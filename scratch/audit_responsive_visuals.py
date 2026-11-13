import asyncio
import base64
import json
import os
import subprocess
import time
import urllib.request
import websockets

SCREENSHOT_DIR = r"C:\Users\prtik\.gemini\antigravity\brain\a3bb74d3-8f77-42ca-b724-69ed032fbcc5\audit_screenshots"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

ROUTES = [
    ("home", "http://localhost:3000/"),
    ("signals", "http://localhost:3000/signals"),
    ("chart", "http://localhost:3000/chart"),
    ("indices", "http://localhost:3000/indices"),
    ("fii_dii", "http://localhost:3000/fii-dii"),
    ("deals", "http://localhost:3000/deals"),
    ("week52", "http://localhost:3000/52-week"),
    ("news", "http://localhost:3000/news"),
    ("company", "http://localhost:3000/company/RELIANCE")
]

VIEWPORTS = [
    ("desktop_1920x1080", 1920, 1080, False),
    ("desktop_1440x900", 1440, 900, False),
    ("laptop_1024x768", 1024, 768, False),
    ("tablet_768x1024", 768, 1024, True),
    ("tablet_834x1194", 834, 1194, True),
    ("mobile_430x932", 430, 932, True),
    ("mobile_390x844", 390, 844, True),
    ("mobile_360x800", 360, 800, True),
    ("mobile_320x740", 320, 740, True)
]

AUDIT_JS = """
(() => {
    const results = {
        hasHorizontalOverflow: false,
        docScrollWidth: document.documentElement.scrollWidth,
        windowWidth: window.innerWidth,
        overflowingElements: [],
        smallTouchTargets: [],
        doubleScrollbars: [],
        clippedTexts: [],
        consoleErrors: []
    };

    results.hasHorizontalOverflow = document.documentElement.scrollWidth > (window.innerWidth + 1);

    // Find all elements sticking out past viewport
    const allEls = document.querySelectorAll('*');
    for (const el of allEls) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            if (rect.right > (window.innerWidth + 2) && !el.closest('table') && !el.closest('pre') && !el.closest('code') && !el.closest('.overflow-x-auto') && !el.closest('.overflow-x-scroll')) {
                const tag = el.tagName.toLowerCase();
                const cls = (el.className && typeof el.className === 'string') ? el.className.slice(0, 50) : '';
                results.overflowingElements.push({
                    tag: tag,
                    className: cls,
                    right: Math.round(rect.right),
                    windowWidth: window.innerWidth,
                    text: (el.innerText || '').slice(0, 30).trim()
                });
            }
        }

        // Check for double scrollbars (nested vertical scrollbars with substantial scrollHeight)
        const computed = window.getComputedStyle(el);
        if ((computed.overflowY === 'auto' || computed.overflowY === 'scroll') && el !== document.documentElement && el !== document.body) {
            if (el.scrollHeight > el.clientHeight + 10 && el.clientHeight > 100) {
                results.doubleScrollbars.push({
                    tag: el.tagName.toLowerCase(),
                    className: (el.className && typeof el.className === 'string') ? el.className.slice(0, 50) : '',
                    scrollHeight: el.scrollHeight,
                    clientHeight: el.clientHeight
                });
            }
        }

        // On mobile/tablet, check button touch target sizes
        if (window.innerWidth <= 834 && (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button')) {
            if (rect.width > 0 && rect.height > 0 && (rect.width < 32 || rect.height < 32)) {
                results.smallTouchTargets.push({
                    tag: el.tagName.toLowerCase(),
                    text: (el.innerText || el.getAttribute('aria-label') || '').slice(0, 25).trim(),
                    w: Math.round(rect.width),
                    h: Math.round(rect.height)
                });
            }
        }
    }

    // Limit sample sizes
    results.overflowingElements = results.overflowingElements.slice(0, 8);
    results.doubleScrollbars = results.doubleScrollbars.slice(0, 5);
    results.smallTouchTargets = results.smallTouchTargets.slice(0, 8);

    return results;
})()
"""

async def run_audit():
    user_data = os.path.join(os.environ.get("TEMP", r"C:\tmp"), "chrome_audit_profile")
    os.makedirs(user_data, exist_ok=True)
    cmd = [
        CHROME_PATH,
        "--remote-debugging-port=9288",
        "--headless=new",
        "--disable-gpu",
        f"--user-data-dir={user_data}",
        "--window-size=1920,1080",
        "about:blank"
    ]
    proc = subprocess.Popen(cmd)
    time.sleep(3.0)

    audit_report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S IST"),
        "routes_audited": len(ROUTES),
        "viewports_audited": len(VIEWPORTS),
        "results": []
    }

    try:
        req = urllib.request.urlopen("http://127.0.0.1:9288/json/list")
        tabs = json.loads(req.read().decode())
        ws_url = next(t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page")

        async with websockets.connect(ws_url, max_size=50_000_000) as ws:
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

            # Collect console messages
            console_errors = []
            async def listen_console():
                try:
                    while True:
                        raw = await ws.recv()
                        ev = json.loads(raw)
                        if ev.get("method") == "Runtime.consoleAPICalled":
                            params = ev.get("params", {})
                            if params.get("type") in ("error", "warning"):
                                txt = " ".join([str(a.get("value", a.get("description", ""))) for a in params.get("args", [])])
                                if "Download the React DevTools" not in txt and "Turbopack" not in txt:
                                    console_errors.append(txt[:100])
                except Exception:
                    pass

            for route_name, route_url in ROUTES:
                print(f"\n--- Auditing Route: {route_name} ({route_url}) ---")
                await send("Page.navigate", {"url": route_url})
                await asyncio.sleep(2.5)

                for vp_name, w, h, is_mobile in VIEWPORTS:
                    # Emulate device metrics
                    await send("Emulation.setDeviceMetricsOverride", {
                        "width": w,
                        "height": h,
                        "deviceScaleFactor": 1,
                        "mobile": is_mobile
                    })
                    await asyncio.sleep(0.6)

                    # Run DOM inspection
                    eval_res = await send("Runtime.evaluate", {
                        "expression": AUDIT_JS,
                        "returnByValue": True
                    })
                    dom_data = eval_res.get("result", {}).get("value", {})

                    # Capture baseline screenshot for key viewport tiers
                    screenshot_path = ""
                    if vp_name in ("desktop_1920x1080", "tablet_768x1024", "mobile_390x844"):
                        shot_res = await send("Page.captureScreenshot", {"format": "png"})
                        data_base64 = shot_res.get("data")
                        if data_base64:
                            fname = f"{route_name}_{vp_name}.png"
                            fpath = os.path.join(SCREENSHOT_DIR, fname)
                            with open(fpath, "wb") as f:
                                f.write(base64.b64decode(data_base64))
                            screenshot_path = fpath
                            print(f"  [SCREENSHOT] Saved: {fname}")

                    item = {
                        "route": route_name,
                        "url": route_url,
                        "viewport": vp_name,
                        "width": w,
                        "height": h,
                        "has_horizontal_overflow": dom_data.get("hasHorizontalOverflow", False),
                        "doc_scroll_width": dom_data.get("docScrollWidth", w),
                        "overflowing_elements_count": len(dom_data.get("overflowingElements", [])),
                        "overflowing_elements": dom_data.get("overflowingElements", []),
                        "double_scrollbars_count": len(dom_data.get("doubleScrollbars", [])),
                        "double_scrollbars": dom_data.get("doubleScrollbars", []),
                        "small_touch_targets_count": len(dom_data.get("smallTouchTargets", [])),
                        "small_touch_targets": dom_data.get("smallTouchTargets", []),
                        "screenshot": screenshot_path
                    }
                    audit_report["results"].append(item)

                    status_flag = "WARN" if (item["has_horizontal_overflow"] or item["overflowing_elements_count"] > 0) else "OK"
                    print(f"  [{status_flag}] {vp_name}: ScrollWidth={item['doc_scroll_width']}/{w} | OverflowEls={item['overflowing_elements_count']} | DoubleScrolls={item['double_scrollbars_count']}")

    finally:
        try:
            proc.terminate()
        except Exception:
            pass

    out_json = os.path.join(r"D:\Algo Robot\scratch", "post_fix_audit_report.json")
    with open(out_json, "w") as f:
        json.dump(audit_report, f, indent=2)
    # Also update baseline responsive_audit_report.json
    with open(os.path.join(r"D:\Algo Robot\scratch", "responsive_audit_report.json"), "w") as f:
        json.dump(audit_report, f, indent=2)
    print(f"\nAudit complete! Saved detailed report to: {out_json}")

if __name__ == "__main__":
    asyncio.run(run_audit())

