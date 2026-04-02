import pytest
from fastapi import APIRouter, Depends, FastAPI
from httpx import ASGITransport, AsyncClient

from app.core.security import create_access_token, get_current_user, require_role

# ─── Isolated test app — does NOT pollute backend/app/main.py routes ─────────
_guard_router = APIRouter()


@_guard_router.get("/protected")
async def protected(user: dict = Depends(get_current_user)):
    return {"email": user["sub"], "role": user["role"]}


@_guard_router.get("/admin-only")
async def admin_only(user: dict = Depends(require_role("admin"))):
    return {"role": user["role"]}


@_guard_router.get("/recruiter-only")
async def recruiter_only(user: dict = Depends(require_role("recruiter"))):
    return {"role": user["role"]}


guard_test_app = FastAPI()
guard_test_app.include_router(_guard_router)


# ─── Client fixture — no DB needed, guards are stateless ─────────────────────
@pytest.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=guard_test_app), base_url="http://test"
    ) as ac:
        yield ac


# ─── Token helpers ─────────────────────────────────────────────────────────────
def _token(role: str) -> str:
    return create_access_token(subject=f"{role}@test.com", role=role)


# ─── Tests ────────────────────────────────────────────────────────────────────
async def test_protected_without_token_returns_401(client):
    response = await client.get("/protected")
    assert response.status_code == 401


async def test_protected_with_valid_token_returns_200(client):
    response = await client.get(
        "/protected", headers={"Authorization": f"Bearer {_token('recruiter')}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "recruiter"


async def test_admin_only_with_recruiter_returns_403(client):
    """AC2: require_role("admin") + recruiter → 403."""
    response = await client.get(
        "/admin-only", headers={"Authorization": f"Bearer {_token('recruiter')}"}
    )
    assert response.status_code == 403


async def test_admin_only_with_admin_returns_200(client):
    response = await client.get(
        "/admin-only", headers={"Authorization": f"Bearer {_token('admin')}"}
    )
    assert response.status_code == 200


async def test_recruiter_only_with_admin_returns_200(client):
    """AC3: require_role("recruiter") + admin → 200 (admin bypass)."""
    response = await client.get(
        "/recruiter-only", headers={"Authorization": f"Bearer {_token('admin')}"}
    )
    assert response.status_code == 200


async def test_recruiter_only_with_interviewer_returns_403(client):
    response = await client.get(
        "/recruiter-only",
        headers={"Authorization": f"Bearer {_token('interviewer')}"},
    )
    assert response.status_code == 403
