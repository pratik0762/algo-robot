"""
ALGO ROBOT — Batch Database Persistence & Deduplication Worker
Asynchronously batches and deduplicates real-time tick snapshots and completed
multi-timeframe candles into SQLite / PostgreSQL without blocking market data feeds.
"""

import time
import logging
import threading
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional, Tuple, Set

from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.session import SessionLocal, engine
from app.db.models import HistoricalCandle, MarketCandle, MarketQuote, Instrument, QualityStatus, DataAuthenticityStatus

logger = logging.getLogger("algo_robot.market_data.persistence")


class BatchPersistenceWorker:
    """
    High-throughput asynchronous persistence worker with multi-level deduplication.
    Prevents database write lock contention during high-frequency live market trading.
    """

    def __init__(self, flush_interval_sec: float = 2.0, max_batch_size: int = 250):
        self.flush_interval_sec = flush_interval_sec
        self.max_batch_size = max_batch_size

        # In-memory deduplication buffers
        self._pending_candles: Dict[Tuple[str, str, str, str], Dict[str, Any]] = {}
        self._pending_quotes: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()

        # Lifecycle control
        self._is_running = False
        self._worker_thread: Optional[threading.Thread] = None

        # Telemetry & performance metrics
        self._total_candles_flushed = 0
        self._total_quotes_flushed = 0
        self._flush_cycles = 0
        self._last_flush_duration_ms = 0.0
        self._last_flush_time = 0.0
        self._error_count = 0

    def start(self) -> None:
        """Starts the background worker daemon thread."""
        with self._lock:
            if self._is_running:
                return
            self._is_running = True
            self._worker_thread = threading.Thread(
                target=self._run_loop,
                name="AlgoRobot-BatchPersistenceWorker",
                daemon=True
            )
            self._worker_thread.start()
            logger.info("BatchPersistenceWorker started (interval: %.1fs, max_batch: %d)",
                        self.flush_interval_sec, self.max_batch_size)

    def stop(self, wait: bool = True) -> None:
        """Gracefully halts the background loop and flushes remaining buffers."""
        with self._lock:
            self._is_running = False

        if wait and self._worker_thread and self._worker_thread.is_alive():
            self._worker_thread.join(timeout=3.0)

        # Final synchronous flush of all remaining items
        try:
            self.flush()
        except Exception as e:
            logger.warning("Error during final persistence flush: %s", e)
        logger.info("BatchPersistenceWorker stopped.")

    def enqueue_candle(self, candle: Dict[str, Any]) -> None:
        """Enqueues a closed candlestick bar for batch persistence with deduplication."""
        if not candle or "symbol" not in candle:
            return

        exchange = str(candle.get("exchange", "NSE")).upper()
        symbol = str(candle["symbol"]).upper()
        tf = str(candle.get("timeframe", "1m")).lower()

        raw_ts = candle.get("timestamp")
        if isinstance(raw_ts, datetime):
            ts_str = raw_ts.isoformat()
            ts_dt = raw_ts
        elif isinstance(raw_ts, (int, float)):
            ts_dt = datetime.fromtimestamp(raw_ts, tz=timezone.utc)
            ts_str = ts_dt.isoformat()
        else:
            ts_str = str(raw_ts)
            ts_dt = datetime.now(timezone.utc)

        dedup_key = (exchange, symbol, tf, ts_str)
        normalized_candle = {
            "exchange": exchange,
            "symbol": symbol,
            "timeframe": tf,
            "timestamp": ts_dt,
            "open": float(candle.get("open", 0.0)),
            "high": float(candle.get("high", 0.0)),
            "low": float(candle.get("low", 0.0)),
            "close": float(candle.get("close", 0.0)),
            "volume": float(candle.get("volume", 0.0)),
            "turnover": float(candle.get("turnover", 0.0)),
            "trades": int(candle.get("trades", 0)),
            "vwap": float(candle.get("vwap", 0.0)) if candle.get("vwap") else None,
            "is_adjusted": bool(candle.get("is_adjusted", False)),
            "data_status": QualityStatus.VALID,
            "source": str(candle.get("source", "PAYTM_MONEY")),
        }

        with self._lock:
            self._pending_candles[dedup_key] = normalized_candle

    def enqueue_candles_batch(self, candles: List[Dict[str, Any]]) -> None:
        """Enqueues multiple closed candlesticks in a single call."""
        for c in candles:
            self.enqueue_candle(c)

    def enqueue_quote(self, quote: Dict[str, Any]) -> None:
        """Enqueues a real-time quote snapshot with deduplication by instrument key."""
        if not quote or "symbol" not in quote:
            return

        exchange = str(quote.get("exchange", "NSE")).upper()
        symbol = str(quote["symbol"]).upper()
        inst_key = f"{exchange}_{symbol}"

        with self._lock:
            self._pending_quotes[inst_key] = quote

    def flush(self, db: Optional[Session] = None) -> Dict[str, int]:
        """
        Synchronously flushes all pending candles and quotes using dialect-aware bulk upsert.
        """
        start_time = time.perf_counter()

        # Pop current items under lock
        with self._lock:
            if not self._pending_candles and not self._pending_quotes:
                return {"candles_flushed": 0, "quotes_flushed": 0}

            candles_to_flush = list(self._pending_candles.values())
            quotes_to_flush = dict(self._pending_quotes)
            self._pending_candles.clear()
            self._pending_quotes.clear()

        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        candles_count = 0
        quotes_count = 0

        try:
            is_sqlite = engine.dialect.name == "sqlite"
            is_postgres = engine.dialect.name == "postgresql"

            # 1. Flush Candles
            if candles_to_flush:
                if is_sqlite:
                    stmt = sqlite_insert(HistoricalCandle).values(candles_to_flush)
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["exchange", "symbol", "timeframe", "timestamp", "is_adjusted"],
                        set_={
                            "open": stmt.excluded.open,
                            "high": stmt.excluded.high,
                            "low": stmt.excluded.low,
                            "close": stmt.excluded.close,
                            "volume": stmt.excluded.volume,
                            "turnover": stmt.excluded.turnover,
                            "trades": stmt.excluded.trades,
                            "data_status": stmt.excluded.data_status,
                            "source": stmt.excluded.source,
                        }
                    )
                    db.execute(stmt)
                elif is_postgres:
                    stmt = pg_insert(HistoricalCandle).values(candles_to_flush)
                    stmt = stmt.on_conflict_do_update(
                        constraint="uq_hist_candle_bar",
                        set_={
                            "open": stmt.excluded.open,
                            "high": stmt.excluded.high,
                            "low": stmt.excluded.low,
                            "close": stmt.excluded.close,
                            "volume": stmt.excluded.volume,
                            "turnover": stmt.excluded.turnover,
                            "trades": stmt.excluded.trades,
                            "data_status": stmt.excluded.data_status,
                            "source": stmt.excluded.source,
                        }
                    )
                    db.execute(stmt)
                else:
                    # Fallback standard merge
                    for cdata in candles_to_flush:
                        existing = db.query(HistoricalCandle).filter(
                            HistoricalCandle.exchange == cdata["exchange"],
                            HistoricalCandle.symbol == cdata["symbol"],
                            HistoricalCandle.timeframe == cdata["timeframe"],
                            HistoricalCandle.timestamp == cdata["timestamp"],
                            HistoricalCandle.is_adjusted == cdata["is_adjusted"]
                        ).first()
                        if existing:
                            for k, v in cdata.items():
                                setattr(existing, k, v)
                        else:
                            db.add(HistoricalCandle(**cdata))

                candles_count = len(candles_to_flush)

            # 2. Flush Quotes
            if quotes_to_flush:
                # Efficient single bulk lookup of Instrument IDs
                inst_keys = list(quotes_to_flush.keys())
                instruments = db.query(Instrument.id, Instrument.instrument_id).filter(
                    Instrument.instrument_id.in_(inst_keys)
                ).all()
                inst_id_map = {inst.instrument_id: inst.id for inst in instruments}

                quote_rows: List[Dict[str, Any]] = []
                for inst_key, q in quotes_to_flush.items():
                    db_inst_id = inst_id_map.get(inst_key)
                    if not db_inst_id:
                        continue

                    quote_rows.append({
                        "instrument_id": db_inst_id,
                        "ltp": float(q.get("ltp", 0.0)),
                        "change": float(q.get("change", 0.0)),
                        "percent_change": float(q.get("percent_change", 0.0)),
                        "open": float(q.get("open", 0.0)),
                        "high": float(q.get("high", 0.0)),
                        "low": float(q.get("low", 0.0)),
                        "previous_close": float(q.get("previous_close", 0.0)),
                        "volume": int(q.get("volume", 0)),
                        "turnover": float(q.get("turnover", 0.0)),
                        "bid": float(q.get("bid", 0.0)),
                        "ask": float(q.get("ask", 0.0)),
                        "bid_qty": int(q.get("bid_qty", 0)),
                        "ask_qty": int(q.get("ask_qty", 0)),
                        "last_trade_qty": int(q.get("last_trade_qty", 0)),
                        "avg_trade_price": float(q.get("avg_trade_price", 0.0)),
                        "upper_circuit": float(q.get("upper_circuit", 0.0)),
                        "lower_circuit": float(q.get("lower_circuit", 0.0)),
                        "high_52w": float(q.get("high_52w", 0.0)),
                        "low_52w": float(q.get("low_52w", 0.0)),
                        "data_status": DataAuthenticityStatus.LIVE,
                        "is_delayed": False,
                        "freshness_age_ms": float(q.get("freshness_age_ms", 0.0)),
                        "timestamp": float(q.get("timestamp", time.time())),
                        "updated_at": datetime.now(timezone.utc)
                    })

                if quote_rows:
                    if is_sqlite:
                        stmt = sqlite_insert(MarketQuote).values(quote_rows)
                        stmt = stmt.on_conflict_do_update(
                            index_elements=["instrument_id"],
                            set_={
                                "ltp": stmt.excluded.ltp,
                                "change": stmt.excluded.change,
                                "percent_change": stmt.excluded.percent_change,
                                "open": stmt.excluded.open,
                                "high": stmt.excluded.high,
                                "low": stmt.excluded.low,
                                "volume": stmt.excluded.volume,
                                "bid": stmt.excluded.bid,
                                "ask": stmt.excluded.ask,
                                "bid_qty": stmt.excluded.bid_qty,
                                "ask_qty": stmt.excluded.ask_qty,
                                "timestamp": stmt.excluded.timestamp,
                                "updated_at": stmt.excluded.updated_at,
                            }
                        )
                        db.execute(stmt)
                    elif is_postgres:
                        stmt = pg_insert(MarketQuote).values(quote_rows)
                        stmt = stmt.on_conflict_do_update(
                            index_elements=["instrument_id"],
                            set_={
                                "ltp": stmt.excluded.ltp,
                                "change": stmt.excluded.change,
                                "percent_change": stmt.excluded.percent_change,
                                "open": stmt.excluded.open,
                                "high": stmt.excluded.high,
                                "low": stmt.excluded.low,
                                "volume": stmt.excluded.volume,
                                "bid": stmt.excluded.bid,
                                "ask": stmt.excluded.ask,
                                "bid_qty": stmt.excluded.bid_qty,
                                "ask_qty": stmt.excluded.ask_qty,
                                "timestamp": stmt.excluded.timestamp,
                                "updated_at": stmt.excluded.updated_at,
                            }
                        )
                        db.execute(stmt)
                    else:
                        for qrow in quote_rows:
                            existing = db.query(MarketQuote).filter(
                                MarketQuote.instrument_id == qrow["instrument_id"]
                            ).first()
                            if existing:
                                for k, v in qrow.items():
                                    setattr(existing, k, v)
                            else:
                                db.add(MarketQuote(**qrow))

                    quotes_count = len(quote_rows)

            db.commit()

            duration_ms = (time.perf_counter() - start_time) * 1000.0
            self._total_candles_flushed += candles_count
            self._total_quotes_flushed += quotes_count
            self._flush_cycles += 1
            self._last_flush_duration_ms = round(duration_ms, 2)
            self._last_flush_time = time.time()

            if candles_count > 0 or quotes_count > 0:
                logger.debug("Flushed %d candles and %d quotes in %.2fms",
                             candles_count, quotes_count, duration_ms)

            return {
                "candles_flushed": candles_count,
                "quotes_flushed": quotes_count,
                "duration_ms": self._last_flush_duration_ms
            }

        except Exception as e:
            db.rollback()
            self._error_count += 1
            logger.error("Error during batch persistence flush: %s", e)
            # Re-queue on failure so data isn't lost
            with self._lock:
                for c in candles_to_flush:
                    key = (c["exchange"], c["symbol"], c["timeframe"], c["timestamp"].isoformat())
                    if key not in self._pending_candles:
                        self._pending_candles[key] = c
                for k, v in quotes_to_flush.items():
                    if k not in self._pending_quotes:
                        self._pending_quotes[k] = v
            raise e
        finally:
            if close_db:
                db.close()

    def _run_loop(self) -> None:
        """Internal daemon worker loop."""
        while self._is_running:
            try:
                time.sleep(self.flush_interval_sec)
                # Check if buffer size triggers flush
                with self._lock:
                    pending_total = len(self._pending_candles) + len(self._pending_quotes)

                if pending_total > 0:
                    self.flush()
            except Exception as e:
                logger.error("Unexpected error in BatchPersistenceWorker loop: %s", e)
                time.sleep(1.0)

    def get_metrics(self) -> Dict[str, Any]:
        """Returns live observability telemetry and performance metrics."""
        with self._lock:
            pending_candles = len(self._pending_candles)
            pending_quotes = len(self._pending_quotes)

        return {
            "status": "RUNNING" if self._is_running else "STOPPED",
            "pending_candles_count": pending_candles,
            "pending_quotes_count": pending_quotes,
            "total_candles_flushed": self._total_candles_flushed,
            "total_quotes_flushed": self._total_quotes_flushed,
            "flush_cycles_completed": self._flush_cycles,
            "last_flush_duration_ms": self._last_flush_duration_ms,
            "last_flush_timestamp": self._last_flush_time,
            "error_count": self._error_count,
            "flush_interval_sec": self.flush_interval_sec,
            "max_batch_size": self.max_batch_size,
        }


# Global singleton instance
batch_persistence_worker = BatchPersistenceWorker()
