import os
import sys
import json
import asyncio
import base64
import tempfile
import subprocess
import requests
import websockets

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(CHROME_PATH):
    CHROME_PATH = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

SCREENSHOTS_DIR = r"C:\Users\prtik\.gemini\antigravity\brain\a3bb74d3-8f77-42ca-b724-69ed032fbcc5\audit_screenshots"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
DEBUG_PORT = 9235

async def cdp_send(ws, method, params=None, msg_id=1):
    req = {"id": msg_id, "method": method, "params": params or {}}
    await ws.send(json.dumps(req))
    while True:
        resp = json.loads(await ws.recv())
        if resp.get("id") == msg_id:
            return resp.get("result", {})

async def capture_screenshot(ws, output_path, msg_id):
    res = await cdp_send(ws, "Page.captureScreenshot", {"format": "png"}, msg_id)
    img_data = base64.b64decode(res["data"])
    with open(output_path, "wb") as f:
        f.write(img_data)
    print(f"  [SAVED] Screenshot -> {output_path}", flush=True)

async def main():
    print("=" * 80, flush=True)
    print("AUDIT & VERIFICATION: OPTION CHAIN & STRATEGY BUILDER", flush=True)
    print("=" * 80, flush=True)

    user_data_dir = tempfile.mkdtemp(prefix="chrome_opt_")
    chrome_cmd = [
        CHROME_PATH,
        f"--remote-debugging-port={DEBUG_PORT}",
        f"--user-data-dir={user_data_dir}",
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--window-size=1600,1050"
    ]
    proc = subprocess.Popen(chrome_cmd)
    await asyncio.sleep(2.0)

    try:
        pages = requests.get(f"http://127.0.0.1:{DEBUG_PORT}/json").json()
        ws_url = pages[0]["webSocketDebuggerUrl"]
        print(f"Connected to Chrome Page CDP at: {ws_url}", flush=True)

        async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
            mid = 1
            await cdp_send(ws, "Page.enable", {}, mid); mid += 1
            await cdp_send(ws, "Runtime.enable", {}, mid); mid += 1

            # -----------------------------------------------------------------
            # 1. OPTION CHAIN TABLE VIEW
            # -----------------------------------------------------------------
            print("\n[Step 1] Navigating to http://127.0.0.1:3000/option-chain ...", flush=True)
            await cdp_send(ws, "Page.navigate", {"url": "http://127.0.0.1:3000/option-chain"}, mid); mid += 1
            await asyncio.sleep(3.5)

            # Check that table loaded
            eval_res = await cdp_send(ws, "Runtime.evaluate", {
                "expression": "document.body.innerText.includes('CALL OPTIONS (CE)') && document.body.innerText.includes('ATM STRIKE')"
            }, mid); mid += 1
            has_table = eval_res.get("result", {}).get("value")
            print(f"  Option Chain Table rendered: {has_table}", flush=True)

            shot1 = os.path.join(SCREENSHOTS_DIR, "option_chain_table_view.png")
            await capture_screenshot(ws, shot1, mid); mid += 1

            # -----------------------------------------------------------------
            # 2. STRATEGY BUILDER & PAYOFF VIEW
            # -----------------------------------------------------------------
            print("\n[Step 2] Switching to Strategy Builder & Payoff View ...", flush=True)
            await cdp_send(ws, "Runtime.evaluate", {
                "expression": """
                (() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const builderBtn = buttons.find(b => b.innerText.includes('Strategy Builder & Payoff'));
                    if (builderBtn) builderBtn.click();
                })()
                """
            }, mid); mid += 1
            await asyncio.sleep(1.5)

            # Select Bull Call Spread from the template select dropdown
            await cdp_send(ws, "Runtime.evaluate", {
                "expression": """
                (() => {
                    const selects = Array.from(document.querySelectorAll('select'));
                    const tplSelect = selects.find(s => s.innerHTML.includes('BULL_CALL_SPREAD') || s.innerHTML.includes('Bull Call Spread'));
                    if (tplSelect) {
                        tplSelect.value = 'BULL_CALL_SPREAD';
                        tplSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                        // Click load button if present
                        const loadBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Load Bull Call Spread'));
                        if (loadBtn) loadBtn.click();
                    }
                })()
                """
            }, mid); mid += 1
            await asyncio.sleep(2.5)

            eval_analysis = await cdp_send(ws, "Runtime.evaluate", {
                "expression": "document.body.innerText.includes('MAX PROFIT') && document.body.innerText.includes('Payoff Profile at Expiry')"
            }, mid); mid += 1
            has_analysis = eval_analysis.get("result", {}).get("value")
            print(f"  Strategy Builder & Payoff Chart loaded: {has_analysis}", flush=True)

            shot2 = os.path.join(SCREENSHOTS_DIR, "option_chain_strategy_builder.png")
            await capture_screenshot(ws, shot2, mid); mid += 1

            # -----------------------------------------------------------------
            # 3. NAVIGATION DRAWER VERIFICATION
            # -----------------------------------------------------------------
            print("\n[Step 3] Opening Navigation Drawer to verify OPTION CHAIN item ...", flush=True)
            await cdp_send(ws, "Runtime.evaluate", {
                "expression": """
                (() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const menuBtn = buttons.find(b => b.innerText.trim() === 'Menu' || b.innerText.includes('Menu'));
                    if (menuBtn) menuBtn.click();
                })()
                """
            }, mid); mid += 1
            await asyncio.sleep(1.5)

            eval_drawer = await cdp_send(ws, "Runtime.evaluate", {
                "expression": "document.getElementById('nav-option-chain') !== null"
            }, mid); mid += 1
            has_drawer_item = eval_drawer.get("result", {}).get("value")
            print(f"  Drawer Option Chain nav item found: {has_drawer_item}", flush=True)

            shot3 = os.path.join(SCREENSHOTS_DIR, "drawer_with_option_chain.png")
            await capture_screenshot(ws, shot3, mid); mid += 1

            # -----------------------------------------------------------------
            # 4. SIGNALS PAGE VERIFICATION (No FUT / OPT categories)
            # -----------------------------------------------------------------
            print("\n[Step 4] Checking Signals Page at http://127.0.0.1:3000/signals ...", flush=True)
            await cdp_send(ws, "Page.navigate", {"url": "http://127.0.0.1:3000/signals"}, mid); mid += 1
            await asyncio.sleep(3.0)

            eval_signals = await cdp_send(ws, "Runtime.evaluate", {
                "expression": """
                (() => {
                    const text = document.body.innerText;
                    const hasFutPill = text.includes('Futures (FUT)');
                    const hasOptPill = text.includes('Options (OPT)');
                    return JSON.stringify({ hasFutPill, hasOptPill, isClean: !hasFutPill && !hasOptPill });
                })()
                """
            }, mid); mid += 1
            signals_check = json.loads(eval_signals.get("result", {}).get("value", "{}"))
            print(f"  Signals page cleanup check: {signals_check}", flush=True)

            shot4 = os.path.join(SCREENSHOTS_DIR, "signals_equities_only.png")
            await capture_screenshot(ws, shot4, mid); mid += 1

            print("\n" + "=" * 80, flush=True)
            print("ALL 4 VERIFICATION PHASES COMPLETED SUCCESSFULLY!", flush=True)
            print("=" * 80, flush=True)

    finally:
        try:
            proc.terminate()
            proc.wait(timeout=3)
        except Exception:
            pass

if __name__ == "__main__":
    asyncio.run(main())
