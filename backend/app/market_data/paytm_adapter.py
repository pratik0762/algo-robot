"""
ALGO ROBOT — Paytm Money Live WebSocket Market Data Adapter
Connects to official Paytm Money Broadcast WebSocket, decodes binary packet modes
(Mode 61 LTP, Mode 62 Quote, Mode 63 Full Depth, Modes 64-66 Index), normalizes
ticks, and streams live prices directly into Algo Robot's Quote & Candle engines.
"""

from __future__ import annotations
import asyncio
import json
import logging
import struct
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Set, Tuple, Union, Awaitable

import websockets

from app.market_data.base_adapter import (
    BaseMarketDataFeedAdapter,
    FeedStatus,
    DataAuthenticity,
    NormalizedTick,
)
from app.market_data.base_provider import (
    BaseMarketDataProvider,
    ProviderCapabilities,
    ProviderQuote,
)
from app.market_data.paytm_auth import paytm_auth_service
from app.market_data.paytm_security_master import paytm_security_master
from app.market_data.live_quote_service import live_quote_service

logger = logging.getLogger("algo_robot.market_data.paytm_adapter")

PAYTM_WS_BASE_URL = "wss://developer-ws.paytmmoney.com/broadcast/user/v1/data"

# Packet mode definitions
MODE_LTP = 61
MODE_QUOTE = 62
MODE_FULL_DEPTH = 63
MODE_INDEX_LTP = 64
MODE_INDEX_QUOTE = 65
MODE_INDEX_DEPTH = 66


class PaytmMoneyMarketDataAdapter(BaseMarketDataFeedAdapter, BaseMarketDataProvider):
    """
    High-frequency market data adapter for Paytm Money WebSocket broadcast feed.
    Unpacks binary byte streams into institutional-grade NormalizedTick models.
    """

    _instance: Optional[PaytmMoneyMarketDataAdapter] = None
    _lock = threading.RLock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
            return cls._instance

    def __init__(self):
        with self._lock:
            if getattr(self, "_initialized", False):
                return
            BaseMarketDataFeedAdapter.__init__(self, name="PAYTM_MONEY")
            BaseMarketDataProvider.__init__(
                self,
                provider_code="PAYTM_MONEY",
                display_name="Paytm Money Open API Live Market Stream",
            )
            if "is_connected" in self.__dict__:
                del self.__dict__["is_connected"]
            self._ws: Optional[Any] = None
            self._listen_task: Optional[asyncio.Task] = None
            self._is_running: bool = False
            self._subscribed_security_ids: Set[int] = set()
            self._tick_count: int = 0
            self._byte_count: int = 0
            self._last_tick_time: float = 0.0
            self._reconnect_count: int = 0
            self._first_tick_time: float = 0.0
            self._last_sub_ack_time: float = 0.0
            self._initialized = True
            paytm_auth_service.register_auth_callback(self._on_auth_success)

    async def _on_auth_success(self) -> None:
        """Auto-connects stream when an OAuth session token is issued or refreshed."""
        if not self.is_connected():
            logger.info("Paytm Money session token available; triggering live stream connection...")
            success = await self.connect()
            if success:
                priority_tokens = [13, 51, 2885, 11536, 1594]  # NIFTY, SENSEX, RELIANCE, TCS, INFY
                await self.subscribe(priority_tokens, mode="FULL")

    def get_capabilities(self) -> ProviderCapabilities:
        """Returns provider capabilities and maximum subscription capacities."""
        return ProviderCapabilities(
            provider_code="PAYTM_MONEY",
            display_name="Paytm Money Open API Live Market Stream",
            supports_live_ticks=True,
            supports_order_book_depth=True,
            supports_historical_intraday=True,
            supports_historical_daily=True,
            supports_eod_bhavcopy=True,
            supports_corporate_actions=True,
            supports_fundamentals=True,
            supported_exchanges=["NSE", "BSE"],
            supported_timeframes=["1m", "3m", "5m", "10m", "15m", "30m", "1h", "1d"],
            max_live_subscriptions=5000,
            rate_limit_requests_per_sec=20,
        )

    def on_tick(self, tick: Union[Dict[str, Any], NormalizedTick]) -> None:
        """Inject or process an individual normalized tick directly into the feed pipeline."""
        from app.market_data.base_adapter import NormalizedTick
        from app.indicators.candle_aggregator import candle_aggregator

        if isinstance(tick, dict):
            ex = tick.get("exchange", "NSE")
            norm_tick = NormalizedTick(
                symbol=tick["symbol"],
                exchange=ex,
                instrument_token=int(tick.get("instrument_token", 0)),
                ltp=float(tick["ltp"]),
                change=float(tick.get("change", 0.0)),
                percent_change=float(tick.get("percent_change", 0.0)),
                open=float(tick.get("open", tick["ltp"])),
                high=float(tick.get("high", tick["ltp"])),
                low=float(tick.get("low", tick["ltp"])),
                close=float(tick.get("close", tick["ltp"])),
                volume=int(tick.get("volume", 0)),
                bid=float(tick.get("bid", 0.0)),
                ask=float(tick.get("ask", 0.0)),
                bid_qty=int(tick.get("bid_qty", 0)),
                ask_qty=int(tick.get("ask_qty", 0)),
                oi=int(tick.get("oi", 0)),
                timestamp=time.time(),
                feed_source="PAYTM_MONEY",
                high_52w=float(tick["high_52w"]) if "high_52w" in tick else None,
                low_52w=float(tick["low_52w"]) if "low_52w" in tick else None,
            )
        else:
            norm_tick = tick

        live_quote_service.process_tick(norm_tick)
        try:
            candle_aggregator.add_tick(norm_tick)
        except Exception as e:
            logger.debug("Failed to forward tick to candle_aggregator: %s", e)

        try:
            from app.scanner.market_scanner import market_scanner
            market_scanner.on_tick(norm_tick)
        except Exception as e:
            logger.debug("Failed to forward tick to market_scanner: %s", e)

        if self.on_tick_callback:
            try:
                res = self.on_tick_callback(norm_tick if isinstance(tick, NormalizedTick) else tick)
                if asyncio.iscoroutine(res):
                    try:
                        loop = asyncio.get_running_loop()
                        loop.create_task(res)
                    except RuntimeError:
                        res.close()
            except Exception as e:
                logger.debug("Error in on_tick_callback: %s", e)

    def is_connected(self) -> bool:
        """Returns True if the WebSocket connection is established and healthy."""
        return self.status == FeedStatus.CONNECTED and self._ws is not None

    async def connect(self) -> bool:
        """Establishes authenticated WebSocket connection to Paytm broadcast gateway."""
        if not paytm_auth_service.is_authenticated():
            logger.info("Paytm Money session not active; adapter in STANDBY mode.")
            self.status = FeedStatus.UNAUTHORIZED
            return False

        public_token = paytm_auth_service.get_public_access_token()
        if not public_token:
            logger.warning("No public access token available for Paytm WebSocket.")
            self.status = FeedStatus.UNAUTHORIZED
            return False

        ws_url = f"{PAYTM_WS_BASE_URL}?x_jwt_token={public_token}"
        self.status = FeedStatus.CONNECTING
        self._is_running = True

        try:
            self._ws = await websockets.connect(
                ws_url,
                ping_interval=20,
                ping_timeout=15,
                close_timeout=5,
            )
            self.status = FeedStatus.CONNECTED
            logger.info("Connected to Paytm Money Live Broadcast WebSocket.")

            # Resubscribe to existing tokens if any
            if self._subscribed_security_ids:
                await self._send_subscription_payload(list(self._subscribed_security_ids), action="ADD")

            # Launch background streaming loop
            self._listen_task = asyncio.create_task(self._listen_loop())
            return True
        except Exception as e:
            logger.warning("Failed to connect to Paytm Money WebSocket: %s", e)
            self.status = FeedStatus.ERROR
            return False

    async def disconnect(self) -> None:
        """Gracefully terminates WebSocket streaming session."""
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
        logger.info("Disconnected from Paytm Money WebSocket.")

    async def subscribe(self, tokens: List[int], symbols: Optional[List[str]] = None, mode: str = "FULL") -> bool:
        """Subscribes to live tick streaming for specified security tokens."""
        for t in tokens:
            self._subscribed_security_ids.add(int(t))
            self.subscribed_tokens.add(int(t))

        if not self.is_connected() or not self._ws:
            return True  # Retained in memory to subscribe on connect

        return await self._send_subscription_payload(tokens, action="ADD", mode=mode)

    async def unsubscribe(self, tokens: List[int]) -> bool:
        """Unsubscribes from live tick streaming for specified security tokens."""
        for t in tokens:
            self._subscribed_security_ids.discard(int(t))
            self.subscribed_tokens.discard(int(t))

        if not self.is_connected() or not self._ws:
            return True

        return await self._send_subscription_payload(tokens, action="REMOVE")

    async def subscribe_by_symbols(
        self,
        symbols: List[str],
        exchange: str = "NSE",
        mode: str = "FULL",
    ) -> int:
        """Helper to resolve symbol names and subscribe to their live feeds."""
        tokens = []
        for sym in symbols:
            sec_id = paytm_security_master.resolve_paytm_id(exchange, sym)
            if sec_id:
                try:
                    tokens.append(int(sec_id))
                except ValueError:
                    pass
        if tokens:
            await self.subscribe(tokens, symbols=symbols, mode=mode)
        return len(tokens)

    async def _send_subscription_payload(
        self,
        tokens: List[int],
        action: str = "ADD",
        mode: str = "FULL",
    ) -> bool:
        """Constructs and transmits official JSON subscription request over WebSocket."""
        if not self._ws or not tokens:
            return False

        # Group tokens into official Paytm subscription payload
        scrip_data = [{"securityId": int(t)} for t in tokens]
        payload = [
            {
                "actionType": action.upper(),
                "modeType": mode.upper(),
                "scripType": "EQUITY",
                "exchangeType": "NSE",
                "scripData": scrip_data,
            }
        ]
        try:
            await self._ws.send(json.dumps(payload))
            self._last_sub_ack_time = time.time()
            logger.info("Sent Paytm subscription payload (%s %d scrips, mode=%s)", action, len(tokens), mode)
            return True
        except Exception as e:
            logger.error("Error sending Paytm subscription payload: %s", e)
            return False

    async def _listen_loop(self) -> None:
        """Continuous event loop consuming incoming binary broadcast packets."""
        while self._is_running:
            try:
                if not self._ws:
                    break
                raw_msg = await self._ws.recv()
                if isinstance(raw_msg, bytes):
                    self._byte_count += len(raw_msg)
                    ticks = self.decode_binary_packets(raw_msg)
                    now_ts = time.time()
                    if not self._first_tick_time and ticks:
                        self._first_tick_time = now_ts
                    for tick in ticks:
                        self._tick_count += 1
                        self.last_tick_time = now_ts
                        self._last_tick_time = now_ts

                        # 1. Update live quote snapshot cache and candle aggregator
                        live_quote_service.process_tick(tick)
                        try:
                            from app.indicators import candle_aggregator
                            candle_aggregator.add_tick(tick)
                        except Exception:
                            pass

                        # 2. Invoke registered callback (e.g. router, strategies, websockets)
                        if self.on_tick_callback:
                            try:
                                res = self.on_tick_callback(tick)
                                if asyncio.iscoroutine(res):
                                    await res
                            except Exception as cb_err:
                                logger.debug("Tick callback error: %s", cb_err)

                        # 3. Notify provider listeners
                        for listener in self._tick_listeners:
                            try:
                                res = listener(tick.to_dict())
                                if asyncio.iscoroutine(res):
                                    await res
                            except Exception:
                                pass
                elif isinstance(raw_msg, str):
                    logger.debug("Received text message on Paytm WS: %s", raw_msg[:100])
            except asyncio.CancelledError:
                break
            except Exception as e:
                self._reconnect_count += 1
                logger.warning("Paytm WS read error (%s). Reconnecting in 5s (attempt %d)...", e, self._reconnect_count)
                self.status = FeedStatus.RECONNECTING
                await asyncio.sleep(5.0)
                if self._is_running:
                    await self.connect()

    def decode_binary_packets(self, data: bytes) -> List[NormalizedTick]:
        """
        Unpacks incoming binary stream buffer into one or more NormalizedTick objects.
        Supports Mode 61 (LTP), Mode 62 (Quote), Mode 63 (Full Depth), and Modes 64-66 (Index).
        """
        if not data or len(data) < 9:
            return []

        ticks = []
        offset = 0
        buf_len = len(data)

        while offset < buf_len:
            remaining = buf_len - offset
            if remaining < 9:
                break

            mode = data[offset]

            # 1. Mode 61: LTP Mode (9 bytes: [1: mode], [4: security_id], [4: ltp])
            if mode == MODE_LTP:
                if remaining < 9:
                    break
                tick = self.decode_mode_61(data[offset : offset + 9])
                if tick:
                    ticks.append(tick)
                offset += 9

            # 2. Mode 62: Quote Mode (29 bytes: mode, sec_id, ltp, close, open, high, low, vol)
            elif mode == MODE_QUOTE:
                if remaining < 29:
                    break
                tick = self.decode_mode_62(data[offset : offset + 29])
                if tick:
                    ticks.append(tick)
                offset += 29

            # 3. Mode 63: Full Depth Mode (133 bytes)
            elif mode == MODE_FULL_DEPTH:
                if remaining < 133:
                    # In case depth packet is truncated or shorter
                    break
                tick = self.decode_mode_63(data[offset : offset + 133])
                if tick:
                    ticks.append(tick)
                offset += 133

            # 4. Modes 64, 65, 66: Index Modes (17 to 21 bytes)
            elif mode in (MODE_INDEX_LTP, MODE_INDEX_QUOTE, MODE_INDEX_DEPTH):
                pkt_size = 21 if remaining >= 21 else (17 if remaining >= 17 else remaining)
                if pkt_size < 17:
                    break
                tick = self.decode_mode_index(data[offset : offset + pkt_size])
                if tick:
                    ticks.append(tick)
                offset += pkt_size

            else:
                # Unknown header or framing offset, advance by 1 to search for next valid header
                offset += 1

        return ticks

    def decode_mode_61(self, packet: bytes) -> Optional[NormalizedTick]:
        """Unpacks Mode 61 LTP Feed packet (9 bytes)."""
        try:
            mode, sec_id, ltp_raw = struct.unpack("<Bif", packet[:9])
            # Price sanity check: if float is invalid, fallback to int32 paise
            if ltp_raw <= 0 or ltp_raw > 10000000 or float("nan") == ltp_raw:
                _, sec_id, ltp_paise = struct.unpack("<Bii", packet[:9])
                ltp = round(ltp_paise / 100.0, 2)
            else:
                ltp = round(float(ltp_raw), 2)

            canonical = paytm_security_master.resolve_canonical(sec_id)
            sym = ((canonical.get("symbol") if canonical else "") or (canonical.get("name") if canonical else "") or f"PAYTM_{sec_id}").strip().upper()
            ex = canonical["exchange"] if canonical else "NSE"

            return NormalizedTick(
                symbol=sym,
                exchange=ex,
                instrument_token=sec_id,
                ltp=ltp,
                change=0.0,
                percent_change=0.0,
                open=ltp,
                high=ltp,
                low=ltp,
                close=ltp,
                volume=0,
                bid=ltp,
                ask=ltp,
                bid_qty=0,
                ask_qty=0,
                oi=0,
                timestamp=time.time(),
                feed_source="PAYTM_MONEY",
                data_status=DataAuthenticity.REAL_LIVE,
                is_simulated=False,
            )
        except Exception:
            return None

    def decode_mode_62(self, packet: bytes) -> Optional[NormalizedTick]:
        """Unpacks Mode 62 Quote Feed packet (29 bytes)."""
        try:
            mode, sec_id, ltp, close_px, open_px, high_px, low_px, vol = struct.unpack(
                "<Bifffffi", packet[:29]
            )
            ltp = round(float(ltp), 2)
            close_px = round(float(close_px), 2)
            open_px = round(float(open_px), 2)
            high_px = round(float(high_px), 2)
            low_px = round(float(low_px), 2)
            vol = int(vol)

            change = round(ltp - close_px, 2) if close_px > 0 else 0.0
            pct_change = round((change / close_px) * 100.0, 2) if close_px > 0 else 0.0

            canonical = paytm_security_master.resolve_canonical(sec_id)
            sym = ((canonical.get("symbol") if canonical else "") or (canonical.get("name") if canonical else "") or f"PAYTM_{sec_id}").strip().upper()
            ex = canonical["exchange"] if canonical else "NSE"

            return NormalizedTick(
                symbol=sym,
                exchange=ex,
                instrument_token=sec_id,
                ltp=ltp,
                change=change,
                percent_change=pct_change,
                open=open_px,
                high=high_px,
                low=low_px,
                close=close_px,
                volume=vol,
                bid=ltp,
                ask=ltp,
                bid_qty=0,
                ask_qty=0,
                oi=0,
                timestamp=time.time(),
                feed_source="PAYTM_MONEY",
                data_status=DataAuthenticity.REAL_LIVE,
                is_simulated=False,
            )
        except Exception:
            return None

    def decode_mode_63(self, packet: bytes) -> Optional[NormalizedTick]:
        """Unpacks Mode 63 Full Market Depth packet (133 bytes)."""
        try:
            # First 29 bytes: Header + OHLCV
            mode, sec_id, ltp, close_px, open_px, high_px, low_px, vol = struct.unpack(
                "<Bifffffi", packet[:29]
            )
            ltp = round(float(ltp), 2)
            close_px = round(float(close_px), 2)
            open_px = round(float(open_px), 2)
            high_px = round(float(high_px), 2)
            low_px = round(float(low_px), 2)
            vol = int(vol)

            # Best bid (offset 29: price float 4, qty int 4, orders short 2)
            bid_px, bid_qty, _ = struct.unpack("<fih", packet[29:39])
            # Best ask (offset 79: price float 4, qty int 4, orders short 2)
            ask_px, ask_qty, _ = struct.unpack("<fih", packet[79:89])

            # Open interest at end (offset 129: int32)
            oi = struct.unpack("<i", packet[129:133])[0] if len(packet) >= 133 else 0

            change = round(ltp - close_px, 2) if close_px > 0 else 0.0
            pct_change = round((change / close_px) * 100.0, 2) if close_px > 0 else 0.0

            canonical = paytm_security_master.resolve_canonical(sec_id)
            sym = ((canonical.get("symbol") if canonical else "") or (canonical.get("name") if canonical else "") or f"PAYTM_{sec_id}").strip().upper()
            ex = canonical["exchange"] if canonical else "NSE"

            return NormalizedTick(
                symbol=sym,
                exchange=ex,
                instrument_token=sec_id,
                ltp=ltp,
                change=change,
                percent_change=pct_change,
                open=open_px,
                high=high_px,
                low=low_px,
                close=close_px,
                volume=vol,
                bid=round(float(bid_px), 2) if bid_px > 0 else ltp,
                ask=round(float(ask_px), 2) if ask_px > 0 else ltp,
                bid_qty=int(bid_qty),
                ask_qty=int(ask_qty),
                oi=int(oi),
                timestamp=time.time(),
                feed_source="PAYTM_MONEY",
                data_status=DataAuthenticity.REAL_LIVE,
                is_simulated=False,
            )
        except Exception:
            return None

    def decode_mode_index(self, packet: bytes) -> Optional[NormalizedTick]:
        """Unpacks Mode 64, 65, or 66 Index packet (17 to 21 bytes)."""
        try:
            mode, sec_id, ltp, close_px, high_px = struct.unpack("<Bifff", packet[:17])
            low_px = struct.unpack("<f", packet[17:21])[0] if len(packet) >= 21 else ltp

            ltp = round(float(ltp), 2)
            close_px = round(float(close_px), 2)
            high_px = round(float(high_px), 2)
            low_px = round(float(low_px), 2)

            change = round(ltp - close_px, 2) if close_px > 0 else 0.0
            pct_change = round((change / close_px) * 100.0, 2) if close_px > 0 else 0.0

            canonical = paytm_security_master.resolve_canonical(sec_id)
            sym = ((canonical.get("symbol") if canonical else "") or (canonical.get("name") if canonical else "") or f"INDEX_{sec_id}").strip().upper()
            ex = canonical["exchange"] if canonical else "NSE"

            return NormalizedTick(
                symbol=sym,
                exchange=ex,
                instrument_token=sec_id,
                ltp=ltp,
                change=change,
                percent_change=pct_change,
                open=close_px,
                high=high_px,
                low=low_px,
                close=close_px,
                volume=0,
                bid=ltp,
                ask=ltp,
                bid_qty=0,
                ask_qty=0,
                oi=0,
                timestamp=time.time(),
                feed_source="PAYTM_MONEY",
                data_status=DataAuthenticity.REAL_LIVE,
                is_simulated=False,
            )
        except Exception:
            return None

    def get_status(self) -> Dict[str, Any]:
        """Returns comprehensive feed status, telemetry, and throughput statistics."""
        return {
            "name": self.name,
            "provider_code": self.provider_code,
            "display_name": self.display_name,
            "status": self.status.value,
            "is_connected": bool(self.status == FeedStatus.CONNECTED and self._ws is not None),
            "subscribed_scrips_count": len(self._subscribed_security_ids),
            "total_ticks_received": self._tick_count,
            "total_bytes_received": self._byte_count,
            "reconnection_count": self._reconnect_count,
            "first_tick_time": self._first_tick_time,
            "last_subscription_ack_time": self._last_sub_ack_time,
            "last_tick_time": self._last_tick_time,
            "last_tick_iso": (
                datetime.fromtimestamp(self._last_tick_time, tz=timezone.utc).isoformat()
                if self._last_tick_time > 0
                else None
            ),
            "auth_status": paytm_auth_service.get_status().get("auth_state"),
        }

    # BaseMarketDataProvider protocol implementation
    async def get_instruments(self, exchange: Optional[Any] = None) -> List[Dict[str, Any]]:
        """Returns tradeable securities from Paytm Security Master."""
        ex_str = str(exchange.value if hasattr(exchange, "value") else exchange).upper() if exchange else None
        stats = paytm_security_master.get_stats()
        # Return summary or sample of instruments
        return [
            paytm_security_master.get_security_info("2885"),  # RELIANCE
            paytm_security_master.get_security_info("11536"), # TCS
            paytm_security_master.get_security_info("13"),    # NIFTY
            paytm_security_master.get_security_info("51"),    # SENSEX
        ]

    async def get_quote(self, symbol_or_token: str, exchange: str = "NSE") -> ProviderQuote:
        """Retrieves real-time quote for symbol from memory snapshot."""
        inst_key = f"{exchange.upper()}_{symbol_or_token.upper()}"
        q = live_quote_service.get_quote(inst_key) or {}
        return ProviderQuote(
            instrument_id=inst_key,
            symbol=symbol_or_token.upper(),
            exchange=exchange.upper(),
            ltp=q.get("ltp", 0.0),
            open=q.get("open", 0.0),
            high=q.get("high", 0.0),
            low=q.get("low", 0.0),
            close=q.get("close", 0.0),
            volume=q.get("volume", 0),
            bid=q.get("bid", 0.0),
            ask=q.get("ask", 0.0),
            source="PAYTM_MONEY",
        )

    async def get_quotes_batch(self, requests: List[Dict[str, str]]) -> Dict[str, ProviderQuote]:
        """Fetches quotes in bulk for up to provider batch size limits."""
        res = {}
        for req in requests:
            sym = req.get("symbol") or req.get("token", "")
            ex = req.get("exchange", "NSE")
            if sym:
                res[f"{ex}_{sym}"] = await self.get_quote(sym, ex)
        return res

    async def get_historical_candles(
        self,
        symbol_or_token: str,
        exchange: str,
        timeframe: str,
        start_time: datetime,
        end_time: datetime,
    ) -> List[Any]:
        """Fetches historical OHLCV bars via Paytm historical adapter."""
        from app.market_data.historical.paytm_historical_adapter import paytm_historical_adapter
        from app.market_data.base_provider import ProviderCandle

        raw_bars = paytm_historical_adapter.fetch_candles(
            symbol=symbol_or_token,
            exchange=exchange,
            timeframe=timeframe,
            from_date=start_time,
            to_date=end_time,
        )
        return [
            ProviderCandle(
                timestamp=datetime.fromisoformat(b["timestamp"].replace("Z", "+00:00")),
                open=b["open"],
                high=b["high"],
                low=b["low"],
                close=b["close"],
                volume=b["volume"],
                turnover=b["turnover"],
                vwap=b["vwap"],
                timeframe=timeframe,
                source="PAYTM_MONEY",
            )
            for b in raw_bars
        ]

    async def subscribe_ticks(self, instrument_tokens: List[str]) -> bool:
        """Subscribes to live WebSocket tick streaming for specified tokens."""
        tokens = [int(t) for t in instrument_tokens if str(t).isdigit()]
        if not tokens:
            return True
        return await self.subscribe(tokens)

    async def unsubscribe_ticks(self, instrument_tokens: List[str]) -> bool:
        """Unsubscribes from live WebSocket tick streaming."""
        tokens = [int(t) for t in instrument_tokens if str(t).isdigit()]
        if not tokens:
            return True
        return await self.unsubscribe(tokens)

    async def get_market_status(self) -> Dict[str, Any]:
        """Returns trading session status (OPEN or CLOSED)."""
        from app.market_data.exchange_calendar import exchange_calendar
        is_open = exchange_calendar.is_trading_session_open()
        return {
            "status": "OPEN" if is_open else "CLOSED",
            "exchange": "NSE",
            "provider": "PAYTM_MONEY",
            "timestamp": time.time(),
        }

    def get_provider_status(self) -> Dict[str, Any]:
        return self.get_status()


paytm_adapter = PaytmMoneyMarketDataAdapter()

# Register with central market data provider registry
try:
    from app.market_data.adapters.provider_registry import provider_registry_manager
    provider_registry_manager.register_provider(paytm_adapter)
except Exception as _e:
    logger.debug("Provider registry deferred: %s", _e)
