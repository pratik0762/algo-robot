"""Launcher for Nifty 50 Financial Reports FastAPI Backend."""

import sys
import uvicorn

if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

if __name__ == "__main__":
    host = "0.0.0.0"
    port = 8000
    print("=" * 70)
    print("🇮🇳  STARTING NIFTY 50 FINANCIAL REPORTS BACKEND (NSE INDIA)")
    print(f"🔗  API Endpoint : http://{host}:{port}")
    print(f"📚  Swagger Docs : http://{host}:{port}/docs")
    print("=" * 70)
    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=True,
        reload_dirs=["backend"],
        reload_includes=["*.py"],
        reload_excludes=[".venv/*", "frontend/*", "*.json", "*.log"],
        app_dir="backend"
    )
