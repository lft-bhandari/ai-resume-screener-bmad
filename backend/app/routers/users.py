from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, require_role
from app.db.dependencies import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserListResponse, UserResponse

router = APIRouter()


@router.post("", status_code=status.HTTP_201_CREATED, response_model=UserResponse)
async def create_user(
    data: UserCreate,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user account. Admin only. (AC: #1, #2, #4)"""
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Email already in use")
    new_user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        role=data.role,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Delete a user account. Admin only. (AC: #3, #4)"""
    result = await db.execute(select(User).where(User.id == user_id))
    user_obj = result.scalar_one_or_none()
    if user_obj is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user_obj.email == user["sub"]:
        raise HTTPException(status_code=409, detail="Cannot delete your own account")
    await db.delete(user_obj)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("", response_model=UserListResponse)
async def list_users(
    user: dict = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """List all users. Admin only. (AC: #5)"""
    result = await db.execute(select(User).order_by(User.created_at.asc()))
    users = list(result.scalars().all())
    return UserListResponse(items=users)
