"""
ALGO ROBOT — Paytm Money Historical Market Data Tests
Validates multi-timeframe candle fetching (1d, 1h, 15m, 5m, 1m),
mathematical invariants, normalization, dual-repository database persistence
(HistoricalCandle & MarketCandle), and REST API endpoints.
"""

from datetime import datetime, date, timedelta, timezone
import pytest
from app.db.session import SessionLocal
from app.db.models import HistoricalCandle, MarketCandle, Instrument
from app.market_data.historical.paytm_historical_adapter import (
    PaytmHistoricalDataAdapter,
    paytm_historical_adapter,
)
from app.market_data.api_router import (
    get_paytm_historical_candles,
    backfill_paytm_historical,
)


@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    yield db
    db.close()


def test_paytm_historical_adapter_initialization():
    """Verify adapter configuration and supported timeframe capabilities."""
    tfs = paytm_historical_adapter.get_supported_timeframes()
    assert "1m" in tfs
    assert "5m" in tfs
    assert "15m" in tfs
    assert "1h" in tfs
    assert "1d" in tfs
    assert paytm_historical_adapter.source_code == "PAYTM_MONEY_HISTORICAL"


def test_fetch_candles_reliance_nse_daily(db_session):
    """Verify daily candle ingestion and mathematical invariants for RELIANCE."""
    candles = paytm_historical_adapter.fetch_candles(
        symbol="RELIANCE",
        exchange="NSE",
        timeframe="1d",
        limit=30,
        persist=True,
        db=db_session,
    )

    assert len(candles) > 0
    bar = candles[-1]
    assert bar["timeframe"] == "1D"
    assert bar["source"] == "PAYTM_MONEY"
    assert "date" in bar
    assert "time" in bar
    assert "datetime" in bar
    assert "timestamp" in bar
    assert "timestamp_epoch" in bar
    
    # Mathematical invariants
    assert bar["high"] >= max(bar["open"], bar["close"])
    assert bar["low"] <= min(bar["open"], bar["close"])
    assert bar["volume"] >= 0
    assert bar["close"] > 1000.0  # Realistic price anchor for RELIANCE


def test_fetch_candles_nifty_index(db_session):
    """Verify benchmark index candle ingestion for NIFTY 50."""
    candles = paytm_historical_adapter.fetch_candles(
        symbol="NIFTY",
        exchange="NSE",
        timeframe="1d",
        limit=15,
        persist=True,
        db=db_session,
    )

    assert len(candles) > 0
    bar = candles[0]
    assert bar["timeframe"] == "1D"
    assert bar["close"] > 20000.0  # NIFTY 50 index benchmark scale


def test_fetch_candles_bse_equity(db_session):
    """Verify BSE equity candle ingestion by 6-digit scrip code."""
    candles = paytm_historical_adapter.fetch_candles(
        symbol="500325",
        exchange="BSE",
        timeframe="1d",
        limit=10,
        persist=True,
        db=db_session,
    )

    assert len(candles) > 0
    bar = candles[-1]
    assert bar["high"] >= bar["low"]
    assert bar["close"] > 0


def test_intraday_timeframe_candles(db_session):
    """Verify intraday (15m) timeframe candle fetching and timestamp formatting."""
    candles = paytm_historical_adapter.fetch_candles(
        symbol="TCS",
        exchange="NSE",
        timeframe="15m",
        limit=20,
        persist=True,
        db=db_session,
    )

    assert len(candles) > 0
    bar = candles[0]
    assert bar["timeframe"] == "15M"
    assert ":" in bar["time"]
    assert bar["close"] > 3000.0  # TCS benchmark price scale


def test_database_persistence_dual_repo(db_session):
    """Verify persistence into both HistoricalCandle and MarketCandle repositories."""
    paytm_historical_adapter.fetch_candles(
        symbol="RELIANCE",
        exchange="NSE",
        timeframe="1d",
        limit=10,
        persist=True,
        db=db_session,
    )

    # 1. Query HistoricalCandle table
    hist_count = (
        db_session.query(HistoricalCandle)
        .filter(
            HistoricalCandle.exchange == "NSE",
            HistoricalCandle.symbol == "RELIANCE",
            HistoricalCandle.timeframe == "1d",
            HistoricalCandle.source == "PAYTM_MONEY",
        )
        .count()
    )
    assert hist_count >= 10

    # 2. Query MarketCandle table
    inst = db_session.query(Instrument).filter(Instrument.exchange_symbol == "RELIANCE").first()
    if inst:
        mc_count = (
            db_session.query(MarketCandle)
            .filter(
                MarketCandle.instrument_id == inst.id,
                MarketCandle.timeframe == "1d",
                MarketCandle.source == "PAYTM_MONEY",
            )
            .count()
        )
        assert mc_count >= 10


def test_api_router_historical_endpoints(db_session):
    """Verify REST API endpoints for fetching and backfilling Paytm historical data."""
    # 1. Candles endpoint
    res = get_paytm_historical_candles(
        symbol="RELIANCE",
        exchange="NSE",
        timeframe="1d",
        limit=25,
        db=db_session,
    )
    assert res["status"] == "success"
    assert res["symbol"] == "RELIANCE"
    assert res["exchange"] == "NSE"
    assert res["count"] > 0
    assert len(res["candles"]) > 0

    # 2. Backfill endpoint
    backfill_res = backfill_paytm_historical(
        symbol="RELIANCE",
        exchange="NSE",
        timeframe="1d",
        days=20,
        db=db_session,
    )
    assert backfill_res["status"] == "success"
    assert backfill_res["candles_count"] > 0
    assert backfill_res["earliest_bar"] is not None
    assert backfill_res["latest_bar"] is not None
