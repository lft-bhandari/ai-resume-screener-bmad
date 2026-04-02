from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.user import User

log = structlog.get_logger(__name__)


async def seed_admin_user(db: AsyncSession) -> None:
    """Create a default admin user if no users exist in the database.

    Idempotent — safe to call on every startup. Does nothing if users already exist.
    Password is hashed with bcrypt before storage (never stored in plaintext).
    """
    result = await db.execute(select(func.count()).select_from(User))
    count = result.scalar_one()
    if count > 0:
        return

    settings = get_settings()
    admin = User(
        email=settings.admin_email,
        hashed_password=hash_password(settings.admin_password),
        role="admin",
    )
    db.add(admin)
    await db.commit()
    log.info("admin_user_seeded", email=settings.admin_email)
