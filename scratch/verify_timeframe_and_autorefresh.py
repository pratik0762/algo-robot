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

async def test_auto_signals():
    user_data = os.path.join(os.environ.get("TEMP", r"C:\tmp"), "chrome_dev_auto_signals")
    os.makedirs(user_data, exist_ok=True)
    
    cmd = [
        CHROME_PATH,
        "--remote-debugging-port=9236",
        "--headless=new",
        "--disable-gpu",
        f"--user-data-dir={user_data}",
        "--window-size=1440,950",
        "http://localhost:3000/signals"
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(3.5)
    
    try:
        req = urllib.request.urlopen("http://127.0.0.1:9236/json/list")
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
            
            # Wait for /signals to load
            await asyncio.sleep(4.0)
            
            # 1. Screenshot of Trade Signals showing Timeframe on each trade and Auto-Refresh Active badge
            ss1 = await send("Page.captureScreenshot", {"format": "png"})
            path1 = os.path.join(SCREENSHOT_DIR, "chrome_verified_trade_signals_with_timeframe.png")
            with open(path1, "wb") as f:
                f.write(base64.b64decode(ss1["data"]))
            print("1. Saved Trade Signals with Timeframe & Auto-Refresh:", path1)

            # 2. Wait for automatic real-time sync (approx 8 seconds) or trigger via backend to verify auto-refresh
            urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8000/api/trade-signals/trigger", method="POST"))
            await asyncio.sleep(7.0)

            # 3. Screenshot showing the newly auto-refreshed signal & persistent bottom-left toast
            ss2 = await send("Page.captureScreenshot", {"format": "png"})
            path2 = os.path.join(SCREENSHOT_DIR, "chrome_verified_signals_autorefresh_toast.png")
            with open(path2, "wb") as f:
                f.write(base64.b64decode(ss2["data"]))
            print("2. Saved Auto-Refreshed Signal & Persistent Toast:", path2)

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

if __name__ == "__main__":
    asyncio.run(test_auto_signals())
