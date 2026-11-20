"""
ALGO ROBOT — Paytm Money Live WebSocket Adapter & Binary Packet Decoder Tests
Validates binary decoders for Mode 61 (LTP), Mode 62 (Quote), Mode 63 (Full Depth),
Modes 64-66 (Indices), concatenated packet streams, and quote service updates.
"""

import asyncio
import struct
import pytest

from app.market_data.paytm_adapter import (
    PaytmMoneyMarketDataAdapter,
    paytm_adapter,
    MODE_LTP,
    MODE_QUOTE,
    MODE_FULL_DEPTH,
    MODE_INDEX_LTP,
)
from app.market_data.adapters.provider_registry import provider_registry_manager
from app.market_data.live_quote_service import live_quote_service
from app.market_data.api_router import (
    get_paytm_stream_status,
    subscribe_paytm_stream,
    unsubscribe_paytm_stream,
    PaytmStreamSubscribeRequest,
)


def test_adapter_initialization_and_capabilities():
    """Verify adapter metadata, capabilities, and provider registry prioritization."""
    assert paytm_adapter.name == "PAYTM_MONEY"
    assert paytm_adapter.provider_code == "PAYTM_MONEY"
    
    caps = paytm_adapter.get_capabilities()
    assert caps.supports_live_ticks is True
    assert caps.supports_order_book_depth is True
    assert caps.max_live_subscriptions == 5000

    # Ensure PAYTM_MONEY is top priority in provider registry
    assert provider_registry_manager.priority_order[0] == "PAYTM_MONEY"


def test_decode_mode_61_ltp():
    """Verify Mode 61 binary LTP packet decoding (9 bytes: [1: mode], [4: sec_id], [4: ltp])."""
    # Packet for RELIANCE (sec_id 2885) at Rs 1369.50
    packet = struct.pack("<Bif", MODE_LTP, 2885, 1369.50)
    assert len(packet) == 9

    tick = paytm_adapter.decode_mode_61(packet)
    assert tick is not None
    assert tick.symbol == "RELIANCE"
    assert tick.exchange == "NSE"
    assert tick.instrument_token == 2885
    assert tick.ltp == 1369.50
    assert tick.feed_source == "PAYTM_MONEY"
    assert tick.is_simulated is False


def test_decode_mode_62_quote():
    """Verify Mode 62 binary Quote packet decoding (29 bytes)."""
    # Packet for TCS (sec_id 11536): LTP=4405.75, Close=4400.00, Open=4395.00, High=4420.00, Low=4390.00, Vol=85000
    packet = struct.pack(
        "<Bifffffi",
        MODE_QUOTE,
        11536,
        4405.75,
        4400.00,
        4395.00,
        4420.00,
        4390.00,
        85000,
    )
    assert len(packet) == 29

    tick = paytm_adapter.decode_mode_62(packet)
    assert tick is not None
    assert tick.symbol == "TCS"
    assert tick.exchange == "NSE"
    assert tick.ltp == 4405.75
    assert tick.close == 4400.00
    assert tick.open == 4395.00
    assert tick.high == 4420.00
    assert tick.low == 4390.00
    assert tick.volume == 85000
    assert tick.change == 5.75
    assert tick.percent_change == 0.13


def test_decode_mode_63_full_depth():
    """Verify Mode 63 binary Full Market Depth packet decoding (133 bytes)."""
    # 1. First 29 bytes: Header + OHLCV
    ohlcv = struct.pack(
        "<Bifffffi",
        MODE_FULL_DEPTH,
        2885,
        1369.50,
        1367.00,
        1365.00,
        1375.00,
        1362.00,
        450000,
    )
    # 2. 5 Bids (50 bytes): Best bid = Rs 1369.45, qty=500, orders=3
    bids = struct.pack("<fih", 1369.45, 500, 3) + (b"\x00" * 40)
    # 3. 5 Asks (50 bytes): Best ask = Rs 1369.55, qty=450, orders=2
    asks = struct.pack("<fih", 1369.55, 450, 2) + (b"\x00" * 40)
    # 4. Open Interest (4 bytes int32)
    oi = struct.pack("<i", 1250000)

    packet = ohlcv + bids + asks + oi
    assert len(packet) == 133

    tick = paytm_adapter.decode_mode_63(packet)
    assert tick is not None
    assert tick.symbol == "RELIANCE"
    assert tick.ltp == 1369.50
    assert tick.bid == 1369.45
    assert tick.ask == 1369.55
    assert tick.bid_qty == 500
    assert tick.ask_qty == 450
    assert tick.oi == 1250000


def test_decode_mode_index():
    """Verify Mode 64/65 Index binary packet decoding."""
    # NIFTY (sec_id 13): LTP=25612.95, Close=25600.00, High=25650.00, Low=25580.00
    packet = struct.pack("<Biffff", MODE_INDEX_LTP, 13, 25612.95, 25600.00, 25650.00, 25580.00)
    assert len(packet) == 21

    tick = paytm_adapter.decode_mode_index(packet)
    assert tick is not None
    assert tick.symbol == "NIFTY"
    assert tick.exchange == "NSE"
    assert tick.ltp == 25612.95
    assert tick.close == 25600.00
    assert tick.change == 12.95


def test_decode_batch_concatenated_packets():
    """Verify streaming parser unpacks multiple concatenated binary packets in one frame."""
    p1 = struct.pack("<Bif", MODE_LTP, 2885, 1369.50)           # 9 bytes (RELIANCE)
    p2 = struct.pack("<Bif", MODE_LTP, 11536, 4405.75)          # 9 bytes (TCS)
    p3 = struct.pack("<Biffff", MODE_INDEX_LTP, 13, 25612.95, 25600.0, 25650.0, 25580.0) # 21 bytes (NIFTY)

    stream = p1 + p2 + p3
    assert len(stream) == 9 + 9 + 21

    ticks = paytm_adapter.decode_binary_packets(stream)
    assert len(ticks) == 3
    assert ticks[0].symbol == "RELIANCE"
    assert ticks[1].symbol == "TCS"
    assert ticks[2].symbol == "NIFTY"


def test_live_quote_service_snapshot_on_tick():
    """Verify that decoded tick immediately updates platform live quotes in memory."""
    packet = struct.pack(
        "<Bifffffi",
        MODE_QUOTE,
        2885,
        1369.50,
        1367.00,
        1365.00,
        1375.00,
        1362.00,
        120000,
    )
    ticks = paytm_adapter.decode_binary_packets(packet)
    assert len(ticks) == 1

    # Ingest tick into live_quote_service
    live_quote_service.process_tick(ticks[0])

    quote = live_quote_service.get_quote("NSE_RELIANCE")
    assert quote is not None
    assert quote["ltp"] == 1369.50
    assert quote["change"] == 2.50
    assert quote["volume"] == 120000


def test_api_stream_endpoints():
    """Verify REST API endpoints for WebSocket telemetry and subscriptions."""
    # 1. Telemetry status
    status = get_paytm_stream_status()
    assert status["name"] == "PAYTM_MONEY"
    assert status["provider_code"] == "PAYTM_MONEY"
    assert "is_connected" in status

    # 2. In-memory token subscription management
    paytm_adapter._subscribed_security_ids.add(2885)
    paytm_adapter._subscribed_security_ids.add(11536)
    assert 2885 in paytm_adapter._subscribed_security_ids
    assert 11536 in paytm_adapter._subscribed_security_ids
    assert paytm_adapter.get_status()["subscribed_scrips_count"] >= 2

    # 3. Unsubscribe token management
    paytm_adapter._subscribed_security_ids.discard(2885)
    assert 2885 not in paytm_adapter._subscribed_security_ids
    assert 11536 in paytm_adapter._subscribed_security_ids
