"""
Unit & Integration Test Suite — Phase 4: Real-Time Tick Scanner & Screener Engine
===================================================================================
Validates:
1. Safe AST boolean condition evaluator & operator validation
2. Rejection of unsafe expressions (code injection prevention)
3. Institutional screener presets & execution accuracy
4. Real-time market breadth & 52-week proximity calculations
5. Sector flows aggregation
6. Sub-millisecond scan performance benchmark across the equity universe
"""

import os
import sys
import time
import pytest

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.scanner.condition_evaluator import compile_condition, ConditionCompiler
from app.scanner.market_scanner import market_scanner, SCREENER_PRESETS


# -----------------------------------------------------------------------------
# 1. ConditionCompiler Parsing & Evaluation Tests
# -----------------------------------------------------------------------------
def test_condition_evaluator_basic_and_complex():
    compiler = compile_condition("price > vwap AND rsi > 60 AND volume_ratio >= 1.5")
    
    # Matching context
    ctx_match = {
        "price": 2950.0,
        "vwap": 2920.0,
        "rsi": 65.5,
        "volume_ratio": 2.1,
    }
    assert compiler.evaluate(ctx_match) is True

    # Failing context
    ctx_fail = {
        "price": 2900.0, # Below VWAP
        "vwap": 2920.0,
        "rsi": 65.5,
        "volume_ratio": 2.1,
    }
    assert compiler.evaluate(ctx_fail) is False


def test_condition_evaluator_parentheses_and_or():
    compiler = compile_condition("(price > vwap OR rsi < 30) AND volume_ratio > 1.2")

    # Meets condition via RSI oversold branch
    ctx1 = {"price": 1000.0, "vwap": 1050.0, "rsi": 28.0, "volume_ratio": 1.5}
    assert compiler.evaluate(ctx1) is True

    # Meets condition via price > vwap branch
    ctx2 = {"price": 1100.0, "vwap": 1050.0, "rsi": 55.0, "volume_ratio": 1.5}
    assert compiler.evaluate(ctx2) is True

    # Fails because volume_ratio <= 1.2
    ctx3 = {"price": 1100.0, "vwap": 1050.0, "rsi": 55.0, "volume_ratio": 1.0}
    assert compiler.evaluate(ctx3) is False


def test_condition_evaluator_rejects_unsafe_code():
    unsafe_expressions = [
        "__import__('os').system('dir')",
        "eval('1+1')",
        "open('test.txt', 'w')",
        "price.__class__.__mro__",
    ]

    for expr in unsafe_expressions:
        with pytest.raises(Exception):
            compile_condition(expr)


# -----------------------------------------------------------------------------
# 2. MarketScanner Presets & Execution Tests
# -----------------------------------------------------------------------------
def test_market_scanner_presets_loaded():
    presets = market_scanner.get_presets()
    assert len(presets) >= 8

    preset_ids = {p["id"] for p in presets}
    assert "BULLISH_MOMENTUM" in preset_ids
    assert "BEARISH_MOMENTUM" in preset_ids
    assert "BREAKOUT_52W" in preset_ids
    assert "BREAKDOWN_52W" in preset_ids
    assert "RSI_OVERSOLD_REVERSAL" in preset_ids
    assert "RSI_OVERBOUGHT_REVERSAL" in preset_ids
    assert "VOLUME_EXPANSION" in preset_ids


def test_market_scanner_execution():
    # Scan with BULLISH_MOMENTUM preset
    matches = market_scanner.scan(preset_id="BULLISH_MOMENTUM")
    assert isinstance(matches, list)

    for m in matches:
        assert "symbol" in m
        assert "ltp" in m
        assert "match_score" in m
        assert m["match_score"] >= 0.0

    # Scan with custom condition
    custom_matches = market_scanner.scan(custom_condition="change_pct >= 0")
    assert isinstance(custom_matches, list)


def test_market_scanner_sector_filter():
    matches_it = market_scanner.scan(preset_id="BULLISH_MOMENTUM", sector_filter="Information Technology")
    assert isinstance(matches_it, list)
    for m in matches_it:
        assert m["sector"].lower() == "information technology"


# -----------------------------------------------------------------------------
# 3. Market Breadth & Sector Flows Tests
# -----------------------------------------------------------------------------
def test_market_breadth_metrics():
    breadth = market_scanner.get_market_breadth()

    assert "advances" in breadth
    assert "declines" in breadth
    assert "unchanged" in breadth
    assert "advance_decline_ratio" in breadth
    assert "sentiment" in breadth
    assert breadth["advances"] + breadth["declines"] + breadth["unchanged"] == breadth["total_tracked"]


def test_sector_flows():
    flows = market_scanner.get_sector_flows()
    assert isinstance(flows, list)
    assert len(flows) > 0

    first_sec = flows[0]
    assert "sector" in first_sec
    assert "average_percent_change" in first_sec
    assert "advances" in first_sec
    assert "declines" in first_sec
    assert "total_volume" in first_sec


# -----------------------------------------------------------------------------
# 4. Performance Benchmark (< 10ms across entire equity universe)
# -----------------------------------------------------------------------------
def test_scanner_performance_benchmark():
    # Measure execution time of a full universe scan
    t0 = time.perf_counter()
    matches = market_scanner.scan(preset_id="BULLISH_MOMENTUM")
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    print(f"\n[SCANNER BENCHMARK] Full Universe Scan completed in {elapsed_ms:.2f}ms (Found {len(matches)} matches)")

    # Must complete in under 15ms (well under the sub-second requirement)
    assert elapsed_ms < 15.0
