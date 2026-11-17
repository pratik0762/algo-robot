"""
ALGO ROBOT — Unified Market Data Provider Interface
Defines the standard contract that every licensed market data feed, broker API,
and exchange source adapter must implement.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set, Awaitable

from app.db.models import (
    DataAuthenticityStatus,
    ExchangeCode,
    BoardType,
    SubscriptionTier,
)


@dataclass
class ProviderCapabilities:
    """Discovery descriptor for what data types and depths a provider supports."""
    provider_code: str
    display_name: str
    supports_live_ticks: bool = False
    supports_order_book_depth: bool = False
    supports_historical_intraday: bool = False
    supports_historical_daily: bool = False
    supports_eod_bhavcopy: bool = False
    supports_corporate_actions: bool = False
    supports_fundamentals: bool = False
    supported_exchanges: List[str] = field(default_factory=lambda: ["NSE", "BSE"])
    supported_timeframes: List[str] = field(default_factory=lambda: ["1m", "5m", "15m", "1h", "1d"])
    max_live_subscriptions: int = 500  # Strict throttle ceiling
    rate_limit_requests_per_sec: int = 10


@dataclass
class ProviderQuote:
    """Standardized quote response contract from any provider."""
    instrument_id: str
    symbol: str
    exchange: str
    ltp: float
    open: float = 0.0
    high: float = 0.0
    low: float = 0.0
    close: float = 0.0
    volume: int = 0
    turnover: float = 0.0
    bid: float = 0.0
    ask: float = 0.0
    bid_qty: int = 0
    ask_qty: int = 0
    last_trade_qty: int = 0
    avg_price: float = 0.0
    upper_circuit: float = 0.0
    lower_circuit: float = 0.0
    high_52w: float = 0.0
    low_52w: float = 0.0
    data_status: DataAuthenticityStatus = DataAuthenticityStatus.LIVE
    is_delayed: bool = False
    freshness_age_ms: float = 0.0
    timestamp: float = field(default_factory=lambda: datetime.now(timezone.utc).timestamp())
    source: str = "PROVIDER"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "instrument_id": self.instrument_id,
            "symbol": self.symbol,
            "exchange": self.exchange,
            "ltp": self.ltp,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
            "turnover": self.turnover,
            "bid": self.bid,
            "ask": self.ask,
            "bid_qty": self.bid_qty,
            "ask_qty": self.ask_qty,
            "last_trade_qty": self.last_trade_qty,
            "avg_price": self.avg_price,
            "upper_circuit": self.upper_circuit,
            "lower_circuit": self.lower_circuit,
            "high_52w": self.high_52w,
            "low_52w": self.low_52w,
            "data_status": self.data_status.value if hasattr(self.data_status, "value") else str(self.data_status),
            "is_delayed": self.is_delayed,
            "freshness_age_ms": round(self.freshness_age_ms, 2),
            "timestamp": self.timestamp,
            "source": self.source,
        }


@dataclass
class ProviderCandle:
    """Standardized OHLCV candle response."""
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    turnover: float = 0.0
    trade_count: int = 0
    vwap: float = 0.0
    timeframe: str = "1d"
    source: str = "PROVIDER"
    data_status: DataAuthenticityStatus = DataAuthenticityStatus.HISTORICAL

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp.isoformat(),
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
            "turnover": self.turnover,
            "trade_count": self.trade_count,
            "vwap": self.vwap,
            "timeframe": self.timeframe,
            "source": self.source,
            "data_status": self.data_status.value if hasattr(self.data_status, "value") else str(self.data_status),
        }


class BaseMarketDataProvider(ABC):
    """Abstract Base Class for all market data source adapters and broker bridges."""

    def __init__(self, provider_code: str, display_name: str):
        self.provider_code = provider_code
        self.display_name = display_name
        self.capabilities = self.get_capabilities()
        self.is_connected = False
        self.last_heartbeat = 0.0
        self.error_count = 0
        self.last_error_message: Optional[str] = None
        self._subscribed_tokens: Set[str] = set()
        self._tick_listeners: List[Callable[[Dict[str, Any]], Awaitable[None]]] = []

    @abstractmethod
    def get_capabilities(self) -> ProviderCapabilities:
        """Returns the declared capabilities and throttles of this provider."""
        pass

    @abstractmethod
    async def get_instruments(self, exchange: Optional[ExchangeCode] = None) -> List[Dict[str, Any]]:
        """Fetches the tradeable instrument master list from the provider/exchange."""
        pass

    @abstractmethod
    async def get_quote(self, symbol_or_token: str, exchange: str = "NSE") -> ProviderQuote:
        """Fetches a single quote snapshot for the specified symbol."""
        pass

    @abstractmethod
    async def get_quotes_batch(self, requests: List[Dict[str, str]]) -> Dict[str, ProviderQuote]:
        """Fetches quotes in bulk for up to provider batch size limits."""
        pass

    @abstractmethod
    async def get_historical_candles(
        self,
        symbol_or_token: str,
        exchange: str,
        timeframe: str,
        start_time: datetime,
        end_time: datetime,
    ) -> List[ProviderCandle]:
        """Fetches historical OHLCV bars for the specified instrument and date range."""
        pass

    @abstractmethod
    async def subscribe_ticks(self, instrument_tokens: List[str]) -> bool:
        """Subscribes to live WebSocket tick streaming for specified tokens."""
        pass

    @abstractmethod
    async def unsubscribe_ticks(self, instrument_tokens: List[str]) -> bool:
        """Unsubscribes from live WebSocket tick streaming."""
        pass

    @abstractmethod
    async def get_market_status(self) -> Dict[str, Any]:
        """Returns trading session status (e.g. OPEN, CLOSED, PRE_OPEN)."""
        pass

    def get_provider_status(self) -> Dict[str, Any]:
        """Returns telemetry health metrics for this provider."""
        return {
            "provider_code": self.provider_code,
            "display_name": self.display_name,
            "is_connected": self.is_connected,
            "last_heartbeat": self.last_heartbeat,
            "active_subscriptions": len(self._subscribed_tokens),
            "max_subscriptions": self.capabilities.max_live_subscriptions,
            "error_count": self.error_count,
            "last_error": self.last_error_message,
        }

    def register_tick_listener(self, listener: Callable[[Dict[str, Any]], Awaitable[None]]) -> None:
        if listener not in self._tick_listeners:
            self._tick_listeners.append(listener)

    def unregister_tick_listener(self, listener: Callable[[Dict[str, Any]], Awaitable[None]]) -> None:
        if listener in self._tick_listeners:
            self._tick_listeners.remove(listener)
