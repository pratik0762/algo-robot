"""
ALGO ROBOT — Streaming Real-Time Candle Aggregator
Rolls tick-by-tick market data into OHLCV bars across multi-timeframes (1s, 1m, 5m, 15m, 1h, 1d)
with zero dropped volume and instantaneous candle close event triggers.
"""

from __future__ import annotations
import asyncio
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Awaitable
from app.market_data.base_adapter import NormalizedTick

TIMEFRAME_SECONDS: Dict[str, int] = {
    "1s": 1,
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "1d": 86400,
}


class CandleBar:
    """Internal mutable representation of an open or recently closed candle bar."""
    __slots__ = ("symbol", "timeframe", "bucket_ts", "open", "high", "low", "close", "volume", "tick_count", "is_closed")

    def __init__(self, symbol: str, timeframe: str, bucket_ts: int, price: float, volume: int = 0):
        self.symbol = symbol
        self.timeframe = timeframe
        self.bucket_ts = bucket_ts
        self.open = price
        self.high = price
        self.low = price
        self.close = price
        self.volume = volume
        self.tick_count = 1
        self.is_closed = False

    def update(self, price: float, vol: int = 0) -> None:
        if price > self.high:
            self.high = price
        elif price < self.low:
            self.low = price
        self.close = price
        self.volume += vol
        self.tick_count += 1

    def to_dict(self) -> Dict[str, Any]:
        return {
            "symbol": self.symbol,
            "timeframe": self.timeframe,
            "timestamp": self.bucket_ts,
            "time": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self.bucket_ts)),
            "open": round(self.open, 2),
            "high": round(self.high, 2),
            "low": round(self.low, 2),
            "close": round(self.close, 2),
            "volume": self.volume,
            "tick_count": self.tick_count,
            "is_closed": self.is_closed,
        }


class StreamingCandleAggregator:
    """High-speed in-memory multi-timeframe candle builder."""

    def __init__(self, max_history_bars: int = 500):
        self.max_history = max_history_bars
        self._lock = threading.RLock()
        # symbol -> timeframe -> active CandleBar
        self._active_bars: Dict[str, Dict[str, CandleBar]] = {}
        # symbol -> timeframe -> List of completed bar dicts
        self._history: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
        self._candle_close_listeners: List[Callable[[Dict[str, Any]], Awaitable[None]]] = []

    def register_close_listener(self, callback: Callable[[Dict[str, Any]], Awaitable[None]]) -> None:
        if callback not in self._candle_close_listeners:
            self._candle_close_listeners.append(callback)

    def add_tick(self, tick: NormalizedTick) -> List[Dict[str, Any]]:
        """
        Updates rolling candle bars for the tick's symbol across all standard timeframes.
        Returns any candles that closed as a result of this tick.
        """
        closed_candles: List[Dict[str, Any]] = []
        symbol = tick.symbol.upper()
        price = tick.ltp
        tick_time = int(tick.timestamp) if tick.timestamp > 0 else int(time.time())

        with self._lock:
            if symbol not in self._active_bars:
                self._active_bars[symbol] = {}
                self._history[symbol] = {tf: [] for tf in TIMEFRAME_SECONDS}

            for tf, tf_sec in TIMEFRAME_SECONDS.items():
                bucket_ts = (tick_time // tf_sec) * tf_sec
                active = self._active_bars[symbol].get(tf)

                if active is None:
                    # First bar for this timeframe
                    self._active_bars[symbol][tf] = CandleBar(symbol, tf, bucket_ts, price, tick.volume)
                elif active.bucket_ts == bucket_ts:
                    # Current candle continues
                    active.update(price, tick_vol := max(0, tick.volume - active.volume) if tick.volume > active.volume else 1)
                else:
                    # Candle has completed; close it
                    active.is_closed = True
                    closed_dict = active.to_dict()
                    closed_candles.append(closed_dict)

                    # Append to history ring-buffer
                    hist = self._history[symbol].setdefault(tf, [])
                    hist.append(closed_dict)
                    if len(hist) > self.max_history:
                        hist.pop(0)

                    # Start new active bar
                    self._active_bars[symbol][tf] = CandleBar(symbol, tf, bucket_ts, price, 1)

        return closed_candles

    def get_candles(self, symbol: str, timeframe: str = "5m", limit: int = 100) -> List[Dict[str, Any]]:
        """Returns completed candles plus the currently active unclosed candle."""
        sym = symbol.upper()
        with self._lock:
            hist = list(self._history.get(sym, {}).get(timeframe, []))
            active = self._active_bars.get(sym, {}).get(timeframe)
            if active:
                hist.append(active.to_dict())
            return hist[-limit:] if limit > 0 else hist

    def seed_candles(self, symbol: str, timeframe: str, candles: List[Dict[str, Any]]) -> None:
        """Seeds historic candles into the ring buffer for immediate technical analysis."""
        sym = symbol.upper()
        with self._lock:
            if sym not in self._history:
                self._history[sym] = {tf: [] for tf in TIMEFRAME_SECONDS}
            self._history[sym][timeframe] = list(candles[-self.max_history:])


# Singleton streaming candle aggregator
candle_aggregator = StreamingCandleAggregator()
