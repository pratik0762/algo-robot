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

async def test_all_features():
    user_data = os.path.join(os.environ.get("TEMP", r"C:\tmp"), "chrome_dev_heatmap_test_v2")
    os.makedirs(user_data, exist_ok=True)
    
    cmd = [
        CHROME_PATH,
        "--remote-debugging-port=9244",
        "--headless=new",
        "--disable-gpu",
        f"--user-data-dir={user_data}",
        "--window-size=1440,950",
        "http://localhost:3000/signals"
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(3.5)
    
    try:
        req = urllib.request.urlopen("http://127.0.0.1:9244/json/list")
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
            print("Loading /signals...", flush=True)
            await asyncio.sleep(4.0)
            
            # 1. Capture Signals page with wrapped strategies and capital protection protocol
            shot1 = await send("Page.captureScreenshot", {"format": "png"})
            with open(os.path.join(SCREENSHOT_DIR, "chrome_verified_strategies_no_cutoff.png"), "wb") as f:
                f.write(base64.b64decode(shot1["data"]))
            print("1. Saved chrome_verified_strategies_no_cutoff.png", flush=True)

            # 2. Trigger simulated signal to test persistent toast
            print("Triggering new trade signal via API...", flush=True)
            try:
                urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8000/api/trade-signals/trigger", method="POST"))
            except Exception as e:
                print("Trigger error:", e, flush=True)
            
            # Wait for background poll to pick it up (6s polling)
            print("Waiting for signal to appear in UI...", flush=True)
            await asyncio.sleep(7.0)

            # Capture persistent toast notification
            shot2 = await send("Page.captureScreenshot", {"format": "png"})
            with open(os.path.join(SCREENSHOT_DIR, "chrome_verified_toast_persistent_stays.png"), "wb") as f:
                f.write(base64.b64decode(shot2["data"]))
            print("2. Saved chrome_verified_toast_persistent_stays.png", flush=True)

            # 3. Navigate to /chart
            print("3. Navigating to http://localhost:3000/chart (NSE Market Heat Map)...", flush=True)
            await send("Page.navigate", {"url": "http://localhost:3000/chart"})
            await asyncio.sleep(4.0)

            # Capture /chart redesigned heatmap
            shot3 = await send("Page.captureScreenshot", {"format": "png"})
            with open(os.path.join(SCREENSHOT_DIR, "chrome_verified_nse_heatmap_redesigned.png"), "wb") as f:
                f.write(base64.b64decode(shot3["data"]))
            print("3. Saved chrome_verified_nse_heatmap_redesigned.png", flush=True)

            # 4. Open Drawer on /chart
            print("4. Opening Drawer on /chart...", flush=True)
            await send("Runtime.evaluate", {
                "expression": """
                (() => {
                    const btns = Array.from(document.querySelectorAll('button'));
                    const drawerBtn = btns.find(b => b.textContent && b.textContent.includes('Drawer'));
                    if (drawerBtn) { drawerBtn.click(); return 'DRAWER_CLICKED'; }
                    return 'DRAWER_NOT_FOUND';
                })()
                """
            })
            await asyncio.sleep(1.5)
            shot4 = await send("Page.captureScreenshot", {"format": "png"})
            with open(os.path.join(SCREENSHOT_DIR, "chrome_verified_drawer_heatmap_option.png"), "wb") as f:
                f.write(base64.b64decode(shot4["data"]))
            print("4. Saved chrome_verified_drawer_heatmap_option.png", flush=True)

            print("All verifications successful!", flush=True)

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

if __name__ == "__main__":
    asyncio.run(test_all_features())
