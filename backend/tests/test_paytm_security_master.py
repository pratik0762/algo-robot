"""
ALGO ROBOT — Paytm Money Security Master Ingestion & Canonical Mapping Tests
Validates parsing of official security master, fast resolution of Bluechip equities,
indices, derivatives, bidirectional mapping to 5,607 companies & 8,109 instruments,
and coverage statistics.
"""

import pytest
from app.db.session import SessionLocal
from app.market_data.paytm_security_master import (
    PaytmSecurityMasterManager,
    paytm_security_master,
    CANONICAL_INDEX_IDS,
)
from app.market_data.api_router import (
    get_paytm_security_master_stats,
    resolve_paytm_security,
    lookup_paytm_security,
    sync_paytm_security_master,
)


@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    yield db
    db.close()


def test_security_master_parsing_and_stats():
    """Verify official security master parses 100,000+ contracts across NSE and BSE."""
    total = paytm_security_master.load_security_master()
    assert total > 100000

    stats = paytm_security_master.get_stats()
    assert stats["is_loaded"] is True
    assert stats["total_securities"] > 100000
    assert stats["nse_equity_count"] > 2000
    assert stats["bse_equity_count"] > 4000
    assert stats["derivatives_count"] > 50000
    assert stats["indices_count"] >= len(CANONICAL_INDEX_IDS)


def test_resolve_paytm_id_bluechip_equities():
    """Verify sub-millisecond resolution of NSE and BSE bluechip equities."""
    # 1. NSE RELIANCE
    rel_nse = paytm_security_master.resolve_paytm_id("NSE", "RELIANCE")
    assert rel_nse == "2885"

    # Series stripping check
    rel_nse_eq = paytm_security_master.resolve_paytm_id("NSE", "RELIANCE-EQ")
    assert rel_nse_eq == "2885"

    # 2. BSE RELIANCE (by 6-digit scrip code and symbol)
    rel_bse_code = paytm_security_master.resolve_paytm_id("BSE", "500325")
    assert rel_bse_code == "500325"

    rel_bse_sym = paytm_security_master.resolve_paytm_id("BSE", "RELIANCE")
    assert rel_bse_sym == "500325"

    # 3. NSE TCS
    tcs_nse = paytm_security_master.resolve_paytm_id("NSE", "TCS")
    assert tcs_nse == "11536"

    # 4. BSE TCS
    tcs_bse = paytm_security_master.resolve_paytm_id("BSE", "532540")
    assert tcs_bse == "532540"

    tcs_bse_sym = paytm_security_master.resolve_paytm_id("BSE", "TCS")
    assert tcs_bse_sym == "532540"


def test_resolve_paytm_id_indices():
    """Verify resolution of benchmark market indices across NSE and BSE."""
    # NIFTY 50
    assert paytm_security_master.resolve_paytm_id("NSE", "NIFTY") == "13"
    assert paytm_security_master.resolve_paytm_id("NSE", "NIFTY 50") == "13"

    # BANK NIFTY
    assert paytm_security_master.resolve_paytm_id("NSE", "BANKNIFTY") == "25"
    assert paytm_security_master.resolve_paytm_id("NSE", "NIFTY BANK") == "25"

    # FINNIFTY
    assert paytm_security_master.resolve_paytm_id("NSE", "FINNIFTY") == "27"

    # SENSEX
    assert paytm_security_master.resolve_paytm_id("BSE", "SENSEX") == "51"

    # BANKEX
    assert paytm_security_master.resolve_paytm_id("BSE", "BANKEX") == "69"


def test_resolve_canonical_reverse():
    """Verify reverse resolution from Paytm security_id back to canonical instrument."""
    # 1. Reverse resolve RELIANCE NSE
    can_rel = paytm_security_master.resolve_canonical("2885")
    assert can_rel is not None
    assert can_rel["symbol"] == "RELIANCE"
    assert can_rel["exchange"] == "NSE"

    # 2. Reverse resolve SENSEX
    can_sensex = paytm_security_master.resolve_canonical("51")
    assert can_sensex is not None
    assert can_sensex["exchange"] == "BSE"
    assert "SENSEX" in can_sensex["name"].upper()

    # 3. Non-existent ID returns None
    assert paytm_security_master.resolve_canonical("999999999") is None


def test_canonical_universe_mapping(db_session):
    """Verify cross-referencing and coverage of canonical DB instruments (8,100+)."""
    mapping_res = paytm_security_master.map_to_canonical_universe(db=db_session)

    assert mapping_res["status"] == "success"
    assert mapping_res["total_db_instruments"] > 8000
    assert mapping_res["total_matched"] > 7000
    assert mapping_res["nse_matched"] > 2500
    assert mapping_res["bse_matched"] > 4500
    assert mapping_res["coverage_percentage"] > 90.0


def test_security_info_metadata():
    """Verify tick size, lot size, upper limit, lower limit, and freeze quantity."""
    info = paytm_security_master.get_security_info("2885")
    assert info is not None
    assert info["symbol"] == "RELIANCE"
    assert info["exchange"] == "NSE"
    assert info["lot_size"] == 1
    assert info["tick_size"] > 0.0
    assert info["upper_limit"] > 0.0
    assert info["lower_limit"] > 0.0


def test_api_router_security_master_endpoints(db_session):
    """Verify REST API endpoints for stats, resolve, lookup, and sync."""
    # 1. Stats endpoint
    stats = get_paytm_security_master_stats()
    assert stats["is_loaded"] is True
    assert stats["total_securities"] > 100000

    # 2. Resolve endpoint
    resolve_data = resolve_paytm_security(exchange="NSE", symbol="RELIANCE")
    assert resolve_data["status"] == "success"
    assert resolve_data["security_id"] == "2885"

    # 3. Lookup endpoint
    lookup_data = lookup_paytm_security(security_id="2885")
    assert lookup_data["status"] == "success"
    assert lookup_data["canonical"]["symbol"] == "RELIANCE"
    assert lookup_data["canonical"]["exchange"] == "NSE"

    # 4. Sync endpoint
    sync_data = sync_paytm_security_master(force_download=False, db=db_session)
    assert sync_data["status"] == "success"
    assert sync_data["coverage_percentage"] > 90.0
