from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator
from typing import Any

import google.generativeai as genai
import structlog
from pydantic import ValidationError

from app.core.config import get_settings
from app.schemas.analysis import AnalysisResult

logger = structlog.get_logger(__name__)

# Pre-defined analysis phases emitted as reasoning_step SSE events.
# These communicate progress to the frontend (FR15 / UX-DR10) while
# Gemini processes the prompt server-side.
ANALYSIS_PHASES: list[tuple[str, str]] = [
    ("initialising", "Initialising analysis engine..."),
    ("skills_match", "Analysing skills match against job description..."),
    ("ats_check", "Checking ATS compatibility and keyword density..."),
    ("generating_output", "Generating structured output and feedback..."),
]

# Prompt template: instructs Gemini to return a JSON object that maps
# exactly to the AnalysisResult Pydantic schema.
ANALYSIS_PROMPT_TEMPLATE = """\
You are an expert technical recruiter and ATS specialist. \
Analyse the resume below against the provided job description.

# Job Description
{jd_text}

# Resume
{resume_text}

Return a JSON object with EXACTLY this structure — no markdown, no prose, \
only valid JSON:
{{
  "score": <float 0-100, overall candidate fit score>,
  "ats_score": <float 0-100, ATS compatibility score based on formatting and keywords>,
  "matched_keywords": [<list of strings: keywords present in both resume and JD>],
  "missing_keywords": [<list of strings: keywords required by JD but absent from resume>],
  "jd_match": [
    {{"skill": "<skill name from JD>", "present": <true|false>, \
"evidence": "<quote from resume or null>"}}
  ],
  "feedback": "<2-4 sentence human-readable summary of candidate strengths and gaps>",
  "reasoning": "<3-6 sentence extended reasoning narrative explaining the overall fit score>"
}}"""


def _sse_event(event_type: str, data: dict[str, Any]) -> str:
    """Format a dict payload as a single SSE event string.

    Returns a string of the form:
        event: <event_type>\\n
        data: <json>\\n
        \\n
    The trailing blank line is required by the SSE spec to delimit events.
    """
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


class GeminiService:
    """Server-side Gemini 2.5 Flash service for structured resume analysis.

    SECURITY CONTRACT (NFR-I2, NFR-S3):
    - GEMINI_API_KEY is read from Settings only — never hardcoded.
    - All Gemini calls are made exclusively inside this service.
    - This class must never be imported by, or instantiated from, any
      client-facing module (routers return SSE streams, not this object).
    """

    def __init__(self) -> None:
        settings = get_settings()
        genai.configure(api_key=settings.gemini_api_key)
        self._model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
            ),
        )

    async def stream_analysis(
        self,
        resume_text: str,
        jd_text: str,
    ) -> AsyncGenerator[str, None]:
        """Yield SSE-formatted event strings for a resume analysis.

        Yields events in this guaranteed order:
            1. N × ``event: reasoning_step`` — one per ANALYSIS_PHASES entry
            2. Exactly one of:
               - ``event: analysis_complete`` — if Gemini returns valid output
               - ``event: error`` — if Gemini fails or output is invalid

        Args:
            resume_text: Extracted plain text of the uploaded resume.
            jd_text: Full text of the job description to analyse against.

        Raises:
            Nothing — all exceptions are caught and surfaced as error events.
        """
        try:
            # Emit progress phases before the blocking Gemini call.
            # These give the UI (UX-DR10) something to show immediately.
            for step_key, message in ANALYSIS_PHASES:
                yield _sse_event("reasoning_step", {"step": step_key, "message": message})
                await asyncio.sleep(0)  # yield control to the event loop

            # Build the prompt and call Gemini (non-streaming, structured JSON).
            prompt = ANALYSIS_PROMPT_TEMPLATE.format(
                resume_text=resume_text,
                jd_text=jd_text,
            )
            response = await self._model.generate_content_async(prompt)
            raw_text = response.text

            # Validate raw JSON against the AnalysisResult contract (NFR-I4).
            try:
                payload = json.loads(raw_text)
                result = AnalysisResult.model_validate(payload)
            except (json.JSONDecodeError, TypeError, ValidationError) as exc:
                logger.error(
                    "gemini_output_validation_failed",
                    error=str(exc),
                    error_type=type(exc).__name__,
                )
                yield _sse_event("error", {"message": "Analysis failed. Please try again."})
                return

            # Emit the complete, validated result.
            yield _sse_event("analysis_complete", result.model_dump())

        except Exception as exc:  # noqa: BLE001 — intentional broad catch
            # Log with context but no PII (NFR-R2, NFR-S6).
            logger.error(
                "gemini_analysis_error",
                error=str(exc),
                error_type=type(exc).__name__,
            )
            yield _sse_event("error", {"message": "Analysis failed. Please try again."})
