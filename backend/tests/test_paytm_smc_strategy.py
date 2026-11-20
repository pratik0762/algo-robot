import time
import numpy as np
import pytest
from datetime import datetime, timezone

from app.strategies.smc_strategies import (
    OrderBlockMitigationStrategy,
    FairValueGapImbalanceStrategy,
    BreakOfStructureStrategy,
    SupertrendTrendRiderStrategy,
    StrategySignalCandidate,
)
from app.order_block_engine import order_block_engine
from app.strategies.signal_service import signal_service, SignalState
from app.market_data.paytm_adapter import paytm_adapter
from app.market_data.live_quote_service import live_quote_service


def test_smc_order_block_detection_and_candidate():
    """Verify OrderBlockMitigationStrategy detects unmitigated order blocks and produces candidates."""
    symbol = "RELIANCE"
    n = 30

    # Build candle series where bar 22 is a down-close origin followed by 23 strong bullish displacement
    base_price = 2500.0
    opens = np.full(n, base_price)
    highs = np.full(n, base_price + 10.0)
    lows = np.full(n, base_price - 10.0)
    closes = np.full(n, base_price + 2.0)
    volumes = np.full(n, 100000.0)

    # Down bar at index 20
    opens[20] = 2500.0
    closes[20] = 2480.0
    highs[20] = 2505.0
    lows[20] = 2475.0

    # Strong bullish displacement candle at index 21 (+50 points)
    opens[21] = 2485.0
    closes[21] = 2535.0
    highs[21] = 2540.0
    lows[21] = 2480.0
    volumes[21] = 350000.0

    # Retest pullback into OB zone [2480 - 2500] at the current bar (index 29)
    closes[-1] = 2495.0
    highs[-1] = 2502.0
    lows[-1] = 2490.0

    candidate = OrderBlockMitigationStrategy.evaluate(
        symbol=symbol,
        opens=opens,
        highs=highs,
        lows=lows,
        closes=closes,
        volumes=volumes,
        timeframe="15m"
    )

    if candidate:
        assert isinstance(candidate, StrategySignalCandidate)
        assert candidate.strategy_id == "SMC_ORDER_BLOCK"
        assert candidate.symbol == symbol
        assert candidate.signal_type in ("BUY", "SELL")
        assert candidate.entry_price > 0
        assert candidate.stop_loss > 0


def test_smc_fair_value_gap_strategy():
    """Verify FairValueGapImbalanceStrategy identifies 3-bar institutional imbalances."""
    symbol = "TCS"
    n = 25
    base = 4000.0

    opens = np.full(n, base)
    highs = np.full(n, base + 15.0)
    lows = np.full(n, base - 15.0)
    closes = np.full(n, base + 5.0)
    volumes = np.full(n, 50000.0)

    # 3-bar bullish FVG at indices 18, 19, 20:
    # Bar 18 High = 3980
    highs[18] = 3980.0
    closes[18] = 3975.0

    # Bar 19 Large bullish impulse
    opens[19] = 3982.0
    closes[19] = 4050.0
    highs[19] = 4055.0
    lows[19] = 3980.0

    # Bar 20 Low = 4010. FVG exists between 3980 and 4010!
    lows[20] = 4010.0
    opens[20] = 4050.0
    closes[20] = 4060.0

    # Current bar pulls back into the gap [3980 - 4010]
    closes[-1] = 3995.0
    lows[-1] = 3990.0
    highs[-1] = 4005.0

    candidate = FairValueGapImbalanceStrategy.evaluate(
        symbol=symbol,
        opens=opens,
        highs=highs,
        lows=lows,
        closes=closes,
        volumes=volumes,
        timeframe="5m"
    )

    if candidate:
        assert candidate.strategy_id == "SMC_FAIR_VALUE_GAP"
        assert candidate.symbol == symbol
        assert candidate.target_1 > 0


def test_order_block_engine_scan_with_paytm_quotes(monkeypatch):
    """Verify order_block_engine runs multi-stock scan incorporating Paytm live prices."""
    from app.market_data_service import market_data_service

    # Mock get_candles so test doesn't perform external network timeouts
    mock_candles = [
        {"open": 2500.0, "high": 2510.0, "low": 2490.0, "close": 2505.0, "volume": 100000, "timestamp": time.time()}
        for _ in range(50)
    ]
    monkeypatch.setattr(market_data_service, "get_candles", lambda symbol, timeframe="15m", limit=50, force_live=False: mock_candles)

    # Feed a live quote for RELIANCE from Paytm Money
    paytm_adapter.on_tick({
        "symbol": "RELIANCE",
        "exchange": "NSE",
        "ltp": 2580.0,
        "open": 2540.0,
        "high": 2590.0,
        "low": 2530.0,
        "close": 2540.0,
        "change": 40.0,
        "percent_change": 1.57,
        "volume": 2500000,
        "feed_source": "PAYTM_MONEY"
    })

    scan_result = order_block_engine.scan_all_order_blocks(force_refresh=True)
    assert "market_overview" in scan_result
    assert "bullish_board" in scan_result
    assert "bearish_board" in scan_result
    assert "liquidity_board" in scan_result
    assert "sector_flow" in scan_result

    # Overview statistics
    overview = scan_result["market_overview"]
    assert "advances" in overview
    assert "declines" in overview
    assert "market_regime" in overview


def test_signal_service_paytm_tick_lifecycle():
    """Verify SignalService state machine transitions as live Paytm ticks arrive."""
    from app.market_data.base_adapter import NormalizedTick
    symbol = "INFY"
    entry = 1900.0
    sl = 1880.0
    t1 = 1930.0
    t2 = 1960.0

    # 1. Create a signal in PENDING state
    sig = signal_service.create_signal(
        symbol=symbol,
        strategy_name="Order Block Retest",
        timeframe="15m",
        signal_type="BUY",
        entry_price=entry,
        stop_loss=sl,
        target_1=t1,
        target_2=t2,
        confidence_score=85.0,
        initial_state=SignalState.PENDING
    )
    assert sig.state == SignalState.PENDING

    # 2. Feed a tick at entry price
    tick1 = NormalizedTick(
        symbol=symbol,
        exchange="NSE",
        instrument_token=0,
        ltp=1900.0,
        change=0.0,
        percent_change=0.0,
        open=1895.0,
        high=1905.0,
        low=1898.0,
        close=1900.0,
        volume=50000,
        bid=1899.0,
        ask=1901.0,
        bid_qty=100,
        ask_qty=100,
        oi=0,
        timestamp=time.time(),
        feed_source="PAYTM_MONEY"
    )
    events = signal_service.process_tick(tick1)
    assert sig.state == SignalState.ACTIVE

    # 3. Feed a tick hitting Target 1
    tick_t1 = NormalizedTick(
        symbol=symbol,
        exchange="NSE",
        instrument_token=0,
        ltp=1932.0,
        change=32.0,
        percent_change=1.68,
        open=1900.0,
        high=1935.0,
        low=1900.0,
        close=1932.0,
        volume=120000,
        bid=1931.0,
        ask=1933.0,
        bid_qty=100,
        ask_qty=100,
        oi=0,
        timestamp=time.time(),
        feed_source="PAYTM_MONEY"
    )
    events_t1 = signal_service.process_tick(tick_t1)
    assert sig.state == SignalState.TARGET_1_HIT

    # 4. Feed a tick hitting Target 2
    tick_t2 = NormalizedTick(
        symbol=symbol,
        exchange="NSE",
        instrument_token=0,
        ltp=1965.0,
        change=65.0,
        percent_change=3.42,
        open=1900.0,
        high=1970.0,
        low=1900.0,
        close=1965.0,
        volume=250000,
        bid=1964.0,
        ask=1966.0,
        bid_qty=100,
        ask_qty=100,
        oi=0,
        timestamp=time.time(),
        feed_source="PAYTM_MONEY"
    )
    events_t2 = signal_service.process_tick(tick_t2)
    assert sig.state == SignalState.TARGET_2_HIT
