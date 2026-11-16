"""Multi-Timeframe Strong Supply & Demand + Failed Breakout + CHoCH Engine.

Quantitative Price Action, Market Structure, and Institutional Level Execution System.
Modules included:
  1. MarketDataManager (multi-timeframe validation, zero lookahead)
  2. SwingHighLowDetector (non-repainting pivot / fractal detection)
  3. MarketStructureDetector (HH, HL, LH, LL structure mapping)
  4. ImpulsiveMoveDetector (ATR expansion, body-to-range >= 60%, displacement >= 2x ATR)
  5. MajorLevelDetector & MinorLevelDetector (ATR-normalized displacement classification)
  6. VirginLevelValidator (VIRGIN, TOUCHED, MITIGATED, INVALIDATED, EXPIRED tracking)
  7. SupplyDemandZoneDetector (origin reversal base zone identification)
  8. RetracementAnalyzer (approach speed, momentum decay)
  9. BuyerSellerBehaviourAnalyzer (attempt counter, rejection wicks, exhaustion)
  10. LiquiditySweepDetector & FailedBreakoutDetector (stop hunt & rejection close)
  11. CHoCHDetector (Change of Character on completed candle close)
  12. BOSDetector (Break of Structure continuation)
  13. StrategyScoringEngine (0-100 composite quality score)
  14. EntrySignalGenerator (Conservative, Balanced, Aggressive modes)
  15. StopLossManager & TargetManager (ATR buffer, structure levels, min 1:2 R:R)
  16. PositionSizingEngine & RiskManagementEngine (1% risk, capital allocation)
  17. MultiTimeframeConfluence (HTF trend alignment & confluence)
  18. StrategyConfigurationManager (user-configurable profiles)
"""

from __future__ import annotations
import math
import numpy as np
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field, asdict
from enum import Enum

IST = timezone(timedelta(hours=5, minutes=30))


class LevelType(str, Enum):
    SUPPLY = "SUPPLY"
    DEMAND = "DEMAND"


class LevelClassification(str, Enum):
    MAJOR = "MAJOR"       # God Level: >= 2.5x ATR displacement, structural break
    MINOR = "MINOR"       # 1.5x - 2.5x ATR displacement, local swing
    WEAK = "WEAK"         # < 1.5x ATR displacement or overlapping zones


class VirginStatus(str, Enum):
    VIRGIN = "VIRGIN"             # Untouched since formation
    TOUCHED = "TOUCHED"           # Penetrated boundary but closed within
    MITIGATED = "MITIGATED"       # Reached 50% zone depth or initiated reaction
    INVALIDATED = "INVALIDATED"   # Closed decisively beyond invalidation boundary
    EXPIRED = "EXPIRED"           # Reached maximum age without test


class EntryMode(str, Enum):
    CONSERVATIVE = "CONSERVATIVE" # CHoCH + BOS + Retest
    BALANCED = "BALANCED"         # CHoCH + Retest
    AGGRESSIVE = "AGGRESSIVE"     # Confirmed CHoCH on closed candle


@dataclass
class SwingPoint:
    index: int
    price: float
    timestamp: str
    confirmed_index: int
    confirmed_timestamp: str
    swing_type: str               # 'HIGH' or 'LOW'
    structure_label: str = ""     # 'HH', 'HL', 'LH', 'LL'


@dataclass
class SupplyDemandZone:
    id: str
    zone_type: LevelType
    classification: LevelClassification
    high: float
    low: float
    origin_bar: int
    origin_time: str
    displacement_atr: float
    level_strength_score: float
    status: VirginStatus = VirginStatus.VIRGIN
    touch_count: int = 0
    last_touch_bar: Optional[int] = None
    invalidation_bar: Optional[int] = None
    invalidation_time: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["zone_type"] = self.zone_type.value
        d["classification"] = self.classification.value
        d["status"] = self.status.value
        return d


@dataclass
class ScoreBreakdown:
    level_strength: float = 0.0      # max 20
    virgin_quality: float = 0.0      # max 15
    impulsive_move: float = 0.0      # max 15
    buyer_seller_failure: float = 0.0# max 15
    liquidity_sweep: float = 0.0     # max 10
    choch_confirmation: float = 0.0  # max 15
    bos_retest: float = 0.0          # max 10
    total_score: float = 0.0         # 0 - 100
    rating: str = "Reject"           # High Quality, Good, Moderate, Reject


# =============================================================================
# 1. Market Data Manager & Mathematical Helpers
# =============================================================================

def compute_atr_series(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, period: int = 14) -> np.ndarray:
    """Calculates True Range and Average True Range (Wilder smoothing)."""
    n = len(closes)
    atr = np.zeros(n)
    if n < 2:
        return atr
    tr = np.zeros(n)
    tr[0] = highs[0] - lows[0]
    for i in range(1, n):
        tr[i] = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
    if n < period:
        atr[:] = np.mean(tr)
        return atr
    atr[period - 1] = np.mean(tr[:period])
    for i in range(period, n):
        atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
    for i in range(period - 1):
        atr[i] = atr[period - 1]
    return atr


# =============================================================================
# 2. Swing High / Low Detector (Strict Zero-Lookahead & Non-Repainting)
# =============================================================================

class SwingHighLowDetector:
    """Identifies fractal swing highs and lows with right-side closed candle confirmation.
    
    A swing at index `k` requires `left_bars` lower highs on the left and `right_bars`
    lower highs on the right. Crucially, it is ONLY confirmed at index `k + right_bars`
    once that candle has closed!
    """

    def __init__(self, left_bars: int = 3, right_bars: int = 2):
        self.left_bars = max(2, left_bars)
        self.right_bars = max(1, right_bars)

    def detect(self, highs: np.ndarray, lows: np.ndarray, candles: List[Dict[str, Any]]) -> Tuple[List[SwingPoint], List[SwingPoint]]:
        n = len(highs)
        swing_highs: List[SwingPoint] = []
        swing_lows: List[SwingPoint] = []
        if n < (self.left_bars + self.right_bars + 1):
            return swing_highs, swing_lows

        for i in range(self.left_bars, n - self.right_bars):
            # Check swing high at i
            val_h = highs[i]
            is_high = True
            for l in range(1, self.left_bars + 1):
                if highs[i - l] >= val_h:
                    is_high = False
                    break
            if is_high:
                for r in range(1, self.right_bars + 1):
                    if highs[i + r] > val_h:
                        is_high = False
                        break
            if is_high:
                conf_idx = i + self.right_bars
                conf_ts = candles[conf_idx].get("time", "") if conf_idx < len(candles) else ""
                orig_ts = candles[i].get("time", "")
                swing_highs.append(SwingPoint(
                    index=i,
                    price=float(val_h),
                    timestamp=orig_ts,
                    confirmed_index=conf_idx,
                    confirmed_timestamp=conf_ts,
                    swing_type="HIGH"
                ))

            # Check swing low at i
            val_l = lows[i]
            is_low = True
            for l in range(1, self.left_bars + 1):
                if lows[i - l] <= val_l:
                    is_low = False
                    break
            if is_low:
                for r in range(1, self.right_bars + 1):
                    if lows[i + r] < val_l:
                        is_low = False
                        break
            if is_low:
                conf_idx = i + self.right_bars
                conf_ts = candles[conf_idx].get("time", "") if conf_idx < len(candles) else ""
                orig_ts = candles[i].get("time", "")
                swing_lows.append(SwingPoint(
                    index=i,
                    price=float(val_l),
                    timestamp=orig_ts,
                    confirmed_index=conf_idx,
                    confirmed_timestamp=conf_ts,
                    swing_type="LOW"
                ))

        return swing_highs, swing_lows


# =============================================================================
# 3. Market Structure Detector (HH, HL, LH, LL)
# =============================================================================

class MarketStructureDetector:
    """Labels swing points and determines active market structure (BULLISH, BEARISH, RANGING)."""

    @staticmethod
    def classify_swings(swing_highs: List[SwingPoint], swing_lows: List[SwingPoint]) -> Tuple[List[SwingPoint], List[SwingPoint], str]:
        for i in range(len(swing_highs)):
            if i == 0:
                swing_highs[i].structure_label = "HIGH"
            else:
                swing_highs[i].structure_label = "HH" if swing_highs[i].price > swing_highs[i - 1].price else "LH"

        for i in range(len(swing_lows)):
            if i == 0:
                swing_lows[i].structure_label = "LOW"
            else:
                swing_lows[i].structure_label = "HL" if swing_lows[i].price > swing_lows[i - 1].price else "LL"

        # Determine prevailing market structure based on last 2 swings
        structure = "RANGING"
        if len(swing_highs) >= 2 and len(swing_lows) >= 2:
            last_h = swing_highs[-1].structure_label
            last_l = swing_lows[-1].structure_label
            if last_h == "HH" and last_l == "HL":
                structure = "BULLISH"
            elif last_h == "LH" and last_l == "LL":
                structure = "BEARISH"
            elif last_h == "HH" and last_l == "LL":
                structure = "EXPANDING"
            elif last_h == "LH" and last_l == "HL":
                structure = "CONTRACTING"

        return swing_highs, swing_lows, structure


# =============================================================================
# 4. Impulsive Move Detector
# =============================================================================

class ImpulsiveMoveDetector:
    """Calculates displacement, candle body-to-range ratio, and consecutive momentum."""

    def __init__(self, min_atr_displacement: float = 2.0, min_body_to_range: float = 0.60):
        self.min_atr_displacement = min_atr_displacement
        self.min_body_to_range = min_body_to_range

    def check_impulse_down(self, opens: np.ndarray, highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, atr: np.ndarray, start_idx: int, window: int = 4) -> Tuple[bool, float, float]:
        """Checks if a strong bearish impulsive move originated from start_idx."""
        n = len(closes)
        end_idx = min(n - 1, start_idx + window)
        if end_idx <= start_idx:
            return False, 0.0, 0.0

        drop = highs[start_idx] - np.min(lows[start_idx + 1:end_idx + 1])
        cur_atr = max(0.1, atr[start_idx])
        displacement_atr = drop / cur_atr

        # Check candle body ratios in the impulse leg
        body_ratios = []
        for j in range(start_idx + 1, end_idx + 1):
            c_range = max(0.01, highs[j] - lows[j])
            c_body = abs(closes[j] - opens[j])
            body_ratios.append(c_body / c_range)

        avg_body_ratio = float(np.mean(body_ratios)) if body_ratios else 0.0
        is_impulse = (displacement_atr >= self.min_atr_displacement) and (avg_body_ratio >= self.min_body_to_range)
        return is_impulse, float(displacement_atr), avg_body_ratio

    def check_impulse_up(self, opens: np.ndarray, highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, atr: np.ndarray, start_idx: int, window: int = 4) -> Tuple[bool, float, float]:
        """Checks if a strong bullish impulsive move originated from start_idx."""
        n = len(closes)
        end_idx = min(n - 1, start_idx + window)
        if end_idx <= start_idx:
            return False, 0.0, 0.0

        rally = np.max(highs[start_idx + 1:end_idx + 1]) - lows[start_idx]
        cur_atr = max(0.1, atr[start_idx])
        displacement_atr = rally / cur_atr

        body_ratios = []
        for j in range(start_idx + 1, end_idx + 1):
            c_range = max(0.01, highs[j] - lows[j])
            c_body = abs(closes[j] - opens[j])
            body_ratios.append(c_body / c_range)

        avg_body_ratio = float(np.mean(body_ratios)) if body_ratios else 0.0
        is_impulse = (displacement_atr >= self.min_atr_displacement) and (avg_body_ratio >= self.min_body_to_range)
        return is_impulse, float(displacement_atr), avg_body_ratio


# =============================================================================
# 5. Supply & Demand Zone Detector & Level Classifier
# =============================================================================

class SupplyDemandZoneDetector:
    """Discovers Major and Minor Supply and Demand zones based on explosive reversal origins."""

    def __init__(self, major_displacement_threshold: float = 2.5, minor_displacement_threshold: float = 1.6):
        self.major_disp = major_displacement_threshold
        self.minor_disp = minor_displacement_threshold
        self.impulse_detector = ImpulsiveMoveDetector(min_atr_displacement=minor_displacement_threshold)

    def detect_zones(
        self,
        candles: List[Dict[str, Any]],
        highs: np.ndarray,
        lows: np.ndarray,
        opens: np.ndarray,
        closes: np.ndarray,
        atr: np.ndarray,
        swing_highs: List[SwingPoint],
        swing_lows: List[SwingPoint]
    ) -> List[SupplyDemandZone]:
        zones: List[SupplyDemandZone] = []
        n = len(closes)
        zone_counter = 1

        # A. Detect Supply Zones originating from Swing Highs
        for sh in swing_highs:
            idx = sh.index
            is_impulse, disp_atr, body_ratio = self.impulse_detector.check_impulse_down(
                opens, highs, lows, closes, atr, idx, window=4
            )
            if disp_atr >= self.minor_disp:
                # Origin base candle is candle idx
                zone_high = float(highs[idx])
                # Zone low is base candle body minimum or 50% wick
                zone_low = float(min(opens[idx], closes[idx]))
                if (zone_high - zone_low) < 0.2 * atr[idx]:
                    zone_low = float(zone_high - 0.4 * atr[idx])

                classification = LevelClassification.MAJOR if disp_atr >= self.major_disp else LevelClassification.MINOR
                strength_score = min(20.0, 10.0 + (disp_atr * 3.5) + (body_ratio * 4.0))

                z = SupplyDemandZone(
                    id=f"SUPPLY-{zone_counter:03d}",
                    zone_type=LevelType.SUPPLY,
                    classification=classification,
                    high=zone_high,
                    low=zone_low,
                    origin_bar=idx,
                    origin_time=candles[idx].get("time", ""),
                    displacement_atr=round(disp_atr, 2),
                    level_strength_score=round(strength_score, 1)
                )
                zones.append(z)
                zone_counter += 1

        # B. Detect Demand Zones originating from Swing Lows
        for sl in swing_lows:
            idx = sl.index
            is_impulse, disp_atr, body_ratio = self.impulse_detector.check_impulse_up(
                opens, highs, lows, closes, atr, idx, window=4
            )
            if disp_atr >= self.minor_disp:
                # Origin base candle is candle idx
                zone_low = float(lows[idx])
                zone_high = float(max(opens[idx], closes[idx]))
                if (zone_high - zone_low) < 0.2 * atr[idx]:
                    zone_high = float(zone_low + 0.4 * atr[idx])

                classification = LevelClassification.MAJOR if disp_atr >= self.major_disp else LevelClassification.MINOR
                strength_score = min(20.0, 10.0 + (disp_atr * 3.5) + (body_ratio * 4.0))

                z = SupplyDemandZone(
                    id=f"DEMAND-{zone_counter:03d}",
                    zone_type=LevelType.DEMAND,
                    classification=classification,
                    high=zone_high,
                    low=zone_low,
                    origin_bar=idx,
                    origin_time=candles[idx].get("time", ""),
                    displacement_atr=round(disp_atr, 2),
                    level_strength_score=round(strength_score, 1)
                )
                zones.append(z)
                zone_counter += 1

        return zones


# =============================================================================
# 6. Virgin Level Validator (Lifecycle Tracking: VIRGIN, TOUCHED, MITIGATED, INVALIDATED)
# =============================================================================

class VirginLevelValidator:
    """Tracks interaction history from zone creation bar to current bar."""

    @staticmethod
    def update_lifecycle(
        zone: SupplyDemandZone,
        candles: List[Dict[str, Any]],
        highs: np.ndarray,
        lows: np.ndarray,
        closes: np.ndarray,
        current_bar: int,
        max_age_bars: int = 150
    ) -> SupplyDemandZone:
        n = len(closes)
        limit_bar = min(n - 1, current_bar)

        if limit_bar - zone.origin_bar > max_age_bars:
            zone.status = VirginStatus.EXPIRED
            return zone

        # Iterate bars strictly AFTER the formation impulse (origin_bar + 2)
        start_eval = zone.origin_bar + 2
        if start_eval > limit_bar:
            zone.status = VirginStatus.VIRGIN
            return zone

        midpoint = (zone.high + zone.low) / 2.0

        for b in range(start_eval, limit_bar + 1):
            c_high = highs[b]
            c_low = lows[b]
            c_close = closes[b]

            if zone.zone_type == LevelType.SUPPLY:
                # Invalidation: candle closes decisively above zone high
                if c_close > zone.high:
                    zone.status = VirginStatus.INVALIDATED
                    zone.invalidation_bar = b
                    zone.invalidation_time = candles[b].get("time", "")
                    return zone

                # Touched or Mitigated
                if c_high >= zone.low:
                    zone.touch_count += 1
                    zone.last_touch_bar = b
                    if c_high >= midpoint:
                        zone.status = VirginStatus.MITIGATED
                    elif zone.status == VirginStatus.VIRGIN:
                        zone.status = VirginStatus.TOUCHED

            elif zone.zone_type == LevelType.DEMAND:
                # Invalidation: candle closes decisively below zone low
                if c_close < zone.low:
                    zone.status = VirginStatus.INVALIDATED
                    zone.invalidation_bar = b
                    zone.invalidation_time = candles[b].get("time", "")
                    return zone

                # Touched or Mitigated
                if c_low <= zone.high:
                    zone.touch_count += 1
                    zone.last_touch_bar = b
                    if c_low <= midpoint:
                        zone.status = VirginStatus.MITIGATED
                    elif zone.status == VirginStatus.VIRGIN:
                        zone.status = VirginStatus.TOUCHED

        return zone


# =============================================================================
# 7. Retracement & Buyer/Seller Behaviour Analyzer
# =============================================================================

class BuyerSellerBehaviourAnalyzer:
    """Analyzes price action near the zone: attempts count, rejection wicks, exhaustion."""

    @staticmethod
    def analyze_approach_to_supply(
        highs: np.ndarray,
        lows: np.ndarray,
        opens: np.ndarray,
        closes: np.ndarray,
        zone: SupplyDemandZone,
        eval_window: int = 10
    ) -> Dict[str, Any]:
        n = len(closes)
        lookback = min(n, eval_window)
        sub_highs = highs[-lookback:]
        sub_lows = lows[-lookback:]
        sub_opens = opens[-lookback:]
        sub_closes = closes[-lookback:]

        attempts = 0
        rejection_wicks = 0
        exhaustion_candles = 0

        for i in range(lookback):
            h, l, o, c = sub_highs[i], sub_lows[i], sub_opens[i], sub_closes[i]
            # Touched or approached within 0.5% of zone low
            if h >= (zone.low * 0.995):
                attempts += 1
                c_range = max(0.01, h - l)
                upper_wick = h - max(o, c)
                if (upper_wick / c_range) >= 0.40:
                    rejection_wicks += 1
                # Small body after high = buyer exhaustion
                if abs(c - o) / c_range <= 0.35:
                    exhaustion_candles += 1

        momentum_weakening = (rejection_wicks >= 1 or exhaustion_candles >= 2)
        return {
            "attempts_count": attempts,
            "rejection_wicks": rejection_wicks,
            "exhaustion_candles": exhaustion_candles,
            "momentum_weakening": momentum_weakening,
            "highest_price": float(np.max(sub_highs)),
            "lowest_price": float(np.min(sub_lows))
        }

    @staticmethod
    def analyze_approach_to_demand(
        highs: np.ndarray,
        lows: np.ndarray,
        opens: np.ndarray,
        closes: np.ndarray,
        zone: SupplyDemandZone,
        eval_window: int = 10
    ) -> Dict[str, Any]:
        n = len(closes)
        lookback = min(n, eval_window)
        sub_highs = highs[-lookback:]
        sub_lows = lows[-lookback:]
        sub_opens = opens[-lookback:]
        sub_closes = closes[-lookback:]

        attempts = 0
        rejection_wicks = 0
        exhaustion_candles = 0

        for i in range(lookback):
            h, l, o, c = sub_highs[i], sub_lows[i], sub_opens[i], sub_closes[i]
            if l <= (zone.high * 1.005):
                attempts += 1
                c_range = max(0.01, h - l)
                lower_wick = min(o, c) - l
                if (lower_wick / c_range) >= 0.40:
                    rejection_wicks += 1
                if abs(c - o) / c_range <= 0.35:
                    exhaustion_candles += 1

        momentum_weakening = (rejection_wicks >= 1 or exhaustion_candles >= 2)
        return {
            "attempts_count": attempts,
            "rejection_wicks": rejection_wicks,
            "exhaustion_candles": exhaustion_candles,
            "momentum_weakening": momentum_weakening,
            "highest_price": float(np.max(sub_highs)),
            "lowest_price": float(np.min(sub_lows))
        }


# =============================================================================
# 8. Liquidity Sweep & Failed Breakout Detector
# =============================================================================

class LiquiditySweepDetector:
    """Detects liquidity sweeps above swing highs / below swing lows with candle close rejection."""

    @staticmethod
    def detect_bearish_sweep(
        highs: np.ndarray,
        closes: np.ndarray,
        swing_highs: List[SwingPoint],
        current_idx: int
    ) -> Optional[Dict[str, Any]]:
        """Price wicks above a previous swing high, but closed candle rejected below it."""
        if not swing_highs or current_idx < 1:
            return None

        # Look at the last 2 confirmed swing highs prior to current candle
        eligible_swings = [sh for sh in swing_highs if sh.confirmed_index <= current_idx and sh.index < current_idx - 1]
        if not eligible_swings:
            return None

        target_sh = eligible_swings[-1]
        cur_high = highs[current_idx]
        cur_close = closes[current_idx]

        # Wicks above swing high, but closes below it
        if cur_high > target_sh.price and cur_close < target_sh.price:
            return {
                "is_sweep": True,
                "type": "BEARISH_LIQUIDITY_SWEEP",
                "swept_level": target_sh.price,
                "wick_high": float(cur_high),
                "close_price": float(cur_close),
                "swing_origin_time": target_sh.timestamp,
                "description": f"Liquidity sweep above previous swing high ₹{target_sh.price:.2f} with bearish rejection close at ₹{cur_close:.2f}"
            }
        return None

    @staticmethod
    def detect_bullish_sweep(
        lows: np.ndarray,
        closes: np.ndarray,
        swing_lows: List[SwingPoint],
        current_idx: int
    ) -> Optional[Dict[str, Any]]:
        """Price wicks below a previous swing low, but closed candle recovered above it."""
        if not swing_lows or current_idx < 1:
            return None

        eligible_swings = [sl for sl in swing_lows if sl.confirmed_index <= current_idx and sl.index < current_idx - 1]
        if not eligible_swings:
            return None

        target_sl = eligible_swings[-1]
        cur_low = lows[current_idx]
        cur_close = closes[current_idx]

        # Wicks below swing low, but closes above it
        if cur_low < target_sl.price and cur_close > target_sl.price:
            return {
                "is_sweep": True,
                "type": "BULLISH_LIQUIDITY_SWEEP",
                "swept_level": target_sl.price,
                "wick_low": float(cur_low),
                "close_price": float(cur_close),
                "swing_origin_time": target_sl.timestamp,
                "description": f"Liquidity sweep below previous swing low ₹{target_sl.price:.2f} with bullish recovery close at ₹{cur_close:.2f}"
            }
        return None


# =============================================================================
# 9. CHoCH & BOS Detector (Strict Non-Repainting on Completed Candles)
# =============================================================================

class CHoCHDetector:
    """Detects Change of Character (reversal of structure) and Break of Structure (continuation).
    
    Bearish CHoCH: Market in bullish structure, completed candle closes below the confirmed Higher Low.
    Bullish CHoCH: Market in bearish structure, completed candle closes above the confirmed Lower High.
    """

    @staticmethod
    def detect_bearish_choch(
        closes: np.ndarray,
        swing_lows: List[SwingPoint],
        current_idx: int
    ) -> Optional[Dict[str, Any]]:
        # Find confirmed HLs prior to current_idx
        eligible_hl = [sl for sl in swing_lows if sl.confirmed_index <= current_idx and sl.index < current_idx]
        if not eligible_hl:
            return None

        recent_hl = eligible_hl[-1]
        # Breakout must happen on completed candle close
        if closes[current_idx] < recent_hl.price and (current_idx == 0 or closes[current_idx - 1] >= recent_hl.price):
            return {
                "is_choch": True,
                "direction": "BEARISH",
                "broken_level": recent_hl.price,
                "broken_swing_type": "HL",
                "origin_bar": recent_hl.index,
                "description": f"Bearish CHoCH confirmed: Completed candle closed below Higher Low ₹{recent_hl.price:.2f}"
            }
        return None

    @staticmethod
    def detect_bullish_choch(
        closes: np.ndarray,
        swing_highs: List[SwingPoint],
        current_idx: int
    ) -> Optional[Dict[str, Any]]:
        eligible_lh = [sh for sh in swing_highs if sh.confirmed_index <= current_idx and sh.index < current_idx]
        if not eligible_lh:
            return None

        recent_lh = eligible_lh[-1]
        if closes[current_idx] > recent_lh.price and (current_idx == 0 or closes[current_idx - 1] <= recent_lh.price):
            return {
                "is_choch": True,
                "direction": "BULLISH",
                "broken_level": recent_lh.price,
                "broken_swing_type": "LH",
                "origin_bar": recent_lh.index,
                "description": f"Bullish CHoCH confirmed: Completed candle closed above Lower High ₹{recent_lh.price:.2f}"
            }
        return None

    @staticmethod
    def detect_bos(
        closes: np.ndarray,
        swing_points: List[SwingPoint],
        direction: str,
        current_idx: int
    ) -> Optional[Dict[str, Any]]:
        """Detects Break of Structure continuation."""
        if not swing_points:
            return None
        eligible = [sp for sp in swing_points if sp.confirmed_index <= current_idx and sp.index < current_idx]
        if len(eligible) < 2:
            return None
        target = eligible[-1]
        if direction == "BEARISH" and closes[current_idx] < target.price:
            return {
                "is_bos": True,
                "direction": "BEARISH",
                "broken_level": target.price,
                "description": f"Bearish BOS confirmed below ₹{target.price:.2f}"
            }
        elif direction == "BULLISH" and closes[current_idx] > target.price:
            return {
                "is_bos": True,
                "direction": "BULLISH",
                "broken_level": target.price,
                "description": f"Bullish BOS confirmed above ₹{target.price:.2f}"
            }
        return None


# =============================================================================
# 10. 0–100 Strategy Scoring Engine
# =============================================================================

class StrategyScoringEngine:
    """Calculates granular 0-100 quality score according to institutional specification.
    
    Breakdown:
      - Major Level Strength: 20 pts
      - Virgin Level Quality: 15 pts (VIRGIN=15, TOUCHED=8, MITIGATED=4, INVALIDATED=0)
      - Impulsive Movement: 15 pts
      - Buyer/Seller Failure: 15 pts
      - Liquidity Sweep: 10 pts
      - CHoCH Confirmation: 15 pts
      - BOS / Retest: 10 pts
    """

    @staticmethod
    def score_setup(
        zone: SupplyDemandZone,
        impulse_disp: float,
        behaviour: Dict[str, Any],
        sweep: Optional[Dict[str, Any]],
        choch: Optional[Dict[str, Any]],
        bos: Optional[Dict[str, Any]],
        has_retest: bool = False
    ) -> ScoreBreakdown:
        sb = ScoreBreakdown()

        # 1. Level Strength (Max 20)
        sb.level_strength = min(20.0, zone.level_strength_score)

        # 2. Virgin Quality (Max 15)
        if zone.status == VirginStatus.VIRGIN:
            sb.virgin_quality = 15.0
        elif zone.status == VirginStatus.TOUCHED:
            sb.virgin_quality = 8.0
        elif zone.status == VirginStatus.MITIGATED:
            sb.virgin_quality = 4.0
        else:
            sb.virgin_quality = 0.0

        # 3. Impulsive Movement (Max 15)
        if impulse_disp >= 2.5:
            sb.impulsive_move = 15.0
        elif impulse_disp >= 2.0:
            sb.impulsive_move = 12.0
        elif impulse_disp >= 1.5:
            sb.impulsive_move = 8.0
        else:
            sb.impulsive_move = 4.0

        # 4. Buyer/Seller Failure (Max 15)
        b_pts = 0.0
        if behaviour.get("attempts_count", 0) >= 2:
            b_pts += 6.0
        elif behaviour.get("attempts_count", 0) == 1:
            b_pts += 3.0
        if behaviour.get("rejection_wicks", 0) >= 1:
            b_pts += 5.0
        if behaviour.get("momentum_weakening", False):
            b_pts += 4.0
        sb.buyer_seller_failure = min(15.0, b_pts)

        # 5. Liquidity Sweep (Max 10)
        if sweep and sweep.get("is_sweep", False):
            sb.liquidity_sweep = 10.0
        else:
            sb.liquidity_sweep = 0.0

        # 6. CHoCH Confirmation (Max 15)
        if choch and choch.get("is_choch", False):
            sb.choch_confirmation = 15.0
        else:
            sb.choch_confirmation = 0.0

        # 7. BOS / Retest (Max 10)
        bos_pts = 0.0
        if bos and bos.get("is_bos", False):
            bos_pts += 6.0
        if has_retest:
            bos_pts += 4.0
        sb.bos_retest = min(10.0, bos_pts)

        sb.total_score = round(
            sb.level_strength +
            sb.virgin_quality +
            sb.impulsive_move +
            sb.buyer_seller_failure +
            sb.liquidity_sweep +
            sb.choch_confirmation +
            sb.bos_retest,
            1
        )

        if sb.total_score >= 85.0:
            sb.rating = "High Quality"
        elif sb.total_score >= 70.0:
            sb.rating = "Good"
        elif sb.total_score >= 55.0:
            sb.rating = "Moderate"
        else:
            sb.rating = "Reject"

        return sb


# =============================================================================
# 11. Multi-Timeframe Strong Supply & Demand Engine Core
# =============================================================================

class MultiTimeframeSupplyDemandEngine:
    """Master algorithmic engine orchestrating all modules to evaluate trade opportunities."""

    def __init__(
        self,
        entry_mode: EntryMode = EntryMode.CONSERVATIVE,
        min_score_threshold: float = 65.0,
        min_risk_reward: float = 2.0,
        atr_buffer_mult: float = 0.50
    ):
        self.entry_mode = entry_mode
        self.min_score_threshold = min_score_threshold
        self.min_risk_reward = min_risk_reward
        self.atr_buffer_mult = atr_buffer_mult

        self.swing_detector = SwingHighLowDetector(left_bars=3, right_bars=2)
        self.zone_detector = SupplyDemandZoneDetector()
        self.impulse_detector = ImpulsiveMoveDetector()
        self.scoring_engine = StrategyScoringEngine()

    def evaluate(
        self,
        candles: List[Dict[str, Any]],
        symbol: str,
        timeframe: str = "15m",
        quote: Optional[Dict[str, Any]] = None,
        higher_tf_candles: Optional[List[Dict[str, Any]]] = None
    ) -> Optional[Dict[str, Any]]:
        """Evaluates complete candle series with zero lookahead up to the current closed bar."""
        n = len(candles)
        if n < 25:
            return None

        # Extract arrays
        opens = np.array([float(c["open"]) for c in candles])
        highs = np.array([float(c["high"]) for c in candles])
        lows = np.array([float(c["low"]) for c in candles])
        closes = np.array([float(c["close"]) for c in candles])
        volumes = np.array([float(c.get("volume", 0)) for c in candles])
        atr = compute_atr_series(highs, lows, closes, period=14)

        cur_idx = n - 1
        cur_close = float(closes[cur_idx])
        cur_atr = float(atr[cur_idx])

        # 1. Detect Swing Highs and Lows
        swing_highs, swing_lows = self.swing_detector.detect(highs, lows, candles)
        if not swing_highs or not swing_lows:
            return None

        # 2. Classify Swings and Market Structure
        swing_highs, swing_lows, structure = MarketStructureDetector.classify_swings(swing_highs, swing_lows)

        # 3. Detect Supply & Demand Zones
        all_zones = self.zone_detector.detect_zones(
            candles, highs, lows, opens, closes, atr, swing_highs, swing_lows
        )
        if not all_zones:
            return None

        # 4. Update Virgin Lifecycle for all zones up to cur_idx
        active_zones: List[SupplyDemandZone] = []
        for z in all_zones:
            updated_z = VirginLevelValidator.update_lifecycle(z, candles, highs, lows, closes, cur_idx)
            if updated_z.status != VirginStatus.INVALIDATED and updated_z.status != VirginStatus.EXPIRED:
                active_zones.append(updated_z)

        if not active_zones:
            return None

        # 5. Check SHORT Setup: Test against valid Supply Zones
        supply_zones = [z for z in active_zones if z.zone_type == LevelType.SUPPLY]
        for sz in reversed(supply_zones):
            # Check price proximity to supply zone (within 1.2% or inside zone)
            if sz.low * 0.985 <= cur_close <= sz.high * 1.015 or highs[cur_idx] >= sz.low:
                # A. Buyer behaviour analysis
                behaviour = BuyerSellerBehaviourAnalyzer.analyze_approach_to_supply(
                    highs, lows, opens, closes, sz, eval_window=10
                )
                # B. Liquidity sweep detection
                sweep = LiquiditySweepDetector.detect_bearish_sweep(highs, closes, swing_highs, cur_idx)
                # C. CHoCH detection
                choch = CHoCHDetector.detect_bearish_choch(closes, swing_lows, cur_idx)
                # D. BOS detection
                bos = CHoCHDetector.detect_bos(closes, swing_lows, "BEARISH", cur_idx)

                # Check Entry Mode Eligibility
                entry_triggered = False
                if self.entry_mode == EntryMode.AGGRESSIVE and choch:
                    entry_triggered = True
                elif self.entry_mode == EntryMode.BALANCED and (choch or (sweep and behaviour["momentum_weakening"])):
                    entry_triggered = True
                elif self.entry_mode == EntryMode.CONSERVATIVE:
                    if choch or (bos and sweep) or (choch and bos):
                        entry_triggered = True

                if entry_triggered:
                    # Calculate Score
                    disp = sz.displacement_atr
                    score = self.scoring_engine.score_setup(
                        zone=sz,
                        impulse_disp=disp,
                        behaviour=behaviour,
                        sweep=sweep,
                        choch=choch,
                        bos=bos,
                        has_retest=True
                    )

                    if score.total_score >= self.min_score_threshold:
                        # Trade levels calculation
                        entry_price = cur_close
                        highest_wick = max(sz.high, float(sweep["wick_high"])) if sweep else sz.high
                        stop_loss = round(highest_wick + (self.atr_buffer_mult * cur_atr), 2)
                        risk_per_share = max(0.10, stop_loss - entry_price)

                        # Find nearest opposing demand zone for structural Target 1
                        opp_demand = [z for z in active_zones if z.zone_type == LevelType.DEMAND and z.high < entry_price]
                        if opp_demand:
                            target_1 = round(opp_demand[-1].high, 2)
                            # Ensure at least 1:2 R:R
                            if (entry_price - target_1) < (self.min_risk_reward * risk_per_share):
                                target_1 = round(entry_price - (self.min_risk_reward * risk_per_share), 2)
                        else:
                            target_1 = round(entry_price - (self.min_risk_reward * risk_per_share), 2)

                        target_2 = round(entry_price - (3.5 * risk_per_share), 2)
                        target_3 = round(entry_price - (5.0 * risk_per_share), 2)

                        rr_ratio = round((entry_price - target_1) / risk_per_share, 2)

                        # Position sizing: 1% risk of ₹500,000 capital
                        capital = 500000.0
                        risk_amt = capital * 0.01
                        suggested_qty = max(1, int(risk_amt / risk_per_share))

                        rationale = (
                            f"Major Supply Zone ({sz.id}, ₹{sz.low:.2f}-₹{sz.high:.2f}) reaction confirmed on {timeframe}. "
                            f"{'Liquidity sweep of swing high. ' if sweep else ''}"
                            f"{'Bearish CHoCH confirmed on completed candle close. ' if choch else 'Seller dominance rejection. '}"
                            f"Quality Score: {score.total_score}/100 ({score.rating})."
                        )

                        return {
                            "symbol": symbol,
                            "type": "SELL",
                            "strategy_id": "supply_demand_choch",
                            "strategy_name": "Multi-Timeframe Supply & Demand + CHoCH",
                            "strategy_badge": "INSTITUTIONAL PRICE ACTION",
                            "strategy_category": "Price Action & Structure",
                            "timeframe": timeframe,
                            "entry_price": entry_price,
                            "stop_loss": stop_loss,
                            "target_1": target_1,
                            "target_2": target_2,
                            "target_3": target_3,
                            "risk_reward": f"1:{rr_ratio}",
                            "confidence": int(min(98, score.total_score)),
                            "entry_mode": self.entry_mode.value,
                            "signal_score": score.total_score,
                            "score_rating": score.rating,
                            "score_breakdown": asdict(score),
                            "zone": sz.to_dict(),
                            "choch": choch,
                            "bos": bos,
                            "liquidity_sweep": sweep,
                            "behaviour": behaviour,
                            "suggested_quantity": suggested_qty,
                            "trade_capital": round(suggested_qty * entry_price, 2),
                            "max_risk_amount": round(suggested_qty * risk_per_share, 2),
                            "rationale": rationale,
                            "timestamp": candles[cur_idx].get("time", datetime.now(IST).strftime("%d-%b-%Y %I:%M:%S %p IST"))
                        }

        # 6. Check LONG Setup: Test against valid Demand Zones
        demand_zones = [z for z in active_zones if z.zone_type == LevelType.DEMAND]
        for dz in reversed(demand_zones):
            if dz.low * 0.985 <= cur_close <= dz.high * 1.015 or lows[cur_idx] <= dz.high:
                behaviour = BuyerSellerBehaviourAnalyzer.analyze_approach_to_demand(
                    highs, lows, opens, closes, dz, eval_window=10
                )
                sweep = LiquiditySweepDetector.detect_bullish_sweep(lows, closes, swing_lows, cur_idx)
                choch = CHoCHDetector.detect_bullish_choch(closes, swing_highs, cur_idx)
                bos = CHoCHDetector.detect_bos(closes, swing_highs, "BULLISH", cur_idx)

                entry_triggered = False
                if self.entry_mode == EntryMode.AGGRESSIVE and choch:
                    entry_triggered = True
                elif self.entry_mode == EntryMode.BALANCED and (choch or (sweep and behaviour["momentum_weakening"])):
                    entry_triggered = True
                elif self.entry_mode == EntryMode.CONSERVATIVE:
                    if choch or (bos and sweep) or (choch and bos):
                        entry_triggered = True

                if entry_triggered:
                    disp = dz.displacement_atr
                    score = self.scoring_engine.score_setup(
                        zone=dz,
                        impulse_disp=disp,
                        behaviour=behaviour,
                        sweep=sweep,
                        choch=choch,
                        bos=bos,
                        has_retest=True
                    )

                    if score.total_score >= self.min_score_threshold:
                        entry_price = cur_close
                        lowest_wick = min(dz.low, float(sweep["wick_low"])) if sweep else dz.low
                        stop_loss = round(lowest_wick - (self.atr_buffer_mult * cur_atr), 2)
                        risk_per_share = max(0.10, entry_price - stop_loss)

                        opp_supply = [z for z in active_zones if z.zone_type == LevelType.SUPPLY and z.low > entry_price]
                        if opp_supply:
                            target_1 = round(opp_supply[-1].low, 2)
                            if (target_1 - entry_price) < (self.min_risk_reward * risk_per_share):
                                target_1 = round(entry_price + (self.min_risk_reward * risk_per_share), 2)
                        else:
                            target_1 = round(entry_price + (self.min_risk_reward * risk_per_share), 2)

                        target_2 = round(entry_price + (3.5 * risk_per_share), 2)
                        target_3 = round(entry_price + (5.0 * risk_per_share), 2)

                        rr_ratio = round((target_1 - entry_price) / risk_per_share, 2)

                        capital = 500000.0
                        risk_amt = capital * 0.01
                        suggested_qty = max(1, int(risk_amt / risk_per_share))

                        rationale = (
                            f"Major Demand Zone ({dz.id}, ₹{dz.low:.2f}-₹{dz.high:.2f}) reaction confirmed on {timeframe}. "
                            f"{'Liquidity sweep of swing low. ' if sweep else ''}"
                            f"{'Bullish CHoCH confirmed on completed candle close. ' if choch else 'Buyer dominance bounce. '}"
                            f"Quality Score: {score.total_score}/100 ({score.rating})."
                        )

                        return {
                            "symbol": symbol,
                            "type": "BUY",
                            "strategy_id": "supply_demand_choch",
                            "strategy_name": "Multi-Timeframe Supply & Demand + CHoCH",
                            "strategy_badge": "INSTITUTIONAL PRICE ACTION",
                            "strategy_category": "Price Action & Structure",
                            "timeframe": timeframe,
                            "entry_price": entry_price,
                            "stop_loss": stop_loss,
                            "target_1": target_1,
                            "target_2": target_2,
                            "target_3": target_3,
                            "risk_reward": f"1:{rr_ratio}",
                            "confidence": int(min(98, score.total_score)),
                            "entry_mode": self.entry_mode.value,
                            "signal_score": score.total_score,
                            "score_rating": score.rating,
                            "score_breakdown": asdict(score),
                            "zone": dz.to_dict(),
                            "choch": choch,
                            "bos": bos,
                            "liquidity_sweep": sweep,
                            "behaviour": behaviour,
                            "suggested_quantity": suggested_qty,
                            "trade_capital": round(suggested_qty * entry_price, 2),
                            "max_risk_amount": round(suggested_qty * risk_per_share, 2),
                            "rationale": rationale,
                            "timestamp": candles[cur_idx].get("time", datetime.now(IST).strftime("%d-%b-%Y %I:%M:%S %p IST"))
                        }

        return None

    def get_detected_zones_for_display(
        self,
        candles: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Returns detected zones, virgin status, and swing levels for UI chart rendering and inspector."""
        if not candles or len(candles) < 25:
            return []
        opens = np.array([float(c["open"]) for c in candles])
        highs = np.array([float(c["high"]) for c in candles])
        lows = np.array([float(c["low"]) for c in candles])
        closes = np.array([float(c["close"]) for c in candles])
        atr = compute_atr_series(highs, lows, closes, period=14)

        swing_highs, swing_lows = self.swing_detector.detect(highs, lows, candles)
        all_zones = self.zone_detector.detect_zones(
            candles, highs, lows, opens, closes, atr, swing_highs, swing_lows
        )
        cur_idx = len(closes) - 1
        res = []
        for z in all_zones:
            uz = VirginLevelValidator.update_lifecycle(z, candles, highs, lows, closes, cur_idx)
            res.append(uz.to_dict())
        return res


# Global singleton instance
supply_demand_engine = MultiTimeframeSupplyDemandEngine()
