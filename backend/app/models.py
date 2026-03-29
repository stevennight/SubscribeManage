"""Database models for the subscription management system."""
from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, Date, DateTime,
    Numeric, ForeignKey, JSON, UniqueConstraint
)
from sqlalchemy.orm import relationship

from app.database import Base


class SystemConfig(Base):
    """System-wide configuration stored as key-value pairs."""
    __tablename__ = "system_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Config keys:
    # - username: login username
    # - password_hash: hashed login password
    # - unified_currency: target currency for conversions (locked after first set)
    # - unified_currency_locked: "true" once set
    # - exchange_rate_api_key: API key for exchange rate service
    # - telegram_bot_token: Telegram bot token
    # - telegram_chat_id: Telegram chat ID
    # - telegram_enabled: "true" / "false"


class Category(Base):
    """Subscription categories."""
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    icon = Column(String(50), nullable=True)  # Font Awesome icon name
    color = Column(String(20), nullable=True)  # Hex color code
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    subscriptions = relationship("Subscription", back_populates="category")


class Subscription(Base):
    """Main subscription records."""
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)

    # Billing cycle: N * (day/month/year)
    cycle_amount = Column(Integer, nullable=False, default=1)
    cycle_unit = Column(String(10), nullable=False, default="month")  # day/month/year

    # Cost
    cost_original = Column(Numeric(12, 2), nullable=False)
    currency_original = Column(String(10), nullable=False, default="USD")
    cost_unified = Column(Numeric(12, 2), nullable=True)  # converted to unified currency
    exchange_rate = Column(Numeric(16, 6), nullable=True)
    monthly_cost = Column(Numeric(12, 2), nullable=True)  # monthly cost in unified currency

    # Dates
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)

    # Reminder
    reminder_days = Column(Integer, default=7)  # days before expiry to start reminding

    # URL / Logo
    url = Column(String(500), nullable=True)
    logo_type = Column(String(20), default="default")  # default/favicon/fontawesome/upload
    logo_value = Column(String(500), nullable=True)

    # Payment
    payment_method = Column(String(100), nullable=True)

    # Status: active / expiring / expired / disabled
    status = Column(String(20), default="active", index=True)
    cancel_date = Column(Date, nullable=True)

    # Notification tracking
    last_notified_at = Column(DateTime, nullable=True)

    # Notes
    notes = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    category = relationship("Category", back_populates="subscriptions")
    payment_history = relationship(
        "PaymentHistory", back_populates="subscription",
        order_by="desc(PaymentHistory.renewed_at)"
    )

    @property
    def monthly_cost_original(self) -> Decimal:
        """Calculate the monthly cost in the original currency."""
        if not self.cost_original or not self.cycle_amount:
            return Decimal("0.0")
        if self.cycle_unit == "day":
            return round(self.cost_original / self.cycle_amount * 30, 2)
        elif self.cycle_unit == "month":
            return round(self.cost_original / self.cycle_amount, 2)
        elif self.cycle_unit == "year":
            return round(self.cost_original / (self.cycle_amount * 12), 2)
        return self.cost_original


class PaymentHistory(Base):
    """Payment history including initial activation and renewals."""
    __tablename__ = "payment_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=False)

    type = Column(String(20), nullable=False)  # initial / renewal
    renewed_at = Column(DateTime, default=datetime.utcnow)

    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=False)

    cost_original = Column(Numeric(12, 2), nullable=False)
    currency_original = Column(String(10), nullable=False)
    cost_unified = Column(Numeric(12, 2), nullable=True)
    unified_currency = Column(String(10), nullable=True)  # redundant record
    exchange_rate = Column(Numeric(16, 6), nullable=True)

    subscription = relationship("Subscription", back_populates="payment_history")


class ExchangeRate(Base):
    """Exchange rate cache with manual/API mode per currency pair."""
    __tablename__ = "exchange_rates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    base_currency = Column(String(10), nullable=False)
    target_currency = Column(String(10), nullable=False)
    rate = Column(Numeric(16, 6), nullable=False)
    is_manual = Column(Boolean, default=False)  # True = manual, False = API-managed
    fetched_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("base_currency", "target_currency", name="uq_currency_pair"),
    )
