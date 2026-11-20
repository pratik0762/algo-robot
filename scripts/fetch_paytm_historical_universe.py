#!/usr/bin/env python3
"""
ALGO ROBOT — Paytm Money Full-Universe Historical Downloader CLI
Command-line tool to fetch historical OHLCV data for 5,000+ companies from Paytm Money.

Usage:
    python scripts/fetch_paytm_historical_universe.py --universe ALL --timeframe 1d --days 365
    python scripts/fetch_paytm_historical_universe.py --universe NIFTY50 --timeframe 15m --days 30
    python scripts/fetch_paytm_historical_universe.py --universe FNO --concurrency 6 --rate-limit 8
"""

import sys
import os
import time
import argparse
from datetime import timedelta

# Add backend directory to sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.market_data.paytm_bulk_downloader import paytm_bulk_downloader
from app.market_data.paytm_auth import paytm_auth_service


def parse_args():
    parser = argparse.ArgumentParser(
        description="Fetch historical OHLCV candles for 5,000+ Indian companies using Paytm Money Open API."
    )
    parser.add_argument(
        "--universe",
        type=str,
        default="ALL",
        choices=["ALL", "NIFTY50", "NIFTY500", "FNO", "NSE", "BSE"],
        help="Target company universe (default: ALL = 5,179 mapped companies)",
    )
    parser.add_argument(
        "--timeframe",
        type=str,
        default="1d",
        choices=["1m", "3m", "5m", "10m", "15m", "30m", "1h", "1d"],
        help="Candle timeframe resolution (default: 1d)",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=365,
        help="Lookback period in days (default: 365 days)",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=4,
        help="Number of concurrent worker threads (default: 4)",
    )
    parser.add_argument(
        "--rate-limit",
        type=float,
        default=6.0,
        help="Target API requests per second to avoid 429 throttling (default: 6.0)",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Reset previous checkpoint and re-download all targets from scratch",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    print("=" * 78)
    print(" ALGO ROBOT — PAYTM MONEY FULL-UNIVERSE HISTORICAL DATA DOWNLOADER")
    print("=" * 78)

    # 1. Check Auth Status
    auth_status = paytm_auth_service.get_status()
    print(f"[*] Provider:                {auth_status.get('provider')}")
    print(f"[*] API Key Configured:      {auth_status.get('api_key_configured')} ({auth_status.get('api_key_masked')})")
    print(f"[*] API Secret Configured:   {auth_status.get('api_secret_configured')}")
    print(f"[*] Active Session Ready:    {auth_status.get('is_authenticated') or auth_status.get('is_ready_for_session')}")
    print(f"[*] Universe Selection:      {args.universe}")
    print(f"[*] Timeframe:               {args.timeframe}")
    print(f"[*] Lookback Period:         {args.days} days")
    print(f"[*] Concurrency Workers:     {args.concurrency}")
    print(f"[*] Rate Limit Pacing:       {args.rate_limit} req/sec")
    print("=" * 78)

    # 2. Start Downloader
    res = paytm_bulk_downloader.start_batch_download(
        universe=args.universe,
        timeframe=args.timeframe,
        lookback_days=args.days,
        concurrency=args.concurrency,
        rate_limit_rps=args.rate_limit,
        reset_checkpoint=args.reset,
    )
    print(f"[+] Batch Job Started: {res}")
    print("[+] Press Ctrl+C at any time to pause safely. Progress is automatically checkpointed.\n")

    # 3. Live Terminal Monitoring Loop
    try:
        while True:
            status = paytm_bulk_downloader.get_status()
            if not status["is_running"]:
                break

            total = status["total_targets"]
            done = status["completed_total"]
            pct = status["percentage_complete"]
            saved = status["total_candles_saved"]
            curr = status["current_symbol"] or "..."
            rate = status["rate_per_second"]
            eta = status["eta_formatted"]

            # Format status line with in-place overwrite
            sys.stdout.write(
                f"\r\033[K[PROGRESS] [{done:>4}/{total:>4}] ({pct:>5.1f}%) | "
                f"Cur: {curr:<16} | Saved: {saved:>6} bars | Speed: {rate:>4.1f} rps | ETA: {eta}"
            )
            sys.stdout.flush()
            time.sleep(0.5)

    except KeyboardInterrupt:
        print("\n\n[!] Interrupt signal received! Stopping downloader gracefully...")
        paytm_bulk_downloader.stop_batch_download()
        while paytm_bulk_downloader.get_status()["is_running"]:
            time.sleep(0.2)
        print("[+] Downloader safely stopped. You can resume anytime by re-running this script.\n")
        return

    final_status = paytm_bulk_downloader.get_status()
    print("\n\n" + "=" * 78)
    print(" BATCH DOWNLOAD COMPLETE")
    print("=" * 78)
    print(f"[*] Total Completed Targets:  {final_status['completed_total']} / {final_status['total_targets']}")
    print(f"[*] Total Candles in DB:     {final_status['total_candles_saved']}")
    print(f"[*] Checkpoint File:         {final_status['checkpoint_file']}")
    print("=" * 78)


if __name__ == "__main__":
    main()
