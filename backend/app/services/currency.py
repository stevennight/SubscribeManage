"""Currency exchange rate service."""
import logging
from datetime import datetime
from decimal import Decimal
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app.models import ExchangeRate, SystemConfig

logger = logging.getLogger(__name__)


def get_unified_currency(db: Session) -> Optional[str]:
    """Get the unified currency from system config."""
    config = db.query(SystemConfig).filter(SystemConfig.key == "unified_currency").first()
    return config.value if config else None


def get_api_key(db: Session) -> Optional[str]:
    """Get the exchange rate API key from system config."""
    config = db.query(SystemConfig).filter(SystemConfig.key == "exchange_rate_api_key").first()
    return config.value if config and config.value else None


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


async def fetch_rates_from_api(api_key: str, base_currency: str) -> Optional[dict]:
    """Fetch exchange rates from ExchangeRate-API."""
    url = f"https://v6.exchangerate-api.com/v6/{api_key}/latest/{base_currency}"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("result") == "success":
                    return data.get("conversion_rates", {})
            logger.error(f"Exchange rate API error: {resp.status_code} - {resp.text}")
    except Exception as e:
        logger.error(f"Exchange rate API request failed: {e}")
    return None


async def update_rates_for_currency(db: Session, api_key: str, base_currency: str, target_currencies: list[str]):
    """Update exchange rates from API for specific currency pairs."""
    rates = await fetch_rates_from_api(api_key, base_currency)
    if not rates:
        return

    now = datetime.utcnow()
    for target in target_currencies:
        target_upper = target.upper()
        if target_upper not in rates:
            continue

        existing = db.query(ExchangeRate).filter(
            ExchangeRate.base_currency == base_currency.upper(),
            ExchangeRate.target_currency == target_upper,
        ).first()

        if existing:
            if not existing.is_manual:  # Only update non-manual rates
                existing.rate = Decimal(str(rates[target_upper]))
                existing.fetched_at = now
        else:
            db.add(ExchangeRate(
                base_currency=base_currency.upper(),
                target_currency=target_upper,
                rate=Decimal(str(rates[target_upper])),
                is_manual=False,
                fetched_at=now,
            ))

    db.commit()


async def fetch_and_cache_rate(db: Session, from_currency: str, to_currency: str) -> Optional[Decimal]:
    """Fetch a single exchange rate and cache it. Used when new currency is encountered."""
    if from_currency.upper() == to_currency.upper():
        return Decimal("1.0")

    # Check cache first
    existing_rate = get_exchange_rate(db, from_currency, to_currency)
    if existing_rate is not None:
        return existing_rate

    # Try API
    api_key = get_api_key(db)
    if api_key:
        rates = await fetch_rates_from_api(api_key, from_currency.upper())
        if rates and to_currency.upper() in rates:
            rate = Decimal(str(rates[to_currency.upper()]))
            db.add(ExchangeRate(
                base_currency=from_currency.upper(),
                target_currency=to_currency.upper(),
                rate=rate,
                is_manual=False,
                fetched_at=datetime.utcnow(),
            ))
            db.commit()
            return rate

    return None
