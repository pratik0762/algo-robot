"""
ALGO ROBOT — Unified Market Data Feed Architecture
Defines base interfaces and data contracts for high-frequency broker WebSocket feeds.
Standardizes real-time ticks across Zerodha, Angel One, Upstox, Dhan, and NSE.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
import enum
from typing import Any, Callable, Dict, List, Optional, Awaitable


class FeedStatus(str, enum.Enum):
    CONNECTED = "CONNECTED"
    CONNECTING = "CONNECTING"
    DISCONNECTED = "DISCONNECTED"
    RECONNECTING = "RECONNECTING"
    UNAUTHORIZED = "UNAUTHORIZED"
    ERROR = "ERROR"


class DataAuthenticity(str, enum.Enum):
    REAL_LIVE = "REAL_LIVE"       # Active genuine tick received during market hours
    REAL_CLOSED = "REAL_CLOSED"   # Authentic settlement/closing quote outside market hours
    STALE = "STALE"               # Genuine tick but last updated > 10 seconds ago
    UNAVAILABLE = "UNAVAILABLE"   # Feed offline, disconnected, or unsubscribed


@dataclass
class NormalizedTick:
    """Standardized real-time market data tick contract across all providers."""
    symbol: str
    exchange: str
    instrument_token: int
    ltp: float
    change: float
    percent_change: float
    open: float
    high: float
    low: float
    close: float
    volume: int
    bid: float
    ask: float
    bid_qty: int
    ask_qty: int
    oi: int
    timestamp: float
    feed_source: str
    data_status: DataAuthenticity = DataAuthenticity.REAL_LIVE
    is_simulated: bool = False  # Strictly False under Rule 1

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["data_status"] = self.data_status.value
        return d


class BaseMarketDataFeedAdapter(ABC):
    """Abstract interface that every broker WebSocket streaming adapter must implement."""

    def __init__(self, name: str):
        self.name = name
        self.status: FeedStatus = FeedStatus.DISCONNECTED
        self.last_tick_time: float = 0.0
        self.subscribed_tokens: set = set()
        self.on_tick_callback: Optional[Callable[[NormalizedTick], Awaitable[None]]] = None

    @abstractmethod
    async def connect(self) -> bool:
        """Establishes persistent WebSocket connection to broker streaming gateway."""
        pass

    @abstractmethod
    async def disconnect(self) -> None:
        """Gracefully terminates WebSocket streaming session."""
        pass

    @abstractmethod
    async def subscribe(self, tokens: List[int], symbols: Optional[List[str]] = None) -> bool:
        """Subscribes to live tick streaming for specified instrument tokens/symbols."""
        pass

    @abstractmethod
    async def unsubscribe(self, tokens: List[int]) -> bool:
        """Unsubscribes from live tick streaming for specified tokens."""
        pass

    @abstractmethod
    def is_connected(self) -> bool:
        """Returns True if the WebSocket connection is actively streaming."""
        pass

    def get_status(self) -> Dict[str, Any]:
        """Returns diagnostic telemetry for the feed adapter."""
        return {
            "name": self.name,
            "status": self.status.value,
            "is_connected": self.is_connected(),
            "subscribed_instruments_count": len(self.subscribed_tokens),
            "last_tick_time": self.last_tick_time,
            "seconds_since_last_tick": round(datetime.now(timezone.utc).timestamp() - self.last_tick_time, 2)
            if self.last_tick_time > 0 else None,
        }
