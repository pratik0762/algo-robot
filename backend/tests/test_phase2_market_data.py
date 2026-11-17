"""
Unit & Integration Test Suite — Phase 2: Unified Market Data Ingestion & Real Tick Pipeline
=============================================================================================
Validates:
1. NormalizedTick contract & data authenticity metadata
2. Zerodha Kite binary packet parsing & token mapping
3. Angel One binary packet parsing
4. Upstox streaming message parser
5. MarketDataRouter listener dispatch & telemetry
6. Strict Rule 1 compliance: zero synthetic ticks when DATA_SOURCE_MODE == 'REAL_ONLY'
"""

import os
import struct
import sys
import time
import pytest

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.config import settings
from app.market_data.base_adapter import (
    NormalizedTick,
    DataAuthenticity,
    FeedStatus,
)
from app.market_data.kite_adapter import ZerodhaKiteTickerAdapter, TOKEN_TO_SYMBOL
from app.market_data.angel_adapter import AngelOneSmartStreamAdapter
from app.market_data.upstox_adapter import UpstoxWebSocketAdapter
from app.market_data.router import MarketDataRouter
from app.tick_engine import tick_engine


# -----------------------------------------------------------------------------
# 1. NormalizedTick Contract Tests
# -----------------------------------------------------------------------------
def test_normalized_tick_contract():
    tick = NormalizedTick(
        symbol="RELIANCE",
        exchange="NSE",
        instrument_token=738561,
        ltp=2945.50,
        change=25.50,
        percent_change=0.87,
        open=2920.0,
        high=2955.0,
        low=2915.0,
        close=2920.0,
        volume=1450200,
        bid=2945.45,
        ask=2945.55,
        bid_qty=500,
        ask_qty=750,
        oi=0,
        timestamp=time.time(),
        feed_source="ZERODHA_KITE",
        data_status=DataAuthenticity.REAL_LIVE,
        is_simulated=False,
    )

    d = tick.to_dict()
    assert d["symbol"] == "RELIANCE"
    assert d["ltp"] == 2945.50
    assert d["data_status"] == "REAL_LIVE"
    assert d["is_simulated"] is False
    assert d["feed_source"] == "ZERODHA_KITE"


# -----------------------------------------------------------------------------
# 2. Zerodha Kite Binary Packet Parsing Tests
# -----------------------------------------------------------------------------
def test_kite_binary_packet_parsing():
    adapter = ZerodhaKiteTickerAdapter(api_key="mock_key", access_token="mock_tok")

    # Construct a synthetic Kite full-quote binary packet (184 bytes) for RELIANCE (token 738561)
    token = 738561
    ltp_int = 295050   # 2950.50 in paise
    last_qty = 25
    avg_p = 294000
    vol = 1200000
    buy_qty = 50000
    sell_qty = 45000
    o_int = 292000    # 2920.00
    h_int = 296000    # 2960.00
    l_int = 291500    # 2915.00
    c_int = 292500    # 2925.00

    # Header + basic fields (44 bytes)
    header_data = struct.pack(
        ">IIIIIIIIIII",
        token, ltp_int, last_qty, avg_p, vol, buy_qty, sell_qty,
        o_int, h_int, l_int, c_int
    )

    # Padding up to 184 bytes (market depth)
    # At offset 64: first bid (12 bytes: qty 100, price 295045, orders 2, pad 0)
    # At offset 124 (60 bytes later): first ask (qty 200, price 295055)
    padding_before_depth = b"\x00" * (64 - len(header_data))
    first_bid = struct.pack(">IIHH", 100, 295045, 2, 0)
    padding_between = b"\x00" * (60 - len(first_bid))
    first_ask = struct.pack(">IIHH", 200, 295055, 3, 0)
    trailing_padding = b"\x00" * (184 - (64 + len(first_bid) + len(padding_between) + len(first_ask)))

    full_packet_184 = header_data + padding_before_depth + first_bid + padding_between + first_ask + trailing_padding
    assert len(full_packet_184) == 184

    # Pack into Kite multi-packet container: [2 bytes: count=1] [2 bytes: length=184] [184 bytes: packet]
    container = struct.pack(">HH", 1, 184) + full_packet_184

    ticks = adapter.parse_binary_packets(container)
    assert len(ticks) == 1
    t = ticks[0]

    assert t.symbol == "RELIANCE"
    assert t.ltp == 2950.50
    assert t.open == 2920.00
    assert t.high == 2960.00
    assert t.low == 2915.00
    assert t.close == 2925.00
    assert t.change == 25.50
    assert t.percent_change == round((25.50 / 2925.00) * 100.0, 2)
    assert t.bid == 2950.45
    assert t.ask == 2950.55
    assert t.feed_source == "ZERODHA_KITE"
    assert t.is_simulated is False


# -----------------------------------------------------------------------------
# 3. Angel One Binary Packet Parsing Tests
# -----------------------------------------------------------------------------
def test_angel_binary_packet_parsing():
    adapter = AngelOneSmartStreamAdapter(api_key="mock_key", client_code="mock_code")

    # Angel One Quote Mode packet (~91 bytes)
    # [1: sub_mode=2], [1: exch=1], [25: token="2885"], [16: seq + timestamp]
    # [8: ltp_paise = 295050], [8: last_qty], [8: avg_p], [8: vol]
    # [8: open = 292000], [8: high = 296000], [8: low = 291500], [8: close = 292500]
    token_str = "2885".ljust(25, "\x00")
    header = struct.pack("<bb", 2, 1) + token_str.encode("utf-8")
    seq_ts = struct.pack("<qq", 101, int(time.time() * 1000))
    ltp_bytes = struct.pack("<q", 295050)
    meta_bytes = struct.pack("<qqq", 50, 294000, 1500000)
    ohlc_bytes = struct.pack("<qqqq", 292000, 296000, 291500, 292500)

    raw_packet = header + seq_ts + ltp_bytes + meta_bytes + ohlc_bytes
    tick = adapter.parse_binary_packet(raw_packet)

    assert tick is not None
    assert tick.symbol == "RELIANCE"
    assert tick.ltp == 2950.50
    assert tick.close == 2925.00
    assert tick.feed_source == "ANGEL_ONE"
    assert tick.is_simulated is False


# -----------------------------------------------------------------------------
# 4. Upstox Message Parsing Tests
# -----------------------------------------------------------------------------
def test_upstox_message_parsing():
    adapter = UpstoxWebSocketAdapter(api_key="mock", access_token="mock")

    sample_msg = {
        "feeds": {
            "NSE_EQ|INFY": {
                "ff": {
                    "ltp": 1850.75,
                    "v": 2500000,
                    "marketOHLC": {
                        "ohlc": [
                            {"open": 1840.0, "high": 1860.0, "low": 1835.0, "close": 1842.0}
                        ]
                    }
                }
            }
        }
    }

    tick = adapter.parse_message(sample_msg)
    assert tick is not None
    assert tick.symbol == "INFY"
    assert tick.ltp == 1850.75
    assert tick.close == 1842.0
    assert tick.change == 8.75
    assert tick.feed_source == "UPSTOX"
    assert tick.is_simulated is False


# -----------------------------------------------------------------------------
# 5. MarketDataRouter Listener & Telemetry Tests
# -----------------------------------------------------------------------------
def test_market_data_router_telemetry():
    router = MarketDataRouter()
    diag = router.get_diagnostics()

    assert "active_feed" in diag
    assert diag["rule_1_compliant"] is True
    assert "adapters" in diag
    assert "ZERODHA_KITE" in diag["adapters"]
    assert "ANGEL_ONE" in diag["adapters"]
    assert "UPSTOX" in diag["adapters"]


# -----------------------------------------------------------------------------
# 6. Strict Rule 1 Enforcement Tests
# -----------------------------------------------------------------------------
def test_rule_1_compliance_no_synthetic_ticks():
    # In REAL_ONLY data mode, update_ticks must NEVER return synthetic micro-ticks
    assert settings.DATA_SOURCE_MODE == "REAL_ONLY"
    synthetic_ticks = tick_engine.update_ticks()
    assert synthetic_ticks == []

    # GIFT Nifty synthetic tick function must return None in REAL_ONLY mode
    assert tick_engine.update_gift_nifty_tick() is None

    # Verify that existing stock quotes do not claim to be simulated
    stock_quote = tick_engine.get_stock_quote("RELIANCE")
    assert stock_quote is not None
    assert stock_quote.get("is_simulated") is False
    assert stock_quote.get("data_status") in ("REAL_LIVE", "REAL_CLOSED", "UNAVAILABLE")
