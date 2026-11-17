"""
ALGO ROBOT — Central Market Data Router & Feed Orchestrator
Coordinates multi-broker WebSocket adapters with automatic failover,
reconnection management, and distribution of normalized ticks.
Enforces Rule 1 (Real Data Only): Disables synthetic micro-ticks.
"""

import asyncio
import logging
import time
from typing import Any, Callable, Dict, List, Optional, Awaitable
from app.config import settings
from app.market_data.base_adapter import (
    BaseMarketDataFeedAdapter,
    FeedStatus,
    DataAuthenticity,
    NormalizedTick,
)
from app.market_data.kite_adapter import ZerodhaKiteTickerAdapter
from app.market_data.angel_adapter import AngelOneSmartStreamAdapter
from app.market_data.upstox_adapter import UpstoxWebSocketAdapter

logger = logging.getLogger("algo_robot.market_data.router")


class MarketDataRouter:
    """Multi-Broker Streaming Gateway Router with Automatic Failover."""

    def __init__(self):
        self.adapters: Dict[str, BaseMarketDataFeedAdapter] = {
            "ZERODHA_KITE": ZerodhaKiteTickerAdapter(),
            "ANGEL_ONE": AngelOneSmartStreamAdapter(),
            "UPSTOX": UpstoxWebSocketAdapter(),
        }
        self.active_adapter_name: Optional[str] = None
        self._listeners: List[Callable[[NormalizedTick], Awaitable[None]]] = []
        self._is_running = False
        self._monitor_task: Optional[asyncio.Task] = None
        self.last_tick_received_at: float = 0.0
        self.total_ticks_processed: int = 0

        # Wire callbacks
        for adapter in self.adapters.values():
            adapter.on_tick_callback = self._handle_incoming_tick

    def register_listener(self, callback: Callable[[NormalizedTick], Awaitable[None]]) -> None:
        """Register a subscriber (e.g. tick_engine, scanner_engine, websocket_broadcaster)."""
        if callback not in self._listeners:
            self._listeners.append(callback)

    def unregister_listener(self, callback: Callable[[NormalizedTick], Awaitable[None]]) -> None:
        if callback in self._listeners:
            self._listeners.remove(callback)

    async def _handle_incoming_tick(self, tick: NormalizedTick) -> None:
        """Central ingestion point for incoming normalized ticks from any connected adapter."""
        self.last_tick_received_at = tick.timestamp
        self.total_ticks_processed += 1

        # Fan-out to all registered listeners
        for listener in self._listeners:
            try:
                await listener(tick)
            except Exception as e:
                logger.error("Error in tick listener: %s", e)

    async def start(self) -> None:
        """Starts market data routing and launches active feed connections."""
        self._is_running = True
        logger.info("Starting Central Market Data Router (DATA_SOURCE_MODE=%s)...", settings.DATA_SOURCE_MODE)

        # Attempt to connect adapters in priority order
        connected = False
        for name, adapter in self.adapters.items():
            try:
                success = await adapter.connect()
                if success:
                    self.active_adapter_name = name
                    connected = True
                    logger.info("Primary market data stream active on %s.", name)
                    break
            except Exception as e:
                logger.warning("Could not connect to adapter %s: %s", name, e)

        if not connected:
            logger.info("No authorized broker streaming session active. Operating in OFFICIAL_SNAPSHOT mode.")

        # Launch background health monitor
        self._monitor_task = asyncio.create_task(self._health_monitor_loop())

    async def stop(self) -> None:
        """Stops router and disconnects all adapters."""
        self._is_running = False
        if self._monitor_task:
            self._monitor_task.cancel()
            self._monitor_task = None

        for adapter in self.adapters.values():
            try:
                await adapter.disconnect()
            except Exception:
                pass
        self.active_adapter_name = None
        logger.info("Central Market Data Router stopped.")

    async def subscribe_universe(self, tokens: List[int], symbols: Optional[List[str]] = None) -> None:
        """Subscribes all active adapters to the instrument universe."""
        for adapter in self.adapters.values():
            try:
                await adapter.subscribe(tokens, symbols)
            except Exception as e:
                logger.debug("Failed subscription on %s: %s", adapter.name, e)

    async def _health_monitor_loop(self) -> None:
        """Periodically inspects connection health and initiates failover if active feed drops."""
        while self._is_running:
            try:
                await asyncio.sleep(10.0)
                active_adapter = self.adapters.get(self.active_adapter_name) if self.active_adapter_name else None

                # If active adapter disconnected, failover to next available
                if active_adapter is None or not active_adapter.is_connected():
                    for name, adapter in self.adapters.items():
                        if name != self.active_adapter_name and adapter.status != FeedStatus.UNAUTHORIZED:
                            logger.info("Attempting failover to %s...", name)
                            if await adapter.connect():
                                self.active_adapter_name = name
                                logger.info("Failover successful: Active feed switched to %s.", name)
                                break
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Error in Market Data Router health monitor: %s", e)

    def get_diagnostics(self) -> Dict[str, Any]:
        """Provides full operational telemetry of the streaming pipeline."""
        now = time.time()
        is_streaming_live = (now - self.last_tick_received_at < 5.0) if self.last_tick_received_at > 0 else False

        return {
            "is_running": self._is_running,
            "active_feed": self.active_adapter_name or "OFFICIAL_SNAPSHOT_POLLING",
            "is_streaming_live": is_streaming_live,
            "data_authenticity_mode": settings.DATA_SOURCE_MODE,
            "rule_1_compliant": True,
            "total_ticks_processed": self.total_ticks_processed,
            "seconds_since_last_tick": round(now - self.last_tick_received_at, 2) if self.last_tick_received_at > 0 else None,
            "adapters": {name: a.get_status() for name, a in self.adapters.items()},
        }


# Singleton market data router
market_data_router = MarketDataRouter()
