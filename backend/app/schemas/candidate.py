from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ShortlistToggleRequest(BaseModel):
    is_shortlisted: bool


class ShortlistToggleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_shortlisted: bool


class NoteCreate(BaseModel):
    content: str = Field(min_length=1, max_length=10_000)


class NoteUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=10_000)


class NoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    content: str
    analysis_id: int
    created_by: int
    created_at: datetime


class NoteListResponse(BaseModel):
    items: list[NoteResponse]
    total: int
