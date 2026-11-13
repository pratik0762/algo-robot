"""Quantitative Indicators Library for Algo Robot.
Vectorized, mathematical calculation of technical indicators on OHLCV candle series
using numpy and pandas.
"""

from __future__ import annotations
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Any, Optional

def compute_ema(prices: np.ndarray, period: int) -> np.ndarray:
    """Compute Exponential Moving Average (EMA) with standard smoothing alpha = 2 / (period + 1)."""
    if len(prices) == 0:
        return np.array([])
    s = pd.Series(prices)
    ema = s.ewm(span=period, adjust=False).mean().to_numpy()
    return ema

def compute_sma(prices: np.ndarray, period: int) -> np.ndarray:
    """Compute Simple Moving Average (SMA)."""
    if len(prices) < period:
        return prices.copy()
    s = pd.Series(prices)
    sma = s.rolling(window=period, min_periods=1).mean().to_numpy()
    return sma

def compute_atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 10) -> np.ndarray:
    """Compute True Range (TR) and Average True Range (ATR) using Wilder's smoothing."""
    n = len(close)
    if n == 0:
        return np.array([])
    if n == 1:
        return np.array([high[0] - low[0]])

    tr = np.zeros(n, dtype=np.float64)
    tr[0] = high[0] - low[0]
    for i in range(1, n):
        hl = high[i] - low[i]
        hpc = abs(high[i] - close[i - 1])
        lpc = abs(low[i] - close[i - 1])
        tr[i] = max(hl, hpc, lpc)

    atr = pd.Series(tr).ewm(alpha=1.0 / period, adjust=False).mean().to_numpy()
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
    n = len(close)
    if n == 0:
        return np.array([]), np.array([])

    atr = compute_atr(high, low, close, period)
    hl2 = (high + low) / 2.0

    basic_upper = hl2 + (multiplier * atr)
    basic_lower = hl2 - (multiplier * atr)

    final_upper = np.zeros(n, dtype=np.float64)
    final_lower = np.zeros(n, dtype=np.float64)
    supertrend = np.zeros(n, dtype=np.float64)
    direction = np.zeros(n, dtype=np.int32)

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
    n = len(close)
    if n < 2:
        return np.full(n, 50.0)

    delta = np.diff(close)
    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)

    # Initial average
    avg_gain = pd.Series(gain).ewm(alpha=1.0 / period, adjust=False).mean().to_numpy()
    avg_loss = pd.Series(loss).ewm(alpha=1.0 / period, adjust=False).mean().to_numpy()

    rs = np.divide(avg_gain, avg_loss, out=np.zeros_like(avg_gain), where=avg_loss != 0)
    rsi_vals = 100.0 - (100.0 / (1.0 + rs))

    # Prepend neutral 50 for the first element
    rsi = np.zeros(n, dtype=np.float64)
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
    n = len(close)
    if n == 0:
        return np.array([]), np.array([]), np.array([])

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
    n = len(close)
    if n == 0:
        return np.array([]), np.array([]), np.array([]), np.array([])

    s = pd.Series(close)
    middle = s.rolling(window=period, min_periods=1).mean().to_numpy()
    std = s.rolling(window=period, min_periods=1).std(ddof=0).fillna(0).to_numpy()

    upper = middle + (std_dev * std)
    lower = middle - (std_dev * std)
    
    # Bandwidth = (Upper - Lower) / Middle
    bandwidth = np.divide(upper - lower, middle, out=np.zeros_like(middle), where=middle != 0)

    return upper, middle, lower, bandwidth

def detect_swing_levels(
    high: np.ndarray,
    low: np.ndarray,
    lookback: int = 8
) -> Tuple[float, float]:
    """Identify recent swing high and swing low over lookback window."""
    n = len(high)
    if n == 0:
        return 0.0, 0.0
    lb = min(n, lookback)
    recent_high = float(np.max(high[-lb:]))
    recent_low = float(np.min(low[-lb:]))
    return recent_high, recent_low

