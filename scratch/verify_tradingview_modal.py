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

async def test_tradingview_modal():
    user_data = os.path.join(os.environ.get("TEMP", r"C:\tmp"), "chrome_dev_tv_modal")
    os.makedirs(user_data, exist_ok=True)
    cmd = [
        CHROME_PATH,
        "--remote-debugging-port=9250",
        "--headless=new",
        "--disable-gpu",
        f"--user-data-dir={user_data}",
        "--window-size=1540,980",
        "http://localhost:3000/signals"
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(3.5)
    try:
        req = urllib.request.urlopen("http://127.0.0.1:9250/json/list")
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
            await asyncio.sleep(4.0)

            # 1. Search for COFORGE or click COFORGE's chart button
            find_coforge_script = """
            (() => {
                const searchInput = document.querySelector('input[placeholder*="Search symbol"]');
                if (searchInput) {
                    searchInput.value = 'COFORGE';
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    return 'SEARCHED_COFORGE';
                }
                return 'NO_SEARCH_INPUT';
            })()
            """
            search_res = await send("Runtime.evaluate", {"expression": find_coforge_script})
            print("Search result:", search_res.get("result", {}).get("value"))
            await asyncio.sleep(1.5)

            # Click the NSE Chart button on COFORGE signal
            click_coforge_chart = """
            (() => {
                const chartBtn = document.querySelector('button[title*="COFORGE"]');
                if (chartBtn) {
                    chartBtn.click();
                    return 'CLICKED_COFORGE_CHART';
                }
                // Fallback to first chart button
                const allChartBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('NSE Chart'));
                if (allChartBtns.length > 0) {
                    allChartBtns[0].click();
                    return 'CLICKED_FIRST_CHART_BTN';
                }
                return 'NO_CHART_BTN';
            })()
            """
            click_res = await send("Runtime.evaluate", {"expression": click_coforge_chart})
            print("Click result:", click_res.get("result", {}).get("value"))
            await asyncio.sleep(2.5)

            # Capture screenshot of COFORGE TradingView Chart Modal with Long Position Overlay
            ss1 = await send("Page.captureScreenshot", {"format": "png"})
            path1 = os.path.join(SCREENSHOT_DIR, "chrome_verified_coforge_tradingview_chart_modal.png")
            with open(path1, "wb") as f:
                f.write(base64.b64decode(ss1["data"]))
            print("1. Saved COFORGE TradingView Chart Modal:", path1)

            # Close the modal
            await send("Runtime.evaluate", {"expression": """(() => {
                const closeBtn = document.querySelector('button[title="Close Chart"]');
                if (closeBtn) closeBtn.click();
            })()"""})
            await asyncio.sleep(1.5)

            # Filter by SELL Only to test a SHORT position chart
            await send("Runtime.evaluate", {"expression": """(() => {
                const searchInput = document.querySelector('input[placeholder*="Search symbol"]');
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
                const buttons = Array.from(document.querySelectorAll('button'));
                const sellBtn = buttons.find(b => b.textContent.trim() === 'SELL Only');
                if (sellBtn) sellBtn.click();
            })()"""})
            await asyncio.sleep(1.5)

            # Click first SELL signal chart button
            await send("Runtime.evaluate", {"expression": """(() => {
                const chartBtns = Array.from(document.querySelectorAll('button[title*="SHORT"]'));
                if (chartBtns.length > 0) chartBtns[0].click();
            })()"""})
            await asyncio.sleep(2.5)

            # Capture screenshot of SHORT position TradingView Chart Modal
            ss2 = await send("Page.captureScreenshot", {"format": "png"})
            path2 = os.path.join(SCREENSHOT_DIR, "chrome_verified_short_tradingview_chart_modal.png")
            with open(path2, "wb") as f:
                f.write(base64.b64decode(ss2["data"]))
            print("2. Saved SHORT TradingView Chart Modal:", path2)

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except:
            proc.kill()

if __name__ == "__main__":
    asyncio.run(test_tradingview_modal())
