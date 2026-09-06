"""Pydantic schemas for request/response validation."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field


# ============== Auth ==============

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserInfo(BaseModel):
    username: str


# ============== Category ==============

class CategoryCreate(BaseModel):
    name: str
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None


class CategoryResponse(BaseModel):
    id: int
    name: str
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: int
    subscription_count: int = 0

    class Config:
        from_attributes = True


# ============== Subscription ==============

class SubscriptionCreate(BaseModel):
    name: str
    category_id: Optional[int] = None
    cycle_amount: int = 1
    cycle_unit: str = "month"  # day/month/year
    cost_original: Decimal
    currency_original: str = "USD"
    reminder_days: int = 7
    url: Optional[str] = None
    logo_type: str = "default"
    logo_value: Optional[str] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None


class SubscriptionUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    cycle_amount: Optional[int] = None
    cycle_unit: Optional[str] = None
    cost_original: Optional[Decimal] = None
    currency_original: Optional[str] = None
    reminder_days: Optional[int] = None
    url: Optional[str] = None
    logo_type: Optional[str] = None
    logo_value: Optional[str] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None


class SubscriptionResponse(BaseModel):
    id: int
    name: str
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    cycle_amount: int
    cycle_unit: str
    cost_original: Decimal
    currency_original: str
    cost_unified: Optional[Decimal] = None
    exchange_rate: Optional[Decimal] = None
    monthly_cost: Optional[Decimal] = None
    monthly_cost_original: Optional[Decimal] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    reminder_days: int
    url: Optional[str] = None
    logo_type: str
    logo_value: Optional[str] = None
    payment_method: Optional[str] = None
    status: str
    cancel_date: Optional[date] = None
    last_notified_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SubscriptionListResponse(BaseModel):
    items: list[SubscriptionResponse]
    total: int
    total_monthly_cost: Decimal = Decimal("0")  # sum of monthly_cost for filtered results

class DashboardCategoryBreakdown(BaseModel):
    category_id: Optional[int] = None
    category_name: str
    total_cost: Decimal
    subscription_count: int


class DashboardStatsResponse(BaseModel):
    active_count: int
    expiring_count: int
    monthly_total: Decimal  # sum of monthly_cost for all non-disabled subs
    unified_currency: str
    breakdown: list[DashboardCategoryBreakdown] = []


class PaymentRecordCreate(BaseModel):
    start_date: date
    end_date: date
    cost_original: Decimal


class PaymentRecordUpdate(BaseModel):
    cost_original: Decimal

# ============== Payment History ==============

class PaymentHistoryResponse(BaseModel):
    id: int
    subscription_id: int
    renewed_at: Optional[datetime] = None
    start_date: Optional[date] = None
    end_date: date
    cost_original: Decimal
    currency_original: str
    cost_unified: Optional[Decimal] = None
    unified_currency: Optional[str] = None
    exchange_rate: Optional[Decimal] = None

    class Config:
        from_attributes = True


# ============== Exchange Rate ==============

class ExchangeRateResponse(BaseModel):
    id: int
    base_currency: str
    target_currency: str
    rate: Decimal
    is_manual: bool
    fetched_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ExchangeRateUpdate(BaseModel):
    base_currency: str
    target_currency: str
    rate: Decimal
    is_manual: bool = True


# ============== Settings ==============

class SettingsResponse(BaseModel):
    unified_currency: Optional[str] = None
    unified_currency_locked: bool = False
    exchange_rate_api_key: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_enabled: bool = False
    outbound_proxy_url: Optional[str] = None
    outbound_proxy_enabled: bool = False


class SettingsUpdate(BaseModel):
    unified_currency: Optional[str] = None
    exchange_rate_api_key: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_enabled: Optional[bool] = None
    outbound_proxy_url: Optional[str] = None
    outbound_proxy_enabled: Optional[bool] = None


class PasswordChange(BaseModel):
    old_password: str
    new_password: str


class UsernameChange(BaseModel):
    new_username: str
    password: str  # require password confirmation


# ============== Reports ==============

class ReportCategoryBreakdown(BaseModel):
    category_id: Optional[int] = None
    category_name: str
    total_cost: Decimal
    subscription_count: int
    subscriptions: list[dict] = []


class MonthlyReportResponse(BaseModel):
    year: int
    month: int
    total_cost: Decimal
    unified_currency: str
    breakdown: list[ReportCategoryBreakdown]


class MonthlyTrendItem(BaseModel):
    year: int
    month: int
    total_cost: Decimal


class MonthlyTrendResponse(BaseModel):
    unified_currency: str
    data: list[MonthlyTrendItem]


# ============== Favicon ==============

class FaviconRequest(BaseModel):
    url: str


class FaviconResponse(BaseModel):
    favicon_url: Optional[str] = None
    success: bool
