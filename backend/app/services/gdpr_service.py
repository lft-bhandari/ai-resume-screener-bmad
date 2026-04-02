from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog
from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.resume_analysis import ResumeAnalysis

logger = structlog.get_logger(__name__)


async def delete_candidate(analysis_id: int, db: AsyncSession) -> None:
    """Delete a candidate record and all associated data (GDPR right-to-erasure).

    The resume BLOB is stored in-row — deleting the ResumeAnalysis row removes it.
    candidate_notes are cascade-deleted via the SQLAlchemy ORM relationship
    (cascade="all, delete-orphan" on ResumeAnalysis.notes).

    Args:
        analysis_id: Primary key of the resume_analyses row to delete.
        db: Active async SQLAlchemy session.

    Raises:
        HTTPException(404): If no resume_analyses row exists for analysis_id.
    """
    result = await db.execute(
        select(ResumeAnalysis).where(ResumeAnalysis.id == analysis_id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Candidate record not found.")
    await db.delete(record)
    await db.commit()
    logger.info("candidate_deleted", analysis_id=analysis_id)


async def purge_expired_candidates(db: AsyncSession) -> None:
    """Bulk-delete resume_analyses records older than RETENTION_DAYS (GDPR compliance).

    Uses a SQL bulk DELETE for efficiency. The database-level FK constraint
    (candidate_notes.analysis_id ondelete="CASCADE") handles child record removal.

    Logs the count of deleted rows at INFO level — no PII in log output.
    Catches all exceptions, logs at ERROR, and does NOT re-raise so the
    APScheduler job survives database errors without crashing the application.

    Args:
        db: Active async SQLAlchemy session.
    """
    try:
        retention_days = get_settings().retention_days
        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
        result = await db.execute(
            delete(ResumeAnalysis)
            .where(ResumeAnalysis.created_at < cutoff)
            .execution_options(synchronize_session=False)
        )
        await db.commit()
        deleted_count = result.rowcount
        logger.info(
            "gdpr_purge_complete",
            deleted_count=deleted_count,
            retention_days=retention_days,
        )
    except Exception:
        logger.exception("gdpr_purge_failed")
