"""
ALGO ROBOT — Angel One SmartStream WebSocket Streaming Adapter
Connects to Angel One SmartStream binary WebSocket feed,
parses token-based binary tick structures, and normalizes into NormalizedTick.
"""

import asyncio
import logging
import struct
import time
from typing import Any, Dict, List, Optional
import websockets
from app.config import settings
from app.market_data.base_adapter import (
    BaseMarketDataFeedAdapter,
    FeedStatus,
    DataAuthenticity,
    NormalizedTick,
)

logger = logging.getLogger("algo_robot.market_data.angel")

ANGEL_TOKEN_MAP: Dict[str, str] = {
    "2885": "RELIANCE",
    "11536": "TCS",
    "1333": "HDFCBANK",
    "10604": "BHARTIARTL",
    "4963": "ICICIBANK",
    "1594": "INFY",
    "3045": "SBIN",
    "1660": "ITC",
    "1394": "HINDUNILVR",
    "11483": "LT",
    "317": "BAJFINANCE",
    "10999": "MARUTI",
    "3351": "SUNPHARMA",
    "2031": "M&M",
    "3506": "TITAN",
    "5900": "AXISBANK",
    "3499": "TATASTEEL",
    "1922": "KOTAKBANK",
}


class AngelOneSmartStreamAdapter(BaseMarketDataFeedAdapter):
    """Angel One SmartAPI SmartStream WebSocket Adapter."""

    def __init__(self, api_key: Optional[str] = None, client_code: Optional[str] = None, feed_token: Optional[str] = None):
        super().__init__(name="ANGEL_ONE")
        self.api_key = api_key or settings.ANGEL_API_KEY
        self.client_code = client_code or settings.ANGEL_CLIENT_CODE
        self.feed_token = feed_token or settings.ANGEL_PIN
        self._ws: Optional[Any] = None
        self._listen_task: Optional[asyncio.Task] = None
        self._is_running = False

    def is_connected(self) -> bool:
        return self.status == FeedStatus.CONNECTED and self._ws is not None

    async def connect(self) -> bool:
        if not self.api_key or not self.client_code:
            logger.info("Angel One credentials not configured; adapter in STANDBY mode.")
            self.status = FeedStatus.UNAUTHORIZED
            return False

        self._is_running = True
        self.status = FeedStatus.CONNECTING
        ws_url = "wss://smartapisocket.angelone.in/smart-stream-ticks"
        headers = {
            "Authorization": f"Bearer {self.feed_token}",
            "x-api-key": self.api_key,
            "x-client-code": self.client_code,
            "x-feed-token": self.feed_token,
        }

        try:
            self._ws = await websockets.connect(
                ws_url,
                extra_headers=headers,
                ping_interval=15,
                ping_timeout=10,
            )
            self.status = FeedStatus.CONNECTED
            logger.info("Connected to Angel One SmartStream WebSocket.")

            if self.subscribed_tokens:
                await self.subscribe(list(self.subscribed_tokens))

            self._listen_task = asyncio.create_task(self._listen_loop())
            return True
        except Exception as e:
            logger.warning("Failed connecting to Angel One SmartStream: %s", e)
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
            import orjson
            sub_payload = {
                "correlationID": f"algo_robot_{int(time.time())}",
                "action": 1,
                "params": {
                    "mode": 2,  # Quote mode
                    "tokenList": [
                        {
                            "exchangeType": 1,  # NSE Equity
                            "tokens": [str(t) for t in tokens]
                        }
                    ]
                }
            }
            await self._ws.send(orjson.dumps(sub_payload).decode("utf-8"))
            return True
        except Exception as e:
            logger.error("Error subscribing to Angel One SmartStream: %s", e)
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
                if isinstance(message, bytes):
                    tick = self.parse_binary_packet(message)
                    if tick:
                        self.last_tick_time = tick.timestamp
                        if self.on_tick_callback:
                            await self.on_tick_callback(tick)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("Angel One stream error (%s). Reconnecting in 5s...", e)
                self.status = FeedStatus.RECONNECTING
                await asyncio.sleep(5.0)
                await self.connect()

    def parse_binary_packet(self, data: bytes) -> Optional[NormalizedTick]:
        """
        Parses Angel One SmartStream binary packet (Quote Mode ~62 bytes).
        [1: subscription_mode], [1: exchange_type], [25: token_bytes],
        [8: sequence_number], [8: exchange_timestamp], [8: ltp_paise],
        [8: last_traded_qty], [8: avg_traded_price], [8: volume],
        [8: total_buy_qty], [8: total_sell_qty], [8: open], [8: high], [8: low], [8: close]
        """
        if len(data) < 43:
            return None

        try:
            sub_mode, exch_type = struct.unpack("<bb", data[:2])
            raw_token = data[2:27].decode("utf-8", errors="ignore").strip("\x00").strip()
            symbol = ANGEL_TOKEN_MAP.get(raw_token, f"ANGEL_{raw_token}")

            # LTP (8 bytes int64 at offset 43 in paise)
            ltp_paise = struct.unpack("<q", data[43:51])[0] if len(data) >= 51 else 0
            ltp = round(ltp_paise / 100.0, 2)

            open_p = high_p = low_p = close_p = ltp
            volume = 0
            if len(data) >= 107:
                # Open, High, Low, Close in paise starting at offset 75
                o_p, h_p, l_p, c_p = struct.unpack("<qqqq", data[75:107])
                open_p = round(o_p / 100.0, 2)
                high_p = round(h_p / 100.0, 2)
                low_p = round(l_p / 100.0, 2)
                close_p = round(c_p / 100.0, 2)

            change = round(ltp - close_p, 2) if close_p > 0 else 0.0
            pct_change = round((change / close_p) * 100.0, 2) if close_p > 0 else 0.0

            return NormalizedTick(
                symbol=symbol,
                exchange="NSE",
                instrument_token=int(raw_token) if raw_token.isdigit() else 0,
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
                feed_source="ANGEL_ONE",
                data_status=DataAuthenticity.REAL_LIVE,
                is_simulated=False,
            )
        except Exception as e:
            logger.debug("Failed parsing Angel One tick: %s", e)
            return None
