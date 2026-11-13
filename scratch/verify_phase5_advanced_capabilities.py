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
from datetime import datetime

# Windows console encoding fix
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

ARTIFACTS_DIR = r"C:\Users\prtik\.gemini\antigravity\brain\a3bb74d3-8f77-42ca-b724-69ed032fbcc5\audit_screenshots"
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

BACKEND_BASE = "http://127.0.0.1:8000"
FRONTEND_BASE = "http://127.0.0.1:3000"

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(CHROME_PATH):
    CHROME_PATH = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
DEBUG_PORT = 9260

async def verify_phase5():
    print("=" * 75, flush=True)
    print("PHASE 5: ADVANCED STRATEGY CAPABILITIES END-TO-END VERIFICATION", flush=True)
    print("=" * 75, flush=True)

    # 1. API Verification
    print("\n--- 1. Testing Phase 5 REST APIs ---", flush=True)
    # Multi-Leg
    r_ml = requests.post(f"{BACKEND_BASE}/api/strategies/multi-leg/calculate", json={
        "strategy_key": "IRON_CONDOR",
        "symbol": "NIFTY",
        "spot_price": 24500.0,
        "days_to_expiry": 7.0,
        "lots": 1
    }, timeout=5)
    assert r_ml.status_code == 200, f"Multi-leg calculate returned {r_ml.status_code}"
    print(f"✓ POST /api/strategies/multi-leg/calculate: Net {r_ml.json()['spread']['spread_type']} ₹{r_ml.json()['spread']['net_premium_total']}", flush=True)

    # Optimizer
    r_opt = requests.post(f"{BACKEND_BASE}/api/strategies/optimize", json={
        "strategy_id": "ema_cross",
        "symbol": "RELIANCE",
        "timeframe": "5m",
        "objective": "sharpe_ratio"
    }, timeout=10)
    assert r_opt.status_code == 200, f"Optimizer returned {r_opt.status_code}"
    print(f"✓ POST /api/strategies/optimize: Evaluated {r_opt.json()['total_evaluated']} combinations. Best: {r_opt.json()['best_params']}", flush=True)

    # Paper Trading
    r_port = requests.get(f"{BACKEND_BASE}/api/paper-trading/portfolio", timeout=5)
    assert r_port.status_code == 200, f"Paper portfolio returned {r_port.status_code}"
    print(f"✓ GET /api/paper-trading/portfolio: Cash ₹{r_port.json()['cash_balance']:,.2f}, Equity ₹{r_port.json()['net_equity']:,.2f}", flush=True)

    # 2. Launch headless Chrome
    print("\n--- 2. Launching Headless Chrome for UI Visual Automation ---", flush=True)
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
    await asyncio.sleep(2.5)

    ws = None
    try:
        ver_url = f"http://127.0.0.1:{DEBUG_PORT}/json"
        req = urllib.request.urlopen(ver_url, timeout=5)
        tabs = json.loads(req.read().decode())
        ws_url = tabs[0]["webSocketDebuggerUrl"]

        ws = await websockets.connect(ws_url, max_size=50_000_000)
        msg_id = 1

        async def send_cmd(method, params=None):
            nonlocal msg_id
            cid = msg_id
            msg_id += 1
            await ws.send(json.dumps({"id": cid, "method": method, "params": params or {}}))
            while True:
                raw = await ws.recv()
                resp = json.loads(raw)
                if resp.get("id") == cid:
                    if "error" in resp:
                        raise Exception(f"CDP Error in {method}: {resp['error']}")
                    return resp.get("result", {})

        async def eval_expr(expr):
            res = await send_cmd("Runtime.evaluate", {"expression": expr, "returnByValue": True})
            return res.get("result", {}).get("value")

        async def capture_screen(filepath):
            scr = await send_cmd("Page.captureScreenshot", {"format": "png"})
            with open(filepath, "wb") as f:
                f.write(base64.b64decode(scr.get("data", "")))

        await send_cmd("Page.enable")
        await send_cmd("Runtime.enable")

        # Step A: Navigate to /strategy
        print("\n--- Step A: Loading /strategy ---", flush=True)
        await send_cmd("Page.navigate", {"url": f"{FRONTEND_BASE}/strategy"})
        await asyncio.sleep(3.0)

        # Step B: Click Tab 4 "Multi-Leg Options Spreads"
        print("\n--- Step B: Verifying Multi-Leg Options Spreads Tab ---", flush=True)
        click_ml = await eval_expr("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const btn = btns.find(b => b.textContent.includes('Multi-Leg Options Spreads'));
                if (btn) { btn.click(); return 'CLICKED_MULTILEG'; }
                return 'NOT_FOUND';
            })()
        """)
        await asyncio.sleep(2.5)

        ml_check = await eval_expr("""
            (() => {
                const text = document.body.innerText;
                return {
                    hasTitle: text.includes('Multi-Leg Options Spread Desk'),
                    hasNetPremium: text.includes('NET PREMIUM'),
                    hasMargin: text.includes('SEBI Margin Benefit'),
                    hasGreeks: text.includes('Net Greeks'),
                    hasLegs: text.includes('Constructed Option Legs'),
                    hasPayoff: text.includes('Expiry Payoff Distribution')
                };
            })()
        """)
        print(f"✓ Multi-Leg Desk UI Check: {ml_check}", flush=True)
        assert ml_check.get("hasTitle") and ml_check.get("hasNetPremium") and ml_check.get("hasPayoff"), "Multi-Leg UI elements missing"

        # Capture Multi-Leg screenshot
        ss_ml = os.path.join(ARTIFACTS_DIR, "phase5_multileg_options_desk.png")
        await capture_screen(ss_ml)
        print(f"✓ Saved screenshot: {ss_ml}", flush=True)

        # Step C: Click Tab 5 "Parameter Optimizer"
        print("\n--- Step C: Verifying Parameter Grid Optimizer Tab ---", flush=True)
        click_opt = await eval_expr("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const btn = btns.find(b => b.textContent.includes('Parameter Optimizer'));
                if (btn) { btn.click(); return 'CLICKED_OPTIMIZER'; }
                return 'NOT_FOUND';
            })()
        """)
        await asyncio.sleep(3.5)

        opt_check = await eval_expr("""
            (() => {
                const text = document.body.innerText;
                return {
                    hasTitle: text.includes('Strategy Parameter Grid Optimizer'),
                    hasOptimalBanner: text.includes('RANK #1 OPTIMAL COMBINATION'),
                    hasHeatmap: text.includes('Parameter Sensitivity Heatmap'),
                    hasRankTable: text.includes('Top Parameter Permutations')
                };
            })()
        """)
        print(f"✓ Strategy Optimizer UI Check: {opt_check}", flush=True)
        assert opt_check.get("hasTitle") and opt_check.get("hasOptimalBanner"), "Optimizer UI elements missing"

        # Capture Optimizer screenshot
        ss_opt = os.path.join(ARTIFACTS_DIR, "phase5_parameter_optimizer_desk.png")
        await capture_screen(ss_opt)
        print(f"✓ Saved screenshot: {ss_opt}", flush=True)

        # Step D: Click Tab 6 "Live Paper Trading Desk"
        print("\n--- Step D: Verifying Live Paper Trading Desk Tab ---", flush=True)
        click_pt = await eval_expr("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const btn = btns.find(b => b.textContent.includes('Live Paper Trading Desk'));
                if (btn) { btn.click(); return 'CLICKED_PAPERTRADING'; }
                return 'NOT_FOUND';
            })()
        """)
        await asyncio.sleep(2.5)

        pt_check = await eval_expr("""
            (() => {
                const text = document.body.innerText;
                return {
                    hasCash: text.includes('VIRTUAL CASH BALANCE'),
                    hasLiveMTM: text.includes('LIVE UNREALIZED MTM'),
                    hasTicket: text.includes('Virtual Order Ticket'),
                    hasPositions: text.includes('Open Virtual Positions')
                };
            })()
        """)
        print(f"✓ Paper Trading UI Check: {pt_check}", flush=True)
        assert pt_check.get("hasCash") and pt_check.get("hasTicket"), "Paper Trading UI elements missing"

        # Capture Paper Trading screenshot
        ss_pt = os.path.join(ARTIFACTS_DIR, "phase5_paper_trading_desk.png")
        await capture_screen(ss_pt)
        print(f"✓ Saved screenshot: {ss_pt}", flush=True)

        print("\n" + "=" * 75, flush=True)
        print("ALL PHASE 5 ADVANCED CAPABILITIES SUCCESSFULLY VERIFIED!", flush=True)
        print("=" * 75, flush=True)
        return True

    finally:
        if ws:
            await ws.close()
        proc.kill()

if __name__ == "__main__":
    success = asyncio.run(verify_phase5())
    sys.exit(0 if success else 1)
