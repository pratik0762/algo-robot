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

async def capture():
    user_data = os.path.join(os.environ.get("TEMP", r"C:\tmp"), "chrome_dev_final_verify")
    os.makedirs(user_data, exist_ok=True)
    
    cmd = [
        CHROME_PATH,
        "--remote-debugging-port=9229",
        "--headless=new",
        "--disable-gpu",
        f"--user-data-dir={user_data}",
        "--window-size=1440,950",
        "http://localhost:3000/52-week"
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(3.5)
    
    try:
        req = urllib.request.urlopen("http://127.0.0.1:9229/json/list")
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
            
            # Wait for /52-week to load
            await asyncio.sleep(4.0)
            
            # 1. 52-Week with BSE Data
            ss1 = await send("Page.captureScreenshot", {"format": "png"})
            path1 = os.path.join(SCREENSHOT_DIR, "chrome_verified_52_week_bse.png")
            with open(path1, "wb") as f:
                f.write(base64.b64decode(ss1["data"]))
            print("1. Saved 52-Week BSE table:", path1)
            
            # 2. Click Playbook tab
            eval_pb = """
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const pb = buttons.find(b => (b.innerText || '').includes('Playbook'));
                if (pb) {
                    pb.click();
                    return 'CLICKED_PLAYBOOK';
                }
                return 'NOT_FOUND';
            })()
            """
            r_pb = await send("Runtime.evaluate", {"expression": eval_pb, "returnByValue": True})
            print("Playbook click:", r_pb)
            await asyncio.sleep(2.0)
            ss2 = await send("Page.captureScreenshot", {"format": "png"})
            path2 = os.path.join(SCREENSHOT_DIR, "chrome_verified_52_week_playbook.png")
            with open(path2, "wb") as f:
                f.write(base64.b64decode(ss2["data"]))
            print("2. Saved 52-Week Playbook:", path2)
            
            # 3. Open Drawer
            eval_drawer = """
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const dr = buttons.find(b => (b.innerText || '').includes('Drawer'));
                if (dr) {
                    dr.click();
                    return 'CLICKED_DRAWER';
                }
                return 'DRAWER_NOT_FOUND';
            })()
            """
            r_dr = await send("Runtime.evaluate", {"expression": eval_drawer, "returnByValue": True})
            print("Drawer click:", r_dr)
            await asyncio.sleep(1.5)
            ss3 = await send("Page.captureScreenshot", {"format": "png"})
            path3 = os.path.join(SCREENSHOT_DIR, "chrome_verified_drawer_clean_final.png")
            with open(path3, "wb") as f:
                f.write(base64.b64decode(ss3["data"]))
            print("3. Saved Drawer Clean Final:", path3)
            
    finally:
        proc.kill()

if __name__ == "__main__":
    asyncio.run(capture())

