from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job_description import JobDescription
from app.schemas.job_description import JobDescriptionCreate, JobDescriptionUpdate


async def create_job_description(
    db: AsyncSession,
    user_id: int,
    data: JobDescriptionCreate,
) -> JobDescription:
    jd = JobDescription(
        title=data.title,
        content=data.content,
        created_by=user_id,
    )
    db.add(jd)
    await db.commit()
    await db.refresh(jd)
    return jd


async def list_job_descriptions(
    db: AsyncSession,
) -> tuple[list[JobDescription], int]:
    result = await db.execute(
        select(JobDescription).order_by(JobDescription.created_at.desc())
    )
    items = list(result.scalars().all())
    return items, len(items)


async def get_job_description(
    db: AsyncSession,
    jd_id: int,
) -> JobDescription | None:
    result = await db.execute(
        select(JobDescription).where(JobDescription.id == jd_id)
    )
    return result.scalar_one_or_none()


async def update_job_description(
    db: AsyncSession,
    jd: JobDescription,
    data: JobDescriptionUpdate,
) -> JobDescription:
    if data.title is not None:
        jd.title = data.title
    if data.content is not None:
        jd.content = data.content
    await db.commit()
    await db.refresh(jd)
    return jd


async def delete_job_description(
    db: AsyncSession,
    jd: JobDescription,
) -> None:
    await db.delete(jd)
    await db.commit()
