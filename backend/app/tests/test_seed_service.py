import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.security import verify_password
from app.models.base import Base
from app.models.user import User  # noqa: F401 — registers table on Base.metadata
from app.services.seed_service import seed_admin_user

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def db():
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


async def test_seed_creates_admin_on_empty_db(db):
    await seed_admin_user(db)

    result = await db.execute(select(User))
    users = result.scalars().all()
    assert len(users) == 1
    assert users[0].role == "admin"
    assert users[0].email == get_settings().admin_email


async def test_seed_stores_password_as_hash_not_plaintext(db):
    await seed_admin_user(db)

    result = await db.execute(select(User))
    user = result.scalar_one()
    assert user.hashed_password != get_settings().admin_password


async def test_seed_password_verifies_correctly(db):
    await seed_admin_user(db)

    result = await db.execute(select(User))
    user = result.scalar_one()
    assert verify_password(get_settings().admin_password, user.hashed_password)


async def test_seed_is_idempotent_when_users_exist(db):
    """AC2: calling seed twice must not create a second user."""
    await seed_admin_user(db)
    await seed_admin_user(db)

    result = await db.execute(select(User))
    users = result.scalars().all()
    assert len(users) == 1
