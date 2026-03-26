"""System settings API routes."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import SystemConfig, ExchangeRate
from app.schemas import (
    SettingsResponse, SettingsUpdate,
    ExchangeRateResponse, ExchangeRateUpdate,
)

router = APIRouter(prefix="/api/settings", tags=["Settings"])


def get_config_value(db: Session, key: str) -> str | None:
    """Get a config value by key."""
    config = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    return config.value if config else None


def set_config_value(db: Session, key: str, value: str):
    """Set or update a config value."""
    config = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if config:
        config.value = value
    else:
        db.add(SystemConfig(key=key, value=value))


@router.get("", response_model=SettingsResponse)
def get_settings(
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all system settings."""
    return SettingsResponse(
        unified_currency=get_config_value(db, "unified_currency"),
        unified_currency_locked=get_config_value(db, "unified_currency_locked") == "true",
        exchange_rate_api_key=get_config_value(db, "exchange_rate_api_key") or "",
        telegram_bot_token=get_config_value(db, "telegram_bot_token") or "",
        telegram_chat_id=get_config_value(db, "telegram_chat_id") or "",
        telegram_enabled=get_config_value(db, "telegram_enabled") == "true",
    )


@router.put("")
def update_settings(
    request: SettingsUpdate,
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update system settings."""
    # Unified currency: can only be set once
    if request.unified_currency is not None:
        locked = get_config_value(db, "unified_currency_locked")
        if locked == "true":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="统一币种已锁定，不可修改",
            )
        set_config_value(db, "unified_currency", request.unified_currency.upper())
        set_config_value(db, "unified_currency_locked", "true")

    if request.exchange_rate_api_key is not None:
        set_config_value(db, "exchange_rate_api_key", request.exchange_rate_api_key)

    if request.telegram_bot_token is not None:
        set_config_value(db, "telegram_bot_token", request.telegram_bot_token)

    if request.telegram_chat_id is not None:
        set_config_value(db, "telegram_chat_id", request.telegram_chat_id)

    if request.telegram_enabled is not None:
        set_config_value(db, "telegram_enabled", "true" if request.telegram_enabled else "false")

    db.commit()
    return {"message": "设置已更新"}


@router.get("/exchange-rates", response_model=list[ExchangeRateResponse])
def get_exchange_rates(
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all exchange rates."""
    rates = db.query(ExchangeRate).order_by(ExchangeRate.base_currency).all()
    return rates


@router.put("/exchange-rates")
def update_exchange_rate(
    request: ExchangeRateUpdate,
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create or update an exchange rate."""
    existing = db.query(ExchangeRate).filter(
        ExchangeRate.base_currency == request.base_currency.upper(),
        ExchangeRate.target_currency == request.target_currency.upper(),
    ).first()

    if existing:
        existing.rate = request.rate
        existing.is_manual = request.is_manual
        from datetime import datetime
        existing.fetched_at = datetime.utcnow()
    else:
        db.add(ExchangeRate(
            base_currency=request.base_currency.upper(),
            target_currency=request.target_currency.upper(),
            rate=request.rate,
            is_manual=request.is_manual,
        ))

    db.commit()
    return {"message": "汇率已更新"}


@router.post("/test-telegram")
async def test_telegram(
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a test Telegram notification."""
    from app.services.notification import send_telegram_message

    bot_token = get_config_value(db, "telegram_bot_token")
    chat_id = get_config_value(db, "telegram_chat_id")

    if not bot_token or not chat_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请先配置 Telegram Bot Token 和 Chat ID",
        )

    success = await send_telegram_message(
        bot_token, chat_id,
        "🔔 SubscribeManage 测试通知\n\n✅ Telegram 通知配置成功！"
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Telegram 消息发送失败，请检查 Bot Token 和 Chat ID",
        )

    return {"message": "测试消息已发送"}
