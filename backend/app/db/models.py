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


# =========================================================================
# ALL-INDIA LISTED COMPANIES & UNIFIED MARKET DATA SCHEMA (20 TABLES)
# =========================================================================

class ExchangeCode(str, enum.Enum):
    NSE = "NSE"
    BSE = "BSE"


class BoardType(str, enum.Enum):
    MAINBOARD = "MAINBOARD"
    SME = "SME"


class MarketCapCategory(str, enum.Enum):
    LARGE_CAP = "LARGE_CAP"
    MID_CAP = "MID_CAP"
    SMALL_CAP = "SMALL_CAP"
    MICRO_CAP = "MICRO_CAP"


class SecurityType(str, enum.Enum):
    EQUITY = "EQUITY"
    PREFERENCE = "PREFERENCE"
    REIT = "REIT"
    INVIT = "INVIT"
    INDEX = "INDEX"


class InstrumentStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    DELISTED = "DELISTED"
    NEWLY_LISTED = "NEWLY_LISTED"


class DataAuthenticityStatus(str, enum.Enum):
    LIVE = "LIVE"
    DELAYED = "DELAYED"
    HISTORICAL = "HISTORICAL"
    EOD = "EOD"
    STALE = "STALE"
    UNAVAILABLE = "UNAVAILABLE"
    SUBSCRIPTION_REQUIRED = "SUBSCRIPTION_REQUIRED"
    PROVIDER_ERROR = "PROVIDER_ERROR"


class SubscriptionTier(str, enum.Enum):
    EOD = "EOD"
    ON_DEMAND = "ON_DEMAND"
    WATCHLIST = "WATCHLIST"
    SCANNER = "SCANNER"
    LIVE = "LIVE"


class IngestionJobStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    PARTIAL = "PARTIAL"


# 1. companies
class Company(Base):
    """Canonical company master across NSE and BSE."""
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(String(50), unique=True, nullable=False, index=True)
    legal_name = Column(String(255), nullable=False)
    normalized_name = Column(String(255), nullable=False, index=True)
    primary_isin = Column(String(12), unique=True, nullable=False, index=True)
    cin = Column(String(25), nullable=True)
    sector = Column(String(100), nullable=True, index=True)
    industry = Column(String(150), nullable=True, index=True)
    market_cap_category = Column(Enum(MarketCapCategory), default=MarketCapCategory.SMALL_CAP, nullable=False, index=True)
    market_cap_cr = Column(Float, default=0.0, nullable=False)
    listing_status = Column(Enum(InstrumentStatus), default=InstrumentStatus.ACTIVE, nullable=False, index=True)
    website = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    instruments = relationship("Instrument", back_populates="company", cascade="all, delete-orphan")
    fundamentals = relationship("CompanyFundamental", back_populates="company", uselist=False, cascade="all, delete-orphan")
    financial_statements = relationship("FinancialStatement", back_populates="company", cascade="all, delete-orphan")
    corporate_actions = relationship("CorporateAction", back_populates="company", cascade="all, delete-orphan")
    corporate_announcements = relationship("CorporateAnnouncement", back_populates="company", cascade="all, delete-orphan")
    shareholding_patterns = relationship("ShareholdingPattern", back_populates="company", cascade="all, delete-orphan")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "company_id": self.company_id,
            "legal_name": self.legal_name,
            "normalized_name": self.normalized_name,
            "primary_isin": self.primary_isin,
            "cin": self.cin,
            "sector": self.sector,
            "industry": self.industry,
            "market_cap_category": self.market_cap_category.value if hasattr(self.market_cap_category, "value") else str(self.market_cap_category),
            "market_cap_cr": self.market_cap_cr,
            "listing_status": self.listing_status.value if hasattr(self.listing_status, "value") else str(self.listing_status),
            "website": self.website,
            "description": self.description,
            "instruments_count": len(self.instruments) if self.instruments else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# 2. instruments
class Instrument(Base):
    """Exchange-specific tradeable instrument (NSE Mainboard/SME or BSE Mainboard/SME)."""
    __tablename__ = "instruments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    instrument_id = Column(String(50), unique=True, nullable=False, index=True) # e.g. NSE_RELIANCE, BSE_500325
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    exchange = Column(Enum(ExchangeCode), nullable=False, index=True)
    exchange_symbol = Column(String(50), nullable=False, index=True) # Symbol or Scrip Code
    trading_symbol = Column(String(50), nullable=False, index=True)
    isin = Column(String(12), nullable=False, index=True)
    series = Column(String(10), default="EQ", nullable=False) # EQ, BE, SM, ST, A, B, M
    segment = Column(String(20), default="EQUITY", nullable=False)
    board_type = Column(Enum(BoardType), default=BoardType.MAINBOARD, nullable=False, index=True)
    security_type = Column(Enum(SecurityType), default=SecurityType.EQUITY, nullable=False)
    instrument_status = Column(Enum(InstrumentStatus), default=InstrumentStatus.ACTIVE, nullable=False, index=True)
    listing_date = Column(DateTime, nullable=True)
    delisting_date = Column(DateTime, nullable=True)
    lot_size = Column(Integer, default=1, nullable=False)
    tick_size = Column(Float, default=0.05, nullable=False)
    face_value = Column(Float, default=10.0, nullable=False)
    is_fno_eligible = Column(Boolean, default=False, nullable=False)
    currency = Column(String(10), default="INR", nullable=False)
    source = Column(String(50), default="EXCHANGE_MASTER", nullable=False)
    last_verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    company = relationship("Company", back_populates="instruments")
    quote = relationship("MarketQuote", back_populates="instrument", uselist=False, cascade="all, delete-orphan")
    listings = relationship("ExchangeListing", back_populates="instrument", cascade="all, delete-orphan")
    symbol_mappings = relationship("HistoricalSymbolMapping", back_populates="instrument", cascade="all, delete-orphan")
    subscription_status = relationship("DataSubscriptionStatus", back_populates="instrument", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_exchange_symbol", "exchange", "exchange_symbol", unique=True),
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "instrument_id": self.instrument_id,
            "company_id": self.company_id,
            "exchange": self.exchange.value if hasattr(self.exchange, "value") else str(self.exchange),
            "exchange_symbol": self.exchange_symbol,
            "trading_symbol": self.trading_symbol,
            "isin": self.isin,
            "series": self.series,
            "segment": self.segment,
            "board_type": self.board_type.value if hasattr(self.board_type, "value") else str(self.board_type),
            "security_type": self.security_type.value if hasattr(self.security_type, "value") else str(self.security_type),
            "instrument_status": self.instrument_status.value if hasattr(self.instrument_status, "value") else str(self.instrument_status),
            "listing_date": self.listing_date.isoformat() if self.listing_date else None,
            "delisting_date": self.delisting_date.isoformat() if self.delisting_date else None,
            "lot_size": self.lot_size,
            "tick_size": self.tick_size,
            "face_value": self.face_value,
            "is_fno_eligible": self.is_fno_eligible,
            "currency": self.currency,
            "source": self.source,
            "last_verified_at": self.last_verified_at.isoformat() if self.last_verified_at else None,
        }


# 3. exchange_listings
class ExchangeListing(Base):
    """Tracks initial IPO, exchange migration, and listing events."""
    __tablename__ = "exchange_listings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False, index=True)
    exchange = Column(Enum(ExchangeCode), nullable=False, index=True)
    listing_date = Column(DateTime, nullable=True)
    delisting_date = Column(DateTime, nullable=True)
    initial_issue_price = Column(Float, nullable=True)
    status = Column(String(20), default="ACTIVE", nullable=False)

    instrument = relationship("Instrument", back_populates="listings")


# 4. historical_symbol_mappings
class HistoricalSymbolMapping(Base):
    """Historical tracking for ticker renames, mergers, and scrip changes."""
    __tablename__ = "historical_symbol_mappings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False, index=True)
    old_symbol = Column(String(50), nullable=False, index=True)
    new_symbol = Column(String(50), nullable=False, index=True)
    change_date = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    reason = Column(String(255), nullable=True)

    instrument = relationship("Instrument", back_populates="symbol_mappings")


# 5. market_sessions
class MarketSession(Base):
    """Official exchange trading hours and session phases."""
    __tablename__ = "market_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    exchange = Column(Enum(ExchangeCode), nullable=False, index=True)
    session_name = Column(String(50), nullable=False) # REGULAR, PRE_OPEN, POST_CLOSE, BLOCK_DEAL
    start_time = Column(String(10), nullable=False)  # HH:MM:SS
    end_time = Column(String(10), nullable=False)    # HH:MM:SS
    is_active = Column(Boolean, default=True, nullable=False)


# 6. exchange_holidays
class ExchangeHoliday(Base):
    """Official exchange holiday calendar."""
    __tablename__ = "exchange_holidays"

    id = Column(Integer, primary_key=True, autoincrement=True)
    exchange = Column(Enum(ExchangeCode), nullable=False, index=True)
    holiday_date = Column(String(10), nullable=False, index=True) # YYYY-MM-DD
    holiday_name = Column(String(100), nullable=False)
    closed_trading = Column(Boolean, default=True, nullable=False)
    closed_clearing = Column(Boolean, default=True, nullable=False)


# 7. market_quotes
class MarketQuote(Base):
    """Real-time cached snapshot quote for every instrument."""
    __tablename__ = "market_quotes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    ltp = Column(Float, nullable=False)
    change = Column(Float, default=0.0, nullable=False)
    percent_change = Column(Float, default=0.0, nullable=False)
    open = Column(Float, default=0.0, nullable=False)
    high = Column(Float, default=0.0, nullable=False)
    low = Column(Float, default=0.0, nullable=False)
    previous_close = Column(Float, default=0.0, nullable=False)
    volume = Column(Integer, default=0, nullable=False)
    turnover = Column(Float, default=0.0, nullable=False)
    bid = Column(Float, default=0.0, nullable=False)
    ask = Column(Float, default=0.0, nullable=False)
    bid_qty = Column(Integer, default=0, nullable=False)
    ask_qty = Column(Integer, default=0, nullable=False)
    last_trade_qty = Column(Integer, default=0, nullable=False)
    avg_trade_price = Column(Float, default=0.0, nullable=False)
    upper_circuit = Column(Float, default=0.0, nullable=False)
    lower_circuit = Column(Float, default=0.0, nullable=False)
    high_52w = Column(Float, default=0.0, nullable=False)
    low_52w = Column(Float, default=0.0, nullable=False)
    data_status = Column(Enum(DataAuthenticityStatus), default=DataAuthenticityStatus.EOD, nullable=False)
    is_delayed = Column(Boolean, default=False, nullable=False)
    freshness_age_ms = Column(Float, default=0.0, nullable=False)
    timestamp = Column(Float, default=0.0, nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    instrument = relationship("Instrument", back_populates="quote")


# 8. market_ticks
class MarketTick(Base):
    """High-frequency tick storage for liquid securities."""
    __tablename__ = "market_ticks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False, index=True)
    timestamp = Column(Float, nullable=False, index=True)
    ltp = Column(Float, nullable=False)
    volume = Column(Integer, default=0, nullable=False)
    bid = Column(Float, default=0.0, nullable=False)
    ask = Column(Float, default=0.0, nullable=False)
    source = Column(String(50), default="BROKER_WS", nullable=False)


# 9. market_candles
class MarketCandle(Base):
    """Multi-timeframe OHLCV candles (1s, 1m, 3m, 5m, 15m, 1h, 1d, 1w, 1M)."""
    __tablename__ = "market_candles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False, index=True)
    timeframe = Column(String(10), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Float, default=0.0, nullable=False)
    turnover = Column(Float, default=0.0, nullable=False)
    trade_count = Column(Integer, default=0, nullable=False)
    vwap = Column(Float, default=0.0, nullable=False)
    source = Column(String(50), default="BROKER_HISTORICAL", nullable=False)
    data_status = Column(Enum(DataAuthenticityStatus), default=DataAuthenticityStatus.HISTORICAL, nullable=False)

    __table_args__ = (
        Index("idx_market_candle_unique", "instrument_id", "timeframe", "timestamp", unique=True),
    )


# 10. company_fundamentals
class CompanyFundamental(Base):
    """Fundamental valuation ratios and balance sheet metrics."""
    __tablename__ = "company_fundamentals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    pe_ratio = Column(Float, default=0.0, nullable=False)
    pb_ratio = Column(Float, default=0.0, nullable=False)
    eps = Column(Float, default=0.0, nullable=False)
    roe = Column(Float, default=0.0, nullable=False)
    roce = Column(Float, default=0.0, nullable=False)
    dividend_yield = Column(Float, default=0.0, nullable=False)
    debt_to_equity = Column(Float, default=0.0, nullable=False)
    book_value = Column(Float, default=0.0, nullable=False)
    enterprise_value = Column(Float, default=0.0, nullable=False)
    ebitda = Column(Float, default=0.0, nullable=False)
    revenue = Column(Float, default=0.0, nullable=False)
    net_profit = Column(Float, default=0.0, nullable=False)
    operating_margin = Column(Float, default=0.0, nullable=False)
    source = Column(String(50), default="OFFICIAL_FILING", nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    company = relationship("Company", back_populates="fundamentals")


# 11. financial_statements
class FinancialStatement(Base):
    """Quarterly and annual financial results (P&L, Balance Sheet, Cash Flow)."""
    __tablename__ = "financial_statements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    period_type = Column(String(20), nullable=False) # QUARTERLY, ANNUAL
    statement_type = Column(String(20), nullable=False) # PNL, BALANCE_SHEET, CASH_FLOW
    classification = Column(String(20), default="CONSOLIDATED", nullable=False) # CONSOLIDATED, STANDALONE
    period_name = Column(String(50), nullable=False) # e.g. "Q3 FY25", "FY2024"
    period_end_date = Column(String(10), nullable=True)
    revenue = Column(Float, nullable=True)
    operating_expenses = Column(Float, nullable=True)
    ebitda = Column(Float, nullable=True)
    pbt = Column(Float, nullable=True)
    pat = Column(Float, nullable=True)
    eps = Column(Float, nullable=True)
    total_assets = Column(Float, nullable=True)
    total_debt = Column(Float, nullable=True)
    net_worth = Column(Float, nullable=True)
    cash_flow_operating = Column(Float, nullable=True)
    cash_flow_investing = Column(Float, nullable=True)
    cash_flow_financing = Column(Float, nullable=True)
    data_json = Column(Text, nullable=True)
    source = Column(String(50), default="NSE_RESULTS", nullable=False)
    published_at = Column(DateTime, nullable=True)

    company = relationship("Company", back_populates="financial_statements")


# 12. corporate_actions
class CorporateAction(Base):
    """Corporate actions (dividends, splits, bonuses, rights issues)."""
    __tablename__ = "corporate_actions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    action_type = Column(String(50), nullable=False, index=True) # DIVIDEND, SPLIT, BONUS, RIGHTS, BUYBACK
    ex_date = Column(String(10), nullable=True, index=True)
    record_date = Column(String(10), nullable=True)
    ratio_or_amount = Column(String(50), nullable=True)
    description = Column(Text, nullable=True)
    source = Column(String(50), default="EXCHANGE_CIRCULAR", nullable=False)

    company = relationship("Company", back_populates="corporate_actions")


# 13. corporate_announcements
class CorporateAnnouncement(Base):
    """Regulatory disclosures and exchange filings."""
    __tablename__ = "corporate_announcements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    category = Column(String(100), default="GENERAL", nullable=False)
    broadcast_date = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    attachment_url = Column(String(500), nullable=True)
    summary = Column(Text, nullable=True)
    source = Column(String(50), default="EXCHANGE_FEED", nullable=False)

    company = relationship("Company", back_populates="corporate_announcements")


# 14. shareholding_patterns
class ShareholdingPattern(Base):
    """Quarterly institutional and promoter equity distributions."""
    __tablename__ = "shareholding_patterns"

    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    quarter = Column(String(20), nullable=False, index=True) # e.g. "Q3 FY25"
    promoter_holding_pct = Column(Float, default=0.0, nullable=False)
    fii_holding_pct = Column(Float, default=0.0, nullable=False)
    dii_holding_pct = Column(Float, default=0.0, nullable=False)
    public_holding_pct = Column(Float, default=0.0, nullable=False)
    source = Column(String(50), default="EXCHANGE_FILING", nullable=False)

    company = relationship("Company", back_populates="shareholding_patterns")


# 15. provider_registry
class ProviderRegistry(Base):
    """Catalog of connected and authorized data providers."""
    __tablename__ = "provider_registry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider_code = Column(String(50), unique=True, nullable=False, index=True) # ZERODHA, ANGEL_ONE, UPSTOX, DHAN, NSE, BSE
    display_name = Column(String(100), nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False)
    priority = Column(Integer, default=1, nullable=False)
    capabilities_json = Column(Text, nullable=True)
    status = Column(String(20), default="ACTIVE", nullable=False)
    last_heartbeat_at = Column(DateTime, nullable=True)


# 16. provider_instruments
class ProviderInstrument(Base):
    """Maps broker/vendor specific instrument tokens to canonical instruments."""
    __tablename__ = "provider_instruments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider_code = Column(String(50), ForeignKey("provider_registry.provider_code", ondelete="CASCADE"), nullable=False, index=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False, index=True)
    provider_token = Column(String(50), nullable=False, index=True)
    provider_symbol = Column(String(50), nullable=False)
    is_tradable = Column(Boolean, default=True, nullable=False)

    __table_args__ = (
        Index("idx_prov_inst_token", "provider_code", "provider_token", unique=True),
    )


# 17. data_ingestion_jobs
class DataIngestionJob(Base):
    """Audit ledger for automated universe synchronization and backfill tasks."""
    __tablename__ = "data_ingestion_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String(50), unique=True, nullable=False, index=True)
    job_name = Column(String(100), nullable=False)
    provider = Column(String(50), default="SYSTEM", nullable=False)
    status = Column(Enum(IngestionJobStatus), default=IngestionJobStatus.PENDING, nullable=False, index=True)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    ended_at = Column(DateTime, nullable=True)
    records_processed = Column(Integer, default=0, nullable=False)
    records_inserted = Column(Integer, default=0, nullable=False)
    records_updated = Column(Integer, default=0, nullable=False)
    records_skipped = Column(Integer, default=0, nullable=False)
    error_count = Column(Integer, default=0, nullable=False)
    error_details = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0, nullable=False)


# 18. data_quality_logs
class DataQualityLog(Base):
    """Anomalies detected by the central data quality engine."""
    __tablename__ = "data_quality_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False, index=True)
    anomaly_type = Column(String(50), nullable=False, index=True)
    details = Column(Text, nullable=False)
    occurred_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    resolved = Column(Boolean, default=False, nullable=False)


# 19. provider_health_logs
class ProviderHealthLog(Base):
    """Connection latency, disconnects, and health status logs."""
    __tablename__ = "provider_health_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider_code = Column(String(50), nullable=False, index=True)
    event_type = Column(String(50), nullable=False, index=True)
    latency_ms = Column(Float, default=0.0, nullable=False)
    message = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)


# 20. data_subscription_status
class DataSubscriptionStatus(Base):
    """Tracks active subscription tier and quota for each instrument."""
    __tablename__ = "data_subscription_status"

    id = Column(Integer, primary_key=True, autoincrement=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    current_tier = Column(Enum(SubscriptionTier), default=SubscriptionTier.EOD, nullable=False, index=True)
    is_live = Column(Boolean, default=False, nullable=False)
    last_requested_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    subscribers_count = Column(Integer, default=0, nullable=False)

    instrument = relationship("Instrument", back_populates="subscription_status")

