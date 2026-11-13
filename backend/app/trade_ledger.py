"""Immutable Trade Signal Ledger & Historical Storage Engine for Algo Robot.
Ensures zero deletion of past signals. Every signal ever generated is preserved
with strategy versioning, exact indicator parameters, MFE/MAE excursion tracking,
and multi-timeframe date range filtering.
"""

from __future__ import annotations

import os
import json
import logging
import threading
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional, Tuple

logger = logging.getLogger("trade_ledger")
IST = timezone(timedelta(hours=5, minutes=30))

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
LEDGER_FILE = os.path.join(DATA_DIR, "trade_signals_ledger.json")


class TradeLedger:
    """Manages immutable persistence and multi-criteria audit retrieval of trade signals."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._ledger: Dict[str, Dict[str, Any]] = {}
        self._ensure_storage()
        self._load_ledger()

    def _ensure_storage(self) -> None:
        os.makedirs(DATA_DIR, exist_ok=True)
        if not os.path.exists(LEDGER_FILE):
            with open(LEDGER_FILE, "w", encoding="utf-8") as f:
                json.dump({}, f, indent=2)

    def _load_ledger(self) -> None:
        try:
            with open(LEDGER_FILE, "r", encoding="utf-8") as f:
                self._ledger = json.load(f)
                logger.info("Loaded %d immutable records from trade ledger.", len(self._ledger))
        except Exception as e:
            logger.debug("Failed loading trade ledger: %s", e)
            self._ledger = {}

    def _save_ledger(self) -> None:
        try:
            tmp_path = f"{LEDGER_FILE}.tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(self._ledger, f, indent=2)
            os.replace(tmp_path, LEDGER_FILE)
        except Exception as e:
            logger.error("Failed persisting trade ledger: %s", e)

    def record_signal(self, signal: Dict[str, Any]) -> Dict[str, Any]:
        """Record or update a signal in the ledger with excursion tracking and version metadata.
        Never deletes past signals!
        """
        with self._lock:
            sig_id = signal["id"]
            now_dt = datetime.now(IST)
            issued_dt_str = signal.get("issued_at") or now_dt.strftime("%d-%b-%Y %I:%M:%S %p IST")

            # Extract or parse date for fast range filtering
            try:
                date_str = now_dt.strftime("%Y-%m-%d")
                if "issued_at" in signal and signal["issued_at"]:
                    # e.g. "13-Nov-2026 04:30:00 PM IST"
                    parts = signal["issued_at"].split()[0]
                    parsed_dt = datetime.strptime(parts, "%d-%b-%Y")
                    date_str = parsed_dt.strftime("%Y-%m-%d")
            except Exception:
                date_str = now_dt.strftime("%Y-%m-%d")

            entry = float(signal.get("entry_price") or signal.get("current_price") or 100.0)
            sig_type = signal.get("type", "BUY")

            # Check existing record for MFE/MAE tracking
            existing = self._ledger.get(sig_id, {})
            current_price = float(signal.get("current_price") or entry)

            # Calculate MFE (Max Favorable Excursion) & MAE (Max Adverse Excursion)
            prev_mfe = float(existing.get("mfe_pct", 0.0))
            prev_mae = float(existing.get("mae_pct", 0.0))

            if sig_type == "BUY":
                curr_gain = ((current_price - entry) / entry) * 100.0
                mfe_pct = round(max(prev_mfe, max(0.0, curr_gain)), 2)
                mae_pct = round(min(prev_mae, min(0.0, curr_gain)), 2)
            else:  # SELL
                curr_gain = ((entry - current_price) / entry) * 100.0
                mfe_pct = round(max(prev_mfe, max(0.0, curr_gain)), 2)
                mae_pct = round(min(prev_mae, min(0.0, curr_gain)), 2)

            # Determine final P&L if closed
            status = signal.get("status", existing.get("status", "ACTIVE"))
            exit_price = signal.get("exit_price") or existing.get("exit_price")
            pnl_pct = signal.get("pnl_percent") or existing.get("pnl_percent")
            outcome_time = signal.get("outcome_time") or existing.get("outcome_time")

            pnl_points = 0.0
            if exit_price:
                pnl_points = round(exit_price - entry if sig_type == "BUY" else entry - exit_price, 2)

            is_closed = status in ("TARGET_1_HIT", "TARGET_2_HIT", "STOP_LOSS_HIT", "EXPIRED")
            is_archived = signal.get("is_archived", existing.get("is_archived", is_closed and (now_dt - now_dt.replace(hour=0, minute=0)).total_seconds() > 86400))

            record = {
                **existing,
                **signal,
                "id": sig_id,
                "date": date_str,
                "strategy_version": signal.get("strategy_version") or existing.get("strategy_version", "1.0.0"),
                "strategy_parameters": signal.get("strategy_parameters") or existing.get("strategy_parameters", {
                    "timeframe": signal.get("timeframe", "15m"),
                    "indicator_reason": signal.get("indicator_reason", ""),
                    "strength": signal.get("strength", "STRONG BUY")
                }),
                "entry_price": entry,
                "stop_loss": float(signal.get("stop_loss", 0.0)),
                "target_1": float(signal.get("target_1", 0.0)),
                "target_2": float(signal.get("target_2", 0.0)),
                "status": status,
                "exit_price": exit_price,
                "pnl_points": pnl_points,
                "pnl_percent": pnl_pct,
                "mfe_pct": mfe_pct,
                "mae_pct": mae_pct,
                "outcome_time": outcome_time,
                "is_closed": is_closed,
                "is_archived": is_archived,
                "recorded_at": existing.get("recorded_at") or now_dt.isoformat()
            }

            self._ledger[sig_id] = record
            self._save_ledger()
            return record

    def sync_signals(self, signals: List[Dict[str, Any]]) -> None:
        """Batch record a list of signals into the immutable ledger."""
        with self._lock:
            for s in signals:
                sig_id = s.get("id")
                if not sig_id:
                    continue
                if sig_id not in self._ledger:
                    self.record_signal(s)
                else:
                    # Update lifecycle if status changed
                    curr_status = s.get("status")
                    if curr_status and curr_status != self._ledger[sig_id].get("status"):
                        self.record_signal(s)

    def query_ledger(
        self,
        view: str = "ACTIVE",  # "ACTIVE" (Default), "ALL", "ARCHIVED"
        date_range: str = "today",  # "today", "yesterday", "this_week", "this_month", "custom", "all"
        start_date: Optional[str] = None,  # YYYY-MM-DD
        end_date: Optional[str] = None,    # YYYY-MM-DD
        strategy_id: Optional[str] = None,
        instrument_type: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None
    ) -> Dict[str, Any]:
        """Query historical signals ledger with date range, view modes, and outcome filters."""
        with self._lock:
            all_records = list(self._ledger.values())

        now_ist = datetime.now(IST)
        today_str = now_ist.strftime("%Y-%m-%d")
        yesterday_str = (now_ist - timedelta(days=1)).strftime("%Y-%m-%d")
        week_start_str = (now_ist - timedelta(days=now_ist.weekday())).strftime("%Y-%m-%d")
        month_start_str = now_ist.strftime("%Y-%m-01")

        filtered: List[Dict[str, Any]] = []

        view_upper = view.upper()
        strat_filter = strategy_id if (strategy_id and strategy_id.lower() != "all") else None
        inst_filter = instrument_type.upper() if (instrument_type and instrument_type.upper() != "ALL") else None
        status_filter = status.upper() if (status and status.upper() != "ALL") else None
        search_term = search.strip().lower() if (search and search.strip()) else None

        for rec in all_records:
            rec_status = rec.get("status", "ACTIVE")
            is_closed = rec.get("is_closed", rec_status != "ACTIVE")
            is_archived = rec.get("is_archived", False)

            # View Filter:
            # - ACTIVE: Only open, non-closed signals (Clean Default Interface!)
            # - ARCHIVED: Only archived signals
            # - ALL: Complete historical audit trail
            if view_upper == "ACTIVE" and is_closed:
                continue
            elif view_upper == "ARCHIVED" and not is_archived:
                continue

            # Date Range Filter
            rec_date = rec.get("date", today_str)
            if date_range == "today" and rec_date != today_str:
                # If viewing active signals, keep active ones open regardless of creation date
                if view_upper != "ACTIVE":
                    continue
            elif date_range == "yesterday" and rec_date != yesterday_str:
                continue
            elif date_range == "this_week" and rec_date < week_start_str:
                continue
            elif date_range == "this_month" and rec_date < month_start_str:
                continue
            elif date_range == "custom":
                if start_date and rec_date < start_date:
                    continue
                if end_date and rec_date > end_date:
                    continue

            # Strategy Filter
            if strat_filter and rec.get("strategy_id") != strat_filter:
                continue

            # Instrument Filter
            if inst_filter and rec.get("instrument_type") != inst_filter:
                continue

            # Status Filter
            if status_filter and rec_status != status_filter:
                continue

            # Search Filter
            if search_term:
                sym = rec.get("symbol", "").lower()
                cname = rec.get("company_name", "").lower()
                csym = rec.get("contract_symbol", "").lower()
                strat_name = rec.get("strategy_name", "").lower()
                if search_term not in sym and search_term not in cname and search_term not in csym and search_term not in strat_name:
                    continue

            filtered.append(rec)

        # Sort newest first
        filtered.sort(key=lambda r: r.get("timestamp_ms", 0), reverse=True)

        # Compute Ledger Analytics
        total_ledger = len(all_records)
        active_count = sum(1 for r in all_records if not r.get("is_closed", False))
        closed_count = sum(1 for r in all_records if r.get("is_closed", False))
        target_hits = sum(1 for r in all_records if r.get("status") in ("TARGET_1_HIT", "TARGET_2_HIT"))
        sl_hits = sum(1 for r in all_records if r.get("status") == "STOP_LOSS_HIT")
        win_rate = round((target_hits / max(1, target_hits + sl_hits)) * 100.0, 1)

        return {
            "status": "success",
            "view": view_upper,
            "date_range": date_range,
            "total_ledger_records": total_ledger,
            "filtered_count": len(filtered),
            "active_count": active_count,
            "closed_count": closed_count,
            "archived_count": sum(1 for r in all_records if r.get("is_archived", False)),
            "win_rate_pct": win_rate,
            "target_hits": target_hits,
            "stop_loss_hits": sl_hits,
            "signals": filtered
        }


# Singleton Instance
trade_ledger = TradeLedger()
