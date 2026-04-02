"""Tests for app/services/gdpr_service.py — Story 6.1."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
import structlog.testing
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import hash_password
from app.models.base import Base
from app.models.candidate_note import CandidateNote  # noqa: F401 — register table
from app.models.job_description import JobDescription  # noqa: F401 — register table
from app.models.resume_analysis import ResumeAnalysis  # noqa: F401 — register table
from app.models.user import User  # noqa: F401 — register table
from app.services.gdpr_service import delete_candidate, purge_expired_candidates

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


# ── Fixtures ─────────────────────────────────────────────────────────────────

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
    user = User(
        email="recruiter@gdpr-test.example.com",
        hashed_password=hash_password("password"),
        role="recruiter",
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest.fixture
async def analysis(test_db, recruiter_user):
    """Create a resume_analyses row with a small blob."""
    row = ResumeAnalysis(
        candidate_name="Test Candidate",
        resume_blob=b"fake-pdf-bytes-for-gdpr-test",
        resume_filename="test-candidate.pdf",
        is_shortlisted=False,
        created_by=recruiter_user.id,
        created_at=datetime.now(timezone.utc),
    )
    test_db.add(row)
    await test_db.commit()
    await test_db.refresh(row)
    return row


@pytest.fixture
async def analysis_with_notes(test_db, analysis, recruiter_user):
    """Create an analysis with two associated candidate notes."""
    for text in ("Strong Python skills", "Good communication"):
        note = CandidateNote(
            content=text,
            analysis_id=analysis.id,
            created_by=recruiter_user.id,
        )
        test_db.add(note)
    await test_db.commit()
    return analysis


# ── AC #1: delete_candidate — row + notes + BLOB removed ─────────────────────

async def test_delete_candidate_removes_analysis_row(test_db, analysis):
    """AC #1: delete_candidate removes the resume_analyses row."""
    analysis_id = analysis.id
    await delete_candidate(analysis_id, test_db)

    result = await test_db.execute(
        select(ResumeAnalysis).where(ResumeAnalysis.id == analysis_id)
    )
    assert result.scalar_one_or_none() is None


async def test_delete_candidate_cascade_removes_notes(test_db, analysis_with_notes):
    """AC #1: candidate_notes are deleted via SQLAlchemy cascade when analysis is deleted."""
    analysis_id = analysis_with_notes.id

    # Confirm notes exist before deletion
    notes_before = (
        await test_db.execute(
            select(CandidateNote).where(CandidateNote.analysis_id == analysis_id)
        )
    ).scalars().all()
    assert len(notes_before) == 2

    await delete_candidate(analysis_id, test_db)

    notes_after = (
        await test_db.execute(
            select(CandidateNote).where(CandidateNote.analysis_id == analysis_id)
        )
    ).scalars().all()
    assert notes_after == []


async def test_delete_candidate_blob_no_longer_retrievable(test_db, analysis):
    """AC #1: resume BLOB is gone after deletion (stored in-row — row deletion removes it)."""
    analysis_id = analysis.id
    await delete_candidate(analysis_id, test_db)

    result = await test_db.execute(
        select(ResumeAnalysis.resume_blob).where(ResumeAnalysis.id == analysis_id)
    )
    assert result.scalar_one_or_none() is None


# ── AC #1: delete_candidate — 404 for unknown ID ─────────────────────────────

async def test_delete_candidate_not_found_raises_404(test_db):
    """AC #1: HTTPException(404) is raised if no row matches analysis_id."""
    with pytest.raises(HTTPException) as exc_info:
        await delete_candidate(999999, test_db)
    assert exc_info.value.status_code == 404
    assert "not found" in exc_info.value.detail.lower()


# ── AC #3: purge_expired_candidates — old rows deleted, recent rows kept ──────

async def test_purge_expired_deletes_old_records(test_db, recruiter_user):
    """AC #3: records with created_at > 90 days ago are purged."""
    old_row = ResumeAnalysis(
        candidate_name="Old Candidate",
        resume_blob=b"old-bytes",
        resume_filename="old.pdf",
        is_shortlisted=False,
        created_by=recruiter_user.id,
        created_at=datetime.now(timezone.utc) - timedelta(days=91),
    )
    test_db.add(old_row)
    await test_db.commit()
    old_id = old_row.id

    await purge_expired_candidates(test_db)

    result = await test_db.execute(
        select(ResumeAnalysis).where(ResumeAnalysis.id == old_id)
    )
    assert result.scalar_one_or_none() is None


async def test_purge_expired_keeps_recent_records(test_db, recruiter_user):
    """AC #3: records within the retention window are NOT deleted."""
    recent_row = ResumeAnalysis(
        candidate_name="Recent Candidate",
        resume_blob=b"recent-bytes",
        resume_filename="recent.pdf",
        is_shortlisted=False,
        created_by=recruiter_user.id,
        created_at=datetime.now(timezone.utc) - timedelta(days=10),
    )
    test_db.add(recent_row)
    await test_db.commit()
    recent_id = recent_row.id

    await purge_expired_candidates(test_db)

    result = await test_db.execute(
        select(ResumeAnalysis).where(ResumeAnalysis.id == recent_id)
    )
    assert result.scalar_one_or_none() is not None


async def test_purge_expired_logs_count_at_info_no_pii(test_db, recruiter_user):
    """AC #3: purge count is logged at INFO level with no PII (no name/email)."""
    # Create two expired rows
    for i in range(2):
        row = ResumeAnalysis(
            candidate_name=f"PII Name {i}",
            resume_blob=b"bytes",
            resume_filename=f"file_{i}.pdf",
            is_shortlisted=False,
            created_by=recruiter_user.id,
            created_at=datetime.now(timezone.utc) - timedelta(days=100),
        )
        test_db.add(row)
    await test_db.commit()

    with structlog.testing.capture_logs() as cap:
        await purge_expired_candidates(test_db)

    purge_logs = [e for e in cap if e.get("event") == "gdpr_purge_complete"]
    assert len(purge_logs) == 1
    log_entry = purge_logs[0]

    # deleted_count present and correct
    assert log_entry["deleted_count"] == 2

    # No PII: candidate names must not appear anywhere in the log entry
    log_str = str(log_entry)
    assert "PII Name" not in log_str
    assert "@" not in log_str  # no emails


# ── AC #4: purge_expired_candidates — DB error caught, does not raise ─────────

async def test_purge_expired_survives_db_error(test_db):
    """AC #4: DB errors during purge are caught and logged at ERROR; no exception raised."""
    with patch.object(test_db, "execute", new_callable=AsyncMock) as mock_execute:
        mock_execute.side_effect = RuntimeError("DB connection lost")

        with structlog.testing.capture_logs() as cap:
            # Must NOT raise despite the DB error
            await purge_expired_candidates(test_db)

    error_logs = [e for e in cap if e.get("log_level") == "error"]
    assert len(error_logs) >= 1
    assert any("gdpr_purge_failed" in str(e.get("event", "")) for e in error_logs)
