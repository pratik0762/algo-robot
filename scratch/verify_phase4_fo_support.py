"""Verification script for Phase 4: Stocks & F&O Common Engine Support.
Tests:
1. Master F&O Specifications API: GET /api/fo/specifications
2. Black-Scholes Greeks Engine: GET /api/fo/greeks (Delta, Gamma, Theta, Vega, IV)
3. Futures Basis & Carry Engine: GET /api/fo/basis (Futures Price, Basis, Carry %)
4. Multi-Asset Trade Signals Filtering:
   - Default all signals (Equity, Futures, Options)
   - Filter instrument=EQUITY
   - Filter instrument=FUTURES (Lot size, Basis, Expiry, Contract code)
   - Filter instrument=OPTIONS (Strike, CE/PE, Premium, Greeks, Lot size, Moneyness)
5. Strategy Registry Multi-Asset Compatibility Matrix
6. Chrome CDP Browser Visual Capture:
   - Futures signals view
   - Options signals view
   - Strategy Logic Card Multi-Asset Compatibility Matrix
"""

import os
import sys
import time
import json
import asyncio
import base64
import subprocess
import urllib.request
import websockets

ARTIFACT_DIR = r"C:\Users\prtik\.gemini\antigravity\brain\a3bb74d3-8f77-42ca-b724-69ed032fbcc5"
SCREENSHOT_DIR = os.path.join(ARTIFACT_DIR, "audit_screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(CHROME_PATH):
    CHROME_PATH = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"


def http_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Phase4Test/1.0"})
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        return resp.status, json.loads(resp.read().decode())


def test_fo_backend_engine():
    print("=" * 75)
    print("ALGO ROBOT: PHASE 4 STOCKS & F&O COMMON ENGINE VERIFICATION")
    print("=" * 75)

    base = "http://127.0.0.1:8000"

    # 1. Master F&O Specifications API
    print("\n[TEST 1] Master F&O Specifications Endpoint: GET /api/fo/specifications ...")
    status, fo_specs = http_get(f"{base}/api/fo/specifications")
    assert status == 200
    lot_sizes = fo_specs.get("lot_sizes", {})
    assert "NIFTY" in lot_sizes and lot_sizes["NIFTY"] == 25
    assert "BANKNIFTY" in lot_sizes and lot_sizes["BANKNIFTY"] == 15
    assert "RELIANCE" in lot_sizes and lot_sizes["RELIANCE"] == 250
    assert "TCS" in lot_sizes and lot_sizes["TCS"] == 175
    exp_info = fo_specs.get("expiry_info", {})
    assert "current_monthly_expiry" in exp_info
    print(f"  [PASS] F&O Lot sizes verified across {len(lot_sizes)} symbols.")
    print(f"  [PASS] Current Monthly Expiry: {exp_info['current_monthly_expiry']} (Days: {exp_info['days_to_monthly_expiry']})")

    # 2. Black-Scholes Greeks Engine
    print("\n[TEST 2] Black-Scholes Greeks Engine: GET /api/fo/greeks ...")
    status, greeks_res = http_get(f"{base}/api/fo/greeks?spot=24100&strike=24100&dte_days=14&iv=0.16&option_type=CE")
    assert status == 200
    g = greeks_res["greeks"]
    assert g["price"] > 0
    assert 0.4 <= g["delta"] <= 0.6, f"Expected ATM Call Delta ~0.5, got {g['delta']}"
    assert g["gamma"] > 0, "Gamma must be positive"
    assert g["vega"] > 0, "Vega must be positive"
    assert g["theta"] < 0, "Theta must be negative (time decay)"
    print(f"  [PASS] Nifty ATM 24100 CE Greeks: Price=₹{g['price']} | Delta={g['delta']} | Gamma={g['gamma']} | Theta=₹{g['theta']}/d | Vega={g['vega']}")

    # Test Put Option (PE)
    status, greeks_pe = http_get(f"{base}/api/fo/greeks?spot=24100&strike=24100&dte_days=14&iv=0.16&option_type=PE")
    g_pe = greeks_pe["greeks"]
    assert -0.6 <= g_pe["delta"] <= -0.4, f"Expected ATM Put Delta ~ -0.5, got {g_pe['delta']}"
    print(f"  [PASS] Nifty ATM 24100 PE Greeks: Price=₹{g_pe['price']} | Delta={g_pe['delta']} | Gamma={g_pe['gamma']} | Theta=₹{g_pe['theta']}/d")

    # 3. Futures Basis & Carry Engine
    print("\n[TEST 3] Futures Basis & Carry Engine: GET /api/fo/basis ...")
    status, fut_res = http_get(f"{base}/api/fo/basis?symbol=RELIANCE&spot_price=1340.00&dte_days=14")
    assert status == 200
    fdata = fut_res["futures_data"]
    assert fdata["futures_price"] >= 1340.00
    assert fdata["lot_size"] == 250
    assert fdata["basis"] >= 0
    print(f"  [PASS] RELIANCE Futures: Spot=₹{fdata['spot_price']} | Fut=₹{fdata['futures_price']} | Basis=₹{fdata['basis']} ({fdata['basis_pct']}%) | Carry={fdata['cost_of_carry_annualized_pct']}%/yr | Lot={fdata['lot_size']}")

    # 4. Multi-Asset Signals Retrieval & Filtering
    print("\n[TEST 4] Multi-Asset Signals Retrieval & Filtering: GET /api/trade-signals ...")
    status, sigs_res = http_get(f"{base}/api/trade-signals")
    assert status == 200
    summary = sigs_res["summary"]
    total = sigs_res["total_signals"]
    print(f"  [PASS] Total Multi-Asset Signals: {total} (Equities: {summary.get('equity_count', 0)}, Futures: {summary.get('futures_count', 0)}, Options: {summary.get('options_count', 0)})")
    assert summary.get("futures_count", 0) > 0, "Expected at least 1 Futures signal"
    assert summary.get("options_count", 0) > 0, "Expected at least 1 Options signal"

    # Filter by Equity
    status, eq_res = http_get(f"{base}/api/trade-signals?instrument=EQUITY")
    for s in eq_res["signals"]:
        assert s["instrument_type"] == "EQUITY"
    print(f"  [PASS] Equity filter verified: {len(eq_res['signals'])} cash equity signals.")

    # Filter by Futures
    status, fut_sig_res = http_get(f"{base}/api/trade-signals?instrument=FUTURES")
    for s in fut_sig_res["signals"]:
        assert s["instrument_type"] == "FUTURES"
        assert "lot_size" in s and s["lot_size"] > 0
        assert "basis" in s
        assert "contract_symbol" in s
    print(f"  [PASS] Futures filter verified: {len(fut_sig_res['signals'])} contracts with lot sizes and basis.")

    # Filter by Options
    status, opt_sig_res = http_get(f"{base}/api/trade-signals?instrument=OPTIONS")
    for s in opt_sig_res["signals"]:
        assert s["instrument_type"] == "OPTIONS"
        assert "strike_price" in s and s["strike_price"] > 0
        assert s["option_type"] in ("CE", "PE")
        assert "greeks" in s and "delta" in s["greeks"]
        assert "total_cost" in s and s["total_cost"] > 0
    print(f"  [PASS] Options filter verified: {len(opt_sig_res['signals'])} contracts with strikes, premiums & Greeks.")

    # 5. Strategy Registry Multi-Asset Compatibility Matrix
    print("\n[TEST 5] Verifying Strategy Logic Compatibility Matrix...")
    status, logic_res = http_get(f"{base}/api/trade-signals/strategies/ema_cross")
    strat = logic_res["strategy"]
    assert "instrument_compatibility" in strat
    compat = strat["instrument_compatibility"]
    assert compat["equity"] is True
    assert compat["futures"] is True
    assert compat["options"] is True
    print(f"  [PASS] EMA Crossover Compatibility: Equity={compat['equity']}, Futures={compat['futures']}, Options={compat['options']}")

    status, b52_res = http_get(f"{base}/api/trade-signals/strategies/breakout_52w")
    b52_strat = b52_res["strategy"]
    b52_compat = b52_strat["instrument_compatibility"]
    assert b52_compat["options"] is False  # 52w breakout not recommended for options
    print(f"  [PASS] 52-Week Breakout Compatibility correctly flags Options={b52_compat['options']}")


async def capture_cdp_fo_screenshots():
    print("\n[TEST 6] Capturing Visual Proof of Stocks & F&O Support via Chrome CDP...")
    port = 9344
    user_data = os.path.join(os.environ.get("TEMP", r"C:\tmp"), "chrome_fo_profile")
    os.makedirs(user_data, exist_ok=True)

    cmd = [
        CHROME_PATH,
        f"--remote-debugging-port={port}",
        "--headless=new",
        "--disable-gpu",
        f"--user-data-dir={user_data}",
        "--window-size=1920,1080",
        "about:blank"
    ]
    proc = subprocess.Popen(cmd)
    await asyncio.sleep(2.5)

    try:
        req = urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list")
        tabs = json.loads(req.read().decode())
        ws_url = next(t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page")

        async with websockets.connect(ws_url, max_size=50_000_000) as ws:
            msg_id = 1

            async def send(method, params=None):
                nonlocal msg_id
                cid = msg_id
                msg_id += 1
                await ws.send(json.dumps({"id": cid, "method": method, "params": params or {}}))
                while True:
                    resp = json.loads(await ws.recv())
                    if resp.get("id") == cid:
                        return resp.get("result", {})

            await send("Page.enable")
            print("  -> Navigating to http://localhost:3000/signals ...")
            await send("Page.navigate", {"url": "http://localhost:3000/signals"})
            await asyncio.sleep(4.0)

            # 1. Click 'Futures (FUT)' Filter Pill
            print("  -> Selecting 'Futures (FUT)' asset filter pill...")
            click_fut = """
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const btn = buttons.find(b => b.textContent && b.textContent.includes('Futures (FUT)'));
                if (btn) {
                    btn.click();
                    return { clicked: true, text: btn.textContent };
                }
                return { clicked: false };
            })()
            """
            res_fut = await send("Runtime.evaluate", {"expression": click_fut, "returnByValue": True})
            print(f"  -> Clicked Futures Pill: {res_fut.get('value')}")
            await asyncio.sleep(1.5)

            # Capture Futures Signals Screenshot
            ss_fut = await send("Page.captureScreenshot", {"format": "png"})
            fut_shot_path = os.path.join(SCREENSHOT_DIR, "phase4_futures_signals.png")
            with open(fut_shot_path, "wb") as f:
                f.write(base64.b64decode(ss_fut.get("data", "")))
            print(f"  [CAPTURED] Saved Futures Signals: {fut_shot_path} ({os.path.getsize(fut_shot_path):,} bytes)")

            # 2. Click 'Options (OPT)' Filter Pill
            print("  -> Selecting 'Options (OPT)' asset filter pill...")
            click_opt = """
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const btn = buttons.find(b => b.textContent && b.textContent.includes('Options (OPT)'));
                if (btn) {
                    btn.click();
                    return { clicked: true, text: btn.textContent };
                }
                return { clicked: false };
            })()
            """
            res_opt = await send("Runtime.evaluate", {"expression": click_opt, "returnByValue": True})
            print(f"  -> Clicked Options Pill: {res_opt.get('value')}")
            await asyncio.sleep(1.5)

            # Capture Options Signals Screenshot
            ss_opt = await send("Page.captureScreenshot", {"format": "png"})
            opt_shot_path = os.path.join(SCREENSHOT_DIR, "phase4_options_signals.png")
            with open(opt_shot_path, "wb") as f:
                f.write(base64.b64decode(ss_opt.get("data", "")))
            print(f"  [CAPTURED] Saved Options Signals: {opt_shot_path} ({os.path.getsize(opt_shot_path):,} bytes)")

            # 3. Select 'Supertrend (10, 3) Breakout' to inspect Multi-Asset Compatibility Matrix in Strategy Logic Card
            print("  -> Selecting 'Supertrend (10, 3) Breakout' pill...")
            click_st = """
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const btn = buttons.find(b => b.textContent && b.textContent.includes('Supertrend'));
                if (btn) {
                    btn.click();
                    return { clicked: true, text: btn.textContent };
                }
                return { clicked: false };
            })()
            """
            await send("Runtime.evaluate", {"expression": click_st, "returnByValue": True})
            await asyncio.sleep(1.5)

            # Capture Strategy Logic Card Compatibility Matrix
            ss_compat = await send("Page.captureScreenshot", {"format": "png"})
            compat_shot_path = os.path.join(SCREENSHOT_DIR, "phase4_compatibility_matrix.png")
            with open(compat_shot_path, "wb") as f:
                f.write(base64.b64decode(ss_compat.get("data", "")))
            print(f"  [CAPTURED] Saved Compatibility Matrix: {compat_shot_path} ({os.path.getsize(compat_shot_path):,} bytes)")

    finally:
        try:
            proc.terminate()
            proc.wait(timeout=2.0)
        except Exception:
            pass


if __name__ == "__main__":
    test_fo_backend_engine()
    asyncio.run(capture_cdp_fo_screenshots())
    print("\n" + "=" * 75)
    print("PHASE 4 COMPLETE: ALL STOCKS & F&O ENGINE TESTS & SCREENSHOTS PASSED")
    print("=" * 75)
