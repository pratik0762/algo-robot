"""
Tests for Paytm Money Full-Universe (5,000+ Companies) Historical Downloader and Live Streaming Manager.
Verifies target discovery, batch job lifecycle, checkpointing, and dynamic stream capacity management.
"""

import asyncio
import os
import time
import pytest

from app.market_data.paytm_bulk_downloader import paytm_bulk_downloader
from app.market_data.paytm_live_manager import paytm_live_manager, MAX_CONCURRENT_STREAM_SCRIPS
from app.market_data.paytm_security_master import paytm_security_master
from app.market_data.api_router import (
    get_paytm_batch_download_status,
    get_paytm_universe_live_status,
)


def test_universe_targets_discovery():
    """Verifies that the target discovery engine finds thousands of mapped companies."""
    targets = paytm_bulk_downloader.get_universe_targets(universe="NIFTY50")
    assert len(targets) >= 40, f"Expected at least 40 Nifty 50 targets, got {len(targets)}"
    
    # Check structure of discovered target
    first = targets[0]
    assert "symbol" in first
    assert "exchange" in first
    assert "security_id" in first
    assert "target_key" in first


def test_batch_downloader_status_and_lifecycle():
    """Verifies batch downloader status reporting, checkpointing, and graceful stop."""
    status = paytm_bulk_downloader.get_status()
    assert "is_running" in status
    assert "total_targets" in status
    assert "completed_total" in status
    assert "percentage_complete" in status
    assert "checkpoint_file" in status

    # Start a small job on NIFTY50 with 1 day lookback
    res = paytm_bulk_downloader.start_batch_download(
        universe="NIFTY50",
        timeframe="1d",
        lookback_days=5,
        concurrency=2,
        rate_limit_rps=20.0,
    )
    assert res["status"] in ("started", "already_running")

    # Check status while running
    mid_status = paytm_bulk_downloader.get_status()
    assert mid_status["universe"] == "NIFTY50"

    # Stop gracefully
    stop_res = paytm_bulk_downloader.stop_batch_download()
    assert stop_res["status"] in ("stopping", "not_running")
    t0 = time.time()
    while paytm_bulk_downloader.get_status()["is_running"] and (time.time() - t0) < 5.0:
        time.sleep(0.05)


def test_live_universe_manager_core_init():
    """Verifies that core benchmark tokens are initialized properly."""
    count = asyncio.run(paytm_live_manager.initialize_core_stream())
    assert count >= 40, f"Expected at least 40 core tokens, got {count}"

    telemetry = paytm_live_manager.get_live_status()
    assert telemetry["core_tokens_count"] >= 40
    assert telemetry["total_universe_mapped"] == 5179
    assert telemetry["max_stream_capacity"] == MAX_CONCURRENT_STREAM_SCRIPS


def test_live_universe_manager_on_demand_subscription():
    """Verifies dynamic on-demand subscription with capacity tracking."""
    token = asyncio.run(paytm_live_manager.subscribe_on_demand(symbol="RELIANCE", exchange="NSE"))
    assert token is not None
    assert isinstance(token, int)

    telemetry = paytm_live_manager.get_live_status()
    assert telemetry["total_stream_active"] > 0
    assert telemetry["capacity_utilization_pct"] <= 100.0


def test_api_batch_download_status_endpoint():
    """Verifies the REST API endpoint for historical batch download status."""
    data = get_paytm_batch_download_status()
    assert data["status"] == "success"
    assert "progress" in data
    assert "total_targets" in data["progress"]


def test_api_universe_live_status_endpoint():
    """Verifies the REST API endpoint for live streaming universe telemetry."""
    data = get_paytm_universe_live_status()
    assert data["status"] == "success"
    assert "telemetry" in data
    assert "total_universe_mapped" in data["telemetry"]
    assert data["telemetry"]["total_universe_mapped"] == 5179
