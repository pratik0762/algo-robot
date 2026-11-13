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

async def test_global_toast_and_nse_chart():
    user_data = os.path.join(os.environ.get("TEMP", r"C:\tmp"), "chrome_dev_global_toast")
    os.makedirs(user_data, exist_ok=True)
    
    cmd = [
        CHROME_PATH,
        "--remote-debugging-port=9240",
        "--headless=new",
        "--disable-gpu",
        f"--user-data-dir={user_data}",
        "--window-size=1440,950",
        "http://localhost:3000/chart"
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(3.5)
    
    try:
        req = urllib.request.urlopen("http://127.0.0.1:9240/json/list")
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

            # Trigger a new signal from backend so that the global toast appears on /chart
            print("Triggering new signal via backend...")
            trig_req = urllib.request.Request("http://127.0.0.1:8000/api/trade-signals/trigger", method="POST")
            urllib.request.urlopen(trig_req)
            
            # Allow toast to render
            await asyncio.sleep(4.0)
            
            # 1. Capture screenshot of /chart showing the persistent signal toast notification in bottom-left
            ss1 = await send("Page.captureScreenshot", {"format": "png"})
            path1 = os.path.join(SCREENSHOT_DIR, "chrome_verified_global_toast_on_chart_page.png")
            with open(path1, "wb") as f:
                f.write(base64.b64decode(ss1["data"]))
            print("1. Saved Global Toast on /chart page:", path1)

            # 2. Click the 'NSE Chart' button inside the toast notification
            click_eval = """
            (() => {
                const toastButtons = Array.from(document.querySelectorAll('div[role="alert"] button'));
                const chartBtn = toastButtons.find(b => b.textContent.includes('NSE Chart'));
                if (chartBtn) {
                    chartBtn.click();
                    return 'CLICKED_TOAST_CHART_BTN';
                }
                return 'NOT_FOUND';
            })()
            """
            res_click = await send("Runtime.evaluate", {"expression": click_eval})
            print("Toast NSE Chart Click result:", res_click.get("result", {}).get("value"))
            await asyncio.sleep(2.0)

            # 3. Capture screenshot of open NSE Chart Modal with Long/Short indicator & ray levels
            ss2 = await send("Page.captureScreenshot", {"format": "png"})
            path2 = os.path.join(SCREENSHOT_DIR, "chrome_verified_nse_chart_modal_indicators.png")
            with open(path2, "wb") as f:
                f.write(base64.b64decode(ss2["data"]))
            print("2. Saved NSE Chart Modal with Indicators:", path2)

            # 4. Now navigate to /signals page to verify chart icons at end of each signal row
            print("Navigating to /signals page...")
            await send("Page.navigate", {"url": "http://localhost:3000/signals"})
            await asyncio.sleep(4.0)

            # 5. Capture screenshot of /signals page showing the Chart icon at the end of each card row
            ss3 = await send("Page.captureScreenshot", {"format": "png"})
            path3 = os.path.join(SCREENSHOT_DIR, "chrome_verified_signals_page_with_chart_icons.png")
            with open(path3, "wb") as f:
                f.write(base64.b64decode(ss3["data"]))
            print("3. Saved Signals page with chart icons on rows:", path3)

            # 6. Click the NSE Chart icon on the first signal card row to inspect modal from row click
            click_row_chart = """
            (() => {
                const rowButtons = Array.from(document.querySelectorAll('div[style*="cursor: pointer"] button, button[title*="Open NSE Chart"]'));
                if (rowButtons.length > 0) {
                    rowButtons[0].click();
                    return 'CLICKED_ROW_CHART_BTN';
                }
                return 'NO_ROW_CHART_BTN';
            })()
            """
            res_row_click = await send("Runtime.evaluate", {"expression": click_row_chart})
            print("Row Chart Click result:", res_row_click.get("result", {}).get("value"))
            await asyncio.sleep(2.0)

            # 7. Capture screenshot of the modal opened from the signal row
            ss4 = await send("Page.captureScreenshot", {"format": "png"})
            path4 = os.path.join(SCREENSHOT_DIR, "chrome_verified_modal_from_signal_row.png")
            with open(path4, "wb") as f:
                f.write(base64.b64decode(ss4["data"]))
            print("4. Saved Modal from row click:", path4)

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except:
            proc.kill()

if __name__ == "__main__":
    asyncio.run(test_global_toast_and_nse_chart())
