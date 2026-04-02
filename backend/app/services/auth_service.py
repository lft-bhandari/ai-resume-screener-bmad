from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_password
from app.models.user import User


async def authenticate_user(
    db: AsyncSession, email: str, password: str
) -> User | None:
    """Look up the user by email (case-insensitive) and verify their password.

    Returns the User object on successful authentication, or None if:
    - No user with that email exists
    - The password does not match

    Never raises HTTP exceptions — callers handle 401 response.
    """
    result = await db.execute(
        select(User).where(func.lower(User.email) == email.lower())
    )
    user = result.scalar_one_or_none()
    if user is None:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user
