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

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

ARTIFACTS_DIR = r"C:\Users\prtik\.gemini\antigravity\brain\a3bb74d3-8f77-42ca-b724-69ed032fbcc5\audit_screenshots"
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

BACKEND_BASE = "http://127.0.0.1:8000"
FRONTEND_BASE = "http://127.0.0.1:3000"

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(CHROME_PATH):
    CHROME_PATH = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
DEBUG_PORT = 9270

async def verify_phase6_7():
    print("=" * 75, flush=True)
    print("PHASE 6 & 7: LIVE BROKER INTEGRATION & REAL-TIME ALERTS VERIFICATION", flush=True)
    print("=" * 75, flush=True)

    # 1. API Verification
    print("\n--- 1. Testing Phase 6 Broker APIs ---", flush=True)
    r_br = requests.get(f"{BACKEND_BASE}/api/brokers/status", timeout=5)
    assert r_br.status_code == 200, f"Broker status returned {r_br.status_code}"
    br_data = r_br.json()
    print(f"✓ GET /api/brokers/status: Active={br_data['active_broker']}, Available Brokers={len(br_data['brokers'])}", flush=True)

    # Test order routing via broker manager
    r_route = requests.post(f"{BACKEND_BASE}/api/brokers/order", json={
        "symbol": "RELIANCE",
        "side": "BUY",
        "quantity": 10,
        "instrument_type": "EQUITY",
        "order_type": "MARKET"
    }, timeout=5)
    assert r_route.status_code == 200, f"Broker order routing returned {r_route.status_code}"
    print(f"✓ POST /api/brokers/order: {r_route.json().get('message')}", flush=True)

    print("\n--- 2. Testing Phase 7 Alerts APIs ---", flush=True)
    r_cfg = requests.get(f"{BACKEND_BASE}/api/notifications/config", timeout=5)
    assert r_cfg.status_code == 200, f"Notification config returned {r_cfg.status_code}"
    print(f"✓ GET /api/notifications/config: Telegram={r_cfg.json()['telegram']['is_enabled']}, Webhook={r_cfg.json()['webhook']['is_enabled']}", flush=True)

    r_tg = requests.post(f"{BACKEND_BASE}/api/notifications/test-telegram", timeout=5)
    assert r_tg.status_code == 200, f"Telegram test returned {r_tg.status_code}"
    print(f"✓ POST /api/notifications/test-telegram: {r_tg.json()['message']}", flush=True)

    r_wh = requests.post(f"{BACKEND_BASE}/api/notifications/test-webhook", timeout=5)
    assert r_wh.status_code == 200, f"Webhook test returned {r_wh.status_code}"
    print(f"✓ POST /api/notifications/test-webhook: {r_wh.json()['message']}", flush=True)

    # 2. Launch headless Chrome
    print("\n--- 3. Launching Headless Chrome for UI Verification ---", flush=True)
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

        # Step B: Click Tab 7 "Live Broker Connect"
        print("\n--- Step B: Verifying Live Broker Connect Tab ---", flush=True)
        click_br = await eval_expr("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const btn = btns.find(b => b.textContent.includes('Live Broker Connect'));
                if (btn) { btn.click(); return 'CLICKED_BROKER'; }
                return 'NOT_FOUND';
            })()
        """)
        await asyncio.sleep(2.5)

        br_check = await eval_expr("""
            (() => {
                const text = document.body.innerText;
                return {
                    hasTitle: text.includes('Live Broker API Integration Hub'),
                    hasZerodha: text.includes('Zerodha Kite Connect'),
                    hasAngel: text.includes('Angel One SmartAPI'),
                    hasDhan: text.includes('Dhan HQ API v2'),
                    hasUpstox: text.includes('Upstox API v2'),
                    hasFunds: text.includes('AVAILABLE CASH MARGIN'),
                    hasAuthForm: text.includes('Connect / Update Broker Credentials')
                };
            })()
        """)
        print(f"✓ Live Broker Desk UI Check: {br_check}", flush=True)
        assert br_check.get("hasTitle") and br_check.get("hasZerodha") and br_check.get("hasFunds"), "Live Broker UI elements missing"

        # Capture Broker screenshot
        ss_br = os.path.join(ARTIFACTS_DIR, "phase6_live_broker_desk.png")
        await capture_screen(ss_br)
        print(f"✓ Saved screenshot: {ss_br}", flush=True)

        # Step C: Click Tab 8 "Real-Time Alerts & Bot"
        print("\n--- Step C: Verifying Real-Time Alerts & Notification Tab ---", flush=True)
        click_alerts = await eval_expr("""
            (() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const btn = btns.find(b => b.textContent.includes('Real-Time Alerts & Bot'));
                if (btn) { btn.click(); return 'CLICKED_NOTIFICATIONS'; }
                return 'NOT_FOUND';
            })()
        """)
        await asyncio.sleep(2.5)

        alerts_check = await eval_expr("""
            (() => {
                const text = document.body.innerText;
                return {
                    hasTitle: text.includes('Real-Time Alerts & Notification Engine'),
                    hasTelegram: text.includes('Telegram Bot Channel'),
                    hasWebhook: text.includes('Universal Webhook Dispatcher'),
                    hasRules: text.includes('Notification Trigger Rules'),
                    hasDeliveries: text.includes('Recent Notification Deliveries')
                };
            })()
        """)
        print(f"✓ Alerts Desk UI Check: {alerts_check}", flush=True)
        assert alerts_check.get("hasTitle") and alerts_check.get("hasTelegram") and alerts_check.get("hasWebhook"), "Alerts UI elements missing"

        # Capture Alerts screenshot
        ss_alerts = os.path.join(ARTIFACTS_DIR, "phase7_alerts_notification_desk.png")
        await capture_screen(ss_alerts)
        print(f"✓ Saved screenshot: {ss_alerts}", flush=True)

        print("\n" + "=" * 75, flush=True)
        print("PHASE 6 & 7 END-TO-END VERIFICATION SUCCESSFULLY COMPLETED!", flush=True)
        print("=" * 75, flush=True)
        return True

    finally:
        if ws:
            await ws.close()
        proc.kill()

if __name__ == "__main__":
    success = asyncio.run(verify_phase6_7())
    sys.exit(0 if success else 1)
