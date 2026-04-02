from __future__ import annotations

import structlog

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.db.database import AsyncSessionLocal
from app.services import gdpr_service

logger = structlog.get_logger(__name__)

_scheduler = AsyncIOScheduler()


async def _run_purge_job() -> None:
    """Async APScheduler job: open its own DB session and run the GDPR purge."""
    async with AsyncSessionLocal() as db:
        await gdpr_service.purge_expired_candidates(db)


def start_scheduler() -> None:
    """Register the daily GDPR purge job and start the scheduler.

    The cron job fires at 02:00 UTC every day. APScheduler's AsyncIOScheduler
    natively handles async job functions on the running asyncio event loop.
    """
    _scheduler.add_job(
        _run_purge_job,
        trigger="cron",
        hour=2,
        minute=0,
        id="gdpr_purge",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("scheduler_started", job="gdpr_purge", cron="02:00 UTC")


def shutdown_scheduler() -> None:
    """Shut down the scheduler gracefully on application shutdown."""
    _scheduler.shutdown(wait=False)
    logger.info("scheduler_shutdown")
