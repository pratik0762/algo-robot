import asyncio
import base64
import json
import os
import subprocess
import time
import urllib.request
import websockets

SCREENSHOT_PATH_1 = r"C:\Users\prtik\.gemini\antigravity\brain\a3bb74d3-8f77-42ca-b724-69ed032fbcc5\chrome_drawer_test_layout.png"

async def capture_drawer():
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    user_data = os.path.join(os.environ.get("TEMP", r"C:\tmp"), "chrome_dev_profile_drawer_align2")
    os.makedirs(user_data, exist_ok=True)
    
    cmd = [
        chrome_path,
        "--remote-debugging-port=9226",
        "--headless=new",
        "--disable-gpu",
        f"--user-data-dir={user_data}",
        "--window-size=1400,900",
        "http://localhost:3000"
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(3.0)
    
    try:
        req = urllib.request.urlopen("http://127.0.0.1:9226/json/list")
        tabs = json.loads(req.read().decode())
        ws_url = None
        for t in tabs:
            if t.get("type") == "page":
                ws_url = t["webSocketDebuggerUrl"]
                break
        if not ws_url:
            ws_url = tabs[0]["webSocketDebuggerUrl"]
            
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
            
            await asyncio.sleep(2.5)
            
            # Click drawer button
            eval_click = """
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const drawerBtn = buttons.find(b => (b.innerText || '').includes('HUBS') || (b.innerText || '').includes('EXPLORE'));
                if (drawerBtn) {
                    drawerBtn.click();
                    return 'CLICKED';
                }
                return 'NOT_FOUND';
            })()
            """
            await send("Runtime.evaluate", {"expression": eval_click, "returnByValue": True})
            await asyncio.sleep(1.2)
            
            ss = await send("Page.captureScreenshot", {"format": "png"})
            with open(SCREENSHOT_PATH_1, "wb") as f:
                f.write(base64.b64decode(ss["data"]))
            print("Saved:", SCREENSHOT_PATH_1)
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            pass

if __name__ == "__main__":
    asyncio.run(capture_drawer())

