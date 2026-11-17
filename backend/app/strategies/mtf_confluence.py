"""
ALGO ROBOT — Multi-Timeframe Trend & Confluence Alignment Engine
Evaluates Higher Timeframe (HTF: 1H / 1D) institutional regimes to validate
and filter Lower Timeframe (LTF: 1m / 5m / 15m) tactical triggers.
"""

from __future__ import annotations
from dataclasses import dataclass
from enum import Enum
import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from app.indicators.technical import (
    calculate_ema,
    calculate_supertrend,
    calculate_adx,
    calculate_rsi,
)

logger = logging.getLogger("algo_robot.strategies.mtf")


class MarketRegime(str, Enum):
    STRONG_BULLISH = "STRONG_BULLISH"
    MILD_BULLISH = "MILD_BULLISH"
    RANGE_BOUND = "RANGE_BOUND"
    MILD_BEARISH = "MILD_BEARISH"
    STRONG_BEARISH = "STRONG_BEARISH"


@dataclass
class HTFAlignmentReport:
    symbol: str
    htf_timeframe: str
    regime: MarketRegime
    ema_50: float
    ema_200: float
    supertrend_direction: int  # 1 for Bullish, -1 for Bearish
    adx: float
    is_trending: bool
    allowed_directions: List[str]  # ["BUY"], ["SELL"], or ["BUY", "SELL"]
    confluence_score: float  # 0 to 100
    rationale: str


class MultiTimeframeConfluence:
    """Evaluates HTF trend structure and validates lower timeframe strategy triggers."""

    @staticmethod
    def evaluate_htf_regime(
        symbol: str,
        closes: np.ndarray,
        highs: np.ndarray,
        lows: np.ndarray,
        htf_timeframe: str = "1h",
    ) -> HTFAlignmentReport:
        """
        Analyzes 1h or 1d candles to determine the macro trend structure.
        """
        n = len(closes)
        if n < 30:
            return HTFAlignmentReport(
                symbol=symbol,
                htf_timeframe=htf_timeframe,
                regime=MarketRegime.RANGE_BOUND,
                ema_50=float(closes[-1]) if n > 0 else 0.0,
                ema_200=float(closes[-1]) if n > 0 else 0.0,
                supertrend_direction=0,
                adx=15.0,
                is_trending=False,
                allowed_directions=["BUY", "SELL"],
                confluence_score=50.0,
                rationale="Insufficient HTF candles; default to neutral range-bound regime.",
            )

        current_price = float(closes[-1])

        # 1. EMAs (50 and 200 or 20/50 for shorter series)
        ema_len1 = min(50, n - 2)
        ema_len2 = min(200, n - 1)
        ema_fast = calculate_ema(closes, ema_len1)
        ema_slow = calculate_ema(closes, ema_len2)
        val_fast = float(ema_fast[-1])
        val_slow = float(ema_slow[-1])

        # 2. Supertrend
        st_val, st_dir = calculate_supertrend(highs, lows, closes, period=10, multiplier=3.0)
        curr_st_dir = int(st_dir[-1])

        # 3. ADX for Trend Strength
        adx_res = calculate_adx(highs, lows, closes, period=14)
        adx_series = adx_res[0] if isinstance(adx_res, tuple) else adx_res
        curr_adx = float(adx_series[-1])
        is_trending = curr_adx >= 22.0

        # Determine Regime
        bullish_score = 0
        bearish_score = 0

        # Price vs EMAs
        if current_price > val_fast:
            bullish_score += 25
        else:
            bearish_score += 25

        if val_fast > val_slow:
            bullish_score += 25
        else:
            bearish_score += 25

        # Supertrend
        if curr_st_dir == 1:
            bullish_score += 30
        else:
            bearish_score += 30

        # ADX trend confirmation
        if is_trending:
            if bullish_score > bearish_score:
                bullish_score += 20
            else:
                bearish_score += 20

        if bullish_score >= 80:
            regime = MarketRegime.STRONG_BULLISH
            allowed = ["BUY"]
            confluence = 95.0
            rationale = f"Strong HTF ({htf_timeframe}) Uptrend: Price > EMA {ema_len1} > EMA {ema_len2}, Supertrend Green, ADX {round(curr_adx, 1)}."
        elif bullish_score >= 55:
            regime = MarketRegime.MILD_BULLISH
            allowed = ["BUY"]
            confluence = 75.0
            rationale = f"Moderate HTF ({htf_timeframe}) Bullish bias with favorable Supertrend alignment."
        elif bearish_score >= 80:
            regime = MarketRegime.STRONG_BEARISH
            allowed = ["SELL"]
            confluence = 95.0
            rationale = f"Strong HTF ({htf_timeframe}) Downtrend: Price < EMA {ema_len1} < EMA {ema_len2}, Supertrend Red, ADX {round(curr_adx, 1)}."
        elif bearish_score >= 55:
            regime = MarketRegime.MILD_BEARISH
            allowed = ["SELL"]
            confluence = 75.0
            rationale = f"Moderate HTF ({htf_timeframe}) Bearish bias with short positioning preferred."
        else:
            regime = MarketRegime.RANGE_BOUND
            allowed = ["BUY", "SELL"]
            confluence = 50.0
            rationale = f"HTF ({htf_timeframe}) Consolidation / Range: ADX below 22, mixed EMA structure."

        return HTFAlignmentReport(
            symbol=symbol,
            htf_timeframe=htf_timeframe,
            regime=regime,
            ema_50=round(val_fast, 2),
            ema_200=round(val_slow, 2),
            supertrend_direction=curr_st_dir,
            adx=round(curr_adx, 2),
            is_trending=is_trending,
            allowed_directions=allowed,
            confluence_score=confluence,
            rationale=rationale,
        )

    @staticmethod
    def validate_signal_confluence(
        signal_type: str,
        htf_report: HTFAlignmentReport,
        ltf_setup_score: float = 80.0,
    ) -> Tuple[bool, float, str]:
        """
        Validates if lower-timeframe trigger matches HTF institutional regime.
        Returns: (is_approved, composite_confidence_score, rationale)
        """
        sig_dir = signal_type.upper()
        if sig_dir not in htf_report.allowed_directions:
            penalty_score = max(35.0, ltf_setup_score - 35.0)
            return (
                False,
                penalty_score,
                f"REJECTED: {sig_dir} signal contradicts {htf_report.htf_timeframe} {htf_report.regime.value} trend.",
            )

        # Confluence bonus
        composite_score = round((ltf_setup_score * 0.6) + (htf_report.confluence_score * 0.4), 1)
        return (
            True,
            composite_score,
            f"CONFIRMED: {sig_dir} aligns with {htf_report.htf_timeframe} {htf_report.regime.value} ({htf_report.rationale}).",
        )
