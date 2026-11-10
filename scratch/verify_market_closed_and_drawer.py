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

async def verify():
    user_data = os.path.join(os.environ.get("TEMP", r"C:\tmp"), "chrome_dev_market_closed_verify")
    os.makedirs(user_data, exist_ok=True)
    
    cmd = [
        CHROME_PATH,
        "--remote-debugging-port=9230",
        "--headless=new",
        "--disable-gpu",
        f"--user-data-dir={user_data}",
        "--window-size=1440,950",
        "http://localhost:3000/"
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(3.5)
    
    try:
        req = urllib.request.urlopen("http://127.0.0.1:9230/json/list")
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
            
            # Wait for homepage to load
            await asyncio.sleep(4.0)
            
            # 1. HomePage with Market Closed Banner
            ss1 = await send("Page.captureScreenshot", {"format": "png"})
            path1 = os.path.join(SCREENSHOT_DIR, "chrome_verified_homepage_market_closed.png")
            with open(path1, "wb") as f:
                f.write(base64.b64decode(ss1["data"]))
            print("1. Saved HomePage Market Closed:", path1)
            
            # 2. Click Drawer button to open Drawer
            eval_drawer = """
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const btn = buttons.find(b => (b.innerText || '').includes('Drawer') || (b.innerText || '').includes('Menu') || b.querySelector('svg.lucide-menu'));
                if (btn) {
                    btn.click();
                    return 'CLICKED_DRAWER';
                }
                return 'DRAWER_BTN_NOT_FOUND';
            })()
            """
            r_drawer = await send("Runtime.evaluate", {"expression": eval_drawer, "returnByValue": True})
            print("Drawer click result:", r_drawer)
            await asyncio.sleep(2.0)
            
            ss2 = await send("Page.captureScreenshot", {"format": "png"})
            path2 = os.path.join(SCREENSHOT_DIR, "chrome_verified_drawer_clean_options.png")
            with open(path2, "wb") as f:
                f.write(base64.b64decode(ss2["data"]))
            print("2. Saved Clean Drawer Screenshot:", path2)
            
            # 3. Navigate to /52-week
            await send("Page.navigate", {"url": "http://localhost:3000/52-week"})
            await asyncio.sleep(4.0)
            ss3 = await send("Page.captureScreenshot", {"format": "png"})
            path3 = os.path.join(SCREENSHOT_DIR, "chrome_verified_52_week_market_closed.png")
            with open(path3, "wb") as f:
                f.write(base64.b64decode(ss3["data"]))
            print("3. Saved 52-Week Market Closed:", path3)

            # 4. Navigate to /chart
            await send("Page.navigate", {"url": "http://localhost:3000/chart"})
            await asyncio.sleep(4.0)
            ss4 = await send("Page.captureScreenshot", {"format": "png"})
            path4 = os.path.join(SCREENSHOT_DIR, "chrome_verified_chart_market_closed.png")
            with open(path4, "wb") as f:
                f.write(base64.b64decode(ss4["data"]))
            print("4. Saved Chart Market Closed:", path4)

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

if __name__ == "__main__":
    asyncio.run(verify())

