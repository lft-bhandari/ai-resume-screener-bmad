import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.db.dependencies import get_db
from app.main import app
from app.models.base import Base
from app.models.candidate_note import CandidateNote  # noqa: F401 — registers table
from app.models.job_description import JobDescription  # noqa: F401 — registers table
from app.models.resume_analysis import ResumeAnalysis  # noqa: F401 — registers table
from app.models.user import User  # noqa: F401 — registers table

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


@pytest.fixture
async def analysis(test_db, recruiter_user):
    row = ResumeAnalysis(
        candidate_name="Alice Smith",
        resume_blob=b"fake-pdf-bytes",
        resume_filename="alice.pdf",
        is_shortlisted=False,
        created_by=recruiter_user.id,
    )
    test_db.add(row)
    await test_db.commit()
    await test_db.refresh(row)
    return row


def _admin_token() -> str:
    return create_access_token(subject="admin@example.com", role="admin")


def _recruiter_token() -> str:
    return create_access_token(subject="recruiter@example.com", role="recruiter")


# ─── Tests ───────────────────────────────────────────────────────────────────

async def test_admin_delete_candidate_success(client, test_db, analysis, recruiter_user):
    """AC #1: Admin deletes candidate → 204; analysis row and notes are removed."""
    # Create a note to verify cascade deletion
    note = CandidateNote(
        content="Interview note",
        analysis_id=analysis.id,
        created_by=recruiter_user.id,
    )
    test_db.add(note)
    await test_db.commit()

    response = await client.delete(
        f"/candidates/{analysis.id}",
        headers={"Authorization": f"Bearer {_admin_token()}"},
    )
    assert response.status_code == 204

    # Verify analysis row is gone
    result = await test_db.execute(
        select(ResumeAnalysis).where(ResumeAnalysis.id == analysis.id)
    )
    assert result.scalar_one_or_none() is None

    # Verify note cascade-deleted
    result = await test_db.execute(
        select(CandidateNote).where(CandidateNote.analysis_id == analysis.id)
    )
    assert result.scalar_one_or_none() is None


async def test_admin_delete_candidate_recruiter_forbidden(client, analysis):
    """AC #2: Recruiter cannot delete a candidate record → 403."""
    response = await client.delete(
        f"/candidates/{analysis.id}",
        headers={"Authorization": f"Bearer {_recruiter_token()}"},
    )
    assert response.status_code == 403


async def test_admin_delete_candidate_not_found(client):
    """AC #3: Non-existent analysis_id → 404."""
    response = await client.delete(
        "/candidates/99999",
        headers={"Authorization": f"Bearer {_admin_token()}"},
    )
    assert response.status_code == 404
