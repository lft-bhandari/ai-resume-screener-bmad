import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.base import Base
from app.models.candidate_note import CandidateNote  # noqa: F401 — register table
from app.models.job_description import JobDescription  # noqa: F401 — register table
from app.models.resume_analysis import ResumeAnalysis  # noqa: F401 — register table
from app.models.user import User  # noqa: F401 — register table
from app.schemas.analysis import AnalysisResult

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
async def recruiter_user(test_db):
    from app.core.security import hash_password

    user = User(
        email="r@test.com",
        hashed_password=hash_password("pw"),
        role="recruiter",
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


async def test_resume_analyses_table_insert(test_db, recruiter_user):
    """AC1: ResumeAnalysis row can be inserted with required fields."""
    analysis = ResumeAnalysis(
        candidate_name="Jane Doe",
        resume_blob=b"%PDF-stub",
        resume_filename="jane_doe.pdf",
        created_by=recruiter_user.id,
    )
    test_db.add(analysis)
    await test_db.commit()
    await test_db.refresh(analysis)
    assert analysis.id is not None
    assert analysis.is_shortlisted is False
    assert analysis.score is None
    assert analysis.jd_id is None


async def test_analysis_result_validation_passes(recruiter_user):
    """AC2: AnalysisResult validates a complete, well-formed payload."""
    payload = {
        "score": 78.5,
        "ats_score": 82.0,
        "matched_keywords": ["Python", "FastAPI"],
        "missing_keywords": ["Kubernetes"],
        "jd_match": [
            {"skill": "Python", "present": True, "evidence": "5 years Python experience"},
            {"skill": "Kubernetes", "present": False, "evidence": None},
        ],
        "feedback": "Strong backend candidate with gaps in cloud infrastructure.",
        "reasoning": "The resume demonstrates deep Python expertise...",
    }
    result = AnalysisResult.model_validate(payload)
    assert result.score == 78.5
    assert len(result.matched_keywords) == 2
    assert result.jd_match[0].skill == "Python"
    assert result.jd_match[1].present is False


async def test_analysis_result_validation_fails_on_missing_fields():
    """AC2: ValidationError raised when required fields are absent."""
    incomplete = {"score": 78.5}  # missing ats_score, matched_keywords, etc.
    with pytest.raises(ValidationError):
        AnalysisResult.model_validate(incomplete)


async def test_cascade_delete_removes_notes(test_db, recruiter_user):
    """AC3: Deleting ResumeAnalysis cascades to CandidateNote rows."""
    analysis = ResumeAnalysis(
        candidate_name="Cascade Test",
        resume_blob=b"%PDF-stub",
        resume_filename="test.pdf",
        created_by=recruiter_user.id,
    )
    test_db.add(analysis)
    await test_db.commit()
    await test_db.refresh(analysis)

    note = CandidateNote(
        content="Excellent communicator",
        analysis_id=analysis.id,
        created_by=recruiter_user.id,
    )
    test_db.add(note)
    await test_db.commit()

    # Delete the analysis — ORM cascade should remove the note
    await test_db.delete(analysis)
    await test_db.commit()

    result = await test_db.execute(
        select(CandidateNote).where(CandidateNote.analysis_id == analysis.id)
    )
    assert result.scalars().all() == []
