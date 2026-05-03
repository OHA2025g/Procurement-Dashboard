"""Background scheduler: hourly KPI threshold check + escalation."""
from __future__ import annotations
import os
import logging
import asyncio

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from alerts import check_kpi_thresholds, run_escalation

logger = logging.getLogger("scheduler")

_scheduler: AsyncIOScheduler | None = None


def start_scheduler(db):
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    if os.environ.get("ENABLE_SCHEDULER", "true").lower() != "true":
        logger.info("Scheduler disabled via ENABLE_SCHEDULER=false")
        return None

    interval = int(os.environ.get("SCHEDULER_INTERVAL_MINUTES", "60"))
    sched = AsyncIOScheduler()

    async def kpi_job():
        try:
            logger.info("[SCHED] Running KPI threshold check")
            await check_kpi_thresholds(db)
        except Exception as e:
            logger.error(f"[SCHED] KPI job failed: {e}")

    async def escalation_job():
        try:
            logger.info("[SCHED] Running escalation")
            await run_escalation(db)
        except Exception as e:
            logger.error(f"[SCHED] Escalation job failed: {e}")

    sched.add_job(kpi_job, IntervalTrigger(minutes=interval), id="kpi_check",
                  replace_existing=True, next_run_time=None)
    sched.add_job(escalation_job, IntervalTrigger(minutes=interval), id="escalation",
                  replace_existing=True, next_run_time=None)
    sched.start()
    _scheduler = sched
    logger.info(f"[SCHED] Started · interval={interval}min · jobs: kpi_check, escalation")
    return sched


def stop_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
