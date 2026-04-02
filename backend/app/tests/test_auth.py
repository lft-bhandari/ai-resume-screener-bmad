import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import hash_password
from app.models.base import Base
from app.db.dependencies import get_db
from app.main import app
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


@pytest.fixture
async def test_user(test_db):
    user = User(
        email="test@example.com",
        hashed_password=hash_password("testpassword"),
        role="recruiter",
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


async def test_login_success(client, test_user):
    response = await client.post(
        "/auth/login",
        json={"email": "test@example.com", "password": "testpassword"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["role"] == "recruiter"
    assert data["token_type"] == "bearer"


async def test_login_wrong_password(client, test_user):
    response = await client.post(
        "/auth/login",
        json={"email": "test@example.com", "password": "wrongpassword"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


async def test_login_nonexistent_email(client, test_user):
    response = await client.post(
        "/auth/login",
        json={"email": "nobody@example.com", "password": "testpassword"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


async def test_logout(client):
    response = await client.post("/auth/logout")
    assert response.status_code == 200


async def test_me_with_valid_token(client, test_user):
    login_response = await client.post(
        "/auth/login",
        json={"email": "test@example.com", "password": "testpassword"},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]

    response = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["role"] == "recruiter"


async def test_me_without_token(client):
    response = await client.get("/auth/me")
    assert response.status_code == 401
