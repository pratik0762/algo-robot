"""
ALGO ROBOT — Market Data Streaming Package
"""

from app.market_data.base_adapter import (
    BaseMarketDataFeedAdapter,
    FeedStatus,
    DataAuthenticity,
    NormalizedTick,
)
from app.market_data.kite_adapter import ZerodhaKiteTickerAdapter
from app.market_data.angel_adapter import AngelOneSmartStreamAdapter
from app.market_data.upstox_adapter import UpstoxWebSocketAdapter
from app.market_data.router import MarketDataRouter, market_data_router

__all__ = [
    "BaseMarketDataFeedAdapter",
    "FeedStatus",
    "DataAuthenticity",
    "NormalizedTick",
    "ZerodhaKiteTickerAdapter",
    "AngelOneSmartStreamAdapter",
    "UpstoxWebSocketAdapter",
    "MarketDataRouter",
    "market_data_router",
]
