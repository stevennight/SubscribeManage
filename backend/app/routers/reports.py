"""Reports API routes - dynamically computed from payment_history + subscriptions."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from dateutil.relativedelta import relativedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import Subscription, PaymentHistory, SystemConfig
from app.schemas import MonthlyReportResponse, ReportCategoryBreakdown, MonthlyTrendResponse, MonthlyTrendItem
from app.services.currency import get_unified_currency, calc_monthly_cost

router = APIRouter(prefix="/api/reports", tags=["Reports"])


def _get_month_range(year: int, month: int):
    """Get the first and last day of a month."""
    first_day = date(year, month, 1)
    if month == 12:
        last_day = date(year + 1, 1, 1) - relativedelta(days=1)
    else:
        last_day = date(year, month + 1, 1) - relativedelta(days=1)
    return first_day, last_day


def _compute_monthly_report(db: Session, year: int, month: int, unified_currency: str) -> MonthlyReportResponse:
    """Compute a monthly report for a specific month using daily proration.
    
    Each PaymentHistory record's cost is prorated by day:
    - total_days = (end_date - start_date).days  (end_date is exclusive)
    - daily_cost = cost / total_days
    - overlap_days with [month_first, month_last+1) 
    - prorated_cost = daily_cost * overlap_days
    """
    first_day, last_day = _get_month_range(year, month)
    # For overlap calculation, use the day after last_day as the exclusive upper bound
    month_end_exclusive = last_day + relativedelta(days=1)

    # Find all payment records that overlap with this month
    # Payment coverage: [start_date, end_date) — end_date is exclusive
    # Overlap condition: start_date < month_end_exclusive AND end_date > first_day
    payments = db.query(PaymentHistory).options(
        joinedload(PaymentHistory.subscription).joinedload(Subscription.category)
    ).filter(
        PaymentHistory.start_date < month_end_exclusive,
        PaymentHistory.end_date > first_day,
        PaymentHistory.start_date.isnot(None),
    ).all()

    category_data = {}  # category_name -> {category_id, cost, count_set, subs}

    for pay in payments:
        sub = pay.subscription
        if not sub or sub.status == "disabled":
            continue

        total_days = (pay.end_date - pay.start_date).days
        if total_days <= 0:
            continue

        # Use unified cost if available, otherwise original
        cost = Decimal(str(pay.cost_unified)) if pay.cost_unified is not None else Decimal(str(pay.cost_original))
        daily_cost = cost / Decimal(str(total_days))

        # Calculate overlap days with target month
        overlap_start = max(pay.start_date, first_day)
        overlap_end = min(pay.end_date, month_end_exclusive)
        overlap_days = (overlap_end - overlap_start).days
        if overlap_days <= 0:
            continue

        prorated_cost = daily_cost * Decimal(str(overlap_days))

        cat_name = sub.category.name if sub.category else "未分类"
        cat_id = sub.category_id

        if cat_name not in category_data:
            category_data[cat_name] = {
                "category_id": cat_id,
                "cost": Decimal("0"),
                "sub_ids": set(),
                "subs": [],
            }

        category_data[cat_name]["cost"] += prorated_cost

        # Track unique subscriptions per category
        if sub.id not in category_data[cat_name]["sub_ids"]:
            category_data[cat_name]["sub_ids"].add(sub.id)
            category_data[cat_name]["subs"].append({
                "id": sub.id,
                "name": sub.name,
                "monthly_cost": float(sub.monthly_cost or 0),
                "currency_original": sub.currency_original,
                "cost_original": float(sub.cost_original),
            })

    breakdown = []
    total = Decimal("0")
    for cat_name, data in sorted(category_data.items()):
        breakdown.append(ReportCategoryBreakdown(
            category_id=data["category_id"],
            category_name=cat_name,
            total_cost=round(data["cost"], 2),
            subscription_count=len(data["sub_ids"]),
            subscriptions=data["subs"],
        ))
        total += data["cost"]

    return MonthlyReportResponse(
        year=year,
        month=month,
        total_cost=round(total, 2),
        unified_currency=unified_currency or "",
        breakdown=breakdown,
    )


@router.get("/current-month", response_model=MonthlyReportResponse)
def get_current_month_report(
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get current month spending report."""
    today = date.today()
    unified = get_unified_currency(db) or ""
    return _compute_monthly_report(db, today.year, today.month, unified)


@router.get("/monthly-trend", response_model=MonthlyTrendResponse)
def get_monthly_trend(
    months: int = Query(12, ge=1, le=36),
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get monthly spending trend for the last N months."""
    unified = get_unified_currency(db) or ""
    today = date.today()
    data = []

    for i in range(months - 1, -1, -1):
        target = today - relativedelta(months=i)
        report = _compute_monthly_report(db, target.year, target.month, unified)
        data.append(MonthlyTrendItem(
            year=report.year,
            month=report.month,
            total_cost=report.total_cost,
        ))

    return MonthlyTrendResponse(unified_currency=unified, data=data)


@router.get("/{year}/{month}", response_model=MonthlyReportResponse)
def get_month_report(
    year: int,
    month: int,
    _: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get spending report for a specific month."""
    if month < 1 or month > 12:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="月份必须在 1-12 之间")

    unified = get_unified_currency(db) or ""
    return _compute_monthly_report(db, year, month, unified)
