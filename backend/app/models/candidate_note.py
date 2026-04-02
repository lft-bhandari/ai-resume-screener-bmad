from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.resume_analysis import ResumeAnalysis


class CandidateNote(Base):
    __tablename__ = "candidate_notes"

    id: Mapped[int] = mapped_column(sa.Integer, primary_key=True, autoincrement=True)
    content: Mapped[str] = mapped_column(sa.Text, nullable=False)

    # FK to resume_analyses — CASCADE DELETE: note deleted when analysis deleted
    analysis_id: Mapped[int] = mapped_column(
        sa.Integer,
        sa.ForeignKey("resume_analyses.id", ondelete="CASCADE"),
        nullable=False,
    )

    # FK to users
    created_by: Mapped[int] = mapped_column(
        sa.Integer,
        sa.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Back-reference to the analysis
    analysis: Mapped[ResumeAnalysis] = relationship(
        "ResumeAnalysis",
        back_populates="notes",
    )
