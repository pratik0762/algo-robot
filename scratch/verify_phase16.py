"""Verification Suite for Phase 16:
1. Institutional Risk & Dynamic Capital Position Sizing Verification
2. RequestAnimationFrame (RAF) Tick Streaming Integration
3. Full Regression Suite (REST Endpoints, WebSocket, and SSR Routes)
"""

import os
import sys
import time
import json
import asyncio
import urllib.request

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

def test_phase16():
    print("=" * 70)
    print("ALGO ROBOT: PHASE 16 VERIFICATION SUITE")
    print("=" * 70)

    # 1. Test Trade Signals REST API for Position Sizing fields
    print("\n[TEST 1] Verifying Institutional Position Sizing on Trade Signals...")
    url = "http://127.0.0.1:8000/api/trade-signals"
    req = urllib.request.Request(url, headers={"User-Agent": "Phase16Test/1.0"})
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode())
    
    signals = data.get("signals", [])
    assert len(signals) > 0, "No trade signals found"
    print(f"  -> Total signals evaluated: {len(signals)}")

    for sig in signals:
        sym = sig["symbol"]
        qty = sig.get("position_size_shares")
        cap = sig.get("trade_capital_inr")
        risk = sig.get("max_risk_inr")
        t1_gain = sig.get("target_1_gain_inr")
        t2_gain = sig.get("target_2_gain_inr")

        assert qty is not None and qty >= 1, f"Invalid quantity for {sym}: {qty}"
        assert cap is not None and cap > 0, f"Invalid trade capital for {sym}: {cap}"
        assert risk is not None and risk > 0, f"Invalid risk amount for {sym}: {risk}"
        assert t1_gain is not None and t1_gain > 0, f"Invalid target 1 gain for {sym}: {t1_gain}"
        assert t2_gain is not None and t2_gain > 0, f"Invalid target 2 gain for {sym}: {t2_gain}"

        # Risk must be capped near ₹5,000 (1.0% portfolio risk on ₹5L capital)
        assert risk <= 5500.0, f"Risk exceeded threshold for {sym}: {risk}"

    sample = signals[0]
    print(f"  [PASS] Sample Signal [{sample['symbol']} {sample['type']}]:")
    print(f"         Entry: ₹{sample['entry_price']} | SL: ₹{sample['stop_loss']} | T1: ₹{sample['target_1']} | T2: ₹{sample['target_2']}")
    print(f"         Position Size: {sample['position_size_shares']} Shares | Capital: ₹{sample['trade_capital_inr']:,}")
    print(f"         Max Risk: ₹{sample['max_risk_inr']:,} | T1 Profit: ₹{sample['target_1_gain_inr']:,} | T2 Profit: ₹{sample['target_2_gain_inr']:,}")

    # 2. Test Live WebSocket Stream
    print("\n[TEST 2] Verifying Real-Time WebSocket Streaming...")
    async def test_ws():
        import websockets
        uri = "ws://127.0.0.1:8000/ws/live-ticks"
        async with websockets.connect(uri, open_timeout=5.0) as ws:
            msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
            parsed = json.loads(msg)
            assert parsed.get("type") == "SNAPSHOT"
            assert len(parsed.get("stocks", [])) > 0
            print(f"  [PASS] WebSocket Stream Active: Received SNAPSHOT with {len(parsed['stocks'])} stocks")

    asyncio.run(test_ws())

    # 3. Test Frontend SSR Routes
    print("\n[TEST 3] Verifying Frontend Production SSR Routes (Port 3000)...")
    routes = [
        ("http://localhost:3000/", "Home Dashboard"),
        ("http://localhost:3000/signals", "Trade Signals Desk"),
        ("http://localhost:3000/chart", "Market Heat Map"),
        ("http://localhost:3000/indices", "Indices Barometer"),
        ("http://localhost:3000/fii-dii", "FII/DII Institutional Desk"),
        ("http://localhost:3000/deals", "Bulk/Block Deals"),
        ("http://localhost:3000/52-week", "52-Week Radar"),
        ("http://localhost:3000/news", "Market News"),
        ("http://localhost:3000/company/RELIANCE", "Company Permalink")
    ]
    for r_url, r_name in routes:
        t0 = time.perf_counter()
        r_req = urllib.request.Request(r_url, headers={"User-Agent": "Phase16Test/1.0"})
        with urllib.request.urlopen(r_req, timeout=5.0) as r_resp:
            body = r_resp.read()
            assert r_resp.status == 200, f"Non-200 for {r_url}: {r_resp.status}"
        t1 = time.perf_counter()
        lat = (t1 - t0) * 1000
        print(f"  -> {r_name:28s}: 200 OK | {lat:.2f} ms | {len(body):,} bytes")

    print("\n" + "=" * 70)
    print("PHASE 16 COMPLETE: ALL TESTS PASSED WITH 100% SUCCESS")
    print("=" * 70)

if __name__ == "__main__":
    test_phase16()

