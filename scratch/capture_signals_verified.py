"""Captures verified screenshot of /signals page using Chrome CDP."""

import os
import subprocess
import json
import time
import urllib.request

ARTIFACT_DIR = r"C:\Users\prtik\.gemini\antigravity\brain\a3bb74d3-8f77-42ca-b724-69ed032fbcc5"
os.makedirs(ARTIFACT_DIR, exist_ok=True)

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(CHROME_PATH):
    CHROME_PATH = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

def capture_screenshot():
    print("Launching Chrome headless to capture verified /signals page...")
    out_png = os.path.join(ARTIFACT_DIR, "signals_verified_live_engine.png")
    
    cmd = [
        CHROME_PATH,
        "--headless=new",
        "--disable-gpu",
        "--window-size=1920,1080",
        f"--screenshot={out_png}",
        "http://localhost:3000/signals"
    ]
    try:
        subprocess.run(cmd, check=True, timeout=15)
        if os.path.exists(out_png):
            print(f"  [SUCCESS] Captured verified screenshot at: {out_png}")
            print(f"  Size: {os.path.getsize(out_png):,} bytes")
        else:
            print("  [WARN] Screenshot file not found.")
    except Exception as e:
        print(f"  [ERR] Chrome capture error: {e}")

if __name__ == "__main__":
    capture_screenshot()

