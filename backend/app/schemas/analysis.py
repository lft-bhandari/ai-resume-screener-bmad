from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.candidate import NoteResponse


class SkillMatch(BaseModel):
    """A single JD skill-to-resume mapping entry."""

    skill: str
    present: bool
    evidence: Optional[str] = None


class AnalysisResult(BaseModel):
    """Pydantic v2 schema for Gemini-structured analysis output.

    This schema is the authoritative contract between GeminiService and the API.
    All Gemini responses MUST be validated against this before client delivery (NFR-I4).
    """

    model_config = ConfigDict(from_attributes=True)

    score: float = Field(ge=0, le=100)        # Overall fit score 0–100
    ats_score: float = Field(ge=0, le=100)    # ATS compatibility score 0–100
    matched_keywords: list[str]         # Keywords present in both resume and JD
    missing_keywords: list[str]         # Keywords in JD but absent from resume
    jd_match: list[SkillMatch]          # Skill-by-skill JD match table
    feedback: str                       # Human-readable strengths/gaps summary
    reasoning: str                      # Extended AI reasoning narrative


class ResumeAnalysisResponse(BaseModel):
    """API response schema for a resume_analyses row (sent to frontend)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    candidate_name: str
    resume_filename: str
    score: Optional[float] = None
    ats_score: Optional[float] = None
    matched_keywords: Optional[str] = None   # JSON string — frontend parses
    jd_match: Optional[str] = None           # JSON string — frontend parses
    feedback: Optional[str] = None
    reasoning: Optional[str] = None
    is_shortlisted: bool
    jd_id: Optional[int] = None
    created_by: int
    created_at: datetime


class ResumeAnalysisListResponse(BaseModel):
    items: list[ResumeAnalysisResponse]
    total: int


class AnalysisInitiatedResponse(BaseModel):
    """HTTP 202 response returned after a resume upload is accepted for processing."""

    analysis_id: int
    status: str = "processing"


class AnalysisListItem(BaseModel):
    """Slim list-view item for GET /analyses — includes jd_title from JOIN."""

    id: int
    candidate_name: str
    score: Optional[float] = None
    ats_score: Optional[float] = None
    is_shortlisted: bool
    jd_id: Optional[int] = None
    jd_title: Optional[str] = None
    created_at: datetime


class AnalysisListResponse(BaseModel):
    items: list[AnalysisListItem]
    total: int


class AnalysisDetailResponse(BaseModel):
    """Full detail for GET /analyses/{id} — includes all notes."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    candidate_name: str
    resume_filename: str
    score: Optional[float] = None
    ats_score: Optional[float] = None
    matched_keywords: Optional[str] = None
    jd_match: Optional[str] = None
    feedback: Optional[str] = None
    reasoning: Optional[str] = None
    is_shortlisted: bool
    jd_id: Optional[int] = None
    created_by: int
    created_at: datetime
    notes: list[NoteResponse] = []
