"""Phase 12: Final Comprehensive Regression Testing Suite for Algo Robot.
Tests REST APIs, WebSocket streaming, Quantitative Calculations, Frontend Routes, and Responsive Metrics.
"""

import asyncio
import json
import os
import sys
import time
import urllib.request
import websockets

def print_header(title):
    print("\n" + "=" * 70)
    print(f" {title}")
    print("=" * 70)

def test_rest_endpoints():
    print_header("1. REST API REGRESSION TEST SUITE (FastAPI on Port 8000)")
    endpoints = [
        ("/api/trade-signals", "Trade Signals Engine"),
        ("/api/trade-signals/analytics", "Signal Lifecycle Analytics"),
        ("/api/chart-data/COFORGE?timeframe=15m", "COFORGE 15m Chart Data"),
        ("/api/chart-data/CYIENT?timeframe=1H", "CYIENT 1H Chart Data"),
        ("/api/stocks/live-ticks", "Live Quotes & GIFT/VIX Ticks"),
        ("/api/indices", "All 140+ Indices"),
        ("/api/fii-dii", "FII / DII Institutional Flows"),
        ("/api/deals", "Bulk & Block Deals"),
        ("/api/52-week", "52-Week High/Low Radar"),
        ("/api/news", "Market News & Corporate Disclosures"),
        ("/api/companies", "Nifty 50 Constituent Database"),
    ]
    
    passed = 0
    for path, desc in endpoints:
        url = f"http://127.0.0.1:8000{path}"
        t0 = time.perf_counter()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "RegressionTester/1.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                status = resp.status
                body = resp.read()
                elapsed_ms = (time.perf_counter() - t0) * 1000
                data = json.loads(body)
                assert status == 200, f"Expected 200, got {status}"
                assert data is not None, "Response body was empty"
                print(f"  [PASS] {desc:32} | {status} OK | {elapsed_ms:5.1f}ms | Size: {len(body):,} bytes")
                passed += 1
        except Exception as e:
            print(f"  [FAIL] {desc:32} | Error: {e}")
            
    print(f"\nREST Endpoints Result: {passed}/{len(endpoints)} passed.")
    return passed == len(endpoints)

async def test_websocket_stream():
    print_header("2. REAL-TIME WEBSOCKET STREAM REGRESSION (Port 8000)")
    ws_url = "ws://127.0.0.1:8000/ws/live-ticks"
    try:
        async with websockets.connect(ws_url, open_timeout=5.0) as ws:
            print(f"  [CONNECTED] Successfully connected to {ws_url}")
            frames_received = 0
            t_end = time.time() + 4.0
            
            while time.time() < t_end and frames_received < 3:
                raw_msg = await asyncio.wait_for(ws.recv(), timeout=4.0)
                frame = json.loads(raw_msg)
                event_type = frame.get("type", "UNKNOWN")
                data = frame.get("data", {})
                frames_received += 1
                print(f"  [FRAME {frames_received}] Type: {event_type:20} | Keys: {list(data.keys())[:5]}")
                
            assert frames_received > 0, "No WebSocket frames received"
            print(f"\nWebSocket Result: Passed ({frames_received} live frames validated).")
            return True
    except Exception as e:
        print(f"  [FAIL] WebSocket streaming error: {e}")
        return False

def test_quantitative_math():
    print_header("3. QUANTITATIVE STRATEGY & INDICATOR MATH REGRESSION")
    try:
        from app.indicators import (
            compute_ema,
            compute_atr,
            compute_supertrend,
            compute_rsi,
            compute_macd,
            compute_bollinger_bands,
            detect_swing_levels
        )
        import numpy as np

        # Synthesize fixed benchmark series
        closes = [100.0, 102.0, 101.5, 103.0, 105.0, 104.0, 106.0, 108.0, 107.5, 109.0,
                  111.0, 110.0, 112.5, 114.0, 113.5, 115.0, 117.0, 116.5, 118.0, 120.0,
                  119.5, 121.0, 123.0, 122.0, 124.0, 126.0, 125.5, 127.0, 129.0, 130.0]
        highs = [c + 1.5 for c in closes]
        lows = [c - 1.5 for c in closes]
        volumes = [100000 + i * 5000 for i in range(len(closes))]
        
        ema9 = compute_ema(closes, 9)
        assert len(ema9) == len(closes), "EMA length mismatch"
        assert abs(ema9[-1] - 126.3) < 3.0, f"Unexpected EMA(9): {ema9[-1]}"
        print(f"  [PASS] EMA(9) Vector Calculation: {ema9[-1]:.2f}")

        atr = compute_atr(highs, lows, closes, 14)
        assert atr[-1] > 0, "ATR must be positive"
        print(f"  [PASS] ATR(14) Volatility Calculation: {atr[-1]:.2f}")

        st_val, st_dir = compute_supertrend(highs, lows, closes, 10, 3.0)
        assert st_dir[-1] in (1, -1), "Supertrend direction must be +1 or -1"
        print(f"  [PASS] Supertrend (10, 3): Band={st_val[-1]:.2f}, Direction={st_dir[-1]} (Bullish)")

        rsi = compute_rsi(closes, 14)
        assert 0 <= rsi[-1] <= 100, "RSI out of bounds"
        print(f"  [PASS] RSI(14) Oscillator Calculation: {rsi[-1]:.2f}")

        macd, sig, hist = compute_macd(closes, 12, 26, 9)
        assert len(macd) == len(closes), "MACD length mismatch"
        print(f"  [PASS] MACD(12, 26, 9): Line={macd[-1]:.2f}, Sig={sig[-1]:.2f}, Hist={hist[-1]:.2f}")

        upper, mid, lower, bw = compute_bollinger_bands(closes, 20, 2.0)
        assert upper[-1] > mid[-1] > lower[-1], "Bollinger band ordering inverted"
        print(f"  [PASS] Bollinger Bands: Upper={upper[-1]:.2f}, Mid={mid[-1]:.2f}, Lower={lower[-1]:.2f}, BW={bw[-1]:.4f}")

        sw_high, sw_low = detect_swing_levels(highs, lows, lookback=8)
        assert sw_high > sw_low, f"Swing high ({sw_high}) must exceed swing low ({sw_low})"
        print(f"  [PASS] Structural Swings Detected: Swing High=₹{sw_high:.2f}, Swing Low=₹{sw_low:.2f}")
        
        return True
    except Exception as e:
        print(f"  [FAIL] Indicator math error: {e}")
        return False

def test_frontend_routes():
    print_header("4. FRONTEND PRODUCTION SSR & ROUTE REGRESSION (Port 3000)")
    routes = [
        ("/", "Home Dashboard (Nifty 50 Desk)"),
        ("/signals", "Algorithmic Trade Signals Desk"),
        ("/chart", "NSE Market Heat Map"),
        ("/indices", "All 140+ Indices Barometer"),
        ("/fii-dii", "Institutional Terminal"),
        ("/deals", "Bulk & Block Deals"),
        ("/52-week", "52-Week High & Low Radar"),
        ("/news", "Market News Feed"),
        ("/company/RELIANCE", "Company Permalink (RELIANCE)"),
    ]
    
    passed = 0
    for path, desc in routes:
        url = f"http://localhost:3000{path}"
        t0 = time.perf_counter()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 Chrome/130.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                status = resp.status
                body = resp.read()
                elapsed_ms = (time.perf_counter() - t0) * 1000
                assert status == 200, f"Expected 200, got {status}"
                assert len(body) > 1000, "HTML payload too small"
                print(f"  [PASS] {desc:35} | {status} OK | {elapsed_ms:5.1f}ms | {len(body):,} bytes")
                passed += 1
        except Exception as e:
            print(f"  [FAIL] {desc:35} | Error: {e}")
            
    print(f"\nFrontend Routes Result: {passed}/{len(routes)} passed.")
    return passed == len(routes)

def test_responsive_audit_metrics():
    print_header("5. RESPONSIVE DESIGN & ACCESSIBILITY AUDIT METRICS")
    report_file = os.path.join(r"D:\Algo Robot\scratch", "post_fix_audit_report.json")
    if not os.path.exists(report_file):
        print("  [FAIL] Audit report not found.")
        return False
        
    with open(report_file, "r") as f:
        report = json.load(f)
        
    runs = report.get("results", [])
    print(f"  [METRIC] Total Route-Viewport Runs Audited: {len(runs)}")
    
    doc_overflows = sum(1 for r in runs if r.get("has_horizontal_overflow", False))
    double_scrolls = sum(1 for r in runs if r.get("double_scrollbars_count", 0) > 0)
    small_targets = sum(len(r.get("small_touch_targets", [])) for r in runs)
    
    print(f"  [METRIC] Document Horizontal Overflows: {doc_overflows} (Expected: 0)")
    print(f"  [METRIC] Double Scrollbars Detected:    {double_scrolls} (Expected: 0)")
    print(f"  [METRIC] Small Touch Targets (<32px):  {small_targets} (Expected: 0)")
    
    assert doc_overflows == 0, f"Found {doc_overflows} document overflows"
    assert double_scrolls == 0, f"Found {double_scrolls} double scrollbars"
    assert small_targets == 0, f"Found {small_targets} small touch targets"
    
    print("\nResponsive Metrics Result: 100% Passed (Zero Defect Certification).")
    return True

async def main():
    print("\n" + "#" * 70)
    print(" ALGO ROBOT — PHASE 12: FINAL REGRESSION TEST SUITE")
    print("#" * 70)
    
    # Add backend/ to Python path for indicator tests
    sys.path.insert(0, os.path.join(r"D:\Algo Robot", "backend"))
    
    r1 = test_rest_endpoints()
    r2 = await test_websocket_stream()
    r3 = test_quantitative_math()
    r4 = test_frontend_routes()
    r5 = test_responsive_audit_metrics()
    
    all_passed = r1 and r2 and r3 and r4 and r5
    print("\n" + "=" * 70)
    if all_passed:
        print(" >>> FINAL REGRESSION RESULT: 5 / 5 TEST SUITES PASSED (100% GREEN) <<<")
    else:
        print(" >>> FINAL REGRESSION RESULT: ONE OR MORE SUITES FAILED <<<")
    print("=" * 70)
    return 0 if all_passed else 1

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
