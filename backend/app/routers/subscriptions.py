"""Subscription CRUD API routes."""
import os
import uuid
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import Subscription, Category, PaymentHistory, SystemConfig
from app.schemas import (
    SubscriptionCreate, SubscriptionUpdate, SubscriptionResponse,
    SubscriptionListResponse, PaymentHistoryResponse,
    FaviconRequest, FaviconResponse, PaymentRecordCreate, PaymentRecordUpdate,
    DashboardStatsResponse
)
from app.services.currency import (
    get_unified_currency, convert_currency, calc_monthly_cost,
    get_exchange_rate, fetch_and_cache_rate,
)
from app.config import settings as app_settings

router = APIRouter(prefix="/api/subscriptions", tags=["Subscriptions"])


def _build_response(sub: Subscription) -> SubscriptionResponse:
    """Build a subscription response with category name."""
    return SubscriptionResponse(
        id=sub.id,
        name=sub.name,
        category_id=sub.category_id,
        category_name=sub.category.name if sub.category else None,
        cycle_amount=sub.cycle_amount,
        cycle_unit=sub.cycle_unit,
        cost_original=sub.cost_original,
        currency_original=sub.currency_original,
        cost_unified=sub.cost_unified,
        exchange_rate=sub.exchange_rate,
        monthly_cost=sub.monthly_cost,
        monthly_cost_original=sub.monthly_cost_original,
        start_date=sub.start_date,
        end_date=sub.end_date,
        reminder_days=sub.reminder_days,
        url=sub.url,
        logo_type=sub.logo_type,
        logo_value=sub.logo_value,
        payment_method=sub.payment_method,
        status=sub.status,
        cancel_date=sub.cancel_date,
        last_notified_at=sub.last_notified_at,
        notes=sub.notes,
        created_at=sub.created_at,
        updated_at=sub.updated_at,
    )


def _calc_end_date(start: date, cycle_amount: int, cycle_unit: str) -> date:
    """Calculate end date from start date + cycle."""
    if cycle_unit == "day":
        return start + relativedelta(days=cycle_amount)
    elif cycle_unit == "month":
        return start + relativedelta(months=cycle_amount)
    elif cycle_unit == "year":
        return start + relativedelta(years=cycle_amount)
    return start + relativedelta(months=cycle_amount)


def _sync_subscription_dates(db: Session, sub: Subscription):
    """Sync subscription start/end dates from payment history MIN/MAX."""
    from sqlalchemy import func
    result = db.query(
        func.min(PaymentHistory.start_date),
        func.max(PaymentHistory.end_date),
    ).filter(PaymentHistory.subscription_id == sub.id).first()

    if result and result[1] is not None:
        # Use the earliest start_date from payments (fall back to existing)
        min_start = result[0] or sub.start_date
        sub.start_date = min_start
        sub.end_date = result[1]
        
        from datetime import date
        if sub.status != "disabled" and sub.end_date:
            today = date.today()
            if sub.end_date <= today:
                if sub.status == "not_renewing":
                    sub.status = "disabled"
                else:
                    sub.status = "expired"
            elif sub.status == "not_renewing":
                pass
            elif sub.reminder_days is not None and (sub.end_date - today).days <= sub.reminder_days:
                sub.status = "expiring"
            else:
                sub.status = "active"
    else:
        # If no records remain, reset dates to null and status to active
        sub.start_date = None
        sub.end_date = None
        sub.status = "active"


@router.get("/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get dashboard stats: active/expiring counts and monthly total for all non-disabled subs."""
    from decimal import Decimal
    from app.schemas import DashboardCategoryBreakdown
    
    subs = db.query(Subscription).options(
        joinedload(Subscription.category)
    ).filter(Subscription.status != "disabled").all()
    
    active_count = 0
    expiring_count = 0
    monthly_total = Decimal("0")
    
    category_data = {}  # cat_id -> {'name': str, 'cost': Decimal, 'count': int}

    for s in subs:
        if s.status in ("active", "not_renewing"):
            active_count += 1
        elif s.status == "expiring":
            expiring_count += 1
            
        cost = s.monthly_cost or Decimal("0")
        monthly_total += cost
        
        cat_id = s.category_id
        cat_name = s.category.name if s.category else "未分类"
        
        if cat_id not in category_data:
            category_data[cat_id] = {
                "name": cat_name,
                "cost": Decimal("0"),
                "count": 0
            }
        category_data[cat_id]["cost"] += cost
        category_data[cat_id]["count"] += 1

    breakdown = []
    for cat_id, data in category_data.items():
        breakdown.append(DashboardCategoryBreakdown(
            category_id=cat_id,
            category_name=data["name"],
            total_cost=round(data["cost"], 2),
            subscription_count=data["count"]
        ))
        
    # Sort breakdown by total_cost descending
    breakdown.sort(key=lambda x: x.total_cost, reverse=True)

    unified = get_unified_currency(db) or ""
    return DashboardStatsResponse(
        active_count=active_count,
        expiring_count=expiring_count,
        monthly_total=round(monthly_total, 2),
        unified_currency=unified,
        breakdown=breakdown,
    )


@router.get("", response_model=SubscriptionListResponse)
def list_subscriptions(
    name: Optional[str] = Query(None),
    category_id: Optional[list[int]] = Query(None),
    status_filter: Optional[list[str]] = Query(None, alias="status"),
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List subscriptions with optional filters (multi-select)."""
    from decimal import Decimal
    query = db.query(Subscription).options(joinedload(Subscription.category))

    if name:
        query = query.filter(Subscription.name.ilike(f"%{name}%"))

    if category_id:
        query = query.filter(Subscription.category_id.in_(category_id))

    if status_filter:
        query = query.filter(Subscription.status.in_(status_filter))
    else:
        # Default: exclude disabled
        query = query.filter(Subscription.status != "disabled")

    total = query.count()
    subs = query.order_by(Subscription.end_date.asc()).all()
    total_monthly_cost = sum((s.monthly_cost or Decimal("0")) for s in subs)

    return SubscriptionListResponse(
        items=[_build_response(s) for s in subs],
        total=total,
        total_monthly_cost=round(total_monthly_cost, 2),
    )


@router.get("/{sub_id}", response_model=SubscriptionResponse)
def get_subscription(
    sub_id: int,
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get subscription detail."""
    sub = db.query(Subscription).options(
        joinedload(Subscription.category)
    ).filter(Subscription.id == sub_id).first()

    if not sub:
        raise HTTPException(status_code=404, detail="订阅不存在")

    return _build_response(sub)


@router.get("/{sub_id}/payments", response_model=list[PaymentHistoryResponse])
def get_payment_history(
    sub_id: int,
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get payment history for a subscription."""
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="订阅不存在")

    history = db.query(PaymentHistory).filter(
        PaymentHistory.subscription_id == sub_id
    ).order_by(PaymentHistory.start_date.desc()).all()

    return history


@router.post("", response_model=SubscriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_subscription(
    request: SubscriptionCreate,
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new subscription with automatic currency conversion."""
    unified = get_unified_currency(db)

    if not unified:
        raise HTTPException(
            status_code=400,
            detail="请先在系统设置中配置统一币种，再添加订阅"
        )

    # Calculate unified cost
    cost_unified = None
    rate = None
    monthly_cost = None

    if request.currency_original.upper() == unified.upper():
        rate = Decimal("1.0")
        cost_unified = request.cost_original
    else:
        rate = get_exchange_rate(db, request.currency_original, unified)
        if rate is None:
            rate = await fetch_and_cache_rate(db, request.currency_original, unified)
        if rate:
            cost_unified = round(request.cost_original * rate, 2)

    if cost_unified is not None:
        monthly_cost = calc_monthly_cost(cost_unified, request.cycle_amount, request.cycle_unit)

    sub_data = request.model_dump()
    sub = Subscription(
        **sub_data,
        cost_unified=cost_unified,
        exchange_rate=rate,
        monthly_cost=monthly_cost,
    )
    db.add(sub)
    db.flush()  # Get the ID

    db.commit()
    db.refresh(sub)

    # Reload with category
    sub = db.query(Subscription).options(
        joinedload(Subscription.category)
    ).filter(Subscription.id == sub.id).first()

    return _build_response(sub)


@router.put("/{sub_id}", response_model=SubscriptionResponse)
async def update_subscription(
    sub_id: int,
    request: SubscriptionUpdate,
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a subscription."""
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="订阅不存在")

    update_data = request.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(sub, key, value)

    # Recalculate unified cost if cost or currency changed
    if "cost_original" in update_data or "currency_original" in update_data:
        unified = get_unified_currency(db)
        if unified:
            if sub.currency_original.upper() == unified.upper():
                sub.exchange_rate = Decimal("1.0")
                sub.cost_unified = sub.cost_original
            else:
                rate = get_exchange_rate(db, sub.currency_original, unified)
                if rate is None:
                    rate = await fetch_and_cache_rate(db, sub.currency_original, unified)
                sub.exchange_rate = rate
                sub.cost_unified = round(sub.cost_original * rate, 2) if rate else None

    # Recalculate monthly cost if relevant fields changed
    if any(k in update_data for k in ["cost_original", "currency_original", "cycle_amount", "cycle_unit"]):
        if sub.cost_unified is not None:
            sub.monthly_cost = calc_monthly_cost(sub.cost_unified, sub.cycle_amount, sub.cycle_unit)

    db.commit()
    db.refresh(sub)

    sub = db.query(Subscription).options(
        joinedload(Subscription.category)
    ).filter(Subscription.id == sub.id).first()

    return _build_response(sub)


@router.delete("/{sub_id}")
def delete_subscription(
    sub_id: int,
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Hard delete a subscription and its payment history."""
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="订阅不存在")

    # Delete payment history first (although DB might handle cascade, doing it explicitly is safer if relationships aren't configured for cascade)
    from app.models import PaymentHistory
    db.query(PaymentHistory).filter(PaymentHistory.subscription_id == sub_id).delete()
    
    db.delete(sub)
    db.commit()
    return {"message": "订阅已删除"}


@router.patch("/{sub_id}/disable")
def disable_subscription(
    sub_id: int,
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disable a subscription."""
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="订阅不存在")

    from datetime import date as d
    sub.status = "disabled"
    sub.cancel_date = d.today()
    db.commit()
    return {"message": "订阅已停用"}


@router.patch("/{sub_id}/cancel_renewal")
def cancel_renewal(
    sub_id: int,
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a subscription to not renew."""
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="订阅不存在")

    if sub.status in ("active", "expiring"):
        sub.status = "not_renewing"
        db.commit()
    elif sub.status == "not_renewing":
        pass # Already not renewing
    else:
        raise HTTPException(status_code=400, detail="当前状态不可取消续订")
        
    return {"message": "已设置为到期不续费"}


@router.patch("/{sub_id}/enable")
def enable_subscription(
    sub_id: int,
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Re-enable a disabled subscription."""
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="订阅不存在")

    from datetime import date
    if sub.end_date and sub.end_date < date.today():
        sub.status = "expired"
    else:
        sub.status = "active"
        
    sub.cancel_date = None
    db.commit()
    return {"message": "订阅已启用"}


@router.post("/{sub_id}/payments", response_model=SubscriptionResponse)
async def add_payment_record(
    sub_id: int,
    request: PaymentRecordCreate,
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a manual payment record to a subscription."""
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="订阅不存在")

    # Overlap validation: check if [start_date, end_date) overlaps with existing records
    existing = db.query(PaymentHistory).filter(
        PaymentHistory.subscription_id == sub_id,
        PaymentHistory.start_date < request.end_date,
        PaymentHistory.end_date > request.start_date,
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"时间段与现有记录冲突（{existing.start_date} ~ {existing.end_date}）"
        )

    unified = get_unified_currency(db)
    rate = None
    cost_unified = None

    if unified:
        if sub.currency_original.upper() == unified.upper():
            rate = Decimal("1.0")
            cost_unified = request.cost_original
        else:
            rate = get_exchange_rate(db, sub.currency_original, unified)
            if rate is None:
                rate = await fetch_and_cache_rate(db, sub.currency_original, unified)
            if rate:
                cost_unified = round(request.cost_original * rate, 2)

    monthly_cost = calc_monthly_cost(cost_unified, sub.cycle_amount, sub.cycle_unit) if cost_unified else None

    from datetime import datetime, timezone
    # Create payment history record
    payment = PaymentHistory(
        subscription_id=sub.id,
        type="payment",
        renewed_at=datetime.now(timezone.utc),
        start_date=request.start_date,
        end_date=request.end_date,
        cost_original=request.cost_original,
        currency_original=sub.currency_original,
        cost_unified=cost_unified,
        unified_currency=unified,
        exchange_rate=rate,
    )
    db.add(payment)
    db.flush()

    # Sync subscription dates from payment history
    _sync_subscription_dates(db, sub)

    sub.last_notified_at = None
    
    db.commit()

    sub = db.query(Subscription).options(
        joinedload(Subscription.category)
    ).filter(Subscription.id == sub.id).first()

    return _build_response(sub)


@router.patch("/{sub_id}/payments/{payment_id}", response_model=PaymentHistoryResponse)
def update_payment(
    sub_id: int,
    payment_id: int,
    request: PaymentRecordUpdate,
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update payment record cost (original currency) and recalculate unified cost."""
    payment = db.query(PaymentHistory).filter(
        PaymentHistory.id == payment_id,
        PaymentHistory.subscription_id == sub_id,
    ).first()
    if not payment:
        raise HTTPException(status_code=404, detail="付费记录不存在")

    payment.cost_original = request.cost_original

    # Recalculate unified cost using the stored exchange rate
    if payment.exchange_rate is not None:
        payment.cost_unified = round(request.cost_original * payment.exchange_rate, 2)

    db.commit()
    db.refresh(payment)
    return payment


@router.delete("/{sub_id}/payments/{payment_id}")
def delete_payment(
    sub_id: int,
    payment_id: int,
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a payment history record and re-sync subscription dates."""
    payment = db.query(PaymentHistory).filter(
        PaymentHistory.id == payment_id,
        PaymentHistory.subscription_id == sub_id,
    ).first()
    if not payment:
        raise HTTPException(status_code=404, detail="付费记录不存在")

    db.delete(payment)
    db.flush()

    # Re-sync subscription dates
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if sub:
        _sync_subscription_dates(db, sub)

    db.commit()
    return {"message": "付费记录已删除"}


@router.post("/fetch-favicon", response_model=FaviconResponse)
async def fetch_favicon_endpoint(
    request: FaviconRequest,
    _: str = Depends(get_current_user),
):
    """Fetch favicon for a URL."""
    from app.services.favicon import fetch_favicon
    favicon_url = await fetch_favicon(request.url)
    return FaviconResponse(favicon_url=favicon_url, success=favicon_url is not None)


@router.post("/upload-logo")
async def upload_logo(
    file: UploadFile = File(...),
    _: str = Depends(get_current_user),
):
    """Upload a custom logo image."""
    if file.size and file.size > app_settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="文件大小不能超过 2MB")

    ext = os.path.splitext(file.filename)[1] if file.filename else ".png"
    if ext.lower() not in [".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp"]:
        raise HTTPException(status_code=400, detail="不支持的文件格式")

    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(app_settings.UPLOAD_DIR, filename)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    return {"filename": filename, "url": f"/uploads/{filename}"}
