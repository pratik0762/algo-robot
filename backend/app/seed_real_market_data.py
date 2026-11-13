"""Seeds persistent OHLCV historical candle cache for universe equities from genuine market data."""

import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app.market_data_service import market_data_service, DEFAULT_UNIVERSE_SYMBOLS

def seed_market_data():
    timeframes = ["15m", "1H", "1D"]
    symbols = DEFAULT_UNIVERSE_SYMBOLS
    print(f"Starting OHLCV seeding for {len(symbols)} symbols across {timeframes}...")

    total_candles = 0
    for sym in symbols:
        for tf in timeframes:
            try:
                candles = market_data_service.fetch_live_candles(sym, timeframe=tf, timeout=7.0)
                if candles:
                    print(f"  [OK] {sym:12} {tf:4} -> {len(candles)} candles (Latest Close: {candles[-1]['close']})")
                    total_candles += len(candles)
                else:
                    print(f"  [--] {sym:12} {tf:4} -> 0 candles")
            except Exception as e:
                print(f"  [ERR] {sym:12} {tf:4}: {e}")
            time.sleep(0.1)

    print(f"\nSeeding complete! Stored {total_candles} authentic candles across symbols.")

if __name__ == "__main__":
    seed_market_data()

