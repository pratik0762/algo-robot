import asyncio
import base64
import json
import os
import subprocess
import time
import urllib.request
import websockets

ARTIFACT_DIR = r"C:\Users\prtik\.gemini\antigravity\brain\a3bb74d3-8f77-42ca-b724-69ed032fbcc5"
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(CHROME_PATH):
    CHROME_PATH = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

async def capture_coforge_modal():
    port = 9296
    user_data = os.path.join(os.environ.get("TEMP", r"C:\tmp"), "chrome_coforge_profile2")
    os.makedirs(user_data, exist_ok=True)
    
    cmd = [
        CHROME_PATH,
        f"--remote-debugging-port={port}",
        "--headless=new",
        "--disable-gpu",
        f"--user-data-dir={user_data}",
        "--window-size=1920,1080",
        "about:blank"
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(3.0)
    
    try:
        req = urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list")
        tabs = json.loads(req.read().decode())
        ws_url = next(t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page")
        
        async with websockets.connect(ws_url, max_size=50_000_000) as ws:
            msg_id = 1
            
            async def send(method, params=None):
                nonlocal msg_id
                cid = msg_id
                msg_id += 1
                await ws.send(json.dumps({"id": cid, "method": method, "params": params or {}}))
                while True:
                    resp = json.loads(await ws.recv())
                    if resp.get("id") == cid:
                        return resp.get("result", {})
            
            await send("Page.enable")
            await send("Page.navigate", {"url": "http://localhost:3000/signals"})
            await asyncio.sleep(4.0)
            
            # Select button by title attribute
            click_js = """
            (() => {
                const btn = document.querySelector('button[title*="COFORGE"]') || document.querySelector('button[title*="LONG"]');
                if (btn) {
                    btn.click();
                    return { clicked: true, title: btn.getAttribute('title') };
                }
                return { clicked: false };
            })()
            """
            click_res = await send("Runtime.evaluate", {"expression": click_js, "returnByValue": True})
            print("Click result:", click_res)
            
            await asyncio.sleep(3.0)
            
            ss_res = await send("Page.captureScreenshot", {"format": "png"})
            png_bytes = base64.b64decode(ss_res["data"])
            
            out_file = os.path.join(ARTIFACT_DIR, "chart_modal_coforge_long.png")
            with open(out_file, "wb") as f:
                f.write(png_bytes)
            print(f"Modal screenshot saved: {out_file} ({len(png_bytes):,} bytes)")
            
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

if __name__ == "__main__":
    asyncio.run(capture_coforge_modal())
