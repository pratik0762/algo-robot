"""
ALGO ROBOT — All-India Listed Companies & Market Data Engine Test Suite
Tests:
1. Exchange Calendar, Sessions & Asia/Kolkata Boundaries
2. Multi-Format Symbol & ISIN Resolver
3. Data Quality & Mathematical Invariants Engine
4. 5-Tier Subscription Manager & Token Quota Enforcement
5. Multi-Timeframe Historical Candle Aggregation
6. Live Quote Telemetry & Snapshot Cache
7. REST Endpoints: Universe, Instruments, Quotes, Coverage, and Search
"""

from datetime import datetime, date, time as dt_time, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

from app.db.session import SessionLocal, init_db
from app.db.models import (
    Company,
    Instrument,
    MarketQuote,
    MarketCandle,
    ExchangeCode,
    BoardType,
    MarketCapCategory,
    InstrumentStatus,
    DataAuthenticityStatus,
    SubscriptionTier,
)
from app.market_data.exchange_calendar import exchange_calendar, IST
from app.market_data.symbol_resolver import symbol_resolver
from app.market_data.data_quality_service import data_quality_engine
from app.market_data.subscription_manager import SubscriptionManager
from app.market_data.historical_data_service import historical_data_service
from app.market_data.live_quote_service import live_quote_service
from app.market_data.universe_manager import universe_manager
from app.market_data.base_adapter import NormalizedTick
from app.main import app

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_market_data_universe():
    """Ensure database tables exist and seed universe with dual-listed and SME securities."""
    init_db()
    with SessionLocal() as db:
        universe_manager.sync_universe(
            nse_records=[
                {
                    "exchange": ExchangeCode.NSE,
                    "exchange_symbol": "SMEGROWTH",
                    "trading_symbol": "SMEGROWTH-SM",
                    "legal_name": "SME Growth Enterprise Limited",
                    "isin": "INE999SME011",
                    "series": "SM",
                    "segment": "SME",
                    "board_type": BoardType.SME,
                    "security_type": "EQUITY",
                    "instrument_status": InstrumentStatus.ACTIVE,
                }
            ],
            bse_records=[
                {
                    "exchange": ExchangeCode.BSE,
                    "exchange_symbol": "500325",
                    "trading_symbol": "RELIANCE",
                    "legal_name": "RELIANCE INDUSTRIES LTD",
                    "isin": "INE002A01018", # Same ISIN as NSE Reliance
                    "series": "A",
                    "segment": "EQUITY",
                    "board_type": BoardType.MAINBOARD,
                    "security_type": "EQUITY",
                    "instrument_status": InstrumentStatus.ACTIVE,
                }
            ],
            db=db,
        )
        symbol_resolver.hydrate_cache(db=db)
        live_quote_service.hydrate_initial_quotes(db=db)
    yield


# =========================================================================
# 1. Exchange Calendar & Session Guardian Tests
# =========================================================================

def test_exchange_calendar_sessions_and_holidays():
    """Verify official Indian trading hours, weekend filters, and holiday calendar."""
    # 1. Official 2026 Republic Day holiday
    is_hol, reason = exchange_calendar.is_holiday(date(2026, 1, 26))
    assert is_hol is True
    assert "Republic Day" in reason

    # 2. Weekend detection (2026-02-15 is Sunday)
    is_weekend, w_reason = exchange_calendar.is_holiday(date(2026, 2, 15))
    assert is_weekend is True
    assert "Weekend" in w_reason

    # 3. Normal Tuesday trading day (2026-02-17)
    is_trading, _ = exchange_calendar.is_holiday(date(2026, 2, 17))
    assert is_trading is False

    # 4. Snap to candle boundary (15m bucket)
    test_dt = datetime(2026, 2, 17, 9, 38, 22)
    snapped = exchange_calendar.snap_to_candle_boundary(test_dt, timeframe_minutes=15)
    assert snapped.hour == 9
    assert snapped.minute == 30 # 09:30 - 09:45 bucket


# =========================================================================
# 2. Multi-Format Symbol & ISIN Resolver Tests
# =========================================================================

def test_symbol_resolver_multiformat():
    """Verify resolution across plain symbol, BSE scrip code, ISIN, and qualified keys."""
    # 1. Plain NSE symbol
    res_rel = symbol_resolver.resolve("RELIANCE")
    assert res_rel is not None
    comp, inst = res_rel
    assert "RELIANCE" in comp["legal_name"].upper()
    assert inst["exchange_symbol"] == "RELIANCE"
    assert inst["exchange"] == "NSE"

    # 2. BSE 6-digit Scrip Code
    res_bse = symbol_resolver.resolve("500325")
    assert res_bse is not None
    comp_bse, inst_bse = res_bse
    assert comp_bse["primary_isin"] == "INE002A01018" # Must match same canonical company!
    assert inst_bse["exchange"] == "BSE"
    assert inst_bse["exchange_symbol"] == "500325"

    # 3. Primary ISIN resolution
    res_isin = symbol_resolver.resolve("INE002A01018")
    assert res_isin is not None
    assert res_isin[0]["primary_isin"] == "INE002A01018"

    # 4. SME security resolution
    res_sme = symbol_resolver.resolve("SMEGROWTH")
    assert res_sme is not None
    assert res_sme[1]["board_type"] == "SME"


# =========================================================================
# 3. Data Quality & Invariants Tests
# =========================================================================

def test_data_quality_engine_invariants():
    """Verify mathematical candle invariants and quote sanity checks."""
    # 1. Valid candle passes
    valid, errors = data_quality_engine.validate_candle(
        open_px=100.0, high_px=105.0, low_px=98.0, close_px=102.5, volume=1500
    )
    assert valid is True
    assert len(errors) == 0

    # 2. Inverted range (Low > High) fails
    inv_valid, inv_errors = data_quality_engine.validate_candle(
        open_px=100.0, high_px=95.0, low_px=98.0, close_px=96.0, volume=100
    )
    assert inv_valid is False
    assert any("INVERTED_RANGE" in e for e in inv_errors)

    # 3. Close out of bounds (Close > High) fails
    oob_valid, oob_errors = data_quality_engine.validate_candle(
        open_px=100.0, high_px=105.0, low_px=98.0, close_px=110.0, volume=100
    )
    assert oob_valid is False
    assert any("CLOSE_OUT_OF_BOUNDS" in e for e in oob_errors)

    # 4. Negative volume fails
    neg_valid, neg_errors = data_quality_engine.validate_candle(
        open_px=100.0, high_px=105.0, low_px=98.0, close_px=102.0, volume=-50
    )
    assert neg_valid is False
    assert any("NEGATIVE_VOLUME" in e for e in neg_errors)


# =========================================================================
# 4. Subscription Manager Quota Tests
# =========================================================================

def test_subscription_manager_tiers_and_quota():
    """Verify subscription tier elevation and token quota limits."""
    mgr = SubscriptionManager(max_live_quota=3)

    # Fill quota with ON_DEMAND tokens
    assert mgr.request_subscription("TOKEN_1", SubscriptionTier.ON_DEMAND) is True
    assert mgr.request_subscription("TOKEN_2", SubscriptionTier.ON_DEMAND) is True
    assert mgr.request_subscription("TOKEN_3", SubscriptionTier.ON_DEMAND) is True
    assert mgr.get_subscription_summary()["active_live_count"] == 3

    # Request high-priority WATCHLIST token: triggers LRU eviction of unreferenced ON_DEMAND
    mgr.release_subscription("TOKEN_1")
    assert mgr.request_subscription("TOKEN_WATCHLIST", SubscriptionTier.WATCHLIST) is True
    assert mgr.is_subscribed_live("TOKEN_WATCHLIST") is True


# =========================================================================
# 5. Historical Data Engine & Aggregation Tests
# =========================================================================

def test_historical_data_multi_timeframe():
    """Verify candle persistence and higher-timeframe bar derivation."""
    with SessionLocal() as db:
        inst = db.query(Instrument).filter(Instrument.exchange_symbol == "RELIANCE").first()
        assert inst is not None
        inst_id = inst.id

        # Insert five 1m candles: 09:15 to 09:19
        base_time = datetime(2026, 2, 17, 9, 15, 0, tzinfo=timezone.utc)
        test_candles = [
            {"timestamp": (base_time + timedelta(minutes=i)).isoformat(), "open": 2850.0 + i, "high": 2855.0 + i, "low": 2848.0 + i, "close": 2852.0 + i, "volume": 1000}
            for i in range(5)
        ]
        saved = historical_data_service.save_candles(
            instrument_id=inst_id,
            candles_data=test_candles,
            timeframe="1m",
            db=db,
        )
        assert saved >= 1

        # Query 5m derived candles
        derived_5m = historical_data_service.get_candles(
            instrument_id=inst_id,
            timeframe="5m",
            limit=10,
            db=db,
        )
        assert len(derived_5m) > 0
        first_5m = derived_5m[0]
        assert first_5m["open"] == 2850.0 # First 1m open
        assert first_5m["high"] >= 2855.0
        assert first_5m["volume"] > 0


# =========================================================================
# 6. Live Quote Service Telemetry Tests
# =========================================================================

def test_live_quote_service_snapshots():
    """Verify normalized tick ingestion, percent change calculation, and snapshot retrieval."""
    now_ts = datetime.now(timezone.utc).timestamp()
    tick = NormalizedTick(
        symbol="TCS",
        exchange="NSE",
        instrument_token=11536,
        ltp=3950.0,
        change=45.0,
        percent_change=1.15,
        open=3910.0,
        high=3965.0,
        low=3905.0,
        close=3905.0,
        volume=500000,
        bid=3949.5,
        ask=3950.5,
        bid_qty=100,
        ask_qty=150,
        oi=0,
        timestamp=now_ts,
        feed_source="ZERODHA",
    )

    snapshot = live_quote_service.process_tick(tick)
    assert snapshot["symbol"] == "TCS"
    assert snapshot["ltp"] == 3950.0
    assert snapshot["change"] > 0.0

    retrieved = live_quote_service.get_quote("NSE_TCS")
    assert retrieved is not None
    assert retrieved["ltp"] == 3950.0


# =========================================================================
# 7. REST Endpoints Integration Tests (TestClient)
# =========================================================================

def test_rest_api_universe_endpoints():
    """Verify /api/companies/universe, /api/companies/search, and /api/exchanges."""
    # 1. Search endpoint
    search_res = client.get("/api/companies/search?q=RELIANCE")
    assert search_res.status_code == 200
    search_data = search_res.json()
    assert search_data["status"] == "success"
    assert len(search_data["items"]) >= 1
    assert any("RELIANCE" in item["legal_name"].upper() for item in search_data["items"])

    # 2. Universe pagination endpoint
    univ_res = client.get("/api/companies/universe?page=1&limit=25")
    assert univ_res.status_code == 200
    univ_data = univ_res.json()
    assert univ_data["status"] == "success"
    assert univ_data["total"] >= 1
    assert univ_data["metrics"]["total_listed_companies"] >= 1
    assert univ_data["metrics"]["nse_instruments"] >= 1
    assert univ_data["metrics"]["sme_instruments"] >= 1
    assert len(univ_data["items"]) <= 25

    # 3. SME Filter
    sme_res = client.get("/api/companies/universe?board_type=SME")
    assert sme_res.status_code == 200
    assert any(item["board_type"] == "SME" for item in sme_res.json()["items"])

    # 4. Exchange metadata
    ex_res = client.get("/api/exchanges")
    assert ex_res.status_code == 200
    ex_data = ex_res.json()
    assert "NSE" in [e["exchange"] for e in ex_data["exchanges"]]
    assert "BSE" in [e["exchange"] for e in ex_data["exchanges"]]

    # 5. Resolve endpoint
    resolve_res = client.get("/api/instruments/resolve?q=RELIANCE")
    assert resolve_res.status_code == 200
    assert resolve_res.json()["instrument"]["exchange_symbol"] == "RELIANCE"

    # 6. Data coverage summary
    cov_res = client.get("/api/data-coverage/summary")
    assert cov_res.status_code == 200
    cov_data = cov_res.json()
    assert cov_data["coverage"]["total_companies"] >= 1
    assert "active_live_stream_count" in cov_data["coverage"]
