"""
ALGO ROBOT — Multi-Strike Open Interest (OI) Buildup & Max Pain Engine
Calculates strike-level institutional buildup, Put-Call Ratio (PCR),
Max Pain settlement theory, and straddle expected moves.
"""

from __future__ import annotations
from enum import Enum
import math
from typing import Any, Dict, List, Optional, Tuple


class OIBuildupType(str, Enum):
    LONG_BUILDUP = "LONG_BUILDUP"
    SHORT_BUILDUP = "SHORT_BUILDUP"
    LONG_UNWINDING = "LONG_UNWINDING"
    SHORT_COVERING = "SHORT_COVERING"
    NEUTRAL = "NEUTRAL"


class OpenInterestAnalyzer:
    """Analyzes Open Interest buildup, PCR, Max Pain, and expected range."""

    @staticmethod
    def classify_strike_buildup(price_change: float, oi_change: float) -> str:
        """
        Classifies strike-level price & OI dynamics into institutional regimes:
        - LONG_BUILDUP: Price UP & OI UP (Fresh longs entering)
        - SHORT_BUILDUP: Price DOWN & OI UP (Fresh shorts entering)
        - LONG_UNWINDING: Price DOWN & OI DOWN (Longs closing positions)
        - SHORT_COVERING: Price UP & OI DOWN (Shorts forced to cover)
        - NEUTRAL: Little or no price/OI change
        """
        if abs(price_change) < 0.05 or abs(oi_change) < 5:
            return "NEUTRAL"

        if price_change > 0 and oi_change > 0:
            return "LONG_BUILDUP"
        elif price_change < 0 and oi_change > 0:
            return "SHORT_BUILDUP"
        elif price_change < 0 and oi_change < 0:
            return "LONG_UNWINDING"
        elif price_change > 0 and oi_change < 0:
            return "SHORT_COVERING"
        return "NEUTRAL"

    @staticmethod
    def calculate_max_pain(
        strikes: List[float],
        call_oi: List[int],
        put_oi: List[int],
    ) -> float:
        """
        Calculates Max Pain strike price.
        The strike at which option writers (institutions) face the minimum total payout.
        """
        if not strikes or len(strikes) != len(call_oi) or len(strikes) != len(put_oi):
            return strikes[len(strikes) // 2] if strikes else 0.0

        n = len(strikes)
        min_total_loss = float("inf")
        max_pain_strike = strikes[n // 2]

        for i in range(n):
            expiry_price = strikes[i]
            call_loss = 0.0
            put_loss = 0.0

            for j in range(n):
                # Calls ITM if expiry_price > strike
                if expiry_price > strikes[j]:
                    call_loss += (expiry_price - strikes[j]) * call_oi[j]
                # Puts ITM if expiry_price < strike
                elif expiry_price < strikes[j]:
                    put_loss += (strikes[j] - expiry_price) * put_oi[j]

            total_loss = call_loss + put_loss
            if total_loss < min_total_loss:
                min_total_loss = total_loss
                max_pain_strike = expiry_price

        return float(max_pain_strike)

    @staticmethod
    def calculate_pcr(
        total_call_oi: int,
        total_put_oi: int,
        total_call_vol: int = 0,
        total_put_vol: int = 0,
    ) -> Dict[str, Any]:
        """Calculates Put-Call Ratio (PCR) for both Open Interest and Volume."""
        pcr_oi = round(total_put_oi / max(total_call_oi, 1), 3)
        pcr_vol = round(total_put_vol / max(total_call_vol, 1), 3) if total_call_vol > 0 else 1.0

        if pcr_oi >= 1.3:
            sentiment = "OVERBOUGHT_OR_STRONG_SUPPORT"
            direction = "BULLISH"
        elif pcr_oi >= 1.0:
            sentiment = "MODERATELY_BULLISH"
            direction = "MILD_BULLISH"
        elif pcr_oi >= 0.75:
            sentiment = "NEUTRAL_RANGE_BOUND"
            direction = "NEUTRAL"
        else:
            sentiment = "OVERSOLD_OR_STRONG_RESISTANCE"
            direction = "BEARISH"

        return {
            "pcr_oi": pcr_oi,
            "pcr_volume": pcr_vol,
            "total_call_oi": total_call_oi,
            "total_put_oi": total_put_oi,
            "total_call_volume": total_call_vol,
            "total_put_volume": total_put_vol,
            "sentiment": sentiment,
            "market_direction": direction,
        }

    @staticmethod
    def calculate_expected_move(
        spot: float,
        atm_iv: float,
        days_to_expiry: float,
        atm_straddle_price: Optional[float] = None,
    ) -> Dict[str, float]:
        """
        Calculates theoretical market expected move:
        Uses both Rule of 16 (IV * sqrt(T)) and ATM Straddle pricing (Straddle * 0.85).
        """
        t = max(days_to_expiry / 365.0, 0.0001)

        # Theoretical volatility-based 1-sigma expected move
        vol_expected_points = round(spot * atm_iv * math.sqrt(t), 2)

        # Straddle market-implied move (if straddle price provided)
        straddle_expected_points = round(atm_straddle_price * 0.85, 2) if atm_straddle_price else vol_expected_points

        expected_points = round((vol_expected_points + straddle_expected_points) / 2.0, 2)
        upper_bound = round(spot + expected_points, 2)
        lower_bound = round(spot - expected_points, 2)
        move_pct = round((expected_points / spot) * 100.0, 2) if spot > 0 else 0.0

        return {
            "spot": spot,
            "expected_move_points": expected_points,
            "expected_move_percent": move_pct,
            "upper_bound": upper_bound,
            "lower_bound": lower_bound,
            "vol_expected_points": vol_expected_points,
            "straddle_expected_points": straddle_expected_points,
        }
