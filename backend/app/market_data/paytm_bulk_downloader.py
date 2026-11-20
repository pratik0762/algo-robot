"""
ALGO ROBOT — Paytm Money Full-Universe Bulk Historical Downloader
Orchestrates rate-governed, resilient historical OHLCV data ingestion for
over 5,000+ listed companies across NSE and BSE.
Includes checkpointing, pause/resume, dual-repository database persistence, and disk caching.
"""

from __future__ import annotations
import os
import json
import time
import logging
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, date, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.db.models import Company, Instrument, ExchangeCode
from app.market_data.paytm_security_master import paytm_security_master
from app.market_data.historical.paytm_historical_adapter import paytm_historical_adapter
from app.market_data.exchange_calendar import IST

logger = logging.getLogger("algo_robot.market_data.paytm_bulk_downloader")

CHECKPOINT_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data", "paytm_historical_checkpoint.json"
)

# Standard Nifty 50 and FNO symbol sets for quick universe subsets
NIFTY_50_SYMBOLS = {
    "RELIANCE", "TCS", "HDFCBANK", "BHARTIARTL", "ICICIBANK", "INFY", "SBIN", "ITC",
    "HINDUNILVR", "LT", "BAJFINANCE", "MARUTI", "SUNPHARMA", "M&M", "TITAN", "AXISBANK",
    "TATASTEEL", "KOTAKBANK", "NTPC", "POWERGRID", "BAJAJFINSV", "HCLTECH", "ULTRACEMCO",
    "ASIANPAINT", "NESTLEIND", "JSWSTEEL", "ADANIENT", "ADANIPORTS", "COALINDIA", "ONGC",
    "GRASIM", "WIPRO", "CIPLA", "DRREDDY", "APOLLOHOSP", "HEROMOTOCO", "EICHERMOT",
    "DIVISLAB", "BPCL", "BRITANNIA", "SHRIRAMFIN", "HDFCLIFE", "SBILIFE", "BEL",
    "TATACONSUM", "HINDALCO", "SHREECEM", "TRENT", "INDUSINDBK", "TATAMOTORS"
}


class PaytmBulkHistoricalDownloader:
    """
    High-throughput, rate-governed downloader for fetching historical candlestick data
    across the entire 5,000+ Indian stock market universe using Paytm Money Open API.
    """

    _instance: Optional[PaytmBulkHistoricalDownloader] = None
    _lock = threading.RLock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
            return cls._instance

    def __init__(self):
        with self._lock:
            if getattr(self, "_initialized", False):
                return
            self._is_running = False
            self._stop_requested = False
            self._worker_thread: Optional[threading.Thread] = None
            
            # Progress tracking
            self._universe_name = "ALL"
            self._timeframe = "1d"
            self._lookback_days = 365
            self._total_targets = 0
            self._processed_count = 0
            self._success_count = 0
            self._failed_count = 0
            self._total_candles_saved = 0
            self._current_symbol = ""
            self._start_time: float = 0.0
            self._last_processed_time: float = 0.0
            self._rate_per_sec: float = 0.0
            self._completed_keys: Set[str] = set()
            self._failed_keys: Dict[str, str] = {}
            
            self._load_checkpoint()
            self._initialized = True

    def _load_checkpoint(self) -> None:
        """Loads persistent progress checkpoint from disk."""
        if os.path.exists(CHECKPOINT_FILE):
            try:
                with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._completed_keys = set(data.get("completed_keys", []))
                    self._failed_keys = data.get("failed_keys", {})
                    self._total_candles_saved = data.get("total_candles_saved", 0)
            except Exception as e:
                logger.warning("Could not read historical checkpoint file: %s", e)

    def _save_checkpoint(self) -> None:
        """Flushes persistent progress checkpoint to disk atomically."""
        try:
            os.makedirs(os.path.dirname(CHECKPOINT_FILE), exist_ok=True)
            payload = {
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "completed_count": len(self._completed_keys),
                "completed_keys": list(self._completed_keys),
                "failed_keys": self._failed_keys,
                "total_candles_saved": self._total_candles_saved,
            }
            tmp_path = f"{CHECKPOINT_FILE}.tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
            os.replace(tmp_path, CHECKPOINT_FILE)
        except Exception as e:
            logger.debug("Could not write historical checkpoint: %s", e)

    def get_universe_targets(
        self,
        universe: str = "ALL",
        db: Optional[Session] = None,
    ) -> List[Dict[str, Any]]:
        """
        Discovers all valid target instruments from the canonical database that map
        to official Paytm Money Security IDs.
        Prioritizes NSE equities; falls back to BSE equities.
        """
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        targets: List[Dict[str, Any]] = []
        try:
            univ_upper = universe.upper().strip()
            # Fetch all instruments in a single bulk query (0.2s) instead of 5,000 queries
            all_instruments = db.query(Instrument).all()
            
            # Group by company_id
            insts_by_comp: Dict[int, List[Instrument]] = {}
            for inst in all_instruments:
                cid = inst.company_id
                if cid not in insts_by_comp:
                    insts_by_comp[cid] = []
                insts_by_comp[cid].append(inst)

            for cid, instruments in insts_by_comp.items():
                # Filter by universe preset if requested
                if univ_upper == "NIFTY50":
                    if not any((i.trading_symbol or i.symbol or "").upper() in NIFTY_50_SYMBOLS for i in instruments):
                        continue

                # Prefer NSE equity, fallback to BSE
                selected_inst = None
                nse_inst = next((i for i in instruments if (i.exchange.value if hasattr(i.exchange, "value") else str(i.exchange)) == "NSE"), None)
                bse_inst = next((i for i in instruments if (i.exchange.value if hasattr(i.exchange, "value") else str(i.exchange)) == "BSE"), None)

                if univ_upper == "NSE":
                    selected_inst = nse_inst
                elif univ_upper == "BSE":
                    selected_inst = bse_inst
                else:
                    selected_inst = nse_inst or bse_inst

                if not selected_inst:
                    continue

                ex = selected_inst.exchange.value if hasattr(selected_inst.exchange, "value") else str(selected_inst.exchange)
                sym = selected_inst.trading_symbol or selected_inst.symbol
                
                # Verify that Paytm security master has this token
                sec_id = paytm_security_master.resolve_paytm_id(ex, sym)
                if sec_id:
                    targets.append({
                        "company_id": cid,
                        "company_name": sym,
                        "symbol": sym,
                        "exchange": ex,
                        "security_id": sec_id,
                        "instrument_id": selected_inst.instrument_id,
                        "target_key": f"{ex}:{sym}",
                    })

            return targets
        finally:
            if close_db:
                db.close()

    def start_batch_download(
        self,
        universe: str = "ALL",
        timeframe: str = "1d",
        lookback_days: int = 365,
        concurrency: int = 4,
        rate_limit_rps: float = 6.0,
        reset_checkpoint: bool = False,
    ) -> Dict[str, Any]:
        """
        Starts the background historical batch download thread.
        Safe against concurrent triggers.
        """
        with self._lock:
            if self._is_running:
                return {
                    "status": "already_running",
                    "message": "A batch historical download job is already active.",
                    "status_summary": self.get_status(),
                }

            if reset_checkpoint:
                self._completed_keys.clear()
                self._failed_keys.clear()
                self._total_candles_saved = 0
                self._save_checkpoint()

            self._universe_name = universe
            self._timeframe = timeframe
            self._lookback_days = lookback_days
            self._is_running = True
            self._stop_requested = False
            self._start_time = time.time()
            self._processed_count = 0
            self._success_count = 0
            self._failed_count = 0

            # Launch background worker thread
            self._worker_thread = threading.Thread(
                target=self._run_download_loop,
                args=(universe, timeframe, lookback_days, concurrency, rate_limit_rps),
                daemon=True,
                name="paytm_bulk_downloader",
            )
            self._worker_thread.start()

            return {
                "status": "started",
                "universe": universe,
                "timeframe": timeframe,
                "lookback_days": lookback_days,
                "concurrency": concurrency,
                "rate_limit_rps": rate_limit_rps,
                "resumed_from_checkpoint": len(self._completed_keys),
            }

    def stop_batch_download(self) -> Dict[str, Any]:
        """Requests graceful termination of active download job."""
        with self._lock:
            if not self._is_running:
                return {"status": "not_running", "message": "No active batch download job."}
            self._stop_requested = True
            return {"status": "stopping", "message": "Graceful stop requested. Finishing current in-flight batch..."}

    def _run_download_loop(
        self,
        universe: str,
        timeframe: str,
        lookback_days: int,
        concurrency: int,
        rate_limit_rps: float,
    ) -> None:
        """Main execution thread iterating over all targets with rate-governed concurrency."""
        logger.info(
            "Starting Paytm Bulk Historical Downloader for universe='%s' (%s, %d days, max %d workers, %.1f rps)",
            universe, timeframe, lookback_days, concurrency, rate_limit_rps
        )
        try:
            targets = self.get_universe_targets(universe)
            self._total_targets = len(targets)
            logger.info("Found %d valid target instruments mapped to Paytm Money.", self._total_targets)

            # Filter out already completed targets if resuming
            pending_targets = [t for t in targets if t["target_key"] not in self._completed_keys]
            logger.info(
                "Pending targets to download: %d (Skipping %d already completed from checkpoint)",
                len(pending_targets),
                len(self._completed_keys)
            )

            to_date = datetime.now(IST).date()
            from_date = to_date - timedelta(days=lookback_days)

            # Inter-request delay to enforce rate limit (seconds per request per pool)
            target_delay = 1.0 / max(1.0, rate_limit_rps)
            last_req_time = 0.0
            req_lock = threading.Lock()
            db_write_lock = threading.Lock()

            def process_target(t: Dict[str, Any]) -> Tuple[str, bool, int, str]:
                nonlocal last_req_time
                if self._stop_requested:
                    return t["target_key"], False, 0, "STOPPED"

                # Rate pacing
                with req_lock:
                    now = time.time()
                    elapsed = now - last_req_time
                    if elapsed < target_delay:
                        time.sleep(target_delay - elapsed)
                    last_req_time = time.time()

                if self._stop_requested:
                    return t["target_key"], False, 0, "STOPPED"

                sym = t["symbol"]
                ex = t["exchange"]
                target_key = t["target_key"]

                try:
                    with db_write_lock:
                        if self._stop_requested:
                            return target_key, False, 0, "STOPPED"
                        candles = paytm_historical_adapter.fetch_candles(
                            symbol=sym,
                            exchange=ex,
                            timeframe=timeframe,
                            from_date=from_date,
                            to_date=to_date,
                            limit=lookback_days + 50,
                            persist=True,
                        )
                    count = len(candles) if candles else 0
                    return target_key, True, count, "OK"
                except Exception as err:
                    err_str = str(err)
                    logger.debug("Failed candle fetch for %s: %s", target_key, err_str)
                    return target_key, False, 0, err_str

            # Process in thread pool with bounded concurrency
            batch_size = max(10, concurrency * 2)
            for i in range(0, len(pending_targets), batch_size):
                if self._stop_requested:
                    logger.info("Bulk historical download stopped by user request.")
                    break

                batch = pending_targets[i : i + batch_size]
                with ThreadPoolExecutor(max_workers=concurrency) as executor:
                    futures = {executor.submit(process_target, t): t for t in batch}
                    for future in as_completed(futures):
                        target_key, success, count, msg = future.result()
                        self._processed_count += 1
                        self._current_symbol = target_key

                        if success:
                            self._success_count += 1
                            self._completed_keys.add(target_key)
                            self._total_candles_saved += count
                            self._failed_keys.pop(target_key, None)
                        else:
                            self._failed_count += 1
                            if msg != "STOPPED":
                                self._failed_keys[target_key] = msg

                        # Periodically save checkpoint every 25 items
                        if self._processed_count % 25 == 0:
                            self._save_checkpoint()

                # Calculate progress speed
                now = time.time()
                elapsed = now - self._start_time
                if elapsed > 0:
                    self._rate_per_sec = round(self._processed_count / elapsed, 2)

                logger.info(
                    "Paytm Historical Progress: [%d/%d] (%.1f%%) | Success: %d, Failed: %d, Candles: %d | Speed: %.1f req/s",
                    len(self._completed_keys),
                    self._total_targets,
                    (len(self._completed_keys) / max(1, self._total_targets) * 100.0),
                    self._success_count,
                    self._failed_count,
                    self._total_candles_saved,
                    self._rate_per_sec,
                )

            # Final checkpoint save
            self._save_checkpoint()
            logger.info(
                "Paytm Bulk Historical Download finished: %d completed, %d failed. Total candles in DB: %d",
                len(self._completed_keys),
                len(self._failed_keys),
                self._total_candles_saved,
            )
        except Exception as e:
            logger.error("Fatal error in bulk historical downloader loop: %s", e)
        finally:
            self._is_running = False
            self._stop_requested = False

    def get_status(self) -> Dict[str, Any]:
        """Returns live telemetry, speed, completion percentage, and ETA."""
        with self._lock:
            completed_total = len(self._completed_keys)
            total = max(1, self._total_targets) if self._total_targets > 0 else 5179
            pct = round((completed_total / total) * 100.0, 2)

            now = time.time()
            elapsed = max(0.1, now - self._start_time) if self._is_running else 0.0
            rate = round(self._processed_count / elapsed, 2) if (self._is_running and elapsed > 0) else self._rate_per_sec
            
            remaining_items = max(0, total - completed_total)
            eta_seconds = round(remaining_items / max(0.1, rate)) if (self._is_running and rate > 0) else 0

            return {
                "is_running": self._is_running,
                "universe": self._universe_name,
                "timeframe": self._timeframe,
                "lookback_days": self._lookback_days,
                "total_targets": total,
                "completed_total": completed_total,
                "pending_targets": remaining_items,
                "processed_this_session": self._processed_count,
                "success_this_session": self._success_count,
                "failed_this_session": self._failed_count,
                "total_candles_saved": self._total_candles_saved,
                "current_symbol": self._current_symbol,
                "percentage_complete": min(100.0, pct),
                "rate_per_second": rate,
                "eta_seconds": eta_seconds,
                "eta_formatted": str(timedelta(seconds=int(eta_seconds))) if eta_seconds > 0 else "00:00:00",
                "checkpoint_file": CHECKPOINT_FILE,
            }


paytm_bulk_downloader = PaytmBulkHistoricalDownloader()
