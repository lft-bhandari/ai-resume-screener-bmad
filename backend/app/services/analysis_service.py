from __future__ import annotations

import os

import structlog
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job_description import JobDescription
from app.models.resume_analysis import ResumeAnalysis

logger = structlog.get_logger(__name__)

# Allowed file types for resume uploads (extension → allowed content-types)
ALLOWED_EXTENSIONS: frozenset[str] = frozenset({".pdf", ".docx"})
ALLOWED_CONTENT_TYPES: frozenset[str] = frozenset({
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
})
MAX_FILE_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB


def validate_resume_file(filename: str, content_type: str) -> None:
    """Validate that the uploaded file is a PDF or DOCX.

    Checks both the filename extension and the MIME type reported by the client.
    Using both reduces the risk of trivially bypassed extension checks.

    Raises:
        HTTPException(422): If the file extension or MIME type is not allowed.
    """
    ext = os.path.splitext(filename.lower())[1]
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '{ext}'. Only PDF and DOCX are accepted.",
        )
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Unsupported content type '{content_type}'. "
                "Upload PDF (application/pdf) or DOCX "
                "(application/vnd.openxmlformats-officedocument.wordprocessingml.document)."
            ),
        )


async def create_analysis_record(
    db: AsyncSession,
    user_id: int,
    file_bytes: bytes,
    filename: str,
    candidate_name: str,
    jd_id: int | None,
    jd_content: str | None,
    save_jd: bool,
    jd_title: str | None,
) -> ResumeAnalysis:
    """Create a resume_analyses DB record, resolving or creating the JD as needed.

    JD resolution rules:
    - jd_id provided: verify it exists — 404 if not.
    - jd_content provided (jd_id is None): always create a job_descriptions record.
      If save_jd=True and jd_title provided: use supplied title.
      Otherwise: use "Ad-hoc Analysis JD" as title (ensures jd_id is always set).
    - Neither provided: caller must reject (422) before reaching this function.

    The resume BLOB is stored verbatim (NFR-S2) — no text extraction here.
    Text extraction from the BLOB happens in Story 4.4's SSE handler.

    Args:
        db: Active async SQLAlchemy session.
        user_id: Numeric DB id of the authenticated recruiter (from JWT sub lookup).
        file_bytes: Raw bytes of the uploaded PDF or DOCX file.
        filename: Original filename including extension.
        candidate_name: Name or identifier provided by the recruiter.
        jd_id: FK to an existing job_descriptions row (mutually exclusive with jd_content).
        jd_content: Inline JD text provided by recruiter (mutually exclusive with jd_id).
        save_jd: When True and jd_title is provided, save JD visibly with supplied title.
        jd_title: Human-readable title for a newly created JD.

    Returns:
        The newly created ResumeAnalysis ORM instance with id populated.

    Raises:
        HTTPException(404): If jd_id is provided but no matching job_descriptions row exists.
    """
    resolved_jd_id: int | None = jd_id

    if jd_id is not None:
        # Verify the supplied JD exists.
        result = await db.execute(
            select(JobDescription.id).where(JobDescription.id == jd_id)
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Job description not found.")

    elif jd_content is not None:
        # Always create a JD record so Story 4.4 can retrieve the JD text via jd_id.
        effective_title = (
            jd_title if (save_jd and jd_title) else "Ad-hoc Analysis JD"
        )
        new_jd = JobDescription(
            title=effective_title,
            content=jd_content,
            created_by=user_id,
        )
        db.add(new_jd)
        await db.flush()  # Populate new_jd.id without committing the transaction
        resolved_jd_id = new_jd.id
        logger.info(
            "ad_hoc_jd_created",
            jd_id=new_jd.id,
            saved_to_library=save_jd,
        )

    analysis = ResumeAnalysis(
        candidate_name=candidate_name,
        resume_blob=file_bytes,
        resume_filename=filename,
        jd_id=resolved_jd_id,
        created_by=user_id,
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    logger.info(
        "analysis_record_created",
        analysis_id=analysis.id,
        jd_id=resolved_jd_id,
        filename=filename,
    )
    return analysis


def extract_resume_text(blob: bytes, filename: str) -> str:
    """Extract plain text from a PDF or DOCX file blob.

    Called by the SSE streaming handler before invoking GeminiService.
    If extraction yields empty text (e.g. image-only PDF), an empty string
    is returned — Gemini will produce low-confidence output, which is
    preferable to failing the entire analysis.

    Args:
        blob: Raw bytes of the PDF or DOCX file stored in resume_blob.
        filename: Original filename including extension (used for type detection).

    Returns:
        Extracted plain text content (may be empty for image-only files).

    Raises:
        HTTPException(422): If the file extension is not PDF or DOCX.
        HTTPException(500): If the extraction library raises an unexpected error.
    """
    import io

    ext = os.path.splitext(filename.lower())[1]

    try:
        if ext == ".pdf":
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(blob))
            return "\n".join(
                page.extract_text() or "" for page in reader.pages
            ).strip()

        elif ext == ".docx":
            from docx import Document

            doc = Document(io.BytesIO(blob))
            return "\n".join(para.text for para in doc.paragraphs).strip()

        else:
            raise HTTPException(
                status_code=422,
                detail=f"Cannot extract text from '{ext}' — only PDF and DOCX are supported.",
            )

    except HTTPException:
        raise  # Re-raise FastAPI exceptions unchanged

    except Exception as exc:
        logger.error(
            "resume_text_extraction_failed",
            filename=filename,
            error_type=type(exc).__name__,
            error=str(exc),
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to extract text from resume file. The file may be corrupt.",
        )
