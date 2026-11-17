"""
Quantitative Indicators Library for Algo Robot.
Re-exports vectorized technical indicators and streaming aggregators from app.indicators.
"""

from app.indicators.technical import (
    compute_ema,
    compute_sma,
    compute_atr,
    compute_supertrend,
    compute_rsi,
    compute_macd,
    compute_bollinger_bands,
    compute_vwap,
    compute_adx,
    compute_stochastic,
    compute_stoch_rsi,
    compute_donchian_channels,
    compute_keltner_channels,
)
from app.indicators.candle_aggregator import (
    StreamingCandleAggregator,
    candle_aggregator,
    TIMEFRAME_SECONDS,
)

import numpy as np
from typing import Tuple

def detect_swing_levels(
    high: np.ndarray,
    low: np.ndarray,
    lookback: int = 8
) -> Tuple[float, float]:
    """Identify recent swing high and swing low over lookback window."""
    high = np.ascontiguousarray(high, dtype=np.float64)
    low = np.ascontiguousarray(low, dtype=np.float64)
    n = len(high)
    if n == 0:
        return 0.0, 0.0
    lb = min(n, lookback)
    recent_high = float(np.max(high[-lb:]))
    recent_low = float(np.min(low[-lb:]))
    return recent_high, recent_low
