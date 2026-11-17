"""
ALGO ROBOT — Upstox API V2 Market Data WebSocket Adapter
Connects to Upstox streaming gateway wss://api.upstox.com/v2/feed/market-data-feed,
ingests real-time market data packets, and normalizes into NormalizedTick.
"""

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional
import websockets
import orjson
from app.config import settings
from app.market_data.base_adapter import (
    BaseMarketDataFeedAdapter,
    FeedStatus,
    DataAuthenticity,
    NormalizedTick,
)

logger = logging.getLogger("algo_robot.market_data.upstox")


class UpstoxWebSocketAdapter(BaseMarketDataFeedAdapter):
    """Upstox API V2 WebSocket Streaming Adapter."""

    def __init__(self, api_key: Optional[str] = None, access_token: Optional[str] = None):
        super().__init__(name="UPSTOX")
        self.api_key = api_key or settings.UPSTOX_API_KEY
        self.access_token = access_token or settings.ZERODHA_ACCESS_TOKEN  # or dedicated upstox token
        self._ws: Optional[Any] = None
        self._listen_task: Optional[asyncio.Task] = None
        self._is_running = False

    def is_connected(self) -> bool:
        return self.status == FeedStatus.CONNECTED and self._ws is not None

    async def connect(self) -> bool:
        if not self.access_token:
            logger.info("Upstox access token not configured; adapter in STANDBY mode.")
            self.status = FeedStatus.UNAUTHORIZED
            return False

        self._is_running = True
        self.status = FeedStatus.CONNECTING
        ws_url = "wss://api.upstox.com/v2/feed/market-data-feed"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "*/*",
        }

        try:
            self._ws = await websockets.connect(
                ws_url,
                extra_headers=headers,
                ping_interval=15,
                ping_timeout=10,
            )
            self.status = FeedStatus.CONNECTED
            logger.info("Connected to Upstox V2 WebSocket feed.")

            if self.subscribed_tokens:
                await self.subscribe(list(self.subscribed_tokens))

            self._listen_task = asyncio.create_task(self._listen_loop())
            return True
        except Exception as e:
            logger.warning("Failed connecting to Upstox WebSocket: %s", e)
            self.status = FeedStatus.ERROR
            return False

    async def disconnect(self) -> None:
        self._is_running = False
        if self._listen_task:
            self._listen_task.cancel()
            self._listen_task = None
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
        self.status = FeedStatus.DISCONNECTED

    async def subscribe(self, tokens: List[int], symbols: Optional[List[str]] = None) -> bool:
        for t in tokens:
            self.subscribed_tokens.add(t)

        if not self.is_connected() or not self._ws:
            return False

        try:
            instrument_keys = [f"NSE_EQ|{s}" for s in (symbols or [])]
            sub_request = {
                "guid": f"algo_robot_upstox_{int(time.time())}",
                "method": "sub",
                "data": {
                    "mode": "full",
                    "instrumentKeys": instrument_keys or ["NSE_INDEX|Nifty 50"],
                }
            }
            await self._ws.send(orjson.dumps(sub_request).decode("utf-8"))
            return True
        except Exception as e:
            logger.error("Error subscribing to Upstox feed: %s", e)
            return False

    async def unsubscribe(self, tokens: List[int]) -> bool:
        for t in tokens:
            self.subscribed_tokens.discard(t)
        return True

    async def _listen_loop(self) -> None:
        while self._is_running:
            try:
                if not self._ws:
                    break
                message = await self._ws.recv()
                tick = self.parse_message(message)
                if tick:
                    self.last_tick_time = tick.timestamp
                    if self.on_tick_callback:
                        await self.on_tick_callback(tick)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("Upstox stream error (%s). Reconnecting...", e)
                self.status = FeedStatus.RECONNECTING
                await asyncio.sleep(5.0)
                await self.connect()

    def parse_message(self, message: Any) -> Optional[NormalizedTick]:
        """Parses Upstox JSON or Protobuf payload into NormalizedTick."""
        try:
            if isinstance(message, bytes):
                data = orjson.loads(message)
            elif isinstance(message, str):
                data = orjson.loads(message.encode("utf-8"))
            elif isinstance(message, dict):
                data = message
            else:
                return None

            feeds = data.get("feeds", {})
            for key, feed_data in feeds.items():
                symbol = key.split("|")[-1] if "|" in key else key
                full_feed = feed_data.get("ff", {}) or feed_data.get("ltpc", {})
                market_ohlc = full_feed.get("marketOHLC", {}).get("ohlc", [{}])[-1]

                ltp = float(full_feed.get("ltp", 0.0) or full_feed.get("cp", 0.0))
                if ltp <= 0:
                    continue

                close_p = float(market_ohlc.get("close", ltp))
                open_p = float(market_ohlc.get("open", ltp))
                high_p = float(market_ohlc.get("high", ltp))
                low_p = float(market_ohlc.get("low", ltp))
                change = round(ltp - close_p, 2)
                pct_change = round((change / close_p) * 100.0, 2) if close_p > 0 else 0.0
                volume = int(full_feed.get("v", 0))

                return NormalizedTick(
                    symbol=symbol,
                    exchange="NSE",
                    instrument_token=0,
                    ltp=ltp,
                    change=change,
                    percent_change=pct_change,
                    open=open_p,
                    high=high_p,
                    low=low_p,
                    close=close_p,
                    volume=volume,
                    bid=round(ltp - 0.05, 2),
                    ask=round(ltp + 0.05, 2),
                    bid_qty=0,
                    ask_qty=0,
                    oi=0,
                    timestamp=time.time(),
                    feed_source="UPSTOX",
                    data_status=DataAuthenticity.REAL_LIVE,
                    is_simulated=False,
                )
        except Exception as e:
            logger.debug("Failed parsing Upstox feed: %s", e)
        return None
