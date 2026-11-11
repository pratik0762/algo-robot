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

async def test_drawer():
    user_data = os.path.join(os.environ.get("TEMP", r"C:\tmp"), "chrome_dev_chart_drawer")
    os.makedirs(user_data, exist_ok=True)
    
    cmd = [
        CHROME_PATH,
        "--remote-debugging-port=9232",
        "--headless=new",
        "--disable-gpu",
        f"--user-data-dir={user_data}",
        "--window-size=1440,950",
        "http://localhost:3000/chart"
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(3.5)
    
    try:
        req = urllib.request.urlopen("http://127.0.0.1:9232/json/list")
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
            
            # Wait for /chart to load
            await asyncio.sleep(4.0)
            
            # 1. Screenshot of Chart Page with Drawer Button
            ss1 = await send("Page.captureScreenshot", {"format": "png"})
            path1 = os.path.join(SCREENSHOT_DIR, "chrome_verified_chart_page_with_drawer_button.png")
            with open(path1, "wb") as f:
                f.write(base64.b64decode(ss1["data"]))
            print("1. Saved /chart with Drawer Button:", path1)
            
            # 2. Click Drawer button
            eval_click = """
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const btn = buttons.find(b => (b.innerText || '').includes('Drawer'));
                if (btn) {
                    btn.click();
                    return 'CLICKED_DRAWER_BUTTON';
                }
                return 'BUTTON_NOT_FOUND';
            })()
            """
            r_click = await send("Runtime.evaluate", {"expression": eval_click, "returnByValue": True})
            print("Click result:", r_click)
            await asyncio.sleep(2.0)
            
            # 3. Screenshot of open drawer on /chart
            ss2 = await send("Page.captureScreenshot", {"format": "png"})
            path2 = os.path.join(SCREENSHOT_DIR, "chrome_verified_chart_drawer_opened.png")
            with open(path2, "wb") as f:
                f.write(base64.b64decode(ss2["data"]))
            print("2. Saved /chart Drawer Opened:", path2)

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

if __name__ == "__main__":
    asyncio.run(test_drawer())
