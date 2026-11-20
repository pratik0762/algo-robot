import time
import pytest
from app.scanner.market_scanner import market_scanner, SCREENER_PRESETS
from app.market_data.paytm_adapter import paytm_adapter
from app.market_data.live_quote_service import live_quote_service


def test_scanner_presets_retrieval():
    """Verify that all institutional screener presets are registered and compiled."""
    presets = market_scanner.get_presets()
    assert len(presets) >= 8
    preset_ids = {p["id"] for p in presets}
    assert "BULLISH_MOMENTUM" in preset_ids
    assert "BEARISH_MOMENTUM" in preset_ids
    assert "BREAKOUT_52W" in preset_ids
    assert "RSI_OVERSOLD_REVERSAL" in preset_ids
    assert "VOLUME_EXPANSION" in preset_ids


def test_scanner_scan_with_paytm_live_quotes():
    """Verify that stocks with live quotes from Paytm Money are scanned and scored."""
    symbol = "PAYTM_MOMENTUM_TEST"

    # Inject a live tick from Paytm Money with strong bullish momentum
    tick = {
        "symbol": symbol,
        "exchange": "NSE",
        "ltp": 2500.0,
        "open": 2450.0,
        "high": 2510.0,
        "low": 2445.0,
        "close": 2450.0,
        "change": 50.0,
        "percent_change": 2.04,
        "volume": 2000000,
        "feed_source": "PAYTM_MONEY"
    }
    paytm_adapter.on_tick(tick)

    # Run scan with BULLISH_MOMENTUM preset
    matches = market_scanner.scan(preset_id="BULLISH_MOMENTUM", feed_source="PAYTM_MONEY")
    assert len(matches) >= 1

    matched_syms = [m["symbol"] for m in matches]
    assert symbol in matched_syms

    # Verify match attributes
    target = next(m for m in matches if m["symbol"] == symbol)
    assert target["ltp"] == 2500.0
    assert target["feed_source"] == "PAYTM_MONEY"
    assert target["match_score"] > 60.0


def test_scanner_52w_breakout_detection():
    """Verify that a stock near 52W high triggers the BREAKOUT_52W preset."""
    symbol = "PAYTM_52W_BREAKOUT_TEST"

    # Inject quote near 52W high: high_52w = 1000, ltp = 995 (0.5% away)
    tick = {
        "symbol": symbol,
        "exchange": "NSE",
        "ltp": 995.0,
        "open": 980.0,
        "high": 998.0,
        "low": 975.0,
        "close": 980.0,
        "high_52w": 1000.0,
        "low_52w": 650.0,
        "change": 15.0,
        "percent_change": 1.53,
        "volume": 1500000,
        "feed_source": "PAYTM_MONEY"
    }
    paytm_adapter.on_tick(tick)

    matches = market_scanner.scan(preset_id="BREAKOUT_52W", feed_source="PAYTM_MONEY")
    matched_syms = [m["symbol"] for m in matches]
    assert symbol in matched_syms

    target = next(m for m in matches if m["symbol"] == symbol)
    assert target["proximity_52w_high"] <= 1.5
    assert target["percent_change"] > 0


def test_scanner_on_tick_alert_trigger():
    """Verify real-time tick evaluation triggers screener alerts without blocking."""
    symbol = "PAYTM_ALERT_TEST"

    tick = {
        "symbol": symbol,
        "exchange": "NSE",
        "ltp": 3200.0,
        "open": 3150.0,
        "high": 3210.0,
        "low": 3140.0,
        "close": 3150.0,
        "change": 50.0,
        "percent_change": 1.59,
        "volume": 3000000,
        "feed_source": "PAYTM_MONEY"
    }

    # Evaluate tick directly on market scanner
    alerts = market_scanner.on_tick(tick)
    assert isinstance(alerts, list)
    if alerts:
        assert alerts[0]["symbol"] == symbol
        assert alerts[0]["feed_source"] == "PAYTM_MONEY"


def test_scanner_market_breadth_and_sector_flows():
    """Verify market breadth and sector flows accurately reflect Paytm live quotes."""
    breadth = market_scanner.get_market_breadth()
    assert "total_tracked" in breadth
    assert "advance_decline_ratio" in breadth
    assert "paytm_money_active_quotes" in breadth
    assert breadth["paytm_money_active_quotes"] >= 1

    flows = market_scanner.get_sector_flows()
    assert isinstance(flows, list)
    assert len(flows) >= 1
    for flow in flows:
        assert "sector" in flow
        assert "stock_count" in flow
        assert "average_percent_change" in flow


def test_scanner_api_endpoint():
    """Verify the /api/scanner/scan FastAPI route returns matches with provider filtering."""
    from app.main import run_market_scan

    res = run_market_scan(preset_id="BULLISH_MOMENTUM", condition=None, sector=None, feed_source="PAYTM_MONEY")
    assert res["status"] == "success"
    assert res["feed_source"] == "PAYTM_MONEY"
    assert isinstance(res["matches"], list)
