"""Quantitative Indicators Library for Algo Robot.
High-performance vectorized, SIMD-aligned technical indicators on OHLCV candle series
using contiguous C-order NumPy arrays.
"""

from __future__ import annotations
import numpy as np
from typing import Dict, List, Tuple, Any, Optional

def compute_ema(prices: np.ndarray, period: int) -> np.ndarray:
    """Compute Exponential Moving Average (EMA) with standard smoothing alpha = 2 / (period + 1)."""
    prices = np.ascontiguousarray(prices, dtype=np.float64)
    n = len(prices)
    if n == 0:
        return np.empty(0, dtype=np.float64)

    alpha = 2.0 / (period + 1.0)
    out = np.empty(n, dtype=np.float64)
    out[0] = prices[0]
    for i in range(1, n):
        out[i] = alpha * prices[i] + (1.0 - alpha) * out[i - 1]
    return out

def compute_sma(prices: np.ndarray, period: int) -> np.ndarray:
    """Compute Simple Moving Average (SMA) using fast cumulative sum with min_periods=1."""
    prices = np.ascontiguousarray(prices, dtype=np.float64)
    n = len(prices)
    if n == 0:
        return np.empty(0, dtype=np.float64)
    if n < period:
        cumsum = np.cumsum(prices)
        return cumsum / np.arange(1, n + 1, dtype=np.float64)

    out = np.empty(n, dtype=np.float64)
    cumsum = np.cumsum(prices)
    out[:period] = cumsum[:period] / np.arange(1, period + 1, dtype=np.float64)
    out[period:] = (cumsum[period:] - cumsum[:-period]) / float(period)
    return out

def compute_atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 10) -> np.ndarray:
    """Compute True Range (TR) and Average True Range (ATR) using Wilder's smoothing.
    SIMD vectorized True Range calculation over contiguous C-arrays.
    """
    high = np.ascontiguousarray(high, dtype=np.float64)
    low = np.ascontiguousarray(low, dtype=np.float64)
    close = np.ascontiguousarray(close, dtype=np.float64)
    n = len(close)
    if n == 0:
        return np.empty(0, dtype=np.float64)
    if n == 1:
        return np.array([high[0] - low[0]], dtype=np.float64)

    tr = np.empty(n, dtype=np.float64)
    tr[0] = high[0] - low[0]
    hl = high[1:] - low[1:]
    hpc = np.abs(high[1:] - close[:-1])
    lpc = np.abs(low[1:] - close[:-1])
    tr[1:] = np.maximum(hl, np.maximum(hpc, lpc))

    # Wilder's exponential smoothing (alpha = 1 / period)
    alpha = 1.0 / float(period)
    atr = np.empty(n, dtype=np.float64)
    atr[0] = tr[0]
    for i in range(1, n):
        atr[i] = alpha * tr[i] + (1.0 - alpha) * atr[i - 1]
    return atr

def compute_supertrend(
    high: np.ndarray,
    low: np.ndarray,
    close: np.ndarray,
    period: int = 10,
    multiplier: float = 3.0
) -> Tuple[np.ndarray, np.ndarray]:
    """Calculate Supertrend indicator.
    Returns:
        supertrend: np.ndarray of trend support/resistance values
        direction: np.ndarray of 1 (Bullish/Up) or -1 (Bearish/Down)
    """
    high = np.ascontiguousarray(high, dtype=np.float64)
    low = np.ascontiguousarray(low, dtype=np.float64)
    close = np.ascontiguousarray(close, dtype=np.float64)
    n = len(close)
    if n == 0:
        return np.empty(0, dtype=np.float64), np.empty(0, dtype=np.int32)

    atr = compute_atr(high, low, close, period)
    hl2 = (high + low) * 0.5

    basic_upper = hl2 + (multiplier * atr)
    basic_lower = hl2 - (multiplier * atr)

    final_upper = np.empty(n, dtype=np.float64)
    final_lower = np.empty(n, dtype=np.float64)
    supertrend = np.empty(n, dtype=np.float64)
    direction = np.empty(n, dtype=np.int32)

    final_upper[0] = basic_upper[0]
    final_lower[0] = basic_lower[0]
    direction[0] = 1 if close[0] >= basic_lower[0] else -1
    supertrend[0] = final_lower[0] if direction[0] == 1 else final_upper[0]

    for i in range(1, n):
        # Upper band adjustment
        if basic_upper[i] < final_upper[i - 1] or close[i - 1] > final_upper[i - 1]:
            final_upper[i] = basic_upper[i]
        else:
            final_upper[i] = final_upper[i - 1]

        # Lower band adjustment
        if basic_lower[i] > final_lower[i - 1] or close[i - 1] < final_lower[i - 1]:
            final_lower[i] = basic_lower[i]
        else:
            final_lower[i] = final_lower[i - 1]

        # Direction flip
        prev_dir = direction[i - 1]
        if prev_dir == 1:
            if close[i] < final_lower[i]:
                direction[i] = -1
                supertrend[i] = final_upper[i]
            else:
                direction[i] = 1
                supertrend[i] = final_lower[i]
        else:
            if close[i] > final_upper[i]:
                direction[i] = 1
                supertrend[i] = final_lower[i]
            else:
                direction[i] = -1
                supertrend[i] = final_upper[i]

    return supertrend, direction

def compute_rsi(close: np.ndarray, period: int = 14) -> np.ndarray:
    """Compute Wilder's Relative Strength Index (RSI)."""
    close = np.ascontiguousarray(close, dtype=np.float64)
    n = len(close)
    if n < 2:
        return np.full(n, 50.0, dtype=np.float64)

    delta = np.diff(close)
    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)

    # Wilder's smoothing for gains and losses
    alpha = 1.0 / float(period)
    m = len(gain)
    avg_gain = np.empty(m, dtype=np.float64)
    avg_loss = np.empty(m, dtype=np.float64)
    avg_gain[0] = gain[0]
    avg_loss[0] = loss[0]
    for i in range(1, m):
        avg_gain[i] = alpha * gain[i] + (1.0 - alpha) * avg_gain[i - 1]
        avg_loss[i] = alpha * loss[i] + (1.0 - alpha) * avg_loss[i - 1]

    rs = np.divide(avg_gain, avg_loss, out=np.zeros_like(avg_gain), where=avg_loss != 0)
    rsi_vals = 100.0 - (100.0 / (1.0 + rs))

    # Prepend neutral 50 for the first element
    rsi = np.empty(n, dtype=np.float64)
    rsi[0] = 50.0
    rsi[1:] = rsi_vals
    return rsi

def compute_macd(
    close: np.ndarray,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Compute MACD Line, Signal Line, and MACD Histogram."""
    close = np.ascontiguousarray(close, dtype=np.float64)
    n = len(close)
    if n == 0:
        return np.empty(0, dtype=np.float64), np.empty(0, dtype=np.float64), np.empty(0, dtype=np.float64)

    ema_fast = compute_ema(close, fast)
    ema_slow = compute_ema(close, slow)
    macd_line = ema_fast - ema_slow
    signal_line = compute_ema(macd_line, signal)
    histogram = macd_line - signal_line

    return macd_line, signal_line, histogram

def compute_bollinger_bands(
    close: np.ndarray,
    period: int = 20,
    std_dev: float = 2.0
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Compute Bollinger Bands (Upper, Middle, Lower, and Bandwidth)."""
    close = np.ascontiguousarray(close, dtype=np.float64)
    n = len(close)
    if n == 0:
        return np.empty(0, dtype=np.float64), np.empty(0, dtype=np.float64), np.empty(0, dtype=np.float64), np.empty(0, dtype=np.float64)

    middle = compute_sma(close, period)
    sq_middle = compute_sma(close ** 2, period)
    var = np.maximum(0.0, sq_middle - middle ** 2)
    std = np.sqrt(var)

    upper = middle + (std_dev * std)
    lower = middle - (std_dev * std)
    bandwidth = np.divide(upper - lower, middle, out=np.zeros_like(middle), where=middle != 0)

    return upper, middle, lower, bandwidth

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
