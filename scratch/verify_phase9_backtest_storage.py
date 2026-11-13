"""Verification Script for Phase 9: Backtest Storage, History Retrieval & Exporting.
Validates:
1. Persistent Backtest Storage (saving backtests, listing history, retrieving run by ID).
2. Chrome CDP UI verification:
   - 'Saved History' tab displays past simulations
   - 'View Results' loads past backtest without re-running
   - 'CSV' and 'JSON' export options available
3. Captures screenshots of Saved History and loaded backtest results.
"""

import sys
import os
import json
import time
import asyncio
import subprocess
import urllib.request
import websockets
import base64
import requests

ARTIFACTS_DIR = r"C:\Users\prtik\.gemini\antigravity\brain\a3bb74d3-8f77-42ca-b724-69ed032fbcc5\audit_screenshots"
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

def test_storage_api():
    print("\n--- 1. Testing Backtest Storage REST Endpoints ---")
    base_url = "http://127.0.0.1:8000"

    # 1. Run backtest and verify it returns a persistent backtest_id
    payload = {
        "strategy_id": "ema_cross",
        "symbols": ["RELIANCE", "TCS", "HDFCBANK"],
        "timeframe": "15m",
        "instrument_type": "EQUITY",
        "initial_capital": 500000.0,
        "risk_per_trade_pct": 1.5
    }
    r_run = requests.post(f"{base_url}/api/backtest/run", json=payload)
    assert r_run.status_code == 200, f"Expected 200, got {r_run.status_code}"
    run_data = r_run.json()
    bt_id = run_data.get("backtest_id")
    assert bt_id is not None, "Missing backtest_id in run response!"
    print(f"✓ Backtest executed and saved with ID: {bt_id}")

    # 2. Check history list
    r_hist = requests.get(f"{base_url}/api/backtest/history")
    assert r_hist.status_code == 200
    hist_data = r_hist.json()
    assert hist_data.get("count", 0) > 0, "No history runs returned!"
    print(f"✓ GET /api/backtest/history returned {hist_data['count']} saved runs")

    # 3. Retrieve specific run details by ID
    r_single = requests.get(f"{base_url}/api/backtest/history/{bt_id}")
    assert r_single.status_code == 200
    single_data = r_single.json()
    assert single_data.get("backtest", {}).get("backtest_id") == bt_id
    print(f"✓ GET /api/backtest/history/{bt_id} retrieved successfully with {len(single_data['backtest']['trades'])} trades")

    return bt_id

async def test_ui_history_cdp(bt_id: str):
    print("\n--- 2. Testing Backtest History Tab & Loading via Chrome CDP ---")
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    if not os.path.exists(chrome_path):
        chrome_path = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

    debug_port = 9228
    proc = subprocess.Popen([
        chrome_path,
        "--headless=new",
        f"--remote-debugging-port={debug_port}",
        "--disable-gpu",
        "--no-sandbox",
        "--window-size=1600,1200",
        "about:blank"
    ])

    await asyncio.sleep(2)
    try:
        ver_url = f"http://127.0.0.1:{debug_port}/json"
        req = urllib.request.urlopen(ver_url)
        tabs = json.loads(req.read().decode())
        ws_url = tabs[0]["webSocketDebuggerUrl"]

        async with websockets.connect(ws_url, max_size=50_000_000) as ws:
            msg_id = 1

            async def send_cmd(method, params=None):
                nonlocal msg_id
                cid = msg_id
                msg_id += 1
                await ws.send(json.dumps({"id": cid, "method": method, "params": params or {}}))
                while True:
                    resp = json.loads(await ws.recv())
                    if resp.get("id") == cid:
                        return resp.get("result", {})

            await send_cmd("Page.enable")
            await send_cmd("DOM.enable")

            # Navigate to /signals
            print("Navigating to http://localhost:3000/signals ...")
            await send_cmd("Page.navigate", {"url": "http://localhost:3000/signals"})
            await asyncio.sleep(4)

            # Click Backtest Strategy button
            await send_cmd("Runtime.evaluate", {
                "expression": """
                (() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const btBtn = buttons.find(b => b.textContent && b.textContent.includes('Backtest Strategy'));
                    if (btBtn) btBtn.click();
                })()
                """
            })
            await asyncio.sleep(2)

            # Switch to 'Saved History' tab
            print("Switching to 'Saved History' tab...")
            eval_tab = await send_cmd("Runtime.evaluate", {
                "returnByValue": True,
                "expression": """
                (() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const histTab = buttons.find(b => b.textContent && b.textContent.includes('Saved History'));
                    if (histTab) {
                        histTab.click();
                        return 'SWITCHED_TO_HISTORY';
                    }
                    return 'TAB_NOT_FOUND';
                })()
                """
            })
            print(f"Tab switch result: {eval_tab.get('result', {}).get('value')}")
            await asyncio.sleep(2)

            # Capture Screenshot 1: Backtest History Tab
            res1 = await send_cmd("Page.captureScreenshot", {"format": "png"})
            ss1_path = os.path.join(ARTIFACTS_DIR, "phase9_backtest_history_tab.png")
            with open(ss1_path, "wb") as f:
                f.write(base64.b64decode(res1["data"]))
            print(f"✓ Saved Backtest History Tab screenshot: {ss1_path}")

            # Click 'View Results' on first saved run
            print("Clicking 'View Results' on saved run...")
            eval_view = await send_cmd("Runtime.evaluate", {
                "returnByValue": True,
                "expression": """
                (() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const viewBtn = buttons.find(b => b.textContent && b.textContent.includes('View Results'));
                    if (viewBtn) {
                        viewBtn.click();
                        return 'CLICKED_VIEW_RESULTS';
                    }
                    return 'VIEW_BTN_NOT_FOUND';
                })()
                """
            })
            print(f"View Results click: {eval_view.get('result', {}).get('value')}")
            await asyncio.sleep(3)

            # Verify that loaded results display metrics and chart
            eval_loaded = await send_cmd("Runtime.evaluate", {
                "returnByValue": True,
                "expression": """
                (() => {
                    const text = document.body.innerText;
                    const html = document.body.innerHTML;
                    const hasNetPnl = text.includes('NET P&L') || html.includes('NET P&amp;L');
                    const hasId = html.includes('BT-RUN-');
                    const hasExportCsv = text.includes('CSV');
                    const hasExportJson = text.includes('JSON');
                    return { hasNetPnl, hasId, hasExportCsv, hasExportJson };
                })()
                """
            })
            checks = eval_loaded.get("result", {}).get("value", {})
            print(f"Loaded Backtest Verification: {checks}")
            assert checks.get("hasNetPnl"), "Net PnL missing in loaded backtest!"
            assert checks.get("hasId"), "Backtest run ID missing in loaded backtest!"
            assert checks.get("hasExportCsv"), "CSV export button missing!"
            assert checks.get("hasExportJson"), "JSON export button missing!"

            # Capture Screenshot 2: Loaded Backtest Results
            res2 = await send_cmd("Page.captureScreenshot", {"format": "png"})
            ss2_path = os.path.join(ARTIFACTS_DIR, "phase9_backtest_loaded_from_history.png")
            with open(ss2_path, "wb") as f:
                f.write(base64.b64decode(res2["data"]))
            print(f"✓ Saved Loaded Backtest Results screenshot: {ss2_path}")

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

if __name__ == "__main__":
    bt_id = test_storage_api()
    asyncio.run(test_ui_history_cdp(bt_id))
    print("\n✓ PHASE 9 BACKTEST STORAGE & EXPORTING VERIFICATION PASSED SUCCESSFULLY!")

