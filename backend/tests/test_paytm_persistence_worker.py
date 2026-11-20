import time
import pytest
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.db.models import HistoricalCandle, MarketQuote, Instrument
from app.market_data.batch_persistence_worker import BatchPersistenceWorker, batch_persistence_worker
from app.market_data.api_router import get_paytm_persistence_metrics, trigger_paytm_persistence_flush


def test_enqueue_candle_deduplication():
    """Verify enqueuing duplicate candles keeps only the latest update per bar."""
    worker = BatchPersistenceWorker(flush_interval_sec=10.0)
    now_dt = datetime(2026, 11, 20, 10, 0, 0, tzinfo=timezone.utc)

    # Enqueue first candle
    c1 = {
        "exchange": "NSE",
        "symbol": "RELIANCE",
        "timeframe": "5m",
        "timestamp": now_dt,
        "open": 2500.0,
        "high": 2510.0,
        "low": 2495.0,
        "close": 2505.0,
        "volume": 1000.0,
    }
    worker.enqueue_candle(c1)
    assert len(worker._pending_candles) == 1

    # Enqueue duplicate timestamp with updated close and volume
    c2 = {
        "exchange": "NSE",
        "symbol": "RELIANCE",
        "timeframe": "5m",
        "timestamp": now_dt,
        "open": 2500.0,
        "high": 2515.0,
        "low": 2495.0,
        "close": 2512.0,
        "volume": 2500.0,
    }
    worker.enqueue_candle(c2)
    assert len(worker._pending_candles) == 1

    key = ("NSE", "RELIANCE", "5m", now_dt.isoformat())
    assert worker._pending_candles[key]["close"] == 2512.0
    assert worker._pending_candles[key]["volume"] == 2500.0


def test_enqueue_quote_deduplication():
    """Verify enqueuing quote snapshots collapses to the latest quote per instrument."""
    worker = BatchPersistenceWorker(flush_interval_sec=10.0)

    q1 = {"exchange": "NSE", "symbol": "TCS", "ltp": 4100.0, "volume": 100}
    q2 = {"exchange": "NSE", "symbol": "TCS", "ltp": 4105.5, "volume": 250}
    worker.enqueue_quote(q1)
    worker.enqueue_quote(q2)

    assert len(worker._pending_quotes) == 1
    assert worker._pending_quotes["NSE_TCS"]["ltp"] == 4105.5
    assert worker._pending_quotes["NSE_TCS"]["volume"] == 250


def test_batch_flush_candles():
    """Verify flushing candles writes and updates HistoricalCandle records in DB."""
    worker = BatchPersistenceWorker()
    db: Session = SessionLocal()

    try:
        ts1 = datetime(2026, 11, 20, 11, 0, 0, tzinfo=timezone.utc)
        ts2 = datetime(2026, 11, 20, 11, 5, 0, tzinfo=timezone.utc)

        worker.enqueue_candle({
            "exchange": "NSE",
            "symbol": "INFY",
            "timeframe": "5m",
            "timestamp": ts1,
            "open": 1850.0,
            "high": 1860.0,
            "low": 1845.0,
            "close": 1855.0,
            "volume": 5000.0
        })
        worker.enqueue_candle({
            "exchange": "NSE",
            "symbol": "INFY",
            "timeframe": "5m",
            "timestamp": ts2,
            "open": 1855.0,
            "high": 1865.0,
            "low": 1850.0,
            "close": 1862.0,
            "volume": 6000.0
        })

        res = worker.flush(db=db)
        assert res["candles_flushed"] == 2

        # Verify DB query
        candles = db.query(HistoricalCandle).filter(
            HistoricalCandle.symbol == "INFY",
            HistoricalCandle.timeframe == "5m"
        ).all()
        assert len(candles) >= 2
    finally:
        db.close()


def test_batch_flush_quotes():
    """Verify flushing dirty quotes updates MarketQuote rows in DB without locking."""
    worker = BatchPersistenceWorker()
    db: Session = SessionLocal()

    try:
        # Find an existing instrument to update quote for
        inst = db.query(Instrument).filter(Instrument.exchange_symbol == "RELIANCE").first()
        if not inst:
            pytest.skip("RELIANCE instrument not found in DB")

        worker.enqueue_quote({
            "exchange": "NSE",
            "symbol": "RELIANCE",
            "ltp": 2555.50,
            "change": 15.50,
            "percent_change": 0.61,
            "volume": 1250000,
            "open": 2540.0,
            "high": 2560.0,
            "low": 2535.0,
            "previous_close": 2540.0
        })

        res = worker.flush(db=db)
        assert res["quotes_flushed"] >= 1

        mq = db.query(MarketQuote).filter(MarketQuote.instrument_id == inst.id).first()
        if mq:
            assert mq.ltp == 2555.50
    finally:
        db.close()


def test_worker_lifecycle():
    """Verify background worker daemon starts, processes items, and stops cleanly."""
    worker = BatchPersistenceWorker(flush_interval_sec=0.2)
    worker.start()
    assert worker._is_running is True

    worker.enqueue_candle({
        "exchange": "NSE",
        "symbol": "SBIN",
        "timeframe": "15m",
        "timestamp": datetime(2026, 11, 20, 12, 0, 0, tzinfo=timezone.utc),
        "open": 820.0,
        "high": 825.0,
        "low": 818.0,
        "close": 822.0,
        "volume": 10000.0
    })

    # Give background thread time to flush
    for _ in range(20):
        if worker.get_metrics()["flush_cycles_completed"] >= 1:
            break
        time.sleep(0.1)

    metrics = worker.get_metrics()
    assert metrics["flush_cycles_completed"] >= 1

    worker.stop(wait=True)
    assert worker._is_running is False


def test_persistence_api_endpoints():
    """Verify FastAPI router endpoints for persistence worker metrics and manual flush."""
    metrics_res = get_paytm_persistence_metrics()
    assert metrics_res["status"] == "success"
    assert "metrics" in metrics_res
    assert "status" in metrics_res["metrics"]

    db = SessionLocal()
    try:
        flush_res = trigger_paytm_persistence_flush(db=db)
        assert flush_res["status"] == "success"
        assert "result" in flush_res
    finally:
        db.close()
