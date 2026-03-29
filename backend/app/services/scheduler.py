"""Scheduled tasks using APScheduler."""
import asyncio
import logging
from datetime import date, datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Subscription, SystemConfig, ExchangeRate
from app.services.currency import get_unified_currency, get_api_key, update_rates_for_currency
from app.services.notification import (
    send_telegram_message, format_expiry_reminder,
    format_monthly_report,
)

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def _get_telegram_config(db: Session) -> tuple[str, str, bool]:
    """Get Telegram config from DB."""
    bot_token = ""
    chat_id = ""
    enabled = False

    for config in db.query(SystemConfig).filter(
        SystemConfig.key.in_(["telegram_bot_token", "telegram_chat_id", "telegram_enabled"])
    ).all():
        if config.key == "telegram_bot_token":
            bot_token = config.value or ""
        elif config.key == "telegram_chat_id":
            chat_id = config.value or ""
        elif config.key == "telegram_enabled":
            enabled = config.value == "true"

    return bot_token, chat_id, enabled


async def task_update_exchange_rates():
    """Daily task: update exchange rates from API."""
    db = SessionLocal()
    try:
        api_key = get_api_key(db)
        if not api_key:
            logger.info("No API key configured, skipping exchange rate update")
            return

        unified = get_unified_currency(db)
        if not unified:
            return

        # Get all unique currencies used in subscriptions
        currencies = set()
        for sub in db.query(Subscription.currency_original).distinct().all():
            currencies.add(sub[0].upper())

        if not currencies:
            return

        # Update rates for each base currency -> unified
        for currency in currencies:
            if currency != unified.upper():
                await update_rates_for_currency(db, api_key, currency, [unified])

        logger.info(f"Updated exchange rates for {len(currencies)} currencies")
    except Exception as e:
        logger.error(f"Exchange rate update failed: {e}")
    finally:
        db.close()


async def task_daily_subscription_check():
    """Daily task: update subscription statuses and send expiry reminders."""
    db = SessionLocal()
    try:
        today = date.today()
        bot_token, chat_id, tg_enabled = _get_telegram_config(db)

        subs = db.query(Subscription).filter(
            Subscription.status != "disabled"
        ).all()

        for sub in subs:
            # Update status
            if sub.end_date <= today:
                if sub.status == "not_renewing":
                    sub.status = "disabled"
                elif sub.status != "expired":
                    sub.status = "expired"
            elif sub.status == "not_renewing":
                # Skip reminder completely
                continue
            elif sub.end_date <= today + timedelta(days=sub.reminder_days):
                if sub.status != "expiring":
                    sub.status = "expiring"

                # Send reminder (once per day)
                should_notify = True
                if sub.last_notified_at:
                    last_date = sub.last_notified_at.date() if isinstance(sub.last_notified_at, datetime) else sub.last_notified_at
                    if last_date >= today:
                        should_notify = False

                if should_notify and tg_enabled and bot_token and chat_id:
                    days_left = (sub.end_date - today).days
                    msg = format_expiry_reminder(sub.name, sub.end_date, days_left)
                    success = await send_telegram_message(bot_token, chat_id, msg)
                    if success:
                        sub.last_notified_at = datetime.utcnow()
            else:
                if sub.status not in ("active",):
                    sub.status = "active"

        db.commit()
        logger.info(f"Daily subscription check completed for {len(subs)} subscriptions")
    except Exception as e:
        logger.error(f"Daily subscription check failed: {e}")
    finally:
        db.close()


async def task_monthly_report():
    """Monthly task: send spending report for the previous month."""
    db = SessionLocal()
    try:
        bot_token, chat_id, tg_enabled = _get_telegram_config(db)
        if not tg_enabled or not bot_token or not chat_id:
            return

        unified = get_unified_currency(db) or ""

        today = date.today()
        from dateutil.relativedelta import relativedelta
        last_month = today - relativedelta(months=1)

        # Import and compute the report
        from app.routers.reports import _compute_monthly_report
        report = _compute_monthly_report(db, last_month.year, last_month.month, unified)

        breakdown_data = [
            {
                "category_name": b.category_name,
                "total_cost": float(b.total_cost),
                "subscription_count": b.subscription_count,
            }
            for b in report.breakdown
        ]

        msg = format_monthly_report(
            report.year, report.month,
            float(report.total_cost), unified,
            breakdown_data,
        )

        await send_telegram_message(bot_token, chat_id, msg)
        logger.info(f"Monthly report sent for {last_month.year}-{last_month.month}")

    except Exception as e:
        logger.error(f"Monthly report task failed: {e}")
    finally:
        db.close()


def init_scheduler():
    """Initialize and start the scheduler with all tasks."""
    # Exchange rate update - daily at 06:00
    scheduler.add_job(
        task_update_exchange_rates,
        CronTrigger(hour=6, minute=0),
        id="update_exchange_rates",
        replace_existing=True,
    )

    # Daily subscription check - daily at 09:00
    scheduler.add_job(
        task_daily_subscription_check,
        CronTrigger(hour=9, minute=0),
        id="daily_subscription_check",
        replace_existing=True,
    )

    # Monthly report - 1st of each month at 08:00
    scheduler.add_job(
        task_monthly_report,
        CronTrigger(day=1, hour=8, minute=0),
        id="monthly_report",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started with 3 tasks")
