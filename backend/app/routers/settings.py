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
from app.services.http_proxy import build_async_client, get_proxy_url, validate_proxy_url

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
        outbound_proxy_url=get_config_value(db, "outbound_proxy_url") or "",
        outbound_proxy_enabled=get_config_value(db, "outbound_proxy_enabled") == "true",
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

    if request.outbound_proxy_url is not None:
        try:
            cleaned = validate_proxy_url(request.outbound_proxy_url)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
        set_config_value(db, "outbound_proxy_url", cleaned)

    if request.outbound_proxy_enabled is not None:
        set_config_value(
            db, "outbound_proxy_enabled",
            "true" if request.outbound_proxy_enabled else "false",
        )

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
        "🔔 SubscribeManage 测试通知\n\n✅ Telegram 通知配置成功！",
        proxy=get_proxy_url(db),
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Telegram 消息发送失败，请检查 Bot Token 和 Chat ID",
        )

    return {"message": "测试消息已发送"}


@router.post("/test-proxy")
async def test_proxy(
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check that the configured outbound proxy can reach the blocked hosts."""
    proxy = get_config_value(db, "outbound_proxy_url")
    if not proxy:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请先填写代理地址",
        )
    try:
        validate_proxy_url(proxy)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    targets = {
        "Telegram": "https://api.telegram.org",
        "Google": "https://www.google.com/generate_204",
    }
    results = {}
    for name, url in targets.items():
        try:
            async with build_async_client(proxy, timeout=10, follow_redirects=True) as client:
                resp = await client.get(url)
                results[name] = f"ok ({resp.status_code})"
        except Exception as e:  # noqa: BLE001 - report any failure to the user
            results[name] = f"failed: {e}"

    if all(v.startswith("ok") for v in results.values()):
        return {"message": "代理连通正常", "details": results}
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail={"message": "代理无法连通部分目标", "details": results},
    )
