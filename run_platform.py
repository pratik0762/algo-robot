"""
NIFTY 50 Financial Reports Platform — Unified Launcher
======================================================

Launches:
1. Python FastAPI Backend on http://localhost:8000
2. Next.js Web UI on http://localhost:3000
"""

import os
import subprocess
import sys
import time

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    python_exe = os.path.join(root_dir, ".venv", "Scripts", "python.exe")
    frontend_dir = os.path.join(root_dir, "frontend")

    print("=" * 70)
    print("🇮🇳  NIFTY 50 FINANCIAL REPORTS PLATFORM (NSE INDIA)")
    print("=" * 70)
    print("🌐  Frontend UI  : http://localhost:3000")
    print("⚡  FastAPI API  : http://localhost:8000")
    print("📚  Swagger Docs : http://localhost:8000/docs")
    print("=" * 70)

    # 1. Start Python Backend
    print("Starting FastAPI Backend...")
    backend_proc = subprocess.Popen(
        [python_exe, "backend/run_backend.py"],
        cwd=root_dir
    )

    time.sleep(2)

    # 2. Start Next.js Frontend
    print("Starting Next.js Frontend...")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=frontend_dir
    )

    print("\n✓ Both services are running!")
    print("Press Ctrl+C to terminate both servers.\n")

    try:
        backend_proc.wait()
        frontend_proc.wait()
    except KeyboardInterrupt:
        print("\nShutting down servers...")
        backend_proc.terminate()
        frontend_proc.terminate()

if __name__ == "__main__":
    main()
