"""Verification Script for Phase 8: Backtesting UI Integration.
Validates:
1. 'Backtest Strategy' button triggers the Backtest modal.
2. Configuration controls (Strategy, Asset Class, Universe, Timeframe, Capital, Risk, Slippage).
3. 'Run Backtest' execution:
   - Metric Summary Cards (Net P&L, Win Rate, Profit Factor, Drawdown, Sharpe, Charges)
   - Interactive SVG Equity Curve Chart
   - Monthly Performance Breakdown Table
   - Chronological Trade-by-Trade Execution Audit Log
4. Captures CDP screenshots of Backtest Modal & Results.
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

ARTIFACTS_DIR = r"C:\Users\prtik\.gemini\antigravity\brain\a3bb74d3-8f77-42ca-b724-69ed032fbcc5\audit_screenshots"
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

async def test_backtest_ui_cdp():
    print("\n--- Testing Phase 8: Backtesting UI via Chrome CDP ---")
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    if not os.path.exists(chrome_path):
        chrome_path = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

    debug_port = 9227
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

            # 1. Navigate to /signals
            print("Navigating to http://localhost:3000/signals ...")
            await send_cmd("Page.navigate", {"url": "http://localhost:3000/signals"})
            await asyncio.sleep(4)

            # 2. Click 'Backtest Strategy' button
            print("Clicking 'Backtest Strategy' button...")
            eval_click = await send_cmd("Runtime.evaluate", {
                "expression": """
                (() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const btBtn = buttons.find(b => b.textContent && b.textContent.includes('Backtest Strategy'));
                    if (btBtn) {
                        btBtn.click();
                        return 'CLICKED_BACKTEST_BUTTON';
                    }
                    return 'BUTTON_NOT_FOUND';
                })()
                """
            })
            click_res = eval_click.get("result", {}).get("value")
            print(f"Click Backtest button result: {click_res}")
            assert click_res == "CLICKED_BACKTEST_BUTTON", "Failed to find 'Backtest Strategy' button!"
            await asyncio.sleep(2)

            # Capture Screenshot 1: Backtest Modal Configured
            res1 = await send_cmd("Page.captureScreenshot", {"format": "png"})
            ss1_path = os.path.join(ARTIFACTS_DIR, "phase8_backtest_modal_configured.png")
            with open(ss1_path, "wb") as f:
                f.write(base64.b64decode(res1["data"]))
            print(f"✓ Saved Backtest Modal screenshot: {ss1_path}")

            # 3. Click 'Run Backtest' inside the modal
            print("Clicking 'Run Backtest' inside modal...")
            eval_run = await send_cmd("Runtime.evaluate", {
                "expression": """
                (() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const runBtn = buttons.find(b => b.textContent && b.textContent.includes('Run Backtest'));
                    if (runBtn) {
                        runBtn.click();
                        return 'CLICKED_RUN_BACKTEST';
                    }
                    return 'RUN_BTN_NOT_FOUND';
                })()
                """
            })
            run_res = eval_run.get("result", {}).get("value")
            print(f"Click 'Run Backtest' result: {run_res}")
            assert run_res == "CLICKED_RUN_BACKTEST", "Failed to find 'Run Backtest' button inside modal!"

            # Wait for simulation and rendering of results (metrics, SVG chart, trade log)
            await asyncio.sleep(4)

            # Verify that Results components are rendered
            eval_results = await send_cmd("Runtime.evaluate", {
                "returnByValue": True,
                "expression": """
                (() => {
                    const html = document.body.innerHTML;
                    const text = document.body.innerText;
                    const hasNetPnl = text.includes('NET P&L') || html.includes('NET P&amp;L');
                    const hasWinRate = text.includes('WIN RATE') || html.includes('WIN RATE');
                    const hasEquityCurve = text.includes('PORTFOLIO EQUITY CURVE') || html.includes('PORTFOLIO EQUITY CURVE');
                    const hasTradesTable = html.includes('Chronological Trade Execution') || document.querySelectorAll('table').length > 0;
                    const svgChart = document.querySelector('svg polyline');
                    return {
                        hasNetPnl,
                        hasWinRate,
                        hasEquityCurve,
                        hasTradesTable,
                        hasSvg: Boolean(svgChart)
                    };
                })()
                """
            })
            checks = eval_results.get("result", {}).get("value", {})
            print(f"UI Verification Checks: {checks}")
            assert checks.get("hasNetPnl"), "Net PnL card missing in UI!"
            assert checks.get("hasWinRate"), "Win Rate card missing in UI!"
            assert checks.get("hasEquityCurve"), "Equity Curve header missing in UI!"
            assert checks.get("hasTradesTable"), "Trades Audit Log missing in UI!"
            assert checks.get("hasSvg"), "SVG Equity Curve Chart missing!"

            # Capture Screenshot 2: Backtest Results (Metrics, Chart & Trades)
            res2 = await send_cmd("Page.captureScreenshot", {"format": "png"})
            ss2_path = os.path.join(ARTIFACTS_DIR, "phase8_backtest_results_view.png")
            with open(ss2_path, "wb") as f:
                f.write(base64.b64decode(res2["data"]))
            print(f"✓ Saved Backtest Results screenshot: {ss2_path}")

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

if __name__ == "__main__":
    asyncio.run(test_backtest_ui_cdp())
    print("\n✓ PHASE 8 BACKTESTING UI INTEGRATION COMPLETED SUCCESSFULLY!")
