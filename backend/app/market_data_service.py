"""Real Market Data Service for Algo Robot.
Provides genuine multi-timeframe OHLCV historical candle data and live quotes
for Indian Equities (NSE) with persistent local caching.
"""

from __future__ import annotations

import os
import json
import time
import logging
import urllib.request
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional

logger = logging.getLogger("market_data")

IST = timezone(timedelta(hours=5, minutes=30))

# Standard symbols universe
DEFAULT_UNIVERSE_SYMBOLS = [
    # Large Cap
    "RELIANCE", "TCS", "HDFCBANK", "BHARTIARTL", "ICICIBANK",
    "INFY", "SBIN", "ITC", "LT", "MARUTI", "TITAN", "SUNPHARMA",
    # Mid Cap
    "TRENT", "POLYCAB", "PERSISTENT", "COFORGE", "DIXON",
    "SUZLON", "FEDERALBNK", "AUROPHARMA", "BHEL", "ESCORTS",
    # Small Cap
    "CDSL", "KAYNES", "MAPMYINDIA", "HAPPSTMNDS", "TEJASNET",
    "LATENTVIEW", "CAMS", "CYIENT", "ANGELONE", "CLEAN"
]

# Timeframe mapping to Yahoo query parameters
TIMEFRAME_CONFIG = {
    "1m": {"interval": "1m", "range": "1d", "label": "1 Minute"},
    "5m": {"interval": "5m", "range": "5d", "label": "5 Minutes"},
    "15m": {"interval": "15m", "range": "5d", "label": "15 Minutes"},
    "1H": {"interval": "60m", "range": "1mo", "label": "1 Hour"},
    "1D": {"interval": "1d", "range": "6mo", "label": "Daily"}
}

SYMBOL_MAP = {
    "TATAMOTORS": "TMPV.NS",
}

class MarketDataService:
    """Manages real OHLCV candle series and live quotes for algorithmic trading strategies."""

    def __init__(self) -> None:
        self.base_dir = os.path.dirname(__file__)
        self.cache_dir = os.path.join(self.base_dir, "data", "ohlcv_cache")
        self.quotes_cache_path = os.path.join(self.base_dir, "data", "live_quotes_cache.json")
        os.makedirs(self.cache_dir, exist_ok=True)
        self._memory_candle_cache: Dict[str, List[Dict[str, Any]]] = {}

    def get_ticker_for_symbol(self, symbol: str) -> str:
        sym_clean = symbol.upper().replace(".NS", "").replace("-EQ", "")
        if sym_clean in SYMBOL_MAP:
            return SYMBOL_MAP[sym_clean]
        return f"{sym_clean}.NS"

    def _get_cache_filepath(self, symbol: str, timeframe: str) -> str:
        sym_clean = symbol.upper().replace(".NS", "").replace("-EQ", "")
        return os.path.join(self.cache_dir, f"{sym_clean}_{timeframe}.json")

    def load_cached_candles(self, symbol: str, timeframe: str) -> List[Dict[str, Any]]:
        """Load genuine candles from persistent disk cache."""
        cache_key = f"{symbol.upper()}_{timeframe}"
        if cache_key in self._memory_candle_cache:
            return self._memory_candle_cache[cache_key]

        filepath = self._get_cache_filepath(symbol, timeframe)
        if os.path.exists(filepath):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    candles = json.load(f)
                    if isinstance(candles, list) and len(candles) > 0:
                        self._memory_candle_cache[cache_key] = candles
                        return candles
            except Exception as e:
                logger.debug("Failed reading candle cache for %s (%s): %s", symbol, timeframe, e)
        return []

    def save_cached_candles(self, symbol: str, timeframe: str, candles: List[Dict[str, Any]]) -> None:
        """Save authentic candle series to disk cache and memory cache."""
        if not candles:
            return
        cache_key = f"{symbol.upper()}_{timeframe}"
        self._memory_candle_cache[cache_key] = candles
        filepath = self._get_cache_filepath(symbol, timeframe)
        try:
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(candles, f, indent=2)
        except Exception as e:
            logger.debug("Failed writing candle cache for %s (%s): %s", symbol, timeframe, e)

    def fetch_live_candles(
        self,
        symbol: str,
        timeframe: str = "15m",
        timeout: float = 6.0
    ) -> List[Dict[str, Any]]:
        """Fetch authentic OHLCV candlestick series from market feed."""
        cfg = TIMEFRAME_CONFIG.get(timeframe, TIMEFRAME_CONFIG["15m"])
        ticker = self.get_ticker_for_symbol(symbol)
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range={cfg['range']}&interval={cfg['interval']}"

        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "*/*"
            }
        )

        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                result = data.get("chart", {}).get("result", [])
                if not result:
                    return self.load_cached_candles(symbol, timeframe)

                res = result[0]
                timestamps = res.get("timestamp", [])
                quote = res.get("indicators", {}).get("quote", [{}])[0]

                opens = quote.get("open", [])
                highs = quote.get("high", [])
                lows = quote.get("low", [])
                closes = quote.get("close", [])
                volumes = quote.get("volume", [])

                if not timestamps or not closes:
                    return self.load_cached_candles(symbol, timeframe)

                candles: List[Dict[str, Any]] = []
                for i in range(len(timestamps)):
                    o = opens[i] if i < len(opens) else None
                    h = highs[i] if i < len(highs) else None
                    l = lows[i] if i < len(lows) else None
                    c = closes[i] if i < len(closes) else None
                    v = volumes[i] if i < len(volumes) else None

                    # Skip bars with null prices (market halts / gaps)
                    if c is None or o is None or h is None or l is None:
                        continue

                    ts_sec = timestamps[i]
                    dt = datetime.fromtimestamp(ts_sec, tz=IST)
                    time_str = dt.strftime("%Y-%m-%d %H:%M")

                    candles.append({
                        "time": time_str,
                        "timestamp": ts_sec * 1000,
                        "open": round(float(o), 2),
                        "high": round(float(h), 2),
                        "low": round(float(l), 2),
                        "close": round(float(c), 2),
                        "volume": int(v or 0)
                    })

                if candles:
                    self.save_cached_candles(symbol, timeframe, candles)
                    return candles

        except Exception as e:
            logger.debug("Live candle fetch error for %s (%s): %s", symbol, timeframe, e)

        # Fallback to persistent disk cache
        return self.load_cached_candles(symbol, timeframe)

    def get_candles(
        self,
        symbol: str,
        timeframe: str = "15m",
        limit: int = 50,
        force_live: bool = False
    ) -> List[Dict[str, Any]]:
        """Retrieve authentic OHLCV candle series. Always returns real historical prices."""
        sym_clean = symbol.upper().replace(".NS", "").replace("-EQ", "")
        candles: List[Dict[str, Any]] = []

        if force_live:
            candles = self.fetch_live_candles(sym_clean, timeframe)
        else:
            candles = self.load_cached_candles(sym_clean, timeframe)
            if not candles:
                candles = self.fetch_live_candles(sym_clean, timeframe)

        if not candles:
            return []

        if limit and len(candles) > limit:
            return candles[-limit:]
        return candles

    def get_live_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Load live quote from the official live quotes cache."""
        sym_clean = symbol.upper().replace(".NS", "").replace("-EQ", "")
        if os.path.exists(self.quotes_cache_path):
            try:
                with open(self.quotes_cache_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return data.get(sym_clean)
            except Exception:
                pass
        return None

# Global Singleton
market_data_service = MarketDataService()
