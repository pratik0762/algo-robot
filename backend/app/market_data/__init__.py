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

from app.market_data.symbol_resolver import symbol_resolver, SymbolResolver
from app.market_data.exchange_calendar import exchange_calendar, ExchangeCalendar
from app.market_data.universe_manager import universe_manager, UniverseManager
from app.market_data.subscription_manager import subscription_manager, SubscriptionManager
from app.market_data.historical_data_service import historical_data_service, HistoricalDataService
from app.market_data.live_quote_service import live_quote_service, LiveQuoteService
from app.market_data.data_quality_service import data_quality_engine, DataQualityEngine
from app.market_data.adapters.provider_registry import provider_registry_manager, ProviderRegistryManager

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
    "symbol_resolver",
    "SymbolResolver",
    "exchange_calendar",
    "ExchangeCalendar",
    "universe_manager",
    "UniverseManager",
    "subscription_manager",
    "SubscriptionManager",
    "historical_data_service",
    "HistoricalDataService",
    "live_quote_service",
    "LiveQuoteService",
    "data_quality_engine",
    "DataQualityEngine",
    "provider_registry_manager",
    "ProviderRegistryManager",
]
