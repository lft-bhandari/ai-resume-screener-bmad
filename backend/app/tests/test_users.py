import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.db.dependencies import get_db
from app.main import app
from app.models.base import Base
from app.models.user import User  # noqa: F401 — registers table on Base.metadata

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def test_db():
    engine = create_async_engine(
        TEST_DATABASE_URL, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def client(test_db):
    async def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


def _admin_token() -> str:
    return create_access_token(subject="admin@example.com", role="admin")


def _recruiter_token() -> str:
    return create_access_token(subject="recruiter@example.com", role="recruiter")


def _interviewer_token() -> str:
    return create_access_token(subject="interviewer@example.com", role="interviewer")


@pytest.fixture
async def existing_user(test_db):
    user = User(
        email="existing@example.com",
        hashed_password=hash_password("password123"),
        role="recruiter",
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


# ─── POST /users ──────────────────────────────────────────────────────────────

async def test_create_user_success(client):
    """AC #1: Admin creates user — HTTP 201 with id, email, role, created_at."""
    response = await client.post(
        "/users",
        json={"email": "newuser@example.com", "password": "secret123", "role": "recruiter"},
        headers={"Authorization": f"Bearer {_admin_token()}"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newuser@example.com"
    assert data["role"] == "recruiter"
    assert "id" in data
    assert "created_at" in data
    assert "hashed_password" not in data
    assert "password" not in data


async def test_create_user_hashed_password_stored(client, test_db):
    """AC #1: Password must be stored as bcrypt hash, never plaintext."""
    await client.post(
        "/users",
        json={"email": "hashed@example.com", "password": "myplaintext", "role": "interviewer"},
        headers={"Authorization": f"Bearer {_admin_token()}"},
    )
    result = await test_db.execute(select(User).where(User.email == "hashed@example.com"))
    user = result.scalar_one()
    assert user.hashed_password != "myplaintext"
    assert user.hashed_password.startswith("$2b$")


async def test_create_user_duplicate_email_returns_409(client, existing_user):
    """AC #2: Duplicate email → HTTP 409 Conflict, no duplicate created."""
    response = await client.post(
        "/users",
        json={"email": "existing@example.com", "password": "newpass1", "role": "recruiter"},
        headers={"Authorization": f"Bearer {_admin_token()}"},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Email already in use"


async def test_create_user_recruiter_forbidden(client):
    """AC #4: recruiter role → HTTP 403."""
    response = await client.post(
        "/users",
        json={"email": "forbidden@example.com", "password": "pass", "role": "recruiter"},
        headers={"Authorization": f"Bearer {_recruiter_token()}"},
    )
    assert response.status_code == 403


async def test_create_user_interviewer_forbidden(client):
    """AC #4: interviewer role → HTTP 403."""
    response = await client.post(
        "/users",
        json={"email": "forbidden2@example.com", "password": "pass", "role": "recruiter"},
        headers={"Authorization": f"Bearer {_interviewer_token()}"},
    )
    assert response.status_code == 403


async def test_create_user_invalid_role_returns_422(client):
    """UserCreate.role Literal validation: 'admin' role not allowed via API."""
    response = await client.post(
        "/users",
        json={"email": "admin2@example.com", "password": "pass", "role": "admin"},
        headers={"Authorization": f"Bearer {_admin_token()}"},
    )
    assert response.status_code == 422


# ─── DELETE /users/{id} ───────────────────────────────────────────────────────

async def test_delete_user_success(client, existing_user, test_db):
    """AC #3: Admin deletes user → HTTP 204, user removed from DB."""
    response = await client.delete(
        f"/users/{existing_user.id}",
        headers={"Authorization": f"Bearer {_admin_token()}"},
    )
    assert response.status_code == 204
    result = await test_db.execute(select(User).where(User.id == existing_user.id))
    assert result.scalar_one_or_none() is None


async def test_delete_user_not_found_returns_404(client):
    """DELETE /users/{id} with non-existent ID → HTTP 404."""
    response = await client.delete(
        "/users/99999",
        headers={"Authorization": f"Bearer {_admin_token()}"},
    )
    assert response.status_code == 404


async def test_delete_user_recruiter_forbidden(client, existing_user):
    """AC #4: recruiter cannot delete users → HTTP 403."""
    response = await client.delete(
        f"/users/{existing_user.id}",
        headers={"Authorization": f"Bearer {_recruiter_token()}"},
    )
    assert response.status_code == 403


# ─── GET /users ───────────────────────────────────────────────────────────────

async def test_list_users_returns_all_users(client, test_db):
    """AC #5: Admin GET /users returns all users; no hashed_password exposed."""
    # Insert two users
    for email, role in [("u1@example.com", "recruiter"), ("u2@example.com", "interviewer")]:
        test_db.add(User(email=email, hashed_password=hash_password("pw"), role=role))
    await test_db.commit()

    response = await client.get(
        "/users",
        headers={"Authorization": f"Bearer {_admin_token()}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert len(data["items"]) == 2
    for item in data["items"]:
        assert "id" in item
        assert "email" in item
        assert "role" in item
        assert "created_at" in item
        assert "hashed_password" not in item


async def test_list_users_recruiter_forbidden(client):
    """AC #5: non-admin cannot list users → HTTP 403."""
    response = await client.get(
        "/users",
        headers={"Authorization": f"Bearer {_recruiter_token()}"},
    )
    assert response.status_code == 403


async def test_list_users_unauthenticated_returns_401(client):
    """GET /users without token → HTTP 401."""
    response = await client.get("/users")
    assert response.status_code == 401


async def test_delete_user_self_delete_returns_409(client, test_db):
    """Self-delete guard: admin cannot delete their own account → HTTP 409."""
    # Create a user whose email matches the admin token subject
    self_user = User(
        email="admin@example.com",
        hashed_password=hash_password("password123"),
        role="admin",
    )
    test_db.add(self_user)
    await test_db.commit()
    await test_db.refresh(self_user)

    response = await client.delete(
        f"/users/{self_user.id}",
        headers={"Authorization": f"Bearer {_admin_token()}"},
    )
    assert response.status_code == 409
    assert "own account" in response.json()["detail"].lower()


async def test_create_user_short_password_returns_422(client):
    """UserCreate.password min_length=8: password shorter than 8 chars → HTTP 422."""
    response = await client.post(
        "/users",
        json={"email": "shortpw@example.com", "password": "abc", "role": "recruiter"},
        headers={"Authorization": f"Bearer {_admin_token()}"},
    )
    assert response.status_code == 422
