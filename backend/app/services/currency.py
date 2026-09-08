"""Currency exchange rate service."""
import logging
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import ExchangeRate, ExchangeRateHistory, SystemConfig
from app.services.http_proxy import build_async_client, get_proxy_url

logger = logging.getLogger(__name__)

# Defaults for the projected/recurring cost exchange rate.
DEFAULT_PROJECTION_MODE = "rolling_avg"  # rolling_avg | spot
DEFAULT_PROJECTION_WINDOW_DAYS = 90
DEFAULT_PROJECTION_BUFFER_PCT = Decimal("0")
# Re-fetch an API-managed current rate once it is older than this.
RATE_STALE_AFTER = timedelta(days=2)


def get_unified_currency(db: Session) -> Optional[str]:
    """Get the unified currency from system config."""
    config = db.query(SystemConfig).filter(SystemConfig.key == "unified_currency").first()
    return config.value if config else None


def get_api_key(db: Session) -> Optional[str]:
    """Get the exchange rate API key from system config."""
    config = db.query(SystemConfig).filter(SystemConfig.key == "exchange_rate_api_key").first()
    return config.value if config and config.value else None


def get_projection_config(db: Session) -> dict:
    """Read the projected-cost exchange-rate settings from system config."""
    rows = {
        c.key: c.value
        for c in db.query(SystemConfig).filter(
            SystemConfig.key.in_([
                "projection_rate_mode",
                "projection_rate_window_days",
                "projection_fx_buffer_pct",
            ])
        ).all()
    }

    mode = rows.get("projection_rate_mode") or DEFAULT_PROJECTION_MODE
    if mode not in ("rolling_avg", "spot"):
        mode = DEFAULT_PROJECTION_MODE

    try:
        window = int(rows.get("projection_rate_window_days") or DEFAULT_PROJECTION_WINDOW_DAYS)
    except (TypeError, ValueError):
        window = DEFAULT_PROJECTION_WINDOW_DAYS
    window = max(1, min(window, 730))

    try:
        buffer_pct = Decimal(str(rows.get("projection_fx_buffer_pct") or DEFAULT_PROJECTION_BUFFER_PCT))
    except (TypeError, ValueError, ArithmeticError):
        buffer_pct = DEFAULT_PROJECTION_BUFFER_PCT
    if buffer_pct < 0:
        buffer_pct = Decimal("0")

    return {"mode": mode, "window_days": window, "buffer_pct": buffer_pct}


def get_exchange_rate(db: Session, base: str, target: str) -> Optional[Decimal]:
    """Get exchange rate from cache. Returns None if not found."""
    if base.upper() == target.upper():
        return Decimal("1.0")

    rate_entry = db.query(ExchangeRate).filter(
        ExchangeRate.base_currency == base.upper(),
        ExchangeRate.target_currency == target.upper(),
    ).first()

    return rate_entry.rate if rate_entry else None


def convert_currency(db: Session, amount: Decimal, from_currency: str, to_currency: str) -> Optional[Decimal]:
    """Convert an amount from one currency to another. Returns None if rate unavailable."""
    rate = get_exchange_rate(db, from_currency, to_currency)
    if rate is None:
        return None
    return round(amount * rate, 2)


def record_rate_history(
    db: Session, base: str, target: str, rate: Decimal,
    rate_date: Optional[date] = None, source: str = "api", commit: bool = False,
) -> None:
    """Upsert one day's value into the exchange-rate time series."""
    if base.upper() == target.upper():
        return
    rate_date = rate_date or date.today()
    row = db.query(ExchangeRateHistory).filter(
        ExchangeRateHistory.base_currency == base.upper(),
        ExchangeRateHistory.target_currency == target.upper(),
        ExchangeRateHistory.rate_date == rate_date,
    ).first()
    if row:
        row.rate = Decimal(str(rate))
        row.source = source
    else:
        db.add(ExchangeRateHistory(
            base_currency=base.upper(),
            target_currency=target.upper(),
            rate=Decimal(str(rate)),
            rate_date=rate_date,
            source=source,
        ))
    if commit:
        db.commit()


def get_rate_on_date(db: Session, base: str, target: str, on_date: date) -> Optional[Decimal]:
    """Rate to use for a payment dated ``on_date``.

    Prefers the newest history row on or before that date; then the earliest
    history row after it; then the current cached rate.
    """
    if base.upper() == target.upper():
        return Decimal("1.0")

    q = db.query(ExchangeRateHistory).filter(
        ExchangeRateHistory.base_currency == base.upper(),
        ExchangeRateHistory.target_currency == target.upper(),
    )
    row = q.filter(ExchangeRateHistory.rate_date <= on_date).order_by(
        ExchangeRateHistory.rate_date.desc()
    ).first()
    if row is None:
        row = q.order_by(ExchangeRateHistory.rate_date.asc()).first()
    if row is not None:
        return row.rate
    return get_exchange_rate(db, base, target)


def get_trailing_avg_rate(
    db: Session, base: str, target: str, window_days: int, as_of: Optional[date] = None,
) -> Optional[Decimal]:
    """Average of the daily history rows in ``(as_of - window_days, as_of]``.

    Falls back to the current cached rate when no history exists yet.
    """
    if base.upper() == target.upper():
        return Decimal("1.0")
    as_of = as_of or date.today()
    start = as_of - timedelta(days=window_days)

    avg = db.query(func.avg(ExchangeRateHistory.rate)).filter(
        ExchangeRateHistory.base_currency == base.upper(),
        ExchangeRateHistory.target_currency == target.upper(),
        ExchangeRateHistory.rate_date > start,
        ExchangeRateHistory.rate_date <= as_of,
    ).scalar()
    if avg is not None:
        return Decimal(str(avg))
    return get_exchange_rate(db, base, target)


def compute_projection_rate(
    db: Session, from_currency: str, to_currency: str, as_of: Optional[date] = None,
) -> tuple[Optional[Decimal], date]:
    """Exchange rate for projected / recurring cost display.

    Applies the configured mode (trailing average or spot) and the optional
    conservative buffer. Returns ``(rate_or_None, as_of_date)``.
    """
    as_of = as_of or date.today()
    if from_currency.upper() == to_currency.upper():
        return Decimal("1.0"), as_of

    cfg = get_projection_config(db)
    if cfg["mode"] == "rolling_avg":
        base_rate = get_trailing_avg_rate(db, from_currency, to_currency, cfg["window_days"], as_of)
    else:
        # "spot": current cached rate, falling back to the newest history row.
        base_rate = get_exchange_rate(db, from_currency, to_currency)
        if base_rate is None:
            base_rate = get_rate_on_date(db, from_currency, to_currency, as_of)

    if base_rate is None:
        return None, as_of

    buffered = Decimal(str(base_rate)) * (Decimal("1") + cfg["buffer_pct"] / Decimal("100"))
    return buffered.quantize(Decimal("0.000001")), as_of


def calc_monthly_cost(cost_unified: Decimal, cycle_amount: int, cycle_unit: str) -> Decimal:
    """Calculate monthly cost in unified currency."""
    if cost_unified is None:
        return None
    if cycle_unit == "day":
        return round(cost_unified / cycle_amount * 30, 2)
    elif cycle_unit == "month":
        return round(cost_unified / cycle_amount, 2)
    elif cycle_unit == "year":
        return round(cost_unified / (cycle_amount * 12), 2)
    return cost_unified


async def fetch_rates_from_api(
    api_key: str, base_currency: str, proxy: Optional[str] = None
) -> Optional[dict]:
    """Fetch exchange rates from ExchangeRate-API.

    Optionally routed through ``proxy`` (SOCKS/HTTP).
    """
    url = f"https://v6.exchangerate-api.com/v6/{api_key}/latest/{base_currency}"
    try:
        async with build_async_client(proxy, timeout=15) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("result") == "success":
                    return data.get("conversion_rates", {})
            logger.error(f"Exchange rate API error: {resp.status_code} - {resp.text}")
    except Exception as e:
        logger.error(f"Exchange rate API request failed: {e}")
    return None


async def update_rates_for_currency(
    db: Session, api_key: str, base_currency: str, target_currencies: list[str],
    proxy: Optional[str] = None,
) -> int:
    """Update exchange rates from API for specific currency pairs.

    Always appends to the daily history (even for pairs pinned to manual, so the
    trailing average and the rate viewer keep working); only overwrites the
    *current* rate for pairs not pinned to manual. Returns the number of pairs
    for which a fresh rate was obtained.
    """
    rates = await fetch_rates_from_api(api_key, base_currency, proxy)
    if not rates:
        return 0

    now = datetime.utcnow()
    today = date.today()
    updated = 0
    for target in target_currencies:
        target_upper = target.upper()
        if target_upper not in rates:
            continue

        new_rate = Decimal(str(rates[target_upper]))
        updated += 1
        record_rate_history(db, base_currency, target_upper, new_rate, today, source="api")

        existing = db.query(ExchangeRate).filter(
            ExchangeRate.base_currency == base_currency.upper(),
            ExchangeRate.target_currency == target_upper,
        ).first()

        if existing:
            if not existing.is_manual:  # Only overwrite the current value for non-manual pairs
                existing.rate = new_rate
                existing.fetched_at = now
        else:
            db.add(ExchangeRate(
                base_currency=base_currency.upper(),
                target_currency=target_upper,
                rate=new_rate,
                is_manual=False,
                fetched_at=now,
            ))

    db.commit()
    return updated


async def fetch_and_cache_rate(db: Session, from_currency: str, to_currency: str) -> Optional[Decimal]:
    """Fetch a single exchange rate and cache it.

    Used when a new currency is encountered, or to refresh an API-managed rate
    that has gone stale. Manual rates are never overwritten here.
    """
    if from_currency.upper() == to_currency.upper():
        return Decimal("1.0")

    existing = db.query(ExchangeRate).filter(
        ExchangeRate.base_currency == from_currency.upper(),
        ExchangeRate.target_currency == to_currency.upper(),
    ).first()

    fresh_enough = (
        existing is not None
        and (existing.is_manual
             or (existing.fetched_at is not None
                 and datetime.utcnow() - existing.fetched_at < RATE_STALE_AFTER))
    )
    if fresh_enough:
        return existing.rate

    api_key = get_api_key(db)
    if api_key:
        rates = await fetch_rates_from_api(api_key, from_currency.upper(), get_proxy_url(db))
        if rates and to_currency.upper() in rates:
            rate = Decimal(str(rates[to_currency.upper()]))
            record_rate_history(db, from_currency, to_currency, rate, date.today(), source="api")
            if existing is None:
                db.add(ExchangeRate(
                    base_currency=from_currency.upper(),
                    target_currency=to_currency.upper(),
                    rate=rate,
                    is_manual=False,
                    fetched_at=datetime.utcnow(),
                ))
            elif not existing.is_manual:
                existing.rate = rate
                existing.fetched_at = datetime.utcnow()
            db.commit()
            return rate

    return existing.rate if existing is not None else None
