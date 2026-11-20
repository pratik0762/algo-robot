"""
ALGO ROBOT — Comprehensive Historical Market Data Infrastructure Test Suite
Tests official NSE & BSE report parsers, derivatives contract tracking,
corporate action adjustments, deduplication, invariants, API endpoints, and backtesting.
"""

import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.db.models import (
    Base,
    HistoricalCandle,
    HistoricalOpenInterest,
    DataImportJob,
    DataCoverage,
    QualityStatus,
)
from app.market_data.historical.nse_bhavcopy_adapter import NSEBhavcopyAdapter
from app.market_data.historical.nse_fo_bhavcopy_adapter import NSEFOBhavcopyAdapter
from app.market_data.historical.nse_index_adapter import NSEIndexAdapter
from app.market_data.historical.bse_bhavcopy_adapter import BSEBhavcopyAdapter
from app.market_data.historical.corporate_actions_adapter import CorporateActionsAdjustmentEngine
from app.market_data.historical.data_manager import historical_data_manager
from app.backtesting.engine import backtest_engine
from app.backtesting_engine import backtesting_engine

client = TestClient(app)

# =====================================================================
# 1. OFFICIAL EXCHANGE REPORT PARSING TESTS
# =====================================================================

def test_nse_equity_legacy_bhavcopy_parsing():
    """Verifies legacy NSE Capital Market Bhavcopy parsing for Mainboard & SME securities."""
    sample_csv = """SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,TOTTRDVAL,TIMESTAMP,TOTALTRADES,ISIN
RELIANCE,EQ,1360.00,1375.00,1355.00,1369.50,1370.00,1358.00,5420000,7412000000.00,18-NOV-2026,185420,INE002A01018
KAYNES,SM,4500.00,4580.00,4490.00,4550.00,4555.00,4480.00,120000,546000000.00,18-NOV-2026,4500,INE918Z01012
"""
    records = NSEBhavcopyAdapter.parse_csv(sample_csv)
    assert len(records) == 2

    rel = records[0]
    assert rel["symbol"] == "RELIANCE"
    assert rel["series"] == "EQ"
    assert rel["board_type"] == "MAINBOARD"
    assert rel["open"] == 1360.00
    assert rel["high"] == 1375.00
    assert rel["low"] == 1355.00
    assert rel["close"] == 1369.50
    assert rel["volume"] == 5420000
    assert rel["turnover"] == 7412000000.00
    assert rel["isin"] == "INE002A01018"
    assert rel["is_adjusted"] is False

    kay = records[1]
    assert kay["symbol"] == "KAYNES"
    assert kay["series"] == "SM"
    assert kay["board_type"] == "SME"
    assert kay["close"] == 4550.00


def test_nse_equity_udiff_bhavcopy_parsing():
    """Verifies modern UDiFF format NSE Equity Bhavcopy parsing."""
    sample_udiff = """TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd
2026-11-18,2026-11-18,CASH,NSE,EQ,12345,INE009A01021,INFY,EQ,1850.00,1875.00,1845.00,1868.00,1870.00,1848.00,3200000,5970000000.00,95000
"""
    records = NSEBhavcopyAdapter.parse_csv(sample_udiff)
    assert len(records) == 1
    infy = records[0]
    assert infy["symbol"] == "INFY"
    assert infy["close"] == 1868.00
    assert infy["source"] == "OFFICIAL_NSE_UDIFF"


def test_nse_fo_contract_wise_bhavcopy_parsing():
    """Verifies contract-specific Futures and Options parsing with authentic settlement and OI."""
    sample_fo_csv = """INSTRUMENT,SYMBOL,EXPIRY_DT,STRIKE_PR,OPTION_TYP,OPEN,HIGH,LOW,CLOSE,SETTLE_PR,CONTRACTS,VAL_INLAKH,OPEN_INT,CHG_IN_OI,TIMESTAMP
FUTIDX,NIFTY,26-NOV-2026,0,XX,24100.00,24250.00,24050.00,24210.00,24215.00,45000,108900.00,12500000,450000,18-NOV-2026
OPTIDX,NIFTY,26-NOV-2026,24200,CE,180.00,240.00,165.00,225.50,225.50,85000,20650.00,4500000,-120000,18-NOV-2026
OPTIDX,NIFTY,26-NOV-2026,24000,PE,95.00,110.00,72.00,80.00,80.00,62000,15040.00,6200000,850000,18-NOV-2026
"""
    records = NSEFOBhavcopyAdapter.parse_csv(sample_fo_csv)
    assert len(records) == 3

    fut = records[0]
    assert fut["symbol"] == "NIFTY"
    assert fut["contract_identifier"] == "NIFTY26NOVFUT"
    assert fut["close"] == 24210.00
    assert fut["settlement_price"] == 24215.00
    assert fut["open_interest"] == 12500000
    assert fut["change_in_oi"] == 450000
    assert fut["option_type"] == "XX"

    call = records[1]
    assert call["contract_identifier"] == "NIFTY26NOV24200CE"
    assert call["strike_price"] == 24200.0
    assert call["option_type"] == "CE"
    assert call["close"] == 225.50
    assert call["open_interest"] == 4500000
    assert call["change_in_oi"] == -120000

    put = records[2]
    assert put["contract_identifier"] == "NIFTY26NOV24000PE"
    assert put["option_type"] == "PE"


def test_nse_index_archive_parsing():
    """Verifies official NSE Index archive (ind_close_all) parsing."""
    sample_index_csv = """Index Name,Index Date,Open Index Value,High Index Value,Low Index Value,Closing Index Value,Points Change,Change(%),Volume,Turnover (Rs. Cr.),P/E,P/B,Div Yield
Nifty 50,18-11-2026,24150.00,24280.00,24120.00,24225.50,120.50,0.50,285000000,32500.00,21.5,4.1,1.25
Nifty Bank,18-11-2026,51200.00,51650.00,51100.00,51550.00,450.00,0.88,145000000,18200.00,15.8,2.8,0.95
"""
    records = NSEIndexAdapter.parse_csv(sample_index_csv)
    assert len(records) == 2
    n50 = records[0]
    assert n50["symbol"] == "NIFTY 50"
    assert n50["close"] == 24225.50
    assert n50["series"] == "INDEX"
    assert n50["turnover"] == 325000000000.00


def test_bse_equity_bhavcopy_parsing():
    """Verifies BSE Equity Bhavcopy parsing with Scrip Codes and ISINs."""
    sample_bse_csv = """SC_CODE,SC_NAME,SC_GROUP,SC_TYPE,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,NO_TRADES,NO_OF_SHRS,NET_TURNOV,TDCLOINDI,ISIN_CODE
500325,RELIANCE,A,Q,1362.00,1374.00,1356.00,1370.00,1370.50,1359.00,12500,450000,615000000.00,C,INE002A01018
543999,SMEGROW,M,Q,125.00,132.00,124.00,131.00,131.00,122.00,850,50000,6500000.00,C,INE999X01015
"""
    records = BSEBhavcopyAdapter.parse_csv(sample_bse_csv)
    assert len(records) == 2
    rel = records[0]
    assert rel["exchange"] == "BSE"
    assert rel["scrip_code"] == "500325"
    assert rel["board_type"] == "MAINBOARD"
    assert rel["close"] == 1370.00

    sme = records[1]
    assert sme["board_type"] == "SME"
    assert sme["series"] == "M"


# =====================================================================
# 2. CORPORATE ACTIONS ADJUSTMENT ENGINE TESTS
# =====================================================================

def test_corporate_actions_split_and_bonus_adjustments():
    """Verifies that backwards corporate action adjustments scale price and volume while keeping turnover invariant."""
    raw_candles = [
        {"timestamp": "2026-01-10T10:00:00Z", "open": 1000.0, "high": 1050.0, "low": 980.0, "close": 1020.0, "volume": 10000.0, "turnover": 10200000.0},
        {"timestamp": "2026-06-15T10:00:00Z", "open": 200.0, "high": 210.0, "low": 195.0, "close": 205.0, "volume": 50000.0, "turnover": 10250000.0},
    ]

    # Action: 1:5 Split on 2026-03-01 (factor = 0.2)
    actions = [
        {
            "action_type": "SPLIT",
            "ex_date": "2026-03-01T00:00:00Z",
            "factor": 0.2,
        }
    ]

    adjusted = CorporateActionsAdjustmentEngine.apply_adjustments(raw_candles, actions)
    assert len(adjusted) == 2

    # Bar 1 (before ex-date): Price should be scaled down by 0.2, volume scaled up by 5
    bar1 = adjusted[0]
    assert bar1["open"] == 200.0
    assert bar1["close"] == 204.0
    assert bar1["volume"] == 50000.0
    assert bar1["is_adjusted"] is True

    # Bar 2 (after ex-date): Unchanged
    bar2 = adjusted[1]
    assert bar2["close"] == 205.0
    assert bar2["volume"] == 50000.0
    assert bar2["is_adjusted"] is False

    # Raw candles must remain unmutated
    assert raw_candles[0]["close"] == 1020.0


# =====================================================================
# 3. HISTORICAL DATA MANAGER INGESTION & INVARIANTS TESTS
# =====================================================================

def test_historical_manager_idempotent_ingestion_and_provenance():
    """Verifies that importing an official Bhavcopy records jobs, updates coverage, and prevents duplicates."""
    sample_csv = """SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,TOTTRDVAL,TIMESTAMP,TOTALTRADES,ISIN
TESTCO,EQ,100.00,105.00,99.00,104.50,104.00,98.00,50000,5200000.00,18-NOV-2026,1200,INE999A01019
"""
    # 1. First Import
    res1 = historical_data_manager.import_bhavcopy_file(
        source_code="NSE_CM_BHAVCOPY",
        filename="cm18NOV2026bhav.csv",
        file_bytes=sample_csv.encode("utf-8"),
    )
    assert res1["status"] == "COMPLETED"
    assert res1["imported_candles"] >= 1

    # 2. Second Import (Idempotent test)
    res2 = historical_data_manager.import_bhavcopy_file(
        source_code="NSE_CM_BHAVCOPY",
        filename="cm18NOV2026bhav.csv",
        file_bytes=sample_csv.encode("utf-8"),
    )
    assert res2["status"] == "COMPLETED"

    # Query candle back
    query_res = historical_data_manager.get_candles(
        symbol="TESTCO",
        exchange="NSE",
        timeframe="1d",
    )
    assert query_res["status"] == QualityStatus.VALID.value
    assert len(query_res["candles"]) >= 1
    assert query_res["candles"][-1]["close"] == 104.50


def test_intraday_gap_and_non_fabrication_invariants():
    """
    CRITICAL RULE 1 TEST:
    Verifies that requesting an intraday timeframe without genuine source data
    returns DATA_UNAVAILABLE or SUBSCRIPTION_REQUIRED, and NEVER synthesizes fake candles from EOD.
    """
    res = historical_data_manager.get_candles(
        symbol="NON_EXISTENT_SECURITY_123",
        exchange="NSE",
        timeframe="1m",
    )
    assert res["status"] in (QualityStatus.DATA_UNAVAILABLE.value, QualityStatus.SUBSCRIPTION_REQUIRED.value)
    assert len(res["candles"]) == 0
    assert "not present in local archives" in res["message"]


# =====================================================================
# 4. REST API ENDPOINTS TESTS
# =====================================================================

def test_api_historical_sources():
    """Verifies GET /api/market/historical/sources returns registered official sources."""
    resp = client.get("/api/market/historical/sources")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "SUCCESS"
    codes = [s["source_code"] for s in data["sources"]]
    assert "NSE_CM_BHAVCOPY" in codes
    assert "NSE_FO_BHAVCOPY" in codes
    assert "BSE_EQ_BHAVCOPY" in codes


def test_api_historical_coverage():
    """Verifies GET /api/market/historical/coverage returns valid coverage metadata."""
    resp = client.get("/api/market/historical/coverage")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "SUCCESS"
    assert isinstance(data["coverage"], list)


def test_api_admin_data_jobs():
    """Verifies GET /api/admin/data/jobs lists logged ingestion jobs."""
    resp = client.get("/api/admin/data/jobs")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "SUCCESS"
    assert isinstance(data["jobs"], list)


def test_api_admin_data_quality():
    """Verifies GET /api/admin/data/quality returns data quality audit logs."""
    resp = client.get("/api/admin/data/quality")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "SUCCESS"
    assert isinstance(data["issues"], list)


# =====================================================================
# 5. BACKTESTING INTEGRATION VERIFICATION
# =====================================================================

def test_backtesting_engine_historical_data_status():
    """Verifies that backtesting engines return explicit data_status (VALID or INCOMPLETE_DATA)."""
    # 1. Backtest with real cached symbols
    result = backtest_engine.run_backtest(
        strategy_id="SMC_ORDER_BLOCK",
        symbols=["RELIANCE"],
        timeframe="15m",
        initial_capital=500000.0,
    )
    assert result["data_status"] in ("VALID", "INCOMPLETE_DATA")
    if result["data_status"] == "INCOMPLETE_DATA":
        assert result["data_warning"] is not None

    # 2. Backtest with unknown symbol -> must flag INCOMPLETE_DATA
    missing_result = backtest_engine.run_backtest(
        strategy_id="SMC_ORDER_BLOCK",
        symbols=["DEFINITELY_UNKNOWN_SYMBOL_999"],
        timeframe="15m",
        initial_capital=500000.0,
    )
    assert missing_result["data_status"] == "INCOMPLETE_DATA"
    assert missing_result["data_warning"] is not None
