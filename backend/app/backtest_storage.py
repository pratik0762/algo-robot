"""Persistent Storage and Retrieval Engine for Backtest Runs in Algo Robot.
Saves backtest executions, performance metrics, equity curves, and trade logs
to disk so traders can review, compare, and audit past simulations without re-running.
"""

from __future__ import annotations

import os
import json
import logging
import threading
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional

logger = logging.getLogger("backtest_storage")
IST = timezone(timedelta(hours=5, minutes=30))

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
BACKTEST_HISTORY_FILE = os.path.join(DATA_DIR, "backtest_results_ledger.json")


class BacktestStorage:
    """Thread-safe persistent ledger of historical backtest runs."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._runs: Dict[str, Dict[str, Any]] = {}
        self._ensure_storage()
        self._load_ledger()

    def _ensure_storage(self) -> None:
        os.makedirs(DATA_DIR, exist_ok=True)
        if not os.path.exists(BACKTEST_HISTORY_FILE):
            with open(BACKTEST_HISTORY_FILE, "w", encoding="utf-8") as f:
                json.dump({}, f, indent=2)

    def _load_ledger(self) -> None:
        try:
            with open(BACKTEST_HISTORY_FILE, "r", encoding="utf-8") as f:
                self._runs = json.load(f)
                logger.info("Loaded %d historical backtest records from storage.", len(self._runs))
        except Exception as e:
            logger.debug("Failed loading backtest history: %s", e)
            self._runs = {}

    def _save_ledger(self) -> None:
        try:
            tmp_path = f"{BACKTEST_HISTORY_FILE}.tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(self._runs, f, indent=2)
            os.replace(tmp_path, BACKTEST_HISTORY_FILE)
        except Exception as e:
            logger.error("Failed saving backtest history: %s", e)

    def save_run(self, backtest_result: Dict[str, Any]) -> str:
        """Persists a completed backtest execution and returns its unique ID."""
        with self._lock:
            now_dt = datetime.now(IST)
            ts_ms = int(now_dt.timestamp() * 1000)
            strat_id = backtest_result.get("strategy_id", "strategy")
            inst_type = backtest_result.get("instrument_type", "EQUITY")
            run_id = f"BT-RUN-{strat_id}-{inst_type}-{ts_ms}"

            record = {
                "backtest_id": run_id,
                "timestamp_ms": ts_ms,
                "created_at": now_dt.strftime("%d-%b-%Y %I:%M:%S %p IST"),
                "strategy_id": strat_id,
                "strategy_name": backtest_result.get("strategy_name", strat_id),
                "timeframe": backtest_result.get("timeframe", "15m"),
                "instrument_type": inst_type,
                "symbols_tested": backtest_result.get("symbols_tested", []),
                "initial_capital": backtest_result.get("initial_capital", 500000.0),
                "final_capital": backtest_result.get("final_capital", 500000.0),
                "metrics": backtest_result.get("metrics", {}),
                "equity_curve": backtest_result.get("equity_curve", []),
                "monthly_breakdown": backtest_result.get("monthly_breakdown", []),
                "trades": backtest_result.get("trades", []),
                "total_trades": len(backtest_result.get("trades", []))
            }

            self._runs[run_id] = record
            self._save_ledger()
            return run_id

    def list_runs(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Returns summary metadata of historical backtest runs, newest first."""
        with self._lock:
            runs_list = list(self._runs.values())

        # Sort newest first
        runs_list.sort(key=lambda r: r.get("timestamp_ms", 0), reverse=True)

        # Return lightweight summary objects for fast UI lists
        summaries = []
        for r in runs_list[:limit]:
            m = r.get("metrics", {})
            summaries.append({
                "backtest_id": r["backtest_id"],
                "created_at": r["created_at"],
                "strategy_id": r["strategy_id"],
                "strategy_name": r["strategy_name"],
                "timeframe": r["timeframe"],
                "instrument_type": r["instrument_type"],
                "symbols_count": len(r.get("symbols_tested", [])),
                "symbols_preview": r.get("symbols_tested", [])[:4],
                "total_trades": r.get("total_trades", len(r.get("trades", []))),
                "net_profit": m.get("net_profit", 0.0),
                "net_return_pct": m.get("net_return_pct", 0.0),
                "win_rate_pct": m.get("win_rate_pct", 0.0),
                "profit_factor": m.get("profit_factor", 0.0),
                "max_drawdown_pct": m.get("max_drawdown_pct", 0.0)
            })
        return summaries

    def get_run(self, backtest_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves full details, equity curve, and trade log of a specific backtest run."""
        with self._lock:
            return self._runs.get(backtest_id)

    def delete_run(self, backtest_id: str) -> bool:
        """Deletes a single backtest run record."""
        with self._lock:
            if backtest_id in self._runs:
                del self._runs[backtest_id]
                self._save_ledger()
                return True
            return False


# Global Singleton Instance
backtest_storage = BacktestStorage()

