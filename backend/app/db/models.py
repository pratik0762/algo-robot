"""
ALGO ROBOT — SQLAlchemy 2.0 Database Models
Institutional-grade schema for multi-tenant users, encrypted broker credentials,
orders, trade executions, signal lifecycle records, and historical market data.
"""

from datetime import datetime, timezone
import enum
from typing import Any, Dict, Optional
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Enum,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    TRADER = "TRADER"
    VIEWER = "VIEWER"


class BrokerName(str, enum.Enum):
    ZERODHA = "ZERODHA"
    ANGEL = "ANGEL"
    UPSTOX = "UPSTOX"
    DHAN = "DHAN"
    SHOONYA = "SHOONYA"
    PAPER = "PAPER"


class TransactionType(str, enum.Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderStatus(str, enum.Enum):
    PENDING = "PENDING"
    SUBMITTED = "SUBMITTED"
    OPEN = "OPEN"
    COMPLETE = "COMPLETE"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"


class SignalStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    TARGET_HIT = "TARGET_HIT"
    SL_HIT = "SL_HIT"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    role = Column(Enum(UserRole), default=UserRole.TRADER, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    broker_credentials = relationship("BrokerCredential", back_populates="user", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="user", cascade="all, delete-orphan")
    trades = relationship("Trade", back_populates="user", cascade="all, delete-orphan")
    risk_profile = relationship("RiskSetting", back_populates="user", uselist=False, cascade="all, delete-orphan")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role.value if hasattr(self.role, "value") else str(self.role),
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class BrokerCredential(Base):
    """Stores encrypted broker API credentials & access tokens."""
    __tablename__ = "broker_credentials"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    broker_name = Column(Enum(BrokerName), nullable=False)
    
    # All sensitive fields are stored AES-256-GCM encrypted
    encrypted_credentials = Column(Text, nullable=False)  # API Key, Secret, Client Code, etc.
    encrypted_token = Column(Text, nullable=True)         # Active Access Token / Session
    is_active = Column(Boolean, default=False, nullable=False)
    last_authenticated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="broker_credentials")

    __table_args__ = (
        Index("idx_user_broker", "user_id", "broker_name", unique=True),
    )


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    broker_order_id = Column(String(100), nullable=True, index=True)
    symbol = Column(String(50), nullable=False, index=True)
    exchange = Column(String(10), default="NSE", nullable=False)
    transaction_type = Column(Enum(TransactionType), nullable=False)
    product_type = Column(String(20), default="MIS", nullable=False)  # MIS, CNC, NRML
    order_type = Column(String(20), default="MARKET", nullable=False) # MARKET, LIMIT, SL, SL-M
    quantity = Column(Integer, nullable=False)
    filled_quantity = Column(Integer, default=0, nullable=False)
    price = Column(Float, default=0.0, nullable=False)
    trigger_price = Column(Float, default=0.0, nullable=False)
    average_price = Column(Float, default=0.0, nullable=False)
    status = Column(Enum(OrderStatus), default=OrderStatus.PENDING, nullable=False, index=True)
    rejection_reason = Column(String(255), nullable=True)
    is_paper = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="orders")
    trades = relationship("Trade", back_populates="order")


class Trade(Base):
    """Executions and fills ledger with exact regulatory friction breakdown."""
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    symbol = Column(String(50), nullable=False, index=True)
    exchange = Column(String(10), default="NSE", nullable=False)
    transaction_type = Column(Enum(TransactionType), nullable=False)
    quantity = Column(Integer, nullable=False)
    execution_price = Column(Float, nullable=False)
    
    # Indian Market Friction Breakdown (INR)
    brokerage = Column(Float, default=0.0, nullable=False)
    stt_tax = Column(Float, default=0.0, nullable=False)
    exchange_turnover_fee = Column(Float, default=0.0, nullable=False)
    gst = Column(Float, default=0.0, nullable=False)
    sebi_turnover_fee = Column(Float, default=0.0, nullable=False)
    stamp_duty = Column(Float, default=0.0, nullable=False)
    total_charges = Column(Float, default=0.0, nullable=False)
    net_pnl = Column(Float, default=0.0, nullable=False)

    executed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    order = relationship("Order", back_populates="trades")
    user = relationship("User", back_populates="trades")


class SignalRecord(Base):
    """Historical trade signals generated by quantitative & SMC engines."""
    __tablename__ = "signal_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(50), nullable=False, index=True)
    timeframe = Column(String(10), default="5m", nullable=False)
    strategy_name = Column(String(100), nullable=False, index=True)
    signal_type = Column(String(10), nullable=False) # BUY or SELL
    entry_price = Column(Float, nullable=False)
    stop_loss = Column(Float, nullable=False)
    target_1 = Column(Float, nullable=False)
    target_2 = Column(Float, nullable=True)
    status = Column(Enum(SignalStatus), default=SignalStatus.ACTIVE, nullable=False, index=True)
    exit_price = Column(Float, nullable=True)
    pnl_points = Column(Float, default=0.0, nullable=False)
    pnl_percentage = Column(Float, default=0.0, nullable=False)
    fired_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    closed_at = Column(DateTime, nullable=True)


class HistoricalOHLCV(Base):
    """Historical candles for backtesting and technical analysis."""
    __tablename__ = "historical_ohlcv"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(50), nullable=False, index=True)
    exchange = Column(String(10), default="NSE", nullable=False)
    timeframe = Column(String(10), default="1d", nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Float, default=0.0, nullable=False)
    open_interest = Column(Float, default=0.0, nullable=False)

    __table_args__ = (
        Index("idx_symbol_timeframe_ts", "symbol", "timeframe", "timestamp", unique=True),
    )


class RiskSetting(Base):
    """User-specific pre-trade risk thresholds and kill-switch state."""
    __tablename__ = "risk_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    max_daily_loss = Column(Float, default=10000.0, nullable=False) # INR
    max_capital_per_trade = Column(Float, default=50000.0, nullable=False) # INR
    max_open_positions = Column(Integer, default=5, nullable=False)
    max_order_quantity_limit = Column(Integer, default=1800, nullable=False)
    is_kill_switch_active = Column(Boolean, default=False, nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="risk_profile")


class RefreshToken(Base):
    """Tracks active and revoked JWT refresh tokens for session management."""
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    revoked = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", backref="refresh_tokens")
