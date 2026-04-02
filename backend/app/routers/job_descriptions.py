from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.dependencies import get_db
from app.models.job_description import JobDescription
from app.models.user import User
from app.schemas.job_description import (
    JobDescriptionCreate,
    JobDescriptionListResponse,
    JobDescriptionResponse,
    JobDescriptionUpdate,
)
from app.services.job_description_service import (
    create_job_description,
    delete_job_description,
    get_job_description,
    list_job_descriptions,
    update_job_description,
)

router = APIRouter()


async def _resolve_user_id(db: AsyncSession, email: str) -> int:
    """Look up numeric user ID from email (from JWT 'sub' claim)."""
    result = await db.execute(select(User.id).where(User.email == email))
    user_id = result.scalar_one_or_none()
    if user_id is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user_id


@router.post("", status_code=status.HTTP_201_CREATED, response_model=JobDescriptionResponse)
async def create_jd(
    data: JobDescriptionCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new Job Description. (AC2)"""
    user_id = await _resolve_user_id(db, user["sub"])
    return await create_job_description(db, user_id, data)


@router.get("", response_model=JobDescriptionListResponse)
async def list_jds(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all Job Descriptions. (AC3)"""
    items, total = await list_job_descriptions(db)
    return JobDescriptionListResponse(items=items, total=total)


@router.put("/{jd_id}", response_model=JobDescriptionResponse)
async def update_jd(
    jd_id: int,
    data: JobDescriptionUpdate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a Job Description's title or content. (AC4)"""
    jd = await get_job_description(db, jd_id)
    if jd is None:
        raise HTTPException(status_code=404, detail="Job description not found")
    user_id = await _resolve_user_id(db, user["sub"])
    if jd.created_by != user_id:
        raise HTTPException(status_code=403, detail="Not authorised to modify this job description")
    return await update_job_description(db, jd, data)


@router.delete("/{jd_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_jd(
    jd_id: int,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a Job Description. (AC5)"""
    jd = await get_job_description(db, jd_id)
    if jd is None:
        raise HTTPException(status_code=404, detail="Job description not found")
    user_id = await _resolve_user_id(db, user["sub"])
    if jd.created_by != user_id:
        raise HTTPException(status_code=403, detail="Not authorised to delete this job description")
    await delete_job_description(db, jd)
