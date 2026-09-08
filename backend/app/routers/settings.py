"""System settings API routes."""
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Subscription, SystemConfig, ExchangeRate, ExchangeRateHistory
from app.schemas import (
    SettingsResponse, SettingsUpdate,
    ExchangeRateResponse, ExchangeRateUpdate,
    ExchangeRateHistoryResponse, ExchangeRateRefreshResponse,
)
from app.services.currency import (
    DEFAULT_PROJECTION_MODE, DEFAULT_PROJECTION_WINDOW_DAYS, DEFAULT_PROJECTION_BUFFER_PCT,
    get_api_key, update_rates_for_currency,
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
    try:
        window = int(get_config_value(db, "projection_rate_window_days") or DEFAULT_PROJECTION_WINDOW_DAYS)
    except (TypeError, ValueError):
        window = DEFAULT_PROJECTION_WINDOW_DAYS
    try:
        buffer_pct = Decimal(str(get_config_value(db, "projection_fx_buffer_pct") or DEFAULT_PROJECTION_BUFFER_PCT))
    except (TypeError, ValueError, ArithmeticError):
        buffer_pct = DEFAULT_PROJECTION_BUFFER_PCT
    asof = db.query(func.max(Subscription.rate_asof)).scalar()

    return SettingsResponse(
        unified_currency=get_config_value(db, "unified_currency"),
        unified_currency_locked=get_config_value(db, "unified_currency_locked") == "true",
        exchange_rate_api_key=get_config_value(db, "exchange_rate_api_key") or "",
        telegram_bot_token=get_config_value(db, "telegram_bot_token") or "",
        telegram_chat_id=get_config_value(db, "telegram_chat_id") or "",
        telegram_enabled=get_config_value(db, "telegram_enabled") == "true",
        outbound_proxy_url=get_config_value(db, "outbound_proxy_url") or "",
        outbound_proxy_enabled=get_config_value(db, "outbound_proxy_enabled") == "true",
        projection_rate_mode=get_config_value(db, "projection_rate_mode") or DEFAULT_PROJECTION_MODE,
        projection_rate_window_days=window,
        projection_fx_buffer_pct=buffer_pct,
        projection_rate_asof=asof,
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

    projection_changed = False
    if request.projection_rate_mode is not None:
        if request.projection_rate_mode not in ("rolling_avg", "spot"):
            raise HTTPException(status_code=400, detail="预估汇率口径无效")
        set_config_value(db, "projection_rate_mode", request.projection_rate_mode)
        projection_changed = True

    if request.projection_rate_window_days is not None:
        if not 1 <= request.projection_rate_window_days <= 730:
            raise HTTPException(status_code=400, detail="滚动平均窗口需在 1–730 天之间")
        set_config_value(db, "projection_rate_window_days", str(request.projection_rate_window_days))
        projection_changed = True

    if request.projection_fx_buffer_pct is not None:
        if request.projection_fx_buffer_pct < 0 or request.projection_fx_buffer_pct > 100:
            raise HTTPException(status_code=400, detail="汇率缓冲需在 0–100% 之间")
        set_config_value(db, "projection_fx_buffer_pct", str(request.projection_fx_buffer_pct))
        projection_changed = True

    db.commit()

    if projection_changed:
        from app.services.scheduler import refresh_all_projections
        refresh_all_projections(db)

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

    from app.services.currency import record_rate_history
    record_rate_history(
        db, request.base_currency, request.target_currency, request.rate,
        date.today(), source="manual", commit=True,
    )
    from app.services.scheduler import refresh_all_projections
    refresh_all_projections(db)
    return {"message": "汇率已更新"}


@router.post("/exchange-rates/refresh", response_model=ExchangeRateRefreshResponse)
async def refresh_exchange_rates(
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch the latest rates from the API right now (don't wait for the daily job)."""
    api_key = get_api_key(db)
    if not api_key:
        raise HTTPException(status_code=400, detail="请先配置并保存 ExchangeRate-API Key")

    unified = get_config_value(db, "unified_currency")
    if not unified:
        raise HTTPException(status_code=400, detail="请先设置统一币种")
    unified = unified.upper()

    currencies = {
        r.base_currency.upper()
        for r in db.query(ExchangeRate).filter(ExchangeRate.target_currency == unified).all()
    }
    for (cur,) in db.query(Subscription.currency_original).distinct().all():
        if cur:
            currencies.add(cur.upper())
    currencies.discard(unified)

    if not currencies:
        return ExchangeRateRefreshResponse(message="没有需要更新的币种", updated=0, currencies=[])

    proxy = get_proxy_url(db)
    done = []
    for cur in sorted(currencies):
        count = await update_rates_for_currency(db, api_key, cur, [unified], proxy)
        if count:
            done.append(cur)

    if not done:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="未能获取到任何汇率，请检查 API Key、网络或代理设置",
        )

    from app.services.scheduler import refresh_all_projections
    refresh_all_projections(db)
    return ExchangeRateRefreshResponse(
        message=f"已刷新 {len(done)} 个币种汇率", updated=len(done), currencies=done,
    )


@router.get("/exchange-rates/history", response_model=list[ExchangeRateHistoryResponse])
def get_exchange_rate_history(
    base: str = Query(..., min_length=3, max_length=10),
    target: str | None = Query(None, min_length=3, max_length=10),
    days: int = Query(90, ge=1, le=730),
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Daily exchange-rate time series for one currency pair."""
    target = (target or get_config_value(db, "unified_currency") or "").upper()
    if not target:
        raise HTTPException(status_code=400, detail="请先设置统一币种")
    since = date.today() - timedelta(days=days)
    return db.query(ExchangeRateHistory).filter(
        ExchangeRateHistory.base_currency == base.upper(),
        ExchangeRateHistory.target_currency == target,
        ExchangeRateHistory.rate_date >= since,
    ).order_by(ExchangeRateHistory.rate_date.asc()).all()


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
