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

async def test_signals():
    user_data = os.path.join(os.environ.get("TEMP", r"C:\tmp"), "chrome_dev_signals_verify")
    os.makedirs(user_data, exist_ok=True)
    
    cmd = [
        CHROME_PATH,
        "--remote-debugging-port=9234",
        "--headless=new",
        "--disable-gpu",
        f"--user-data-dir={user_data}",
        "--window-size=1440,950",
        "http://localhost:3000/signals"
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(3.5)
    
    try:
        req = urllib.request.urlopen("http://127.0.0.1:9234/json/list")
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
            
            # 1. Screenshot of Trade Signals Page
            ss1 = await send("Page.captureScreenshot", {"format": "png"})
            path1 = os.path.join(SCREENSHOT_DIR, "chrome_verified_trade_signals_page.png")
            with open(path1, "wb") as f:
                f.write(base64.b64decode(ss1["data"]))
            print("1. Saved /signals page:", path1)
            
            # 2. Click 'Simulate New Signal' button to pop up persistent toast in bottom-left
            eval_sim = """
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const btn = buttons.find(b => (b.innerText || '').includes('Simulate New Signal'));
                if (btn) {
                    btn.click();
                    return 'CLICKED_SIMULATE';
                }
                return 'BTN_NOT_FOUND';
            })()
            """
            r_sim = await send("Runtime.evaluate", {"expression": eval_sim, "returnByValue": True})
            print("Simulate click result:", r_sim)
            await asyncio.sleep(2.0)
            
            # 3. Screenshot of bottom-left persistent toast notification
            ss2 = await send("Page.captureScreenshot", {"format": "png"})
            path2 = os.path.join(SCREENSHOT_DIR, "chrome_verified_signals_bottom_left_toast.png")
            with open(path2, "wb") as f:
                f.write(base64.b64decode(ss2["data"]))
            print("2. Saved Persistent Toast Notification Screenshot:", path2)

            # 4. Click 'Drawer' button to open Navigation Drawer showing TRADE SIGNALS
            eval_drawer = """
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const btn = buttons.find(b => (b.innerText || '').includes('Drawer'));
                if (btn) {
                    btn.click();
                    return 'CLICKED_DRAWER';
                }
                return 'DRAWER_NOT_FOUND';
            })()
            """
            r_drawer = await send("Runtime.evaluate", {"expression": eval_drawer, "returnByValue": True})
            print("Drawer click result:", r_drawer)
            await asyncio.sleep(2.0)

            # 5. Screenshot of Drawer showing TRADE SIGNALS
            ss3 = await send("Page.captureScreenshot", {"format": "png"})
            path3 = os.path.join(SCREENSHOT_DIR, "chrome_verified_drawer_trade_signals_option.png")
            with open(path3, "wb") as f:
                f.write(base64.b64decode(ss3["data"]))
            print("3. Saved Drawer with TRADE SIGNALS option:", path3)

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

if __name__ == "__main__":
    asyncio.run(test_signals())
