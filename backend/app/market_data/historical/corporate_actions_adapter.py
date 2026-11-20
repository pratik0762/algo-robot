"""
ALGO ROBOT — Corporate Actions & Historical Price Adjustment Engine
Calculates split, bonus, and dividend adjustment factors.
Enforces Rule 1 & Step 8 Invariants:
- Raw exchange prices in historical_candles remain UNCHANGED.
- Adjusted series are computed dynamically or stored with is_adjusted=True.
- Volume is scaled inversely to price so that turnover remains invariant.
- Prevents look-ahead bias by tracking ex-dates chronologically.
"""

from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("algo_robot.historical.corporate_actions")


class CorporateActionsAdjustmentEngine:
    """Computes price adjustment factors for splits, bonuses, and rights issues."""

    @staticmethod
    def calculate_split_factor(old_shares: float, new_shares: float) -> float:
        """E.g. A 1:5 split (1 old share becomes 5 new shares) -> factor = 1 / 5 = 0.2."""
        if old_shares <= 0 or new_shares <= 0:
            return 1.0
        return old_shares / new_shares

    @staticmethod
    def calculate_bonus_factor(bonus_shares: float, existing_shares: float) -> float:
        """E.g. A 1:1 bonus (1 bonus for 1 held) -> total becomes 2, factor = 1 / (1 + 1) = 0.5."""
        if bonus_shares < 0 or existing_shares <= 0:
            return 1.0
        return existing_shares / (existing_shares + bonus_shares)

    @staticmethod
    def calculate_dividend_factor(close_price: float, dividend_amount: float) -> float:
        """Proportional cash dividend adjustment factor = (Close - Dividend) / Close."""
        if close_price <= dividend_amount or close_price <= 0:
            return 1.0
        return (close_price - dividend_amount) / close_price

    @staticmethod
    def apply_adjustments(
        raw_candles: List[Dict[str, Any]],
        actions: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Backwards-adjusts historical candles for all corporate actions occurring after the bar.
        
        raw_candles: chronological list of candle dicts with keys:
                     'timestamp', 'open', 'high', 'low', 'close', 'volume', 'turnover', etc.
        actions: list of dicts with:
                 'action_type': 'SPLIT', 'BONUS', 'DIVIDEND'
                 'ex_date': datetime
                 'factor': float (multiplier for pre-ex-date prices)
        """
        if not raw_candles:
            return []
        if not actions:
            # Return copy with is_adjusted=False
            return [{**c, "is_adjusted": False} for c in raw_candles]

        # Sort actions chronologically
        sorted_actions = sorted(actions, key=lambda a: a["ex_date"])

        adjusted_candles = []
        for candle in raw_candles:
            c_ts = candle["timestamp"]
            if isinstance(c_ts, str):
                c_dt = datetime.fromisoformat(c_ts.replace("Z", "+00:00"))
            else:
                c_dt = c_ts

            if c_dt.tzinfo is None:
                c_dt = c_dt.replace(tzinfo=timezone.utc)

            # Cumulative multiplier: product of factors for all actions whose ex_date > candle timestamp
            cumulative_factor = 1.0
            for action in sorted_actions:
                act_date = action["ex_date"]
                if isinstance(act_date, str):
                    act_date = datetime.fromisoformat(act_date.replace("Z", "+00:00"))
                if act_date.tzinfo is None:
                    act_date = act_date.replace(tzinfo=timezone.utc)

                if act_date > c_dt:
                    cumulative_factor *= action.get("factor", 1.0)

            # If factor changed, adjust OHLC and volume
            adj_open = round(candle["open"] * cumulative_factor, 2)
            adj_high = round(candle["high"] * cumulative_factor, 2)
            adj_low = round(candle["low"] * cumulative_factor, 2)
            adj_close = round(candle["close"] * cumulative_factor, 2)
            # Volume scaled inversely so turnover remains identical
            adj_vol = round(candle["volume"] / cumulative_factor, 2) if cumulative_factor > 0 else candle["volume"]

            adjusted_candles.append({
                **candle,
                "open": adj_open,
                "high": adj_high,
                "low": adj_low,
                "close": adj_close,
                "volume": adj_vol,
                "vwap": round(candle.get("vwap", adj_close) * cumulative_factor, 2),
                "is_adjusted": cumulative_factor != 1.0,
                "adjustment_factor": round(cumulative_factor, 6),
            })

        return adjusted_candles
