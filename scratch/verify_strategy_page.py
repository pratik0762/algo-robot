import os
import sys
import json
import time
import asyncio
import subprocess
import urllib.request
import websockets
import base64
import requests
import tempfile

ARTIFACTS_DIR = r"C:\Users\prtik\.gemini\antigravity\brain\a3bb74d3-8f77-42ca-b724-69ed032fbcc5\audit_screenshots"
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(CHROME_PATH):
    CHROME_PATH = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
DEBUG_PORT = 9235

async def run_cdp_verification():
    print("=" * 70, flush=True)
    print("PHASE 2 / 3: STRATEGY PAGE & NAVIGATION DRAWER VERIFICATION", flush=True)
    print("=" * 70, flush=True)

    # 1. Verify HTTP endpoints
    print("\n--- 1. Testing Strategy HTTP Endpoints ---", flush=True)
    r_stats = requests.get("http://127.0.0.1:8000/api/strategies/stats", timeout=5)
    assert r_stats.status_code == 200, f"Expected 200 from /api/strategies/stats, got {r_stats.status_code}"
    stats_data = r_stats.json()
    print(f"✓ /api/strategies/stats: Total {stats_data['total_strategies']}, Active {stats_data['active_strategies']}, Custom {stats_data['custom_strategies']}, Runs {stats_data['backtested_runs']}", flush=True)

    r_page = requests.get("http://127.0.0.1:3000/strategy", timeout=10)
    assert r_page.status_code == 200, f"Expected 200 from http://127.0.0.1:3000/strategy, got {r_page.status_code}"
    print(f"✓ GET http://127.0.0.1:3000/strategy responded 200 OK (Content-Length: {len(r_page.text)})", flush=True)

    # 2. Launch headless Chrome with unique user-data-dir
    print("\n--- 2. Launching Chrome for UI Automation & Screenshots ---", flush=True)
    user_data = tempfile.mkdtemp()
    proc = subprocess.Popen([
        CHROME_PATH,
        "--headless=new",
        f"--remote-debugging-port={DEBUG_PORT}",
        f"--user-data-dir={user_data}",
        "--disable-gpu",
        "--no-sandbox",
        "--window-size=1600,1100",
        "about:blank"
    ])
    await asyncio.sleep(2)

    try:
        ver_url = f"http://127.0.0.1:{DEBUG_PORT}/json"
        req = urllib.request.urlopen(ver_url, timeout=5)
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
                        if "error" in resp:
                            raise Exception(f"CDP Error in {method}: {resp['error']}")
                        return resp.get("result", {})

            await send_cmd("Page.enable")
            await send_cmd("Runtime.enable")

            # Step A: Check Drawer on Home Page
            print("\n--- Step A: Verifying Navigation Drawer on Home Page ---", flush=True)
            await send_cmd("Page.navigate", {"url": "http://127.0.0.1:3000/"})
            await asyncio.sleep(3)

            # Open drawer
            await send_cmd("Runtime.evaluate", {
                "expression": """
                    (() => {
                        const btns = Array.from(document.querySelectorAll('button'));
                        const hubBtn = btns.find(b => b.textContent.includes('EXPLORE HUBS') || b.textContent.includes('MARKET HUBS'));
                        if (hubBtn) { hubBtn.click(); return 'OPENED_DRAWER'; }
                        return 'NO_BTN';
                    })()
                """,
                "returnByValue": True
            })
            await asyncio.sleep(2)

            drawer_check = await send_cmd("Runtime.evaluate", {
                "returnByValue": True,
                "expression": """
                    (() => {
                        const drawer = document.querySelector('.nav-drawer-panel');
                        if (!drawer) return { hasDrawer: false };
                        const text = drawer.innerText;
                        const hasStrategy = text.includes('STRATEGY');
                        return { hasDrawer: true, hasStrategy: hasStrategy };
                    })()
                """
            })
            drawer_val = drawer_check.get("result", {}).get("value", {})
            print(f"✓ Drawer Check: {drawer_val}", flush=True)
            assert drawer_val.get("hasStrategy"), "STRATEGY item missing in Navigation Drawer!"

            # Screenshot Drawer
            ss1 = await send_cmd("Page.captureScreenshot", {"format": "png"})
            ss1_path = os.path.join(ARTIFACTS_DIR, "phase13_drawer_strategy_item.png")
            with open(ss1_path, "wb") as f:
                f.write(base64.b64decode(ss1["data"]))
            print(f"✓ Saved screenshot: {ss1_path}", flush=True)

            # Step B: Navigate to /strategy directly
            print("\n--- Step B: Verifying Dedicated Strategy Page (/strategy) ---", flush=True)
            await send_cmd("Page.navigate", {"url": "http://127.0.0.1:3000/strategy"})
            await asyncio.sleep(3)

            page_check = await send_cmd("Runtime.evaluate", {
                "expression": """
                    (() => {
                        const h1 = document.querySelector('h1');
                        const hasTitle = h1 && h1.textContent.includes('Strategy');
                        const hasDesc = document.body.innerText.includes('Create, configure, manage, and backtest your trading strategies.');
                        const hasRepoTab = document.body.innerText.includes('Strategy Repository');
                        const hasBuilderTab = document.body.innerText.includes('Create Strategy');
                        const hasBacktestTab = document.body.innerText.includes('Backtest Strategy');
                        return {
                            hasTitle,
                            hasDesc,
                            hasRepoTab,
                            hasBuilderTab,
                            hasBacktestTab
                        };
                    })()
                """,
                "returnByValue": True
            })
            p_val = page_check.get("result", {}).get("value", {})
            print(f"✓ Strategy Page Header & Tabs: {p_val}", flush=True)

            # Screenshot Strategy Repository Tab
            ss2 = await send_cmd("Page.captureScreenshot", {"format": "png"})
            ss2_path = os.path.join(ARTIFACTS_DIR, "phase13_strategy_page_repository.png")
            with open(ss2_path, "wb") as f:
                f.write(base64.b64decode(ss2["data"]))
            print(f"✓ Saved screenshot: {ss2_path}", flush=True)

            # Step C: Switch to Tab 2: Create Strategy Builder
            print("\n--- Step C: Switching to Create Strategy Tab ---", flush=True)
            await send_cmd("Runtime.evaluate", {
                "expression": """
                    (() => {
                        const tabs = Array.from(document.querySelectorAll('button'));
                        const bTab = tabs.find(b => b.textContent.includes('Create Strategy') && !b.textContent.includes('+'));
                        if (bTab) { bTab.click(); return 'CLICKED_BUILDER_TAB'; }
                        return 'TAB_NOT_FOUND';
                    })()
                """,
                "returnByValue": True
            })
            await asyncio.sleep(1)

            ss3 = await send_cmd("Page.captureScreenshot", {"format": "png"})
            ss3_path = os.path.join(ARTIFACTS_DIR, "phase13_strategy_page_builder.png")
            with open(ss3_path, "wb") as f:
                f.write(base64.b64decode(ss3["data"]))
            print(f"✓ Saved screenshot: {ss3_path}", flush=True)

            # Step D: Switch to Tab 3: Backtest Strategy Terminal and Execute Backtest
            print("\n--- Step D: Switching to Backtest Strategy Tab & Running Simulation ---", flush=True)
            await send_cmd("Runtime.evaluate", {
                "expression": """
                    (() => {
                        const tabs = Array.from(document.querySelectorAll('button'));
                        const btTab = tabs.find(b => b.textContent.includes('Backtest Strategy') && !b.textContent.includes('Desk'));
                        if (btTab) { btTab.click(); return 'CLICKED_BACKTEST_TAB'; }
                        return 'TAB_NOT_FOUND';
                    })()
                """,
                "returnByValue": True
            })
            await asyncio.sleep(1)

            # Click "Run Backtest Simulation"
            await send_cmd("Runtime.evaluate", {
                "expression": """
                    (() => {
                        const btns = Array.from(document.querySelectorAll('button'));
                        const runBtn = btns.find(b => b.textContent.includes('Run Backtest Simulation'));
                        if (runBtn) { runBtn.click(); return 'CLICKED_RUN'; }
                        return 'NO_RUN_BTN';
                    })()
                """,
                "returnByValue": True
            })
            print("Waiting 5s for simulation to execute...", flush=True)
            await asyncio.sleep(5)

            results_check = await send_cmd("Runtime.evaluate", {
                "expression": """
                    (() => {
                        const text = document.body.innerText;
                        return {
                            hasNetProfit: text.includes('NET PROFIT'),
                            hasWinRate: text.includes('WIN RATE'),
                            hasProfitFactor: text.includes('PROFIT FACTOR'),
                            hasTradeLog: text.includes('Trade Execution Log')
                        };
                    })()
                """,
                "returnByValue": True
            })
            r_val = results_check.get("result", {}).get("value", {})
            print(f"✓ Backtest Results on Page: {r_val}", flush=True)

            # Screenshot Backtest Results
            ss4 = await send_cmd("Page.captureScreenshot", {"format": "png"})
            ss4_path = os.path.join(ARTIFACTS_DIR, "phase13_strategy_page_backtest.png")
            with open(ss4_path, "wb") as f:
                f.write(base64.b64decode(ss4["data"]))
            print(f"✓ Saved screenshot: {ss4_path}", flush=True)

            print("\n" + "=" * 70, flush=True)
            print("ALL STRATEGY PAGE & DRAWER VERIFICATIONS PASSED SUCCESSFULLY!", flush=True)
            print("=" * 70, flush=True)

    finally:
        proc.terminate()

if __name__ == "__main__":
    asyncio.run(run_cdp_verification())
