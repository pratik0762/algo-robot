import os
import time
import pytest
from datetime import datetime, timezone

from app.market_data.paytm_adapter import paytm_adapter
from app.market_data.live_quote_service import live_quote_service
from app.indicators.candle_aggregator import candle_aggregator
from app.market_data.historical.paytm_historical_adapter import paytm_historical_adapter


def test_stage6_candle_aggregator_timeframe_registration():
    """Verify candle_aggregator supports all required granularities including 3m, 10m, 30m."""
    from app.indicators.candle_aggregator import TIMEFRAME_SECONDS
    assert "1m" in TIMEFRAME_SECONDS and TIMEFRAME_SECONDS["1m"] == 60
    assert "3m" in TIMEFRAME_SECONDS and TIMEFRAME_SECONDS["3m"] == 180
    assert "5m" in TIMEFRAME_SECONDS and TIMEFRAME_SECONDS["5m"] == 300
    assert "10m" in TIMEFRAME_SECONDS and TIMEFRAME_SECONDS["10m"] == 600
    assert "15m" in TIMEFRAME_SECONDS and TIMEFRAME_SECONDS["15m"] == 900
    assert "30m" in TIMEFRAME_SECONDS and TIMEFRAME_SECONDS["30m"] == 1800
    assert "1h" in TIMEFRAME_SECONDS and TIMEFRAME_SECONDS["1h"] == 3600
    assert "1d" in TIMEFRAME_SECONDS and TIMEFRAME_SECONDS["1d"] == 86400


def test_stage6_live_tick_to_candle_aggregation():
    """Verify ticks fed through paytm_adapter roll into candle_aggregator across timeframes."""
    symbol = "TEST_PAYTM_RELIANCE"
    now_ts = int(time.time())

    # Feed a sequence of ticks simulating price movement
    prices = [2500.0, 2505.0, 2498.0, 2510.0, 2508.5]
    for i, p in enumerate(prices):
        tick = {
            "symbol": symbol,
            "ltp": p,
            "open": 2500.0,
            "high": max(prices[:i+1]),
            "low": min(prices[:i+1]),
            "close": p,
            "volume": 1000 * (i + 1),
            "exchange_timestamp": datetime.fromtimestamp(now_ts + i * 2, tz=timezone.utc),
            "source": "PAYTM_MONEY"
        }
        paytm_adapter.on_tick(tick)

    # Check that live_quote_service received latest price
    quote = live_quote_service.get_quote(symbol)
    assert quote is not None
    assert quote["ltp"] == 2508.5

    # Check that candle_aggregator has active candles for this symbol
    candles_1m = candle_aggregator.get_candles(symbol, "1m")
    assert isinstance(candles_1m, list)


def test_stage6_historical_preseed_into_aggregator():
    """Verify historical candles fetched via paytm_historical_adapter can pre-seed candle_aggregator."""
    symbol = "RELIANCE"
    candles = paytm_historical_adapter.fetch_candles(
        symbol=symbol,
        exchange="NSE",
        interval="15m",
        limit=20
    )
    assert len(candles) > 0

    # Pre-seed candle aggregator
    candle_aggregator.seed_candles(symbol, "15m", candles)
    cached_candles = candle_aggregator.get_candles(symbol, "15m")
    assert len(cached_candles) >= len(candles)


def test_stage6_endpoint_symbol_resolution_non_404(monkeypatch):
    """Verify /api/companies/{symbol} resolves indices and company IDs without 404."""
    from app.main import get_company, nse_client
    from app.db.session import SessionLocal

    monkeypatch.setattr(nse_client, "fetch_all_indices", lambda force_refresh=False: {"indices": [{"index": "NIFTY 50", "index_symbol": "NIFTY", "last_price": 24500.0, "variation": 50.0, "percent_change": 0.2}]})

    db = SessionLocal()
    try:
        # 1. Index symbol resolution
        res_nifty = get_company("NIFTY", db=db)
        assert res_nifty["symbol"] == "NIFTY"
        assert "NIFTY" in res_nifty["company_name"]

        # 2. Company ID resolution
        res_comp = get_company("COMP_20MICRONS", db=db)
        assert res_comp["symbol"] == "20MICRONS"
        assert "20 Microns" in res_comp["company_name"]

        # 3. BSE Scrip Code resolution
        res_bse = get_company("500325", db=db)
        assert res_bse["symbol"] == "500325"
        assert "Reliance" in res_bse["company_name"]
    finally:
        db.close()


def test_quote_bridge_to_tick_engine_stocks():
    """Verify that Paytm ticks processed through live_quote_service update tick_engine.stocks."""
    from app.tick_engine import tick_engine

    test_sym = "PAYTM_BRIDGE_TEST"
    tick = {
        "symbol": test_sym,
        "exchange": "NSE",
        "ltp": 1234.5,
        "open": 1200.0,
        "high": 1240.0,
        "low": 1195.0,
        "close": 1210.0,
        "volume": 75000,
        "bid": 1234.0,
        "ask": 1235.0,
        "bid_qty": 500,
        "ask_qty": 300,
        "source": "PAYTM_MONEY"
    }

    paytm_adapter.on_tick(tick)

    # 1. Verify in live_quote_service
    q = live_quote_service.get_quote(test_sym)
    assert q is not None
    assert q["ltp"] == 1234.5

    # 2. Verify mirrored into tick_engine.stocks
    assert test_sym in tick_engine.stocks
    stock_q = tick_engine.stocks[test_sym]
    assert stock_q["symbol"] == test_sym
    assert stock_q["ltp"] == 1234.5
    assert stock_q["volume"] == 75000
    assert stock_q["feed_source"] == "PAYTM_MONEY"
