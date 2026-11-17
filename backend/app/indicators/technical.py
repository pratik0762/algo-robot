"""
ALGO ROBOT — High-Performance Vectorized Technical Indicators Library
Implements SIMD-aligned, contiguous C-order NumPy technical indicators:
EMA, SMA, ATR, Supertrend, RSI, MACD, Bollinger Bands, VWAP, ADX,
Stochastic Oscillator, Stochastic RSI, Donchian & Keltner Channels.
Performance target: < 1.0ms execution per 1,000 candles.
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


def compute_atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14) -> np.ndarray:
    """Compute True Range (TR) and Average True Range (ATR) using Wilder's exponential smoothing."""
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
        supertrend: np.ndarray of trend line values
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
        if basic_upper[i] < final_upper[i - 1] or close[i - 1] > final_upper[i - 1]:
            final_upper[i] = basic_upper[i]
        else:
            final_upper[i] = final_upper[i - 1]

        if basic_lower[i] > final_lower[i - 1] or close[i - 1] < final_lower[i - 1]:
            final_lower[i] = basic_lower[i]
        else:
            final_lower[i] = final_lower[i - 1]

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


def compute_vwap(
    high: np.ndarray,
    low: np.ndarray,
    close: np.ndarray,
    volume: np.ndarray
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Compute Volume Weighted Average Price (VWAP) and Standard Deviation Bands (+1, -1, +2, -2 SD).
    Returns:
        vwap, upper_1, lower_1, upper_2, lower_2
    """
    high = np.ascontiguousarray(high, dtype=np.float64)
    low = np.ascontiguousarray(low, dtype=np.float64)
    close = np.ascontiguousarray(close, dtype=np.float64)
    volume = np.ascontiguousarray(volume, dtype=np.float64)
    n = len(close)
    if n == 0:
        empty = np.empty(0, dtype=np.float64)
        return empty, empty, empty, empty, empty

    tp = (high + low + close) / 3.0
    cum_vol = np.cumsum(volume)
    safe_cum_vol = np.maximum(cum_vol, 1e-9)

    cum_vp = np.cumsum(tp * volume)
    vwap = cum_vp / safe_cum_vol

    cum_sq_dev = np.cumsum(volume * (tp - vwap) ** 2)
    variance = np.maximum(0.0, cum_sq_dev / safe_cum_vol)
    sd = np.sqrt(variance)

    upper_1 = vwap + (1.0 * sd)
    lower_1 = vwap - (1.0 * sd)
    upper_2 = vwap + (2.0 * sd)
    lower_2 = vwap - (2.0 * sd)

    return vwap, upper_1, lower_1, upper_2, lower_2


def compute_adx(
    high: np.ndarray,
    low: np.ndarray,
    close: np.ndarray,
    period: int = 14
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Compute Average Directional Index (ADX) along with +DI and -DI.
    Returns:
        adx, plus_di, minus_di
    """
    high = np.ascontiguousarray(high, dtype=np.float64)
    low = np.ascontiguousarray(low, dtype=np.float64)
    close = np.ascontiguousarray(close, dtype=np.float64)
    n = len(close)
    if n < 2:
        empty = np.full(n, 20.0, dtype=np.float64)
        return empty, empty, empty

    atr = compute_atr(high, low, close, period)

    up_move = high[1:] - high[:-1]
    down_move = low[:-1] - low[1:]

    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    # Wilder's smoothing for DM
    alpha = 1.0 / float(period)
    m = len(plus_dm)
    smooth_pdm = np.empty(m, dtype=np.float64)
    smooth_mdm = np.empty(m, dtype=np.float64)
    smooth_pdm[0] = plus_dm[0]
    smooth_mdm[0] = minus_dm[0]
    for i in range(1, m):
        smooth_pdm[i] = alpha * plus_dm[i] + (1.0 - alpha) * smooth_pdm[i - 1]
        smooth_mdm[i] = alpha * minus_dm[i] + (1.0 - alpha) * smooth_mdm[i - 1]

    safe_atr = np.maximum(atr[1:], 1e-9)
    plus_di_vals = 100.0 * (smooth_pdm / safe_atr)
    minus_di_vals = 100.0 * (smooth_mdm / safe_atr)

    di_sum = np.maximum(plus_di_vals + minus_di_vals, 1e-9)
    dx = 100.0 * np.abs(plus_di_vals - minus_di_vals) / di_sum

    adx_vals = np.empty(m, dtype=np.float64)
    adx_vals[0] = dx[0]
    for i in range(1, m):
        adx_vals[i] = alpha * dx[i] + (1.0 - alpha) * adx_vals[i - 1]

    adx = np.empty(n, dtype=np.float64)
    plus_di = np.empty(n, dtype=np.float64)
    minus_di = np.empty(n, dtype=np.float64)

    adx[0] = 20.0
    adx[1:] = adx_vals
    plus_di[0] = 20.0
    plus_di[1:] = plus_di_vals
    minus_di[0] = 20.0
    minus_di[1:] = minus_di_vals

    return adx, plus_di, minus_di


def compute_stochastic(
    high: np.ndarray,
    low: np.ndarray,
    close: np.ndarray,
    k_period: int = 14,
    d_period: int = 3,
    smooth_k: int = 3
) -> Tuple[np.ndarray, np.ndarray]:
    """Compute Stochastic Oscillator (%K, %D)."""
    high = np.ascontiguousarray(high, dtype=np.float64)
    low = np.ascontiguousarray(low, dtype=np.float64)
    close = np.ascontiguousarray(close, dtype=np.float64)
    n = len(close)
    if n == 0:
        return np.empty(0, dtype=np.float64), np.empty(0, dtype=np.float64)

    # Rolling lowest low and highest high
    lowest_low = np.empty(n, dtype=np.float64)
    highest_high = np.empty(n, dtype=np.float64)
    for i in range(n):
        start_idx = max(0, i - k_period + 1)
        lowest_low[i] = np.min(low[start_idx:i + 1])
        highest_high[i] = np.max(high[start_idx:i + 1])

    denom = np.maximum(highest_high - lowest_low, 1e-9)
    fast_k = 100.0 * (close - lowest_low) / denom

    slow_k = compute_sma(fast_k, smooth_k)
    slow_d = compute_sma(slow_k, d_period)

    return slow_k, slow_d


def compute_stoch_rsi(
    close: np.ndarray,
    rsi_period: int = 14,
    stoch_period: int = 14,
    k_period: int = 3,
    d_period: int = 3
) -> Tuple[np.ndarray, np.ndarray]:
    """Compute Stochastic RSI (%K, %D)."""
    rsi = compute_rsi(close, rsi_period)
    n = len(rsi)
    lowest_rsi = np.empty(n, dtype=np.float64)
    highest_rsi = np.empty(n, dtype=np.float64)

    for i in range(n):
        start_idx = max(0, i - stoch_period + 1)
        lowest_rsi[i] = np.min(rsi[start_idx:i + 1])
        highest_rsi[i] = np.max(rsi[start_idx:i + 1])

    denom = np.maximum(highest_rsi - lowest_rsi, 1e-9)
    stoch_rsi = 100.0 * (rsi - lowest_rsi) / denom

    k = compute_sma(stoch_rsi, k_period)
    d = compute_sma(k, d_period)
    return k, d


def compute_donchian_channels(
    high: np.ndarray,
    low: np.ndarray,
    period: int = 20
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Compute Donchian Channels (Upper, Lower, Middle)."""
    high = np.ascontiguousarray(high, dtype=np.float64)
    low = np.ascontiguousarray(low, dtype=np.float64)
    n = len(high)
    upper = np.empty(n, dtype=np.float64)
    lower = np.empty(n, dtype=np.float64)

    for i in range(n):
        start_idx = max(0, i - period + 1)
        upper[i] = np.max(high[start_idx:i + 1])
        lower[i] = np.min(low[start_idx:i + 1])

    middle = (upper + lower) * 0.5
    return upper, lower, middle


def compute_keltner_channels(
    high: np.ndarray,
    low: np.ndarray,
    close: np.ndarray,
    ema_period: int = 20,
    atr_period: int = 10,
    multiplier: float = 2.0
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Compute Keltner Channels (Upper, Middle, Lower)."""
    middle = compute_ema(close, ema_period)
    atr = compute_atr(high, low, close, atr_period)
    upper = middle + (multiplier * atr)
    lower = middle - (multiplier * atr)
    return upper, middle, lower


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


# Aliases for calculate_* naming convention
calculate_ema = compute_ema
calculate_sma = compute_sma
calculate_atr = compute_atr
calculate_supertrend = compute_supertrend
calculate_rsi = compute_rsi
calculate_macd = compute_macd
calculate_bollinger_bands = compute_bollinger_bands
calculate_vwap = compute_vwap
calculate_vwap_bands = compute_vwap
calculate_adx = compute_adx
calculate_stochastic = compute_stochastic
calculate_stoch_rsi = compute_stoch_rsi
calculate_donchian_channels = compute_donchian_channels
calculate_keltner_channels = compute_keltner_channels

