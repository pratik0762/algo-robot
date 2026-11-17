"""
Tests for Phase 6: Multi-Timeframe Strategy Engine & Signal State Machine
"""

import time
import pytest
import numpy as np

from app.strategies.signal_state_machine import SignalState, TrackedSignal, SignalTransitionEvent
from app.strategies.mtf_confluence import MultiTimeframeConfluence, MarketRegime, HTFAlignmentReport
from app.strategies.smc_strategies import (
    OrderBlockMitigationStrategy,
    FairValueGapImbalanceStrategy,
    BreakOfStructureStrategy,
    SupertrendTrendRiderStrategy,
    VwapBandMeanReversionStrategy,
)
from app.strategies.signal_service import SignalService
from app.market_data.base_adapter import NormalizedTick


class TestSignalStateMachine:
    """Test rigorous signal state transitions, excursion tracking, and lifecycle rules."""

    def test_pending_to_active_transition(self):
        sig = TrackedSignal(
            id="SIG-TEST-01",
            symbol="RELIANCE",
            strategy_name="Order Block Mitigation",
            timeframe="15m",
            signal_type="BUY",
            entry_price=1340.0,
            stop_loss=1320.0,
            target_1=1370.0,
            target_2=1400.0,
            state=SignalState.PENDING,
        )

        # Tick at 1350 does not fill limit entry at 1340
        ev1 = sig.update_tick(ltp=1350.0, high=1355.0, low=1348.0)
        assert ev1 is None
        assert sig.state == SignalState.PENDING

        # Tick touching 1340 triggers entry
        ev2 = sig.update_tick(ltp=1340.0, high=1345.0, low=1339.0)
        assert ev2 is not None
        assert ev2.previous_state == SignalState.PENDING
        assert ev2.new_state == SignalState.ACTIVE
        assert sig.state == SignalState.ACTIVE
        assert sig.activated_at is not None

    def test_active_to_target_1_and_target_2_progression(self):
        sig = TrackedSignal(
            id="SIG-TEST-02",
            symbol="TCS",
            strategy_name="FVG Imbalance",
            timeframe="5m",
            signal_type="BUY",
            entry_price=2400.0,
            stop_loss=2380.0,
            target_1=2430.0,
            target_2=2460.0,
            state=SignalState.ACTIVE,
        )

        # Tick rising to 2435 hits Target 1
        ev1 = sig.update_tick(ltp=2435.0, high=2435.0, low=2400.0)
        assert ev1 is not None
        assert ev1.new_state == SignalState.TARGET_1_HIT
        assert sig.state == SignalState.TARGET_1_HIT
        assert sig.mfe == 35.0
        assert sig.pnl_points == 35.0

        # Tick rising to 2465 hits Target 2
        ev2 = sig.update_tick(ltp=2465.0, high=2465.0, low=2430.0)
        assert ev2 is not None
        assert ev2.new_state == SignalState.TARGET_2_HIT
        assert sig.state == SignalState.TARGET_2_HIT
        assert sig.closed_at is not None
        assert sig.exit_price == 2460.0
        assert sig.pnl_points == 60.0
        assert round(sig.pnl_percent, 2) == 2.5

    def test_active_to_stop_loss_hit(self):
        sig = TrackedSignal(
            id="SIG-TEST-03",
            symbol="INFY",
            strategy_name="BOS Breakout",
            timeframe="5m",
            signal_type="BUY",
            entry_price=1150.0,
            stop_loss=1140.0,
            target_1=1165.0,
            target_2=1180.0,
            state=SignalState.ACTIVE,
        )

        # Tick dips to 1138, triggering SL
        ev = sig.update_tick(ltp=1138.0, high=1152.0, low=1138.0)
        assert ev is not None
        assert ev.new_state == SignalState.STOP_LOSS_HIT
        assert sig.state == SignalState.STOP_LOSS_HIT
        assert sig.closed_at is not None
        assert sig.exit_price == 1140.0
        assert sig.pnl_points == -10.0

    def test_sell_signal_lifecycle(self):
        sig = TrackedSignal(
            id="SIG-TEST-04",
            symbol="HDFCBANK",
            strategy_name="Bearish Supertrend",
            timeframe="5m",
            signal_type="SELL",
            entry_price=800.0,
            stop_loss=810.0,
            target_1=785.0,
            target_2=770.0,
            state=SignalState.ACTIVE,
        )

        # Target 1 hit on down tick
        ev1 = sig.update_tick(ltp=784.0, high=800.0, low=784.0)
        assert ev1 is not None
        assert ev1.new_state == SignalState.TARGET_1_HIT
        assert sig.pnl_points == 16.0  # entry 800 - ltp 784 = 16.0

        # Stop loss hit on reverse up tick
        ev2 = sig.update_tick(ltp=812.0, high=812.0, low=784.0)
        assert ev2 is not None
        assert ev2.new_state == SignalState.STOP_LOSS_HIT
        assert sig.exit_price == 810.0

    def test_signal_expiration(self):
        sig = TrackedSignal(
            id="SIG-TEST-05",
            symbol="SBIN",
            strategy_name="VWAP Reversion",
            timeframe="15m",
            signal_type="BUY",
            entry_price=1080.0,
            stop_loss=1060.0,
            target_1=1110.0,
            target_2=1140.0,
            state=SignalState.ACTIVE,
            created_at=time.time() - 200000.0,  # > 48 hours ago
            expiry_seconds=172800.0,
        )

        ev = sig.update_tick(ltp=1085.0)
        assert ev is not None
        assert ev.new_state == SignalState.EXPIRED
        assert sig.state == SignalState.EXPIRED


class TestMultiTimeframeConfluence:
    """Test macro regime detection and signal filtering."""

    def test_bullish_htf_regime_detection(self):
        # 50 steadily rising candles
        base = 24000.0
        closes = np.array([base + i * 15.0 for i in range(60)], dtype=np.float64)
        highs = closes + 10.0
        lows = closes - 10.0

        report = MultiTimeframeConfluence.evaluate_htf_regime("NIFTY", closes, highs, lows, "1h")
        assert report.regime in (MarketRegime.STRONG_BULLISH, MarketRegime.MILD_BULLISH)
        assert "BUY" in report.allowed_directions
        assert report.confluence_score >= 70.0

        # Validate that BUY is approved and SELL is rejected
        approved_buy, conf_buy, _ = MultiTimeframeConfluence.validate_signal_confluence("BUY", report, 85.0)
        assert approved_buy is True
        assert conf_buy >= 75.0

        approved_sell, conf_sell, _ = MultiTimeframeConfluence.validate_signal_confluence("SELL", report, 85.0)
        assert approved_sell is False
        assert conf_sell < 60.0

    def test_bearish_htf_regime_detection(self):
        # 60 steadily falling candles
        base = 25000.0
        closes = np.array([base - i * 15.0 for i in range(60)], dtype=np.float64)
        highs = closes + 10.0
        lows = closes - 10.0

        report = MultiTimeframeConfluence.evaluate_htf_regime("BANKNIFTY", closes, highs, lows, "1h")
        assert report.regime in (MarketRegime.STRONG_BEARISH, MarketRegime.MILD_BEARISH)
        assert "SELL" in report.allowed_directions


class TestSMCStrategies:
    """Test Institutional SMC strategy evaluation."""

    def test_order_block_mitigation_eval(self):
        # Build 30 bars: flat, sudden strong displacement up (creating bullish OB), then pullback
        closes = [100.0] * 20
        opens = [100.0] * 20
        highs = [101.0] * 20
        lows = [99.0] * 20

        # Bar 20: Bearish candle (OB candle)
        opens.append(100.0)
        highs.append(100.5)
        lows.append(97.0)
        closes.append(98.0)

        # Bar 21: Explosive displacement up
        opens.append(98.0)
        highs.append(107.0)
        lows.append(98.0)
        closes.append(106.0)

        # Bars 22-24: Pullback into OB zone [97.0 - 100.5]
        opens.append(106.0)
        highs.append(106.0)
        lows.append(103.0)
        closes.append(103.0)

        opens.append(103.0)
        highs.append(103.0)
        lows.append(99.0)
        closes.append(99.5)  # Touches OB

        vols = [1000.0] * len(closes)

        candidate = OrderBlockMitigationStrategy.evaluate(
            symbol="TEST_STOCK",
            opens=np.array(opens, dtype=np.float64),
            highs=np.array(highs, dtype=np.float64),
            lows=np.array(lows, dtype=np.float64),
            closes=np.array(closes, dtype=np.float64),
            volumes=np.array(vols, dtype=np.float64),
        )

        assert candidate is not None
        assert candidate.signal_type == "BUY"
        assert candidate.entry_price == 99.5
        assert candidate.stop_loss < 99.5
        assert candidate.target_1 > 99.5
        assert candidate.target_2 > candidate.target_1
        assert candidate.risk_reward >= 1.5

    def test_fair_value_gap_eval(self):
        # 3-bar imbalance: Bar 0 High = 101, Bar 1 Huge green up to 108, Bar 2 Low = 104 -> Gap [101, 104]
        opens = [100.0] * 15
        highs = [101.0] * 15
        lows = [99.0] * 15
        closes = [100.0] * 15

        # Bar 15
        opens.append(100.0)
        highs.append(101.0)
        lows.append(99.0)
        closes.append(100.5)

        # Bar 16: Big green bar
        opens.append(100.5)
        highs.append(109.0)
        lows.append(100.5)
        closes.append(108.5)

        # Bar 17: Low at 105 (Gap between 101.0 and 105.0)
        opens.append(108.5)
        highs.append(109.0)
        lows.append(105.0)
        closes.append(107.0)

        # Bar 18: Pulls back into gap at 103.0
        opens.append(107.0)
        highs.append(107.0)
        lows.append(102.5)
        closes.append(103.0)

        vols = [1000.0] * len(closes)

        cand = FairValueGapImbalanceStrategy.evaluate(
            symbol="TEST_FVG",
            opens=np.array(opens, dtype=np.float64),
            highs=np.array(highs, dtype=np.float64),
            lows=np.array(lows, dtype=np.float64),
            closes=np.array(closes, dtype=np.float64),
            volumes=np.array(vols, dtype=np.float64),
        )

        assert cand is not None
        assert cand.signal_type == "BUY"
        assert cand.entry_price == 103.0
        assert cand.stop_loss < 103.0
        assert cand.target_1 > 103.0

    def test_break_of_structure_eval(self):
        # Swing high at 150.0, followed by a clean break above 150 with 2.5x volume
        closes = [140.0 + (i % 5) * 2.0 for i in range(25)]
        highs = [c + 1.5 for c in closes]
        lows = [c - 1.5 for c in closes]
        opens = [c - 0.5 for c in closes]
        volumes = [1000.0] * 25

        # Establish previous swing high
        highs[15] = 150.0
        closes[15] = 149.0

        # Break above 150.0 on final bar with high volume
        opens[-1] = 148.0
        lows[-1] = 148.0
        highs[-1] = 154.0
        closes[-1] = 153.0
        volumes[-1] = 3500.0  # 3.5x volume

        cand = BreakOfStructureStrategy.evaluate(
            symbol="TEST_BOS",
            opens=np.array(opens, dtype=np.float64),
            highs=np.array(highs, dtype=np.float64),
            lows=np.array(lows, dtype=np.float64),
            closes=np.array(closes, dtype=np.float64),
            volumes=np.array(volumes, dtype=np.float64),
        )

        assert cand is not None
        assert cand.signal_type == "BUY"
        assert cand.entry_price == 153.0
        assert cand.target_1 > 153.0


class TestSignalServiceOrchestration:
    """Test Central SignalService end-to-end management."""

    def test_create_and_track_signal_lifecycle(self):
        service = SignalService()
        sig = service.create_signal(
            symbol="TATASTEEL",
            strategy_name="Order Block Mitigation",
            timeframe="15m",
            signal_type="BUY",
            entry_price=150.0,
            stop_loss=145.0,
            target_1=156.0,
            target_2=165.0,
            confidence_score=90.0,
        )

        assert sig.id.startswith("SIG-")
        assert sig.symbol == "TATASTEEL"
        assert len(service.get_active_signals("TATASTEEL")) == 1

        # Feed tick reaching Target 1
        tick_t1 = NormalizedTick(
            symbol="TATASTEEL",
            ltp=157.0,
            high=157.5,
            low=149.0,
            volume=500000,
            feed_source="TEST",
            exchange="NSE",
            instrument_token=1234,
            change=7.0,
            percent_change=4.6,
            open=150.0,
            close=150.0,
            bid=156.9,
            ask=157.1,
            bid_qty=100,
            ask_qty=100,
            oi=0,
            timestamp=time.time(),
        )
        events1 = service.process_tick(tick_t1)
        assert len(events1) == 1
        assert events1[0].new_state == SignalState.TARGET_1_HIT

        # Feed tick reaching Target 2 -> closes signal and moves to history
        tick_t2 = NormalizedTick(
            symbol="TATASTEEL",
            ltp=166.0,
            high=166.0,
            low=155.0,
            volume=800000,
            feed_source="TEST",
            exchange="NSE",
            instrument_token=1234,
            change=16.0,
            percent_change=10.6,
            open=150.0,
            close=150.0,
            bid=165.9,
            ask=166.1,
            bid_qty=100,
            ask_qty=100,
            oi=0,
            timestamp=time.time(),
        )
        events2 = service.process_tick(tick_t2)
        assert len(events2) == 1
        assert events2[0].new_state == SignalState.TARGET_2_HIT

        # Active signals should now be empty for TATASTEEL
        assert len(service.get_active_signals("TATASTEEL")) == 0

        # History should contain the closed trade with positive win rate
        history = service.get_signal_history()
        assert history["total_signals"] == 1
        assert history["wins"] == 1
        assert history["win_rate"] == 100.0
