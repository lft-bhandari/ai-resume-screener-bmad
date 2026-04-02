from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_role
from app.db.dependencies import get_db
from app.services import gdpr_service
from app.models.candidate_note import CandidateNote
from app.models.resume_analysis import ResumeAnalysis
from app.models.user import User
from app.schemas.candidate import (
    NoteCreate,
    NoteListResponse,
    NoteResponse,
    NoteUpdate,
    ShortlistToggleRequest,
    ShortlistToggleResponse,
)

router = APIRouter()


async def _resolve_user_id(db: AsyncSession, email: str) -> int:
    """Look up numeric user ID from email (JWT 'sub' claim)."""
    result = await db.execute(select(User.id).where(User.email == email))
    user_id = result.scalar_one_or_none()
    if user_id is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user_id


async def _get_analysis_or_404(db: AsyncSession, analysis_id: int) -> ResumeAnalysis:
    """Return the ResumeAnalysis row or raise HTTP 404."""
    result = await db.execute(
        select(ResumeAnalysis).where(ResumeAnalysis.id == analysis_id)
    )
    analysis = result.scalar_one_or_none()
    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return analysis


@router.post(
    "/{analysis_id}/notes",
    status_code=status.HTTP_201_CREATED,
    response_model=NoteResponse,
)
async def create_note(
    analysis_id: int,
    data: NoteCreate,
    user: dict = Depends(require_role("recruiter")),
    db: AsyncSession = Depends(get_db),
):
    """Create a note on an analysis. (AC: #2)"""
    await _get_analysis_or_404(db, analysis_id)
    user_id = await _resolve_user_id(db, user["sub"])
    note = CandidateNote(
        content=data.content,
        analysis_id=analysis_id,
        created_by=user_id,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.get(
    "/{analysis_id}/notes",
    response_model=NoteListResponse,
)
async def list_notes(
    analysis_id: int,
    user: dict = Depends(require_role("recruiter")),
    db: AsyncSession = Depends(get_db),
):
    """List all notes for an analysis in chronological order. (AC: #3)"""
    await _get_analysis_or_404(db, analysis_id)
    result = await db.execute(
        select(CandidateNote)
        .where(CandidateNote.analysis_id == analysis_id)
        .order_by(CandidateNote.created_at.asc())
    )
    notes = list(result.scalars().all())
    return NoteListResponse(items=notes, total=len(notes))


@router.put(
    "/{analysis_id}/notes/{note_id}",
    response_model=NoteResponse,
)
async def update_note(
    analysis_id: int,
    note_id: int,
    data: NoteUpdate,
    user: dict = Depends(require_role("recruiter")),
    db: AsyncSession = Depends(get_db),
):
    """Update a note's content. (AC: #4)"""
    await _get_analysis_or_404(db, analysis_id)
    result = await db.execute(
        select(CandidateNote).where(
            CandidateNote.id == note_id,
            CandidateNote.analysis_id == analysis_id,
        )
    )
    note = result.scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=404, detail="Note not found")
    user_id = await _resolve_user_id(db, user["sub"])
    if note.created_by != user_id and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied.")
    note.content = data.content
    await db.commit()
    await db.refresh(note)
    return note


@router.patch(
    "/{analysis_id}/shortlist",
    response_model=ShortlistToggleResponse,
)
async def toggle_shortlist(
    analysis_id: int,
    data: ShortlistToggleRequest,
    user: dict = Depends(require_role("recruiter")),
    db: AsyncSession = Depends(get_db),
) -> ShortlistToggleResponse:
    """Toggle shortlist status on an analysis (AC: #1, FR25)."""
    analysis = await _get_analysis_or_404(db, analysis_id)

    # Ownership check — recruiter can only shortlist their own; admin always passes
    user_id = await _resolve_user_id(db, user["sub"])
    if analysis.created_by != user_id and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied.")

    analysis.is_shortlisted = data.is_shortlisted
    await db.commit()
    await db.refresh(analysis)
    return analysis


@router.delete("/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_candidate(
    analysis_id: int,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """GDPR right-to-erasure: delete candidate record and all associated data. Admin only. (AC: #1, #2, #3)"""
    await gdpr_service.delete_candidate(analysis_id, db)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
