"""
ALGO ROBOT — Zerodha Kite Ticker WebSocket Streaming Adapter
Connects to wss://ws.kite.trade, parses live binary tick packets,
and normalizes ticks into the institutional NormalizedTick schema.
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

logger = logging.getLogger("algo_robot.market_data.kite")

# Token to Symbol Mapping Dictionary (cached)
TOKEN_TO_SYMBOL: Dict[int, str] = {
    738561: "RELIANCE",
    2953217: "TCS",
    341249: "HDFCBANK",
    2714625: "BHARTIARTL",
    1270529: "ICICIBANK",
    408065: "INFY",
    779521: "SBIN",
    424961: "ITC",
    356865: "HINDUNILVR",
    2939649: "LT",
    81153: "BAJFINANCE",
    2815745: "MARUTI",
    857857: "SUNPHARMA",
    519937: "M&M",
    895745: "TITAN",
    1510401: "AXISBANK",
    897537: "TATASTEEL",
    492033: "KOTAKBANK",
    2977281: "NTPC",
    3812865: "POWERGRID",
    4267265: "BAJAJFINSV",
    1836545: "HCLTECH",
    2952193: "ULTRACEMCO",
    60417: "ASIANPAINT",
    500479: "TRENT",
    3001089: "JSWSTEEL",
    4598529: "NESTLEIND",
    3465729: "TECHM",
    1346049: "INDUSINDBK",
    884737: "TATAMOTORS",
    6401: "ADANIENT",
    3861249: "ADANIPORTS",
    5215745: "COALINDIA",
    633601: "ONGC",
}


class ZerodhaKiteTickerAdapter(BaseMarketDataFeedAdapter):
    """Zerodha Kite Ticker WebSocket Streaming Adapter."""

    def __init__(self, api_key: Optional[str] = None, access_token: Optional[str] = None):
        super().__init__(name="ZERODHA_KITE")
        self.api_key = api_key or settings.ZERODHA_API_KEY
        self.access_token = access_token or settings.ZERODHA_ACCESS_TOKEN
        self._ws: Optional[Any] = None
        self._listen_task: Optional[asyncio.Task] = None
        self._reconnect_delay = 2.0
        self._is_running = False

    def is_connected(self) -> bool:
        return self.status == FeedStatus.CONNECTED and self._ws is not None

    async def connect(self) -> bool:
        if not self.api_key or not self.access_token:
            logger.info("Zerodha Kite credentials not configured; adapter in STANDBY mode.")
            self.status = FeedStatus.UNAUTHORIZED
            return False

        self._is_running = True
        self.status = FeedStatus.CONNECTING
        ws_url = f"wss://ws.kite.trade?api_key={self.api_key}&access_token={self.access_token}"

        try:
            self._ws = await websockets.connect(
                ws_url,
                ping_interval=15,
                ping_timeout=10,
                max_size=10_000_000,
            )
            self.status = FeedStatus.CONNECTED
            self._reconnect_delay = 2.0
            logger.info("Successfully connected to Zerodha Kite Ticker WebSocket.")

            # If there were existing subscriptions, resubscribe
            if self.subscribed_tokens:
                await self.subscribe(list(self.subscribed_tokens))

            # Start background listener task
            self._listen_task = asyncio.create_task(self._listen_loop())
            return True
        except Exception as e:
            logger.warning("Failed connecting to Zerodha Kite Ticker: %s", e)
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
        logger.info("Zerodha Kite Ticker disconnected.")

    async def subscribe(self, tokens: List[int], symbols: Optional[List[str]] = None) -> bool:
        for t in tokens:
            self.subscribed_tokens.add(t)

        if not self.is_connected() or not self._ws:
            return False

        try:
            subscribe_msg = {
                "a": "subscribe",
                "v": tokens,
            }
            mode_msg = {
                "a": "mode",
                "v": ["full", tokens],
            }
            import orjson
            await self._ws.send(orjson.dumps(subscribe_msg).decode("utf-8"))
            await self._ws.send(orjson.dumps(mode_msg).decode("utf-8"))
            logger.info("Subscribed to %d instruments on Zerodha Kite Ticker.", len(tokens))
            return True
        except Exception as e:
            logger.error("Failed sending subscription to Kite Ticker: %s", e)
            return False

    async def unsubscribe(self, tokens: List[int]) -> bool:
        for t in tokens:
            self.subscribed_tokens.discard(t)

        if not self.is_connected() or not self._ws:
            return False

        try:
            import orjson
            msg = {"a": "unsubscribe", "v": tokens}
            await self._ws.send(orjson.dumps(msg).decode("utf-8"))
            return True
        except Exception as e:
            logger.error("Failed sending unsubscribe to Kite Ticker: %s", e)
            return False

    async def _listen_loop(self) -> None:
        """Receives incoming binary tick packets from Kite Ticker."""
        while self._is_running:
            try:
                if not self._ws:
                    break
                message = await self._ws.recv()
                if isinstance(message, bytes):
                    ticks = self.parse_binary_packets(message)
                    for tick in ticks:
                        self.last_tick_time = tick.timestamp
                        if self.on_tick_callback:
                            await self.on_tick_callback(tick)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("Kite Ticker stream error (%s). Reconnecting in %.1fs...", e, self._reconnect_delay)
                self.status = FeedStatus.RECONNECTING
                await asyncio.sleep(self._reconnect_delay)
                self._reconnect_delay = min(self._reconnect_delay * 2, 30.0)
                await self.connect()

    def parse_binary_packets(self, data: bytes) -> List[NormalizedTick]:
        """
        Parses Kite binary tick packet into NormalizedTick dataclass objects.
        Kite binary format:
        [2 bytes: packet_count]
        For each packet:
          [2 bytes: packet_length]
          [packet_length bytes: binary packet]
        """
        ticks: List[NormalizedTick] = []
        if len(data) < 2:
            return ticks

        packet_count = struct.unpack(">H", data[:2])[0]
        offset = 2

        for _ in range(packet_count):
            if offset + 2 > len(data):
                break
            pkt_len = struct.unpack(">H", data[offset:offset + 2])[0]
            offset += 2
            pkt_data = data[offset:offset + pkt_len]
            offset += pkt_len

            parsed = self._parse_single_packet(pkt_data)
            if parsed:
                ticks.append(parsed)

        return ticks

    def _parse_single_packet(self, data: bytes) -> Optional[NormalizedTick]:
        """Parses an individual Kite packet (Indices: 28 bytes, Full quote: 184 bytes, LTP: 8 bytes)."""
        length = len(data)
        if length < 8:
            return None

        # Common 8-byte header: instrument_token (4 bytes), ltp (4 bytes)
        token, ltp_int = struct.unpack(">II", data[:8])
        divisor = 100.0  # Equity prices in Kite are represented as integer paise
        if token & 0xFF == 3:  # Currencies
            divisor = 10000000.0

        ltp = round(ltp_int / divisor, 2)
        symbol = TOKEN_TO_SYMBOL.get(token, f"TOKEN_{token}")

        # Default fallback values
        open_p = high_p = low_p = close_p = ltp
        change = 0.0
        pct_change = 0.0
        volume = 0
        bid = round(ltp - 0.05, 2)
        ask = round(ltp + 0.05, 2)
        bid_qty = ask_qty = oi = 0

        # Full Quote packet (184 bytes)
        if length >= 44:
            # Full structure unpack
            # [4: token], [4: ltp], [4: last_traded_qty], [4: avg_price], [4: vol], [4: buy_qty], [4: sell_qty]
            # [4: open], [4: high], [4: low], [4: close]
            try:
                (
                    _, _, last_qty, avg_p, vol, buy_qty, sell_qty,
                    o_int, h_int, l_int, c_int
                ) = struct.unpack(">IIIIIIIIIII", data[:44])

                open_p = round(o_int / divisor, 2)
                high_p = round(h_int / divisor, 2)
                low_p = round(l_int / divisor, 2)
                close_p = round(c_int / divisor, 2)
                volume = vol
                change = round(ltp - close_p, 2) if close_p > 0 else 0.0
                pct_change = round((change / close_p) * 100.0, 2) if close_p > 0 else 0.0

                # Market depth top bid/ask if length >= 184
                if length >= 184:
                    # Depth table starts at offset 64
                    depth_data = data[64:184]
                    # First bid (12 bytes): qty (4), price (4), orders (2), padding (2)
                    b_qty, b_p = struct.unpack(">II", depth_data[:8])
                    # First ask: 5 bids * 12 bytes = 60 bytes offset
                    a_qty, a_p = struct.unpack(">II", depth_data[60:68])
                    bid = round(b_p / divisor, 2) if b_p > 0 else bid
                    ask = round(a_p / divisor, 2) if a_p > 0 else ask
                    bid_qty = b_qty
                    ask_qty = a_qty
            except Exception as e:
                logger.debug("Error unpacking full Kite quote: %s", e)

        return NormalizedTick(
            symbol=symbol,
            exchange="NSE",
            instrument_token=token,
            ltp=ltp,
            change=change,
            percent_change=pct_change,
            open=open_p,
            high=high_p,
            low=low_p,
            close=close_p,
            volume=volume,
            bid=bid,
            ask=ask,
            bid_qty=bid_qty,
            ask_qty=ask_qty,
            oi=oi,
            timestamp=time.time(),
            feed_source="ZERODHA_KITE",
            data_status=DataAuthenticity.REAL_LIVE,
            is_simulated=False,
        )
