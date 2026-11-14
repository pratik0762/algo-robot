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
DEBUG_PORT = 9240

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
    user_data_dir = tempfile.mkdtemp(prefix="chrome_final_")
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

        async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
            mid = 1
            await cdp_send(ws, "Page.enable", {}, mid); mid += 1
            await cdp_send(ws, "Runtime.enable", {}, mid); mid += 1

            # 1. OPTION CHAIN TABLE
            print("Capturing Option Chain Table...", flush=True)
            await cdp_send(ws, "Page.navigate", {"url": "http://127.0.0.1:3000/option-chain"}, mid); mid += 1
            await asyncio.sleep(4.0)

            shot1 = os.path.join(SCREENSHOTS_DIR, "option_chain_table_view.png")
            await capture_screenshot(ws, shot1, mid); mid += 1

            # 2. STRATEGY BUILDER - SCROLLED TO CHART
            print("Selecting Bull Call Spread and capturing Payoff Chart...", flush=True)
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

            await cdp_send(ws, "Runtime.evaluate", {
                "expression": """
                (() => {
                    const selects = Array.from(document.querySelectorAll('select'));
                    const tplSelect = selects.find(s => s.innerHTML.includes('BULL_CALL_SPREAD'));
                    if (tplSelect) {
                        tplSelect.value = 'BULL_CALL_SPREAD';
                        tplSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                        const loadBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Load Bull Call Spread'));
                        if (loadBtn) loadBtn.click();
                    }
                })()
                """
            }, mid); mid += 1
            await asyncio.sleep(2.5)

            # Scroll down to chart
            await cdp_send(ws, "Runtime.evaluate", {
                "expression": "window.scrollBy(0, 480);"
            }, mid); mid += 1
            await asyncio.sleep(1.0)

            shot2 = os.path.join(SCREENSHOTS_DIR, "option_chain_payoff_chart.png")
            await capture_screenshot(ws, shot2, mid); mid += 1

    finally:
        try:
            proc.terminate()
            proc.wait(timeout=3)
        except Exception:
            pass

if __name__ == "__main__":
    asyncio.run(main())
