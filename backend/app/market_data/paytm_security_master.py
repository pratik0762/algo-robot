"""
ALGO ROBOT — Paytm Money Security Master Ingestion & Canonical Mapping Manager
Downloads, parses, indexes, and binds all 109,000+ Paytm Money securities to
Algo Robot's canonical 5,607 companies and 8,109 instruments across NSE and BSE.
"""

from __future__ import annotations
import csv
import logging
import os
import re
import threading
import time
from typing import Any, Dict, List, Optional, Tuple
import urllib.request
import urllib.error
from sqlalchemy.orm import Session

from app.db.models import Instrument, Company, ExchangeCode, BoardType
from app.db.session import SessionLocal

logger = logging.getLogger("algo_robot.market_data.paytm_security_master")

PAYTM_SECURITY_MASTER_URL = "https://developer.paytmmoney.com/data/v1/scrips/security_master.csv"
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
SECURITY_MASTER_CSV_PATH = os.path.join(DATA_DIR, "paytm_security_master.csv")

# Standard Index mappings to Paytm Money Security IDs
CANONICAL_INDEX_IDS: Dict[str, str] = {
    "NIFTY": "13",
    "NIFTY 50": "13",
    "NIFTY50": "13",
    "NSE:NIFTY": "13",
    "NSE:NIFTY 50": "13",
    "BANKNIFTY": "25",
    "NIFTY BANK": "25",
    "NSE:BANKNIFTY": "25",
    "NSE:NIFTY BANK": "25",
    "FINNIFTY": "27",
    "NIFTY FIN SERVICE": "27",
    "NSE:FINNIFTY": "27",
    "SENSEX": "51",
    "BSE:SENSEX": "51",
    "BSE SENSEX": "51",
    "BANKEX": "69",
    "BSE:BANKEX": "69",
    "NIFTY AUTO": "14",
    "NIFTY PVT BANK": "15",
    "NIFTY 100": "17",
    "NIFTY 200": "18",
    "NIFTY 500": "19",
    "NIFTY MIDCAP 50": "20",
    "NIFTY FMCG": "28",
    "NIFTY IT": "29",
    "NIFTYIT": "29",
    "NIFTY MEDIA": "30",
    "NIFTY METAL": "31",
    "NIFTY PHARMA": "32",
    "NIFTY PSU BANK": "33",
    "NIFTY REALTY": "34",
    "NIFTY MIDCAP 100": "37",
    "NIFTY NEXT 50": "38",
    "NIFTY MID SELECT": "442",
    "NIFTY MIDCAP 150": "1",
    "NIFTY SMALLCAP 250": "3",
    "NIFTY SMLCAP 100": "5",
}


class PaytmSecurityMasterManager:
    """
    Thread-safe manager for Paytm Money's official Security Master CSV.
    Provides sub-millisecond bidirectional mapping between Paytm Security IDs
    and Algo Robot canonical Instrument and Company IDs.
    """

    _instance: Optional[PaytmSecurityMasterManager] = None
    _lock = threading.RLock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
            return cls._instance

    def __init__(self, csv_path: Optional[str] = None):
        with self._lock:
            if getattr(self, "_initialized", False):
                return
            self._csv_path = csv_path or SECURITY_MASTER_CSV_PATH
            self._records_by_id: Dict[str, Dict[str, Any]] = {}
            self._nse_equity: Dict[str, str] = {}               # NSE Symbol -> security_id
            self._bse_equity_by_code: Dict[str, str] = {}       # BSE Scrip Code -> security_id
            self._bse_equity_by_symbol: Dict[str, str] = {}     # BSE Symbol -> security_id
            self._derivatives: Dict[str, str] = {}              # F&O symbol -> security_id
            self._indices: Dict[str, str] = dict(CANONICAL_INDEX_IDS)
            
            # Canonical cross-mapping caches
            self._inst_to_paytm_id: Dict[str, str] = {}         # "NSE_RELIANCE" -> "2885"
            self._paytm_id_to_inst: Dict[str, str] = {}         # "2885" -> "NSE_RELIANCE"
            self._coverage_stats: Dict[str, Any] = {}
            self._is_loaded = False
            self._last_loaded_time: float = 0.0

            # Attempt automatic load if file exists
            if os.path.exists(self._csv_path):
                self.load_security_master()

            self._initialized = True

    def download_security_master(self, force: bool = False, timeout: int = 30) -> str:
        """
        Downloads official security_master.csv from Paytm Money Developer Portal.
        Caches file locally; skips download if file was updated today unless force=True.
        """
        with self._lock:
            os.makedirs(os.path.dirname(self._csv_path), exist_ok=True)
            if not force and os.path.exists(self._csv_path):
                mtime = os.path.getmtime(self._csv_path)
                # If modified within the last 18 hours, reuse existing file
                if time.time() - mtime < 18 * 3600:
                    logger.info("Using cached Paytm security master (%s)", self._csv_path)
                    return self._csv_path

            logger.info("Downloading official Paytm Money security master from %s...", PAYTM_SECURITY_MASTER_URL)
            req = urllib.request.Request(
                PAYTM_SECURITY_MASTER_URL,
                headers={"User-Agent": "AlgoRobot/2.0 (NSE-BSE Market Infrastructure)"},
            )
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    data = resp.read()
                    temp_path = self._csv_path + ".tmp"
                    with open(temp_path, "wb") as f:
                        f.write(data)
                    if os.path.exists(self._csv_path):
                        os.replace(temp_path, self._csv_path)
                    else:
                        os.rename(temp_path, self._csv_path)
                    logger.info("Downloaded Paytm security master: %d bytes saved to %s", len(data), self._csv_path)
            except Exception as e:
                logger.warning("Paytm security master download failed (%s). Checking local fallback...", e)
                if not os.path.exists(self._csv_path):
                    raise RuntimeError(f"Cannot download Paytm security master and no local cache found: {e}")

            return self._csv_path

    def load_security_master(self, force_reload: bool = False) -> int:
        """
        Parses security_master.csv into memory and builds indexed lookups.
        Returns total count of parsed securities.
        """
        with self._lock:
            if self._is_loaded and not force_reload:
                return len(self._records_by_id)

            if not os.path.exists(self._csv_path):
                self.download_security_master()

            logger.info("Indexing Paytm Money security master from %s...", self._csv_path)
            start_t = time.perf_counter()

            records_by_id = {}
            nse_equity = {}
            bse_equity_by_code = {}
            bse_equity_by_symbol = {}
            derivatives = {}
            indices = dict(CANONICAL_INDEX_IDS)

            counts = {
                "total": 0,
                "ES": 0,
                "ETF": 0,
                "I": 0,
                "OPTSTK": 0,
                "OPTIDX": 0,
                "FUTSTK": 0,
                "FUTIDX": 0,
                "NSE": 0,
                "BSE": 0,
            }

            with open(self._csv_path, "r", encoding="utf-8", errors="ignore") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    sec_id = row.get("security_id", "").strip()
                    if not sec_id:
                        continue

                    symbol = row.get("symbol", "").strip()
                    name = row.get("name", "").strip()
                    series = row.get("series", "").strip()
                    inst_type = row.get("instrument_type", "").strip().upper()
                    segment = row.get("segment", "").strip().upper()
                    exchange = row.get("exchange", "").strip().upper()

                    counts["total"] += 1
                    if inst_type in counts:
                        counts[inst_type] += 1
                    if exchange in counts:
                        counts[exchange] += 1

                    record = {
                        "security_id": sec_id,
                        "symbol": symbol,
                        "name": name,
                        "series": series,
                        "tick_size": float(row.get("tick_size") or 0.05),
                        "lot_size": int(row.get("lot_size") or 1),
                        "instrument_type": inst_type,
                        "segment": segment,
                        "exchange": exchange,
                        "upper_limit": float(row.get("upper_limit") or 0.0),
                        "lower_limit": float(row.get("lower_limit") or 0.0),
                        "expiry_date": row.get("expiry_date", "").strip(),
                        "strike_price": float(row.get("strike_price") or 0.0),
                        "freeze_quantity": int(row.get("freeze_quantity") or 0),
                    }
                    records_by_id[sec_id] = record

                    # Indexing by category
                    if inst_type in ("ES", "ETF"):
                        if exchange == "NSE":
                            sym_clean = symbol.upper()
                            nse_equity[sym_clean] = sec_id
                            # Support series stripping
                            if sym_clean.endswith("-EQ"):
                                nse_equity[sym_clean[:-3]] = sec_id
                            elif sym_clean.endswith("-BE"):
                                nse_equity[sym_clean[:-3]] = sec_id
                            elif sym_clean.endswith("-SM"):
                                nse_equity[sym_clean[:-3]] = sec_id
                        elif exchange == "BSE":
                            # In Paytm Money, BSE security_id IS the 6-digit scrip code!
                            bse_equity_by_code[sec_id] = sec_id
                            if symbol:
                                bse_equity_by_symbol[symbol.upper()] = sec_id
                    elif inst_type == "I":
                        indices[name.upper()] = sec_id
                        if symbol:
                            indices[symbol.upper()] = sec_id
                    elif inst_type in ("OPTSTK", "OPTIDX", "FUTSTK", "FUTIDX"):
                        derivatives[symbol.upper()] = sec_id

            self._records_by_id = records_by_id
            self._nse_equity = nse_equity
            self._bse_equity_by_code = bse_equity_by_code
            self._bse_equity_by_symbol = bse_equity_by_symbol
            self._derivatives = derivatives
            self._indices = indices
            self._coverage_stats = {
                "total_securities": counts["total"],
                "equity_shares": counts["ES"],
                "etfs": counts["ETF"],
                "indices": counts["I"],
                "stock_options": counts["OPTSTK"],
                "index_options": counts["OPTIDX"],
                "stock_futures": counts["FUTSTK"],
                "index_futures": counts["FUTIDX"],
                "nse_total": counts["NSE"],
                "bse_total": counts["BSE"],
                "indexed_at": time.time(),
                "duration_seconds": round(time.perf_counter() - start_t, 3),
            }
            self._is_loaded = True
            self._last_loaded_time = time.time()

            logger.info(
                "Indexed %d securities (%d NSE equity, %d BSE equity, %d derivatives, %d indices) in %.3fs",
                counts["total"],
                len(nse_equity),
                len(bse_equity_by_code),
                len(derivatives),
                len(indices),
                self._coverage_stats["duration_seconds"],
            )

            return counts["total"]

    def resolve_paytm_id(self, exchange: str, symbol: str) -> Optional[str]:
        """
        Sub-millisecond resolution of an exchange + symbol or scrip code to Paytm security_id.
        Examples:
          resolve_paytm_id("NSE", "RELIANCE") -> "2885"
          resolve_paytm_id("BSE", "500325") -> "500325"
          resolve_paytm_id("BSE", "RELIANCE") -> "500325"
          resolve_paytm_id("NSE", "NIFTY") -> "13"
          resolve_paytm_id("NSE", "NIFTY 50") -> "13"
        """
        if not self._is_loaded:
            self.load_security_master()

        ex = exchange.upper().strip()
        sym = symbol.upper().strip()

        # 1. Check Index mapping first
        if sym in self._indices:
            return self._indices[sym]
        full_key = f"{ex}:{sym}"
        if full_key in self._indices:
            return self._indices[full_key]

        # 2. Check NSE Equity
        if ex == "NSE":
            if sym in self._nse_equity:
                return self._nse_equity[sym]
            # Strip common suffixes
            for suffix in ("-EQ", "-BE", "-SM", "-ST", "-BZ"):
                if sym.endswith(suffix):
                    base = sym[: -len(suffix)]
                    if base in self._nse_equity:
                        return self._nse_equity[base]

        # 3. Check BSE Equity (6-digit code or Symbol)
        elif ex == "BSE":
            if sym in self._bse_equity_by_code:
                return self._bse_equity_by_code[sym]
            if sym in self._bse_equity_by_symbol:
                return self._bse_equity_by_symbol[sym]

        # 4. Check Derivatives
        if sym in self._derivatives:
            return self._derivatives[sym]

        # 5. Fallback check across full canonical cache
        inst_key = f"{ex}_{sym}"
        if inst_key in self._inst_to_paytm_id:
            return self._inst_to_paytm_id[inst_key]

        return None

    def resolve_canonical(self, security_id: str | int, db: Optional[Session] = None) -> Optional[Dict[str, Any]]:
        """
        Resolves a Paytm Money security_id back to canonical Instrument and Company.
        Used for decoded WebSocket ticks and historical responses.
        """
        sec_id = str(security_id).strip()
        if not self._is_loaded:
            self.load_security_master()

        # Check in-memory reverse cache
        if sec_id in self._paytm_id_to_inst:
            inst_id = self._paytm_id_to_inst[sec_id]
            rec = self._records_by_id.get(sec_id, {})
            return {
                "security_id": sec_id,
                "instrument_id": inst_id,
                "exchange": rec.get("exchange", "NSE"),
                "symbol": rec.get("symbol", ""),
                "name": rec.get("name", ""),
                "lot_size": rec.get("lot_size", 1),
                "tick_size": rec.get("tick_size", 0.05),
                "instrument_type": rec.get("instrument_type", "ES"),
            }

        rec = self._records_by_id.get(sec_id)
        if not rec:
            return None

        # Determine canonical instrument_id from record
        ex = rec.get("exchange", "NSE")
        sym = rec.get("symbol", "") or rec.get("name", "")
        inst_id = f"{ex}_{sym}" if sym else f"{ex}_{sec_id}"

        return {
            "security_id": sec_id,
            "instrument_id": inst_id,
            "exchange": ex,
            "symbol": sym,
            "name": rec.get("name", ""),
            "lot_size": rec.get("lot_size", 1),
            "tick_size": rec.get("tick_size", 0.05),
            "instrument_type": rec.get("instrument_type", "ES"),
        }

    def map_to_canonical_universe(self, db: Optional[Session] = None) -> Dict[str, Any]:
        """
        Cross-references Algo Robot's canonical database universe (5,607 companies & 8,109 instruments)
        against the loaded Paytm Money security master. Builds bidirectional fast lookup caches.
        """
        with self._lock:
            if not self._is_loaded:
                self.load_security_master()

            close_db = False
            if db is None:
                db = SessionLocal()
                close_db = True

            try:
                instruments = db.query(Instrument).all()
                total_db = len(instruments)
                nse_matched = 0
                bse_matched = 0
                unmatched = []

                for inst in instruments:
                    ex = inst.exchange.value if hasattr(inst.exchange, "value") else str(inst.exchange)
                    sym = inst.exchange_symbol.strip()
                    inst_id = inst.instrument_id

                    paytm_id = self.resolve_paytm_id(ex, sym)
                    if paytm_id:
                        self._inst_to_paytm_id[inst_id] = paytm_id
                        self._paytm_id_to_inst[paytm_id] = inst_id
                        if ex == "NSE":
                            nse_matched += 1
                        elif ex == "BSE":
                            bse_matched += 1
                    else:
                        unmatched.append({"instrument_id": inst_id, "exchange": ex, "symbol": sym})

                total_matched = nse_matched + bse_matched
                match_pct = round((total_matched / total_db * 100.0), 2) if total_db > 0 else 0.0

                stats = {
                    "status": "success",
                    "total_db_instruments": total_db,
                    "total_paytm_securities": len(self._records_by_id),
                    "total_matched": total_matched,
                    "nse_matched": nse_matched,
                    "bse_matched": bse_matched,
                    "unmatched_count": len(unmatched),
                    "coverage_percentage": match_pct,
                    "synced_at": time.time(),
                }
                self._coverage_stats.update(stats)
                logger.info(
                    "Paytm Security Master Universe Mapping: %d/%d instruments matched (%.2f%%)",
                    total_matched,
                    total_db,
                    match_pct,
                )
                return stats
            finally:
                if close_db:
                    db.close()

    def get_security_info(self, security_id: str | int) -> Optional[Dict[str, Any]]:
        """Returns detailed security metadata (lot size, tick size, limits, freeze qty)."""
        sec_id = str(security_id).strip()
        if not self._is_loaded:
            self.load_security_master()
        return self._records_by_id.get(sec_id)

    def get_stats(self) -> Dict[str, Any]:
        """Returns live statistics, coverage numbers, and index readiness."""
        with self._lock:
            if not self._is_loaded:
                self.load_security_master()
            return {
                "is_loaded": self._is_loaded,
                "total_securities": len(self._records_by_id),
                "nse_equity_count": len(self._nse_equity),
                "bse_equity_count": len(self._bse_equity_by_code),
                "derivatives_count": len(self._derivatives),
                "indices_count": len(self._indices),
                "mapped_canonical_instruments": len(self._inst_to_paytm_id),
                "coverage_stats": self._coverage_stats,
                "csv_path": self._csv_path,
                "csv_file_exists": os.path.exists(self._csv_path),
            }


paytm_security_master = PaytmSecurityMasterManager()
