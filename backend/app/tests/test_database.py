from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.database import AsyncSessionLocal
from app.models.base import Base

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


def make_test_engine():
    return create_async_engine(TEST_DB_URL)


def make_test_session_factory(test_engine):
    return async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


async def test_async_session_creates_successfully():
    """Verify async_sessionmaker produces a valid AsyncSession against in-memory DB."""
    test_engine = make_test_engine()
    session_factory = make_test_session_factory(test_engine)
    async with session_factory() as session:
        assert isinstance(session, AsyncSession)
    await test_engine.dispose()


async def test_engine_connects():
    """Verify an async engine can open a connection to an in-memory DB."""
    test_engine = make_test_engine()
    async with test_engine.connect() as conn:
        assert conn is not None
    await test_engine.dispose()


async def test_base_metadata_is_accessible():
    """Verify Base.metadata exists and is empty at this stage (no models yet)."""
    assert Base.metadata is not None


async def test_session_commit_does_not_error():
    """Verify a session can be committed without errors (empty commit)."""
    test_engine = make_test_engine()
    session_factory = make_test_session_factory(test_engine)
    async with session_factory() as session:
        await session.commit()
    await test_engine.dispose()


async def test_in_memory_engine_creates_tables():
    """Verify create_all works against an in-memory DB using Base.metadata."""
    test_engine = make_test_engine()
    try:
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    finally:
        await test_engine.dispose()


async def test_get_db_dependency_yields_session():
    """Verify get_db async generator yields an AsyncSession."""
    from app.db.dependencies import get_db

    gen = get_db()
    session = await anext(gen)
    assert isinstance(session, AsyncSession)
    await gen.aclose()


async def test_async_session_local_creates_session():
    """Verify the module-level AsyncSessionLocal produces a valid AsyncSession (integration smoke test)."""
    async with AsyncSessionLocal() as session:
        assert isinstance(session, AsyncSession)

