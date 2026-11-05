import asyncio
import base64
import json
import os
import subprocess
import time
import urllib.request
import websockets

SCREENSHOT_PATH = r"C:\Users\prtik\.gemini\antigravity\brain\a3bb74d3-8f77-42ca-b724-69ed032fbcc5\chrome_verified_drawer_text_aligned_no_desc.png"

async def capture_drawer():
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    user_data = os.path.join(os.environ.get("TEMP", r"C:\tmp"), "chrome_dev_profile_drawer_align")
    os.makedirs(user_data, exist_ok=True)
    
    cmd = [
        chrome_path,
        "--remote-debugging-port=9225",
        "--headless=new",
        "--disable-gpu",
        f"--user-data-dir={user_data}",
        "--window-size=1400,900",
        "http://localhost:3000"
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(3.0)
    
    try:
        req = urllib.request.urlopen("http://127.0.0.1:9225/json/list")
        tabs = json.loads(req.read().decode())
        ws_url = None
        for t in tabs:
            if t.get("type") == "page":
                ws_url = t["webSocketDebuggerUrl"]
                break
        if not ws_url:
            ws_url = tabs[0]["webSocketDebuggerUrl"]
            
        print("Connecting to ws:", ws_url)
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
            
            # Wait 3 seconds for initial load
            await asyncio.sleep(3)
            
            # Click the Drawer Menu trigger button
            eval_click = """
            (() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const drawerBtn = buttons.find(b => {
                    const text = (b.innerText || '').toLowerCase();
                    const title = (b.getAttribute('title') || '').toLowerCase();
                    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                    return text.includes('hubs') || text.includes('menu') || text.includes('market hubs') ||
                           title.includes('drawer') || title.includes('hubs') || aria.includes('hubs') || aria.includes('menu') ||
                           b.querySelector('svg.lucide-menu') || b.querySelector('svg');
                });
                if (drawerBtn) {
                    drawerBtn.click();
                    return 'CLICKED_DRAWER_BUTTON: ' + drawerBtn.innerText;
                }
                return 'NO_DRAWER_BUTTON_FOUND';
            })()
            """
            res = await send("Runtime.evaluate", {"expression": eval_click, "returnByValue": True})
            print("Click drawer result:", res)
            
            # Wait 1.5 seconds for drawer animation
            await asyncio.sleep(1.5)
            
            # Take screenshot
            ss = await send("Page.captureScreenshot", {"format": "png"})
            img_bytes = base64.b64decode(ss["data"])
            with open(SCREENSHOT_PATH, "wb") as f:
                f.write(img_bytes)
            print("Successfully saved screenshot to:", SCREENSHOT_PATH)

    finally:
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            pass

if __name__ == "__main__":
    asyncio.run(capture_drawer())
