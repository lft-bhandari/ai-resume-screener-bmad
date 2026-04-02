from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.candidate_note import CandidateNote


class ResumeAnalysis(Base):
    __tablename__ = "resume_analyses"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, autoincrement=True)
    candidate_name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    resume_blob: Mapped[bytes] = mapped_column(sa.LargeBinary, nullable=False)
    resume_filename: Mapped[str] = mapped_column(sa.String(255), nullable=False)

    # Gemini output fields — nullable until analysis completes
    score: Mapped[float | None] = mapped_column(sa.Float, nullable=True)
    ats_score: Mapped[float | None] = mapped_column(sa.Float, nullable=True)
    matched_keywords: Mapped[str | None] = mapped_column(sa.Text, nullable=True)  # JSON string
    jd_match: Mapped[str | None] = mapped_column(sa.Text, nullable=True)          # JSON string
    feedback: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    reasoning: Mapped[str | None] = mapped_column(sa.Text, nullable=True)

    is_shortlisted: Mapped[bool] = mapped_column(
        sa.Boolean, nullable=False, default=False
    )

    # FK to job_descriptions — nullable, SET NULL on JD delete (analysis survives)
    jd_id: Mapped[int | None] = mapped_column(
        sa.Integer,
        sa.ForeignKey("job_descriptions.id", ondelete="SET NULL"),
        nullable=True,
    )

    # FK to users — CASCADE on user delete
    created_by: Mapped[int] = mapped_column(
        sa.Integer,
        sa.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Indexed for 90-day purge query and recruiter history filter
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # Cascade delete to candidate_notes (AC3)
    notes: Mapped[list[CandidateNote]] = relationship(
        "CandidateNote",
        back_populates="analysis",
        cascade="all, delete-orphan",
        lazy="select",
    )
