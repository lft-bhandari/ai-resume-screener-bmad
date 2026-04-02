from app.core.logging import configure_logging

configure_logging()  # Must be first — before any logging occurs

from app.core.config import get_settings  # noqa: E402

get_settings()  # Validate required env vars at startup; raises ValidationError if missing

from contextlib import asynccontextmanager  # noqa: E402

from fastapi import FastAPI  # noqa: E402

from app.db.database import AsyncSessionLocal  # noqa: E402
from app.routers import auth as auth_router  # noqa: E402
from app.routers import job_descriptions as jd_router  # noqa: E402
from app.routers import analyses as analyses_router  # noqa: E402
from app.routers import candidates as candidates_router  # noqa: E402
from app.routers import users as users_router  # noqa: E402
from app.services.seed_service import seed_admin_user  # noqa: E402
from app.core import scheduler as app_scheduler  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan: seed admin user on startup and run the GDPR purge scheduler."""
    async with AsyncSessionLocal() as db:
        await seed_admin_user(db)
    app_scheduler.start_scheduler()
    yield
    app_scheduler.shutdown_scheduler()


app = FastAPI(
    title="bmad_evaluation_two",
    version="0.1.0",
    lifespan=lifespan,
)

# Convention (Story 2.3 AC4): auth router is the ONLY router exempt from get_current_user.
# All future routers (routers/job_descriptions.py, routers/analyses.py, etc.) MUST
# include Depends(get_current_user) or Depends(require_role(...)) on every handler.
app.include_router(auth_router.router, prefix="/auth", tags=["auth"])
app.include_router(jd_router.router, prefix="/job_descriptions", tags=["job_descriptions"])
app.include_router(analyses_router.router, prefix="/analyses", tags=["analyses"])
app.include_router(candidates_router.router, prefix="/candidates", tags=["candidates"])
app.include_router(users_router.router, prefix="/users", tags=["users"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}
