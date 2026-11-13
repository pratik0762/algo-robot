import asyncio
import base64
import json
import os
import subprocess
import time
import urllib.request
import websockets

SCREENSHOT_DIR = r"C:\Users\prtik\.gemini\antigravity\brain\a3bb74d3-8f77-42ca-b724-69ed032fbcc5"
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

async def test_short_modal():
    user_data = os.path.join(os.environ.get("TEMP", r"C:\tmp"), "chrome_dev_short_modal")
    os.makedirs(user_data, exist_ok=True)
    cmd = [
        CHROME_PATH,
        "--remote-debugging-port=9246",
        "--headless=new",
        "--disable-gpu",
        f"--user-data-dir={user_data}",
        "--window-size=1440,950",
        "http://localhost:3000/signals"
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(3.5)
    try:
        req = urllib.request.urlopen("http://127.0.0.1:9246/json/list")
        tabs = json.loads(req.read().decode())
        ws_url = next(t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page")
        async with websockets.connect(ws_url) as ws:
            msg_id = 1
            async def send(method, params=None):
                nonlocal msg_id
                m = {"id": msg_id, "method": method, "params": params or {}}
                msg_id += 1
                await ws.send(json.dumps(m))
                while True:
                    resp = json.loads(await ws.recv())
                    if resp.get("id") == m["id"]:
                        return resp.get("result", {})
            await send("Page.enable")
            await send("DOM.enable")
            await send("Runtime.enable")
            await asyncio.sleep(4.0)

            # Click SELL Only filter
            filter_script = """
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const sellBtn = buttons.find(b => b.textContent.trim() === 'SELL Only');
                if (sellBtn) {
                    sellBtn.click();
                    return 'CLICKED_SELL_ONLY';
                }
                return 'SELL_ONLY_NOT_FOUND';
            })()
            """
            await send("Runtime.evaluate", {"expression": filter_script})
            await asyncio.sleep(1.5)

            # Click the first NSE Chart button for the SELL signal
            chart_script = """
            (() => {
                const chartBtns = Array.from(document.querySelectorAll('button[title*="SHORT"]'));
                if (chartBtns.length > 0) {
                    chartBtns[0].click();
                    return 'CLICKED_SHORT_CHART_BTN';
                }
                return 'SHORT_BTN_NOT_FOUND';
            })()
            """
            res = await send("Runtime.evaluate", {"expression": chart_script})
            print("Chart button click:", res.get("result", {}).get("value"))
            await asyncio.sleep(2.0)

            ss = await send("Page.captureScreenshot", {"format": "png"})
            path = os.path.join(SCREENSHOT_DIR, "chrome_verified_short_signal_modal.png")
            with open(path, "wb") as f:
                f.write(base64.b64decode(ss["data"]))
            print("Saved SHORT Modal screenshot:", path)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except:
            proc.kill()

if __name__ == "__main__":
    asyncio.run(test_short_modal())

