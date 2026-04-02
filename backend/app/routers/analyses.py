import asyncio
import json
from collections.abc import AsyncGenerator

import structlog
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_current_user
from app.db.database import AsyncSessionLocal
from app.db.dependencies import get_db
from app.models.job_description import JobDescription
from app.models.resume_analysis import ResumeAnalysis
from app.models.user import User
from app.schemas.analysis import (
    AnalysisDetailResponse,
    AnalysisInitiatedResponse,
    AnalysisListItem,
    AnalysisListResponse,
)
from app.schemas.candidate import NoteResponse
from app.services.analysis_service import (
    MAX_FILE_SIZE_BYTES,
    create_analysis_record,
    extract_resume_text,
    validate_resume_file,
)
from app.services.gemini_service import GeminiService

router = APIRouter()

_MAX_FILE_MB = MAX_FILE_SIZE_BYTES // (1024 * 1024)  # human-readable for error messages


async def _resolve_user_id(db: AsyncSession, email: str) -> int:
    """Look up numeric user ID from email (from JWT 'sub' claim)."""
    result = await db.execute(select(User.id).where(User.email == email))
    user_id = result.scalar_one_or_none()
    if user_id is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user_id


@router.post(
    "",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=AnalysisInitiatedResponse,
)
async def initiate_analysis(
    resume: UploadFile = File(..., description="PDF or DOCX resume file"),
    candidate_name: str = Form(..., min_length=1, max_length=255),
    jd_id: int | None = Form(None, description="ID of an existing Job Description"),
    jd_content: str | None = Form(None, max_length=100_000, description="Inline Job Description text"),
    jd_title: str | None = Form(None, description="Title for saving the JD to library"),
    save_jd: bool = Form(False, description="Save inline JD to the library"),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalysisInitiatedResponse:
    """Upload a resume and initiate analysis — returns an analysis_id for the SSE stream.

    The BLOB is stored immediately; Gemini analysis runs in Story 4.4's SSE handler.

    Multipart form fields:
    - resume (file): PDF or DOCX, max 10 MB
    - candidate_name (str): display name for the candidate
    - jd_id (int, optional): link to existing JD in library
    - jd_content (str, optional): inline JD text (mutually exclusive with jd_id)
    - jd_title (str, optional): title when saving inline JD to library
    - save_jd (bool, default False): if True and jd_title provided, JD is saved visibly
    """
    # AC #5 — exactly one JD source required
    if jd_id is None and jd_content is None:
        raise HTTPException(
            status_code=422,
            detail="Provide either jd_id or jd_content.",
        )

    # AC #2 — validate file type before reading bytes (fail fast)
    validate_resume_file(resume.filename or "", resume.content_type or "")

    # Read file contents with size cap (DoS prevention)
    file_bytes = await resume.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=422,
            detail=f"File too large. Maximum size is {_MAX_FILE_MB} MB.",
        )

    user_id = await _resolve_user_id(db, user["sub"])

    analysis = await create_analysis_record(
        db=db,
        user_id=user_id,
        file_bytes=file_bytes,
        filename=resume.filename or "uploaded_resume",
        candidate_name=candidate_name,
        jd_id=jd_id,
        jd_content=jd_content,
        save_jd=save_jd,
        jd_title=jd_title,
    )

    return AnalysisInitiatedResponse(analysis_id=analysis.id, status="processing")


logger = structlog.get_logger(__name__)


async def _get_analysis_or_404(db: AsyncSession, analysis_id: int) -> ResumeAnalysis:
    """Load a resume_analyses row or raise 404."""
    result = await db.execute(
        select(ResumeAnalysis).where(ResumeAnalysis.id == analysis_id)
    )
    analysis = result.scalar_one_or_none()
    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    return analysis


async def _persist_analysis_result(
    db: AsyncSession, analysis_id: int, payload: dict
) -> None:
    """Write Gemini output fields to the resume_analyses record on completion.

    Uses a fresh AsyncSession passed in — do NOT use the request-scoped session
    here, as this runs inside the StreamingResponse generator lifecycle.

    Stores matched_keywords and jd_match as JSON strings (Text columns).
    missing_keywords is intentionally NOT persisted (no DB column — frontend-only field).
    """
    result = await db.execute(
        select(ResumeAnalysis).where(ResumeAnalysis.id == analysis_id)
    )
    analysis = result.scalar_one_or_none()
    if analysis is None:
        logger.warning("analysis_not_found_for_persist", analysis_id=analysis_id)
        return

    analysis.score = payload.get("score")
    analysis.ats_score = payload.get("ats_score")
    analysis.matched_keywords = json.dumps(payload.get("matched_keywords", []))
    analysis.jd_match = json.dumps(payload.get("jd_match", []))
    analysis.feedback = payload.get("feedback")
    analysis.reasoning = payload.get("reasoning")
    # missing_keywords: NOT a DB column — sent to frontend via SSE only (Story 4.1/4.2)
    await db.commit()
    logger.info("analysis_persisted", analysis_id=analysis_id)


async def _persist_in_background(analysis_id: int, payload: dict) -> None:
    """Fire-and-forget persistence wrapper for the SSE generator.

    Runs as an independent asyncio task so an anyio cancel-scope cancellation
    (triggered by client disconnect) cannot interrupt the DB write via CancelledError.
    """
    try:
        async with AsyncSessionLocal() as update_db:
            await _persist_analysis_result(update_db, analysis_id, payload)
    except Exception as exc:
        logger.error(
            "analysis_persist_failed",
            analysis_id=analysis_id,
            error_type=type(exc).__name__,
            error=str(exc),
        )


@router.get(
    "",
    response_model=AnalysisListResponse,
)
async def list_analyses(
    shortlisted: bool | None = Query(default=None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalysisListResponse:
    """List analyses scoped by role (FR22).

    - recruiter: own analyses only; optional ?shortlisted=true filter
    - admin: all analyses; optional ?shortlisted=true filter
    - interviewer: shortlisted analyses across all recruiters
    """
    user_id = await _resolve_user_id(db, user["sub"])
    user_role = user.get("role", "")

    stmt = (
        select(ResumeAnalysis, JobDescription.title.label("jd_title"))
        .outerjoin(JobDescription, ResumeAnalysis.jd_id == JobDescription.id)
        .order_by(ResumeAnalysis.created_at.desc())
    )

    if user_role == "interviewer":
        stmt = stmt.where(ResumeAnalysis.is_shortlisted.is_(True))
    elif user_role != "admin":
        stmt = stmt.where(ResumeAnalysis.created_by == user_id)

    if shortlisted is True:
        stmt = stmt.where(ResumeAnalysis.is_shortlisted.is_(True))

    result = await db.execute(stmt)
    rows = result.all()

    items = [
        AnalysisListItem(
            id=row.ResumeAnalysis.id,
            candidate_name=row.ResumeAnalysis.candidate_name,
            score=row.ResumeAnalysis.score,
            ats_score=row.ResumeAnalysis.ats_score,
            is_shortlisted=row.ResumeAnalysis.is_shortlisted,
            jd_id=row.ResumeAnalysis.jd_id,
            jd_title=row.jd_title,
            created_at=row.ResumeAnalysis.created_at,
        )
        for row in rows
    ]
    return AnalysisListResponse(items=items, total=len(items))


@router.get(
    "/stream/{analysis_id}",
    response_class=StreamingResponse,
    summary="Stream live SSE analysis results for a resume analysis",
)
async def stream_analysis_sse(
    analysis_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Stream SSE events for an in-progress or new resume analysis.

    Flow:
    1. Load analysis record (404 if not found).
    2. Authorise: owner or admin only (403 otherwise).
    3. Extract resume plain text from BLOB (fail fast — 422/500 if extraction fails).
    4. Load JD text via jd_id (422 if jd_id is NULL or JD deleted).
    5. Return StreamingResponse; the inner generator calls GeminiService and updates DB.

    SSE Event sequence:
        event: reasoning_step  ← 4×, one per analysis phase (FR15)
        event: analysis_complete  ← once, full validated AnalysisResult (FR16)
        — OR —
        event: error  ← if Gemini fails (NFR-R1)

    Headers:
        Cache-Control: no-cache (required for SSE)
        X-Accel-Buffering: no (disables Nginx buffering for real-time delivery)
    """
    # 1. Load analysis record
    analysis = await _get_analysis_or_404(db, analysis_id)

    # 2. Authorization — owner or admin (Story 2.3 AC3: admin has full access)
    user_id = await _resolve_user_id(db, user["sub"])
    user_role = user.get("role", "")
    if analysis.created_by != user_id and user_role != "admin":
        raise HTTPException(status_code=403, detail="Access denied.")

    # 3. Extract resume text before starting the stream (fail fast if corrupt)
    resume_text = extract_resume_text(analysis.resume_blob, analysis.resume_filename)

    # 4. Load JD text — always set from Story 4.3's ad-hoc JD creation guarantee
    if analysis.jd_id is None:
        raise HTTPException(
            status_code=422,
            detail="No job description linked to this analysis.",
        )
    jd_result = await db.execute(
        select(JobDescription).where(JobDescription.id == analysis.jd_id)
    )
    jd = jd_result.scalar_one_or_none()
    if jd is None:
        raise HTTPException(
            status_code=422,
            detail="Linked job description not found (may have been deleted).",
        )
    jd_text = jd.content

    # 5. Streaming generator — calls GeminiService and persists result
    async def generate() -> AsyncGenerator[str, None]:
        """Yield SSE strings from GeminiService; persist result on analysis_complete."""
        gemini = GeminiService()
        async for event_str in gemini.stream_analysis(resume_text, jd_text):
            # Schedule persistence as an independent asyncio task.
            # create_task() runs outside anyio's request cancel scope, so a client
            # disconnect (CancelledError, a BaseException) cannot abort the DB write.
            if event_str.startswith("event: analysis_complete\n"):
                try:
                    # Parse: "event: analysis_complete\ndata: <json>\n\n"
                    data_line = event_str.split("\n")[1]  # "data: <json>"
                    payload = json.loads(data_line[6:])   # strip "data: " (6 chars)
                    asyncio.get_running_loop().create_task(
                        _persist_in_background(analysis_id, payload)
                    )
                except Exception as exc:
                    logger.error(
                        "analysis_persist_failed",
                        analysis_id=analysis_id,
                        error_type=type(exc).__name__,
                        error=str(exc),
                    )

            yield event_str

    # Close the request-scoped session now — it was only needed for validation above.
    # Leaving it open causes CancelledError noise when uvicorn tears down the
    # streaming task: SQLAlchemy tries to rollback an already-gone aiosqlite connection.
    await db.close()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/{analysis_id}",
    response_model=AnalysisDetailResponse,
)
async def get_analysis_detail(
    analysis_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalysisDetailResponse:
    """Return full analysis record with notes (FR23, AC: #4).

    Access rules:
    - Owner: always allowed
    - Admin: always allowed
    - Interviewer: allowed only if analysis is shortlisted
    - Other recruiter: 403
    """
    result = await db.execute(
        select(ResumeAnalysis)
        .options(selectinload(ResumeAnalysis.notes))
        .where(ResumeAnalysis.id == analysis_id)
    )
    analysis = result.scalar_one_or_none()
    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found")

    user_id = await _resolve_user_id(db, user["sub"])
    user_role = user.get("role", "")

    is_owner = analysis.created_by == user_id
    is_admin = user_role == "admin"
    is_interviewer_viewing_shortlisted = user_role == "interviewer" and analysis.is_shortlisted

    if not (is_owner or is_admin or is_interviewer_viewing_shortlisted):
        raise HTTPException(status_code=403, detail="Access denied.")

    sorted_notes = sorted(analysis.notes, key=lambda n: n.created_at)
    return AnalysisDetailResponse(
        id=analysis.id,
        candidate_name=analysis.candidate_name,
        resume_filename=analysis.resume_filename,
        score=analysis.score,
        ats_score=analysis.ats_score,
        matched_keywords=analysis.matched_keywords,
        jd_match=analysis.jd_match,
        feedback=analysis.feedback,
        reasoning=analysis.reasoning,
        is_shortlisted=analysis.is_shortlisted,
        jd_id=analysis.jd_id,
        created_by=analysis.created_by,
        created_at=analysis.created_at,
        notes=[NoteResponse.model_validate(n) for n in sorted_notes],
    )
