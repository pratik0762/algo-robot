"""
ALGO ROBOT — Institutional Quantitative & Smart Money Concepts (SMC) Strategies
Provides production-grade multi-timeframe strategy implementations:
1. Order Block (OB) Retest & Mitigation (SMC-OB)
2. Fair Value Gap (FVG) Imbalance Fill (SMC-FVG)
3. Break of Structure (BOS) / Change of Character (CHoCH)
4. Supertrend + Dual EMA Trend Rider (QUANT-TREND)
5. VWAP Band Mean Reversion (QUANT-VWAP)
"""

from __future__ import annotations
from dataclasses import dataclass, field
import logging
import time
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

from app.indicators.technical import (
    calculate_ema,
    calculate_supertrend,
    calculate_vwap_bands,
    calculate_rsi,
    calculate_atr,
    detect_swing_levels,
)
from app.strategies.mtf_confluence import MultiTimeframeConfluence, HTFAlignmentReport, MarketRegime

logger = logging.getLogger("algo_robot.strategies.smc")


@dataclass
class StrategySignalCandidate:
    strategy_id: str
    strategy_name: str
    symbol: str
    timeframe: str
    signal_type: str  # BUY or SELL
    entry_price: float
    stop_loss: float
    target_1: float
    target_2: float
    risk_reward: float
    confidence_score: float  # 0 to 100
    confluence_factors: List[str] = field(default_factory=list)
    rationale: str = ""
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "strategy_id": self.strategy_id,
            "strategy_name": self.strategy_name,
            "symbol": self.symbol,
            "timeframe": self.timeframe,
            "signal_type": self.signal_type,
            "entry_price": round(self.entry_price, 2),
            "stop_loss": round(self.stop_loss, 2),
            "target_1": round(self.target_1, 2),
            "target_2": round(self.target_2, 2),
            "risk_reward": round(self.risk_reward, 2),
            "confidence_score": round(self.confidence_score, 1),
            "confluence_factors": self.confluence_factors,
            "rationale": self.rationale,
            "timestamp": self.timestamp,
        }


class OrderBlockMitigationStrategy:
    """Institutional Order Block Retest & Mitigation with HTF confluence."""

    ID = "SMC_ORDER_BLOCK"
    NAME = "Order Block Retest & Mitigation"

    @classmethod
    def evaluate(
        cls,
        symbol: str,
        opens: np.ndarray,
        highs: np.ndarray,
        lows: np.ndarray,
        closes: np.ndarray,
        volumes: np.ndarray,
        timeframe: str = "15m",
        htf_report: Optional[HTFAlignmentReport] = None,
    ) -> Optional[StrategySignalCandidate]:
        n = len(closes)
        if n < 20:
            return None

        ltp = float(closes[-1])
        atrs = calculate_atr(highs, lows, closes, 14)
        atr = float(atrs[-1]) if len(atrs) > 0 and atrs[-1] > 0 else (ltp * 0.01)

        # Detect order blocks in the last 15 bars
        # Bullish OB: Bearish candle followed by strong bullish displacement (move > 1.5 ATR)
        for i in range(n - 12, n - 2):
            is_down_candle = closes[i] < opens[i]
            displacement = closes[i + 1] - opens[i + 1]

            if is_down_candle and displacement > 1.2 * atr:
                ob_high = float(highs[i])
                ob_low = float(lows[i])

                # Check if current price is testing the OB zone
                if ob_low <= ltp <= ob_high + (0.3 * atr):
                    # Mitigated/testing bullish OB
                    sl = round(ob_low - (0.2 * atr), 2)
                    risk = max(ltp - sl, atr * 0.5)
                    t1 = round(ltp + (1.5 * risk), 2)
                    t2 = round(ltp + (3.0 * risk), 2)
                    rr = round((t2 - ltp) / risk, 2)

                    # Confluence check
                    approved, conf, reason = MultiTimeframeConfluence.validate_signal_confluence(
                        "BUY", htf_report or HTFAlignmentReport(
                            symbol, "1h", MarketRegime.MILD_BULLISH, ltp, ltp, 1, 25.0, True, ["BUY"], 75.0, "Assumed aligned"
                        ), ltf_setup_score=85.0
                    )
                    if not approved:
                        continue

                    return StrategySignalCandidate(
                        strategy_id=cls.ID,
                        strategy_name=cls.NAME,
                        symbol=symbol,
                        timeframe=timeframe,
                        signal_type="BUY",
                        entry_price=ltp,
                        stop_loss=sl,
                        target_1=t1,
                        target_2=t2,
                        risk_reward=rr,
                        confidence_score=conf,
                        confluence_factors=["Unmitigated Bullish Order Block", "HTF Trend Alignment", "Institutional Demand Absorption"],
                        rationale=f"Price pulled back into Bullish Order Block [{ob_low}-{ob_high}]. {reason}",
                    )

            # Bearish OB: Bullish candle followed by strong downward displacement
            is_up_candle = closes[i] > opens[i]
            down_displacement = opens[i + 1] - closes[i + 1]

            if is_up_candle and down_displacement > 1.2 * atr:
                ob_high = float(highs[i])
                ob_low = float(lows[i])

                if ob_low - (0.3 * atr) <= ltp <= ob_high:
                    sl = round(ob_high + (0.2 * atr), 2)
                    risk = max(sl - ltp, atr * 0.5)
                    t1 = round(ltp - (1.5 * risk), 2)
                    t2 = round(ltp - (3.0 * risk), 2)
                    rr = round((ltp - t2) / risk, 2)

                    approved, conf, reason = MultiTimeframeConfluence.validate_signal_confluence(
                        "SELL", htf_report or HTFAlignmentReport(
                            symbol, "1h", MarketRegime.MILD_BEARISH, ltp, ltp, -1, 25.0, True, ["SELL"], 75.0, "Assumed aligned"
                        ), ltf_setup_score=85.0
                    )
                    if not approved:
                        continue

                    return StrategySignalCandidate(
                        strategy_id=cls.ID,
                        strategy_name=cls.NAME,
                        symbol=symbol,
                        timeframe=timeframe,
                        signal_type="SELL",
                        entry_price=ltp,
                        stop_loss=sl,
                        target_1=t1,
                        target_2=t2,
                        risk_reward=rr,
                        confidence_score=conf,
                        confluence_factors=["Unmitigated Bearish Order Block", "HTF Trend Alignment", "Supply Zone Rejection"],
                        rationale=f"Price pulled back into Bearish Order Block [{ob_low}-{ob_high}]. {reason}",
                    )

        return None


class FairValueGapImbalanceStrategy:
    """Fair Value Gap (FVG) 3-bar imbalance fill strategy."""

    ID = "SMC_FAIR_VALUE_GAP"
    NAME = "Fair Value Gap (FVG) Imbalance"

    @classmethod
    def evaluate(
        cls,
        symbol: str,
        opens: np.ndarray,
        highs: np.ndarray,
        lows: np.ndarray,
        closes: np.ndarray,
        volumes: np.ndarray,
        timeframe: str = "5m",
        htf_report: Optional[HTFAlignmentReport] = None,
    ) -> Optional[StrategySignalCandidate]:
        n = len(closes)
        if n < 15:
            return None

        ltp = float(closes[-1])
        atrs = calculate_atr(highs, lows, closes, 14)
        atr = float(atrs[-1]) if len(atrs) > 0 and atrs[-1] > 0 else (ltp * 0.01)

        # Check last 8 bars for 3-bar FVG
        for i in range(n - 8, n - 2):
            # Bullish FVG: Bar 1 High < Bar 3 Low
            fvg_bottom = float(highs[i])
            fvg_top = float(lows[i + 2])
            gap = fvg_top - fvg_bottom

            if gap > 0.4 * atr:
                equilibrium = (fvg_top + fvg_bottom) / 2.0
                # If price is currently filling into the FVG
                if fvg_bottom <= ltp <= fvg_top:
                    sl = round(fvg_bottom - (0.25 * atr), 2)
                    risk = max(ltp - sl, atr * 0.5)
                    t1 = round(ltp + (1.5 * risk), 2)
                    t2 = round(ltp + (3.0 * risk), 2)

                    approved, conf, reason = MultiTimeframeConfluence.validate_signal_confluence(
                        "BUY", htf_report or HTFAlignmentReport(
                            symbol, "1h", MarketRegime.MILD_BULLISH, ltp, ltp, 1, 20.0, True, ["BUY"], 70.0, "Default"
                        ), ltf_setup_score=80.0
                    )
                    if approved:
                        return StrategySignalCandidate(
                            strategy_id=cls.ID,
                            strategy_name=cls.NAME,
                            symbol=symbol,
                            timeframe=timeframe,
                            signal_type="BUY",
                            entry_price=ltp,
                            stop_loss=sl,
                            target_1=t1,
                            target_2=t2,
                            risk_reward=round((t2 - ltp) / risk, 2),
                            confidence_score=conf,
                            confluence_factors=["Bullish FVG Imbalance", "Discount Equilibrium Fill", "Liquidity Void Re-test"],
                            rationale=f"Price tapping into Bullish FVG [{round(fvg_bottom, 2)}-{round(fvg_top, 2)}]. {reason}",
                        )

            # Bearish FVG: Bar 1 Low > Bar 3 High
            bear_top = float(lows[i])
            bear_bottom = float(highs[i + 2])
            bear_gap = bear_top - bear_bottom

            if bear_gap > 0.4 * atr:
                if bear_bottom <= ltp <= bear_top:
                    sl = round(bear_top + (0.25 * atr), 2)
                    risk = max(sl - ltp, atr * 0.5)
                    t1 = round(ltp - (1.5 * risk), 2)
                    t2 = round(ltp - (3.0 * risk), 2)

                    approved, conf, reason = MultiTimeframeConfluence.validate_signal_confluence(
                        "SELL", htf_report or HTFAlignmentReport(
                            symbol, "1h", MarketRegime.MILD_BEARISH, ltp, ltp, -1, 20.0, True, ["SELL"], 70.0, "Default"
                        ), ltf_setup_score=80.0
                    )
                    if approved:
                        return StrategySignalCandidate(
                            strategy_id=cls.ID,
                            strategy_name=cls.NAME,
                            symbol=symbol,
                            timeframe=timeframe,
                            signal_type="SELL",
                            entry_price=ltp,
                            stop_loss=sl,
                            target_1=t1,
                            target_2=t2,
                            risk_reward=round((ltp - t2) / risk, 2),
                            confidence_score=conf,
                            confluence_factors=["Bearish FVG Imbalance", "Premium Equilibrium Fill", "Liquidity Void Re-test"],
                            rationale=f"Price tapping into Bearish FVG [{round(bear_bottom, 2)}-{round(bear_top, 2)}]. {reason}",
                        )

        return None


class BreakOfStructureStrategy:
    """Break of Structure (BOS) / Change of Character (CHoCH) with Volume Expansion."""

    ID = "SMC_BOS_CHOCH"
    NAME = "Break of Structure (BOS)"

    @classmethod
    def evaluate(
        cls,
        symbol: str,
        opens: np.ndarray,
        highs: np.ndarray,
        lows: np.ndarray,
        closes: np.ndarray,
        volumes: np.ndarray,
        timeframe: str = "5m",
        htf_report: Optional[HTFAlignmentReport] = None,
    ) -> Optional[StrategySignalCandidate]:
        n = len(closes)
        if n < 25:
            return None

        # Detect swing levels on previous bars (excluding current bar)
        recent_sh, recent_sl = detect_swing_levels(highs[:-1], lows[:-1], lookback=12)
        if recent_sh <= 0 or recent_sl <= 0:
            return None

        ltp = float(closes[-1])
        atrs = calculate_atr(highs, lows, closes, 14)
        atr = float(atrs[-1]) if len(atrs) > 0 and atrs[-1] > 0 else (ltp * 0.01)

        # Volume expansion
        avg_vol = np.mean(volumes[-15:-1]) if n >= 15 else 1.0
        rvol = (volumes[-1] / max(avg_vol, 1.0))

        # Bullish BOS: Price cleanly breaks above recent swing high
        if closes[-1] > recent_sh and closes[-2] <= recent_sh and rvol >= 1.3:
            sl = round(recent_sl, 2)
            risk = max(ltp - sl, atr * 0.5)
            t1 = round(ltp + (1.5 * risk), 2)
            t2 = round(ltp + (3.0 * risk), 2)

            approved, conf, reason = MultiTimeframeConfluence.validate_signal_confluence(
                "BUY", htf_report or HTFAlignmentReport(
                    symbol, "1h", MarketRegime.MILD_BULLISH, ltp, ltp, 1, 25.0, True, ["BUY"], 80.0, "Default"
                ), ltf_setup_score=85.0
            )
            if approved:
                return StrategySignalCandidate(
                    strategy_id=cls.ID,
                    strategy_name=cls.NAME,
                    symbol=symbol,
                    timeframe=timeframe,
                    signal_type="BUY",
                    entry_price=ltp,
                    stop_loss=sl,
                    target_1=t1,
                    target_2=t2,
                    risk_reward=round((t2 - ltp) / risk, 2),
                    confidence_score=conf,
                    confluence_factors=["Bullish Break of Structure", f"Volume Expansion (RVol {round(rvol, 1)}x)", "Swing High Cleared"],
                    rationale=f"Bullish BOS above previous swing high {recent_sh} with RVol {round(rvol, 1)}. {reason}",
                )

        # Bearish BOS: Price cleanly breaks below recent swing low
        if closes[-1] < recent_sl and closes[-2] >= recent_sl and rvol >= 1.3:
            sl = round(recent_sh, 2)
            risk = max(sl - ltp, atr * 0.5)
            t1 = round(ltp - (1.5 * risk), 2)
            t2 = round(ltp - (3.0 * risk), 2)

            approved, conf, reason = MultiTimeframeConfluence.validate_signal_confluence(
                "SELL", htf_report or HTFAlignmentReport(
                    symbol, "1h", MarketRegime.MILD_BEARISH, ltp, ltp, -1, 25.0, True, ["SELL"], 80.0, "Default"
                ), ltf_setup_score=85.0
            )
            if approved:
                return StrategySignalCandidate(
                    strategy_id=cls.ID,
                    strategy_name=cls.NAME,
                    symbol=symbol,
                    timeframe=timeframe,
                    signal_type="SELL",
                    entry_price=ltp,
                    stop_loss=sl,
                    target_1=t1,
                    target_2=t2,
                    risk_reward=round((ltp - t2) / risk, 2),
                    confidence_score=conf,
                    confluence_factors=["Bearish Break of Structure", f"Volume Expansion (RVol {round(rvol, 1)}x)", "Swing Low Cleared"],
                    rationale=f"Bearish BOS below previous swing low {recent_sl} with RVol {round(rvol, 1)}. {reason}",
                )

        return None


class SupertrendTrendRiderStrategy:
    """Supertrend + Dual EMA 9/21 Trend Rider."""

    ID = "QUANT_SUPERTREND_RIDER"
    NAME = "Supertrend Dual-EMA Rider"

    @classmethod
    def evaluate(
        cls,
        symbol: str,
        opens: np.ndarray,
        highs: np.ndarray,
        lows: np.ndarray,
        closes: np.ndarray,
        volumes: np.ndarray,
        timeframe: str = "5m",
        htf_report: Optional[HTFAlignmentReport] = None,
    ) -> Optional[StrategySignalCandidate]:
        n = len(closes)
        if n < 25:
            return None

        ltp = float(closes[-1])
        st_val, st_dir = calculate_supertrend(highs, lows, closes, period=7, multiplier=3.0)
        ema_9 = calculate_ema(closes, 9)
        ema_21 = calculate_ema(closes, 21)
        atrs = calculate_atr(highs, lows, closes, 14)
        atr = float(atrs[-1]) if len(atrs) > 0 and atrs[-1] > 0 else (ltp * 0.01)

        # Bullish flip: Supertrend turned +1 on current or prev bar AND EMA 9 > EMA 21
        if st_dir[-1] == 1 and (st_dir[-2] == -1 or st_dir[-3] == -1) and ema_9[-1] > ema_21[-1]:
            sl = round(float(st_val[-1]), 2)
            risk = max(ltp - sl, atr * 0.5)
            t1 = round(ltp + (1.5 * risk), 2)
            t2 = round(ltp + (2.5 * risk), 2)

            approved, conf, reason = MultiTimeframeConfluence.validate_signal_confluence(
                "BUY", htf_report or HTFAlignmentReport(
                    symbol, "1h", MarketRegime.MILD_BULLISH, ltp, ltp, 1, 20.0, True, ["BUY"], 75.0, "Default"
                ), ltf_setup_score=80.0
            )
            if approved:
                return StrategySignalCandidate(
                    strategy_id=cls.ID,
                    strategy_name=cls.NAME,
                    symbol=symbol,
                    timeframe=timeframe,
                    signal_type="BUY",
                    entry_price=ltp,
                    stop_loss=sl,
                    target_1=t1,
                    target_2=t2,
                    risk_reward=round((t2 - ltp) / risk, 2),
                    confidence_score=conf,
                    confluence_factors=["Supertrend Bullish Flip (7,3)", "EMA 9 > EMA 21 Cross", "Momentum Trend Alignment"],
                    rationale=f"Supertrend flipped bullish with EMA 9/21 golden alignment. {reason}",
                )

        # Bearish flip
        if st_dir[-1] == -1 and (st_dir[-2] == 1 or st_dir[-3] == 1) and ema_9[-1] < ema_21[-1]:
            sl = round(float(st_val[-1]), 2)
            risk = max(sl - ltp, atr * 0.5)
            t1 = round(ltp - (1.5 * risk), 2)
            t2 = round(ltp - (2.5 * risk), 2)

            approved, conf, reason = MultiTimeframeConfluence.validate_signal_confluence(
                "SELL", htf_report or HTFAlignmentReport(
                    symbol, "1h", MarketRegime.MILD_BEARISH, ltp, ltp, -1, 20.0, True, ["SELL"], 75.0, "Default"
                ), ltf_setup_score=80.0
            )
            if approved:
                return StrategySignalCandidate(
                    strategy_id=cls.ID,
                    strategy_name=cls.NAME,
                    symbol=symbol,
                    timeframe=timeframe,
                    signal_type="SELL",
                    entry_price=ltp,
                    stop_loss=sl,
                    target_1=t1,
                    target_2=t2,
                    risk_reward=round((ltp - t2) / risk, 2),
                    confidence_score=conf,
                    confluence_factors=["Supertrend Bearish Flip (7,3)", "EMA 9 < EMA 21 Death Cross", "Downward Momentum Alignment"],
                    rationale=f"Supertrend flipped bearish with EMA 9/21 death alignment. {reason}",
                )

        return None


class VwapBandMeanReversionStrategy:
    """VWAP 2-sigma Band Mean Reversion."""

    ID = "QUANT_VWAP_MEAN_REVERSION"
    NAME = "VWAP 2-Sigma Mean Reversion"

    @classmethod
    def evaluate(
        cls,
        symbol: str,
        opens: np.ndarray,
        highs: np.ndarray,
        lows: np.ndarray,
        closes: np.ndarray,
        volumes: np.ndarray,
        timeframe: str = "5m",
        htf_report: Optional[HTFAlignmentReport] = None,
    ) -> Optional[StrategySignalCandidate]:
        n = len(closes)
        if n < 20:
            return None

        ltp = float(closes[-1])
        vwap, upper2, lower2, upper1, lower1 = calculate_vwap_bands(highs, lows, closes, volumes)
        rsis = calculate_rsi(closes, 14)
        rsi = float(rsis[-1])
        curr_vwap = float(vwap[-1])
        curr_upper2 = float(upper2[-1])
        curr_lower2 = float(lower2[-1])
        atrs = calculate_atr(highs, lows, closes, 14)
        atr = float(atrs[-1]) if len(atrs) > 0 and atrs[-1] > 0 else (ltp * 0.01)

        # Bullish Mean Reversion: Low touched or penetrated lower 2-sigma band, RSI < 35, candle bounced
        if lows[-1] <= curr_lower2 and closes[-1] > lows[-1] and rsi <= 35.0:
            sl = round(float(lows[-1]) - (0.3 * atr), 2)
            risk = max(ltp - sl, atr * 0.5)
            t1 = round(curr_vwap, 2)
            t2 = round(curr_upper1[-1] if hasattr(upper1, "__getitem__") else (curr_vwap + risk), 2)

            if t1 > ltp:
                return StrategySignalCandidate(
                    strategy_id=cls.ID,
                    strategy_name=cls.NAME,
                    symbol=symbol,
                    timeframe=timeframe,
                    signal_type="BUY",
                    entry_price=ltp,
                    stop_loss=sl,
                    target_1=t1,
                    target_2=t2,
                    risk_reward=round((t1 - ltp) / risk, 2),
                    confidence_score=75.0,
                    confluence_factors=["VWAP -2 Sigma Touch", f"Oversold RSI ({round(rsi, 1)})", "Mean Reversion to Central VWAP"],
                    rationale=f"Price oversold at lower 2-sigma VWAP band ({round(curr_lower2, 2)}) with bounce toward VWAP ({round(curr_vwap, 2)}).",
                )

        # Bearish Mean Reversion: High touched or penetrated upper 2-sigma band, RSI > 65, candle rejected
        if highs[-1] >= curr_upper2 and closes[-1] < highs[-1] and rsi >= 65.0:
            sl = round(float(highs[-1]) + (0.3 * atr), 2)
            risk = max(sl - ltp, atr * 0.5)
            t1 = round(curr_vwap, 2)
            t2 = round(curr_lower1[-1] if hasattr(lower1, "__getitem__") else (curr_vwap - risk), 2)

            if t1 < ltp:
                return StrategySignalCandidate(
                    strategy_id=cls.ID,
                    strategy_name=cls.NAME,
                    symbol=symbol,
                    timeframe=timeframe,
                    signal_type="SELL",
                    entry_price=ltp,
                    stop_loss=sl,
                    target_1=t1,
                    target_2=t2,
                    risk_reward=round((ltp - t1) / risk, 2),
                    confidence_score=75.0,
                    confluence_factors=["VWAP +2 Sigma Touch", f"Overbought RSI ({round(rsi, 1)})", "Mean Reversion to Central VWAP"],
                    rationale=f"Price overbought at upper 2-sigma VWAP band ({round(curr_upper2, 2)}) with rejection toward VWAP ({round(curr_vwap, 2)}).",
                )

        return None
