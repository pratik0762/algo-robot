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

async def verify_all():
    user_data = os.path.join(os.environ.get("TEMP", r"C:\tmp"), "chrome_dev_chart_verify")
    os.makedirs(user_data, exist_ok=True)
    
    cmd = [
        CHROME_PATH,
        "--remote-debugging-port=9227",
        "--headless=new",
        "--disable-gpu",
        f"--user-data-dir={user_data}",
        "--window-size=1440,950",
        "http://localhost:3000/chart"
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(3.5)
    
    try:
        req = urllib.request.urlopen("http://127.0.0.1:9227/json/list")
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
            
            # Wait for chart render
            await asyncio.sleep(4.0)
            
            # Capture Chart & Buy/Sell signals
            ss1 = await send("Page.captureScreenshot", {"format": "png"})
            path1 = os.path.join(SCREENSHOT_DIR, "chrome_verified_chart_and_signals.png")
            with open(path1, "wb") as f:
                f.write(base64.b64decode(ss1["data"]))
            print("Saved Chart & Signals Screenshot:", path1)
            
            # Switch to Heat Map tab
            eval_hm = """
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const hmBtn = buttons.find(b => (b.innerText || '').includes('Heat Map'));
                if (hmBtn) {
                    hmBtn.click();
                    return 'CLICKED_HEATMAP';
                }
                return 'HEATMAP_BTN_NOT_FOUND';
            })()
            """
            res_hm = await send("Runtime.evaluate", {"expression": eval_hm, "returnByValue": True})
            print("Heatmap tab click:", res_hm)
            await asyncio.sleep(2.0)
            
            ss2 = await send("Page.captureScreenshot", {"format": "png"})
            path2 = os.path.join(SCREENSHOT_DIR, "chrome_verified_nse_heatmap.png")
            with open(path2, "wb") as f:
                f.write(base64.b64decode(ss2["data"]))
            print("Saved NSE Heat Map Screenshot:", path2)
            
            # Open Drawer to verify Option 6
            eval_drawer = """
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const dBtn = buttons.find(b => (b.innerText || '').includes('HUBS') || (b.innerText || '').includes('EXPLORE'));
                if (dBtn) {
                    dBtn.click();
                    return 'CLICKED_DRAWER';
                }
                return 'DRAWER_BTN_NOT_FOUND';
            })()
            """
            res_dr = await send("Runtime.evaluate", {"expression": eval_drawer, "returnByValue": True})
            print("Drawer click:", res_dr)
            await asyncio.sleep(1.5)
            
            ss3 = await send("Page.captureScreenshot", {"format": "png"})
            path3 = os.path.join(SCREENSHOT_DIR, "chrome_verified_drawer_chart_option.png")
            with open(path3, "wb") as f:
                f.write(base64.b64decode(ss3["data"]))
            print("Saved Drawer Screenshot:", path3)

    finally:
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            pass

if __name__ == "__main__":
    asyncio.run(verify_all())
