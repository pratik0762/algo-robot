"""
ALGO ROBOT — Central Live Quote Snapshot & Telemetry Service
Caches real-time quote snapshots for all active instruments, calculates
daily changes, 52W breakouts, bid/ask depth, and freshness age.
"""

from __future__ import annotations
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set
from sqlalchemy.orm import Session

from app.db.models import MarketQuote, Instrument, DataAuthenticityStatus
from app.db.session import SessionLocal
from app.market_data.exchange_calendar import exchange_calendar
from app.market_data.base_adapter import NormalizedTick

logger = logging.getLogger("algo_robot.market_data.live_quote")


class LiveQuoteService:
    """In-memory low-latency snapshot cache for equity quotes across NSE and BSE."""

    def __init__(self):
        self._lock = threading.RLock()
        self._quotes: Dict[str, Dict[str, Any]] = {} # key: instrument_id (e.g. "NSE_RELIANCE")
        self._last_db_sync: float = time.time()

    def process_tick(self, tick: NormalizedTick, db: Optional[Session] = None) -> Dict[str, Any]:
        """Ingests a normalized tick and updates the memory snapshot and optional DB quote."""
        with self._lock:
            inst_key = f"{tick.exchange.upper()}_{tick.symbol.upper()}"
            now = time.time()
            freshness_age_ms = max(0.0, (now - tick.timestamp) * 1000.0)

            # Determine authenticity status
            is_open = exchange_calendar.is_trading_session_open()
            if not is_open:
                status = DataAuthenticityStatus.EOD
            elif freshness_age_ms > 10000.0:
                status = DataAuthenticityStatus.STALE
            else:
                status = DataAuthenticityStatus.LIVE

            existing = self._quotes.get(inst_key)
            prev_close = existing.get("previous_close", tick.close) if existing else tick.close
            change = round(tick.ltp - prev_close, 2)
            pct_change = round((change / prev_close) * 100.0, 2) if prev_close > 0 else 0.0

            high_52w = max(existing.get("high_52w", 0.0), tick.high, tick.ltp) if existing else tick.high
            low_52w = min(existing.get("low_52w", 9999999.0), tick.low, tick.ltp) if existing else tick.low

            snapshot = {
                "instrument_id": inst_key,
                "symbol": tick.symbol.upper(),
                "exchange": tick.exchange.upper(),
                "ltp": tick.ltp,
                "change": change,
                "percent_change": pct_change,
                "open": tick.open,
                "high": tick.high,
                "low": tick.low,
                "previous_close": prev_close,
                "volume": tick.volume,
                "bid": tick.bid,
                "ask": tick.ask,
                "bid_qty": tick.bid_qty,
                "ask_qty": tick.ask_qty,
                "last_trade_qty": 0,
                "avg_price": round((tick.high + tick.low + tick.ltp) / 3.0, 2),
                "high_52w": high_52w,
                "low_52w": low_52w,
                "data_status": status.value,
                "freshness_age_ms": round(freshness_age_ms, 1),
                "timestamp": tick.timestamp,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            self._quotes[inst_key] = snapshot

            # Periodically sync to DB (every 5 seconds)
            if now - self._last_db_sync >= 5.0 and db:
                self._sync_dirty_quotes_to_db(db)
                self._last_db_sync = now

            return snapshot

    def get_quote(self, instrument_key: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._quotes.get(instrument_key.upper())

    def get_quotes_batch(self, instrument_keys: List[str]) -> Dict[str, Dict[str, Any]]:
        with self._lock:
            result = {}
            for k in instrument_keys:
                key_upper = k.upper()
                if key_upper in self._quotes:
                    result[key_upper] = self._quotes[key_upper]
            return result

    def get_all_quotes(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._quotes.values())

    def hydrate_initial_quotes(self, db: Optional[Session] = None) -> None:
        """Pre-warms memory cache from DB market_quotes table on system startup."""
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            quotes = db.query(MarketQuote).all()
            with self._lock:
                for q in quotes:
                    inst = q.instrument
                    if not inst:
                        continue
                    key = inst.instrument_id
                    self._quotes[key] = {
                        "instrument_id": key,
                        "symbol": inst.exchange_symbol,
                        "exchange": inst.exchange.value if hasattr(inst.exchange, "value") else str(inst.exchange),
                        "ltp": q.ltp,
                        "change": q.change,
                        "percent_change": q.percent_change,
                        "open": q.open,
                        "high": q.high,
                        "low": q.low,
                        "previous_close": q.previous_close,
                        "volume": q.volume,
                        "bid": q.bid,
                        "ask": q.ask,
                        "bid_qty": q.bid_qty,
                        "ask_qty": q.ask_qty,
                        "high_52w": q.high_52w,
                        "low_52w": q.low_52w,
                        "data_status": q.data_status.value if hasattr(q.data_status, "value") else str(q.data_status),
                        "freshness_age_ms": q.freshness_age_ms,
                        "timestamp": q.timestamp,
                    }
            logger.info("LiveQuoteService hydrated %d quote snapshots from DB.", len(quotes))
        except Exception as e:
            logger.warning("LiveQuoteService pre-warm deferred: %s", e)
        finally:
            if close_db:
                db.close()

    def _sync_dirty_quotes_to_db(self, db: Session) -> None:
        """Persists memory snapshots back to DB."""
        try:
            for inst_id, qdata in list(self._quotes.items()):
                inst = db.query(Instrument).filter(Instrument.instrument_id == inst_id).first()
                if not inst:
                    continue
                quote = db.query(MarketQuote).filter(MarketQuote.instrument_id == inst.id).first()
                if quote:
                    quote.ltp = qdata["ltp"]
                    quote.change = qdata["change"]
                    quote.percent_change = qdata["percent_change"]
                    quote.high = qdata["high"]
                    quote.low = qdata["low"]
                    quote.volume = qdata["volume"]
                    quote.timestamp = qdata["timestamp"]
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error("Error syncing quotes to DB: %s", e)


live_quote_service = LiveQuoteService()
