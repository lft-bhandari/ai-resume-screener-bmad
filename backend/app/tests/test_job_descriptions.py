import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.db.dependencies import get_db
from app.main import app
from app.models.base import Base
from app.models.job_description import JobDescription  # noqa: F401 — register table
from app.models.user import User  # noqa: F401 — register table

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


@pytest.fixture
async def recruiter_user(test_db):
    user = User(
        email="recruiter@example.com",
        hashed_password=hash_password("password"),
        role="recruiter",
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


def _auth_header(email: str = "recruiter@example.com", role: str = "recruiter") -> dict:
    token = create_access_token(subject=email, role=role)
    return {"Authorization": f"Bearer {token}"}


async def test_create_jd_unauthenticated_returns_401(client):
    """AC6: no JWT → 401."""
    response = await client.post(
        "/job_descriptions", json={"title": "Engineer", "content": "..."}
    )
    assert response.status_code == 401


async def test_create_jd_returns_201(client, recruiter_user):
    """AC2: valid recruiter → 201 with id, title, content, created_at."""
    response = await client.post(
        "/job_descriptions",
        json={"title": "Backend Engineer", "content": "Must know Python"},
        headers=_auth_header(),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Backend Engineer"
    assert data["content"] == "Must know Python"
    assert "id" in data
    assert "created_at" in data


async def test_list_jds_empty(client, recruiter_user):
    """AC3: empty library returns {"items": [], "total": 0}."""
    response = await client.get("/job_descriptions", headers=_auth_header())
    assert response.status_code == 200
    data = response.json()
    assert data == {"items": [], "total": 0}


async def test_list_jds_returns_all(client, recruiter_user):
    """AC3: after creating two JDs, total == 2."""
    headers = _auth_header()
    await client.post(
        "/job_descriptions",
        json={"title": "JD One", "content": "Content one"},
        headers=headers,
    )
    await client.post(
        "/job_descriptions",
        json={"title": "JD Two", "content": "Content two"},
        headers=headers,
    )
    response = await client.get("/job_descriptions", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


async def test_update_jd_title(client, recruiter_user):
    """AC4: PUT with updated title → 200 with updated title, content unchanged."""
    headers = _auth_header()
    create_response = await client.post(
        "/job_descriptions",
        json={"title": "Original Title", "content": "Content"},
        headers=headers,
    )
    jd_id = create_response.json()["id"]

    update_response = await client.put(
        f"/job_descriptions/{jd_id}",
        json={"title": "Updated Title"},
        headers=headers,
    )
    assert update_response.status_code == 200
    assert update_response.json()["title"] == "Updated Title"
    assert update_response.json()["content"] == "Content"


async def test_delete_jd(client, recruiter_user):
    """AC5: DELETE → 204, JD gone from list."""
    headers = _auth_header()
    create_response = await client.post(
        "/job_descriptions",
        json={"title": "To Delete", "content": "Content"},
        headers=headers,
    )
    jd_id = create_response.json()["id"]

    delete_response = await client.delete(
        f"/job_descriptions/{jd_id}", headers=headers
    )
    assert delete_response.status_code == 204

    list_response = await client.get("/job_descriptions", headers=headers)
    assert list_response.json()["total"] == 0


async def test_update_nonexistent_jd_returns_404(client, recruiter_user):
    response = await client.put(
        "/job_descriptions/99999",
        json={"title": "Ghost"},
        headers=_auth_header(),
    )
    assert response.status_code == 404


async def test_delete_nonexistent_jd_returns_404(client, recruiter_user):
    response = await client.delete(
        "/job_descriptions/99999",
        headers=_auth_header(),
    )
    assert response.status_code == 404
