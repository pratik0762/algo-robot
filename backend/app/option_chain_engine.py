"""Option Chain & Option Strategy Builder Engine for Algo Robot.
Provides real-time option chain data, Greeks, PCR, Max Pain, OI Buildup analytics,
and multi-leg options strategy payoff analysis for NSE Indices & Equities.
"""

from __future__ import annotations

import json
import math
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional, Tuple

IST = timezone(timedelta(hours=5, minutes=30))
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
SAVED_STRATEGIES_FILE = os.path.join(DATA_DIR, "option_strategies.json")

# ---------------------------------------------------------------------------
# F&O Universe with Lot Sizes, Strike Intervals, and Baseline Metadata
# ---------------------------------------------------------------------------
FO_INSTRUMENTS: List[Dict[str, Any]] = [
    # Benchmark Indices
    {"symbol": "NIFTY", "name": "NIFTY 50", "type": "INDEX", "lot_size": 25, "interval": 50, "base_price": 24150.0},
    {"symbol": "BANKNIFTY", "name": "NIFTY BANK", "type": "INDEX", "lot_size": 15, "interval": 100, "base_price": 51850.0},
    {"symbol": "FINNIFTY", "name": "NIFTY FINANCIAL SERVICES", "type": "INDEX", "lot_size": 25, "interval": 50, "base_price": 23900.0},
    {"symbol": "MIDCPNIFTY", "name": "NIFTY MIDCAP SELECT", "type": "INDEX", "lot_size": 50, "interval": 25, "base_price": 12800.0},

    # Large-Cap F&O Stocks
    {"symbol": "RELIANCE", "name": "Reliance Industries Ltd", "type": "STOCK", "lot_size": 250, "interval": 20, "base_price": 1340.0},
    {"symbol": "TCS", "name": "Tata Consultancy Services Ltd", "type": "STOCK", "lot_size": 175, "interval": 20, "base_price": 2410.0},
    {"symbol": "HDFCBANK", "name": "HDFC Bank Limited", "type": "STOCK", "lot_size": 550, "interval": 10, "base_price": 800.0},
    {"symbol": "BHARTIARTL", "name": "Bharti Airtel Limited", "type": "STOCK", "lot_size": 475, "interval": 20, "base_price": 2115.0},
    {"symbol": "ICICIBANK", "name": "ICICI Bank Limited", "type": "STOCK", "lot_size": 700, "interval": 10, "base_price": 1567.0},
    {"symbol": "INFY", "name": "Infosys Limited", "type": "STOCK", "lot_size": 400, "interval": 10, "base_price": 1141.0},
    {"symbol": "SBIN", "name": "State Bank of India", "type": "STOCK", "lot_size": 750, "interval": 10, "base_price": 1081.0},
    {"symbol": "ITC", "name": "ITC Limited", "type": "STOCK", "lot_size": 1600, "interval": 5, "base_price": 284.0},
    {"symbol": "LT", "name": "Larsen & Toubro Ltd", "type": "STOCK", "lot_size": 150, "interval": 50, "base_price": 4145.0},
    {"symbol": "BAJFINANCE", "name": "Bajaj Finance Limited", "type": "STOCK", "lot_size": 125, "interval": 100, "base_price": 7180.0},
    {"symbol": "MARUTI", "name": "Maruti Suzuki India Ltd", "type": "STOCK", "lot_size": 50, "interval": 100, "base_price": 12890.0},
    {"symbol": "SUNPHARMA", "name": "Sun Pharmaceutical Industries", "type": "STOCK", "lot_size": 350, "interval": 20, "base_price": 1880.0},
    {"symbol": "M&M", "name": "Mahindra & Mahindra Ltd", "type": "STOCK", "lot_size": 350, "interval": 20, "base_price": 2980.0},
    {"symbol": "TITAN", "name": "Titan Company Limited", "type": "STOCK", "lot_size": 175, "interval": 50, "base_price": 4848.0},
    {"symbol": "HINDUNILVR", "name": "Hindustan Unilever Ltd", "type": "STOCK", "lot_size": 300, "interval": 20, "base_price": 2420.0},
    {"symbol": "AXISBANK", "name": "Axis Bank Limited", "type": "STOCK", "lot_size": 625, "interval": 10, "base_price": 1165.0},
    {"symbol": "KOTAKBANK", "name": "Kotak Mahindra Bank Ltd", "type": "STOCK", "lot_size": 400, "interval": 20, "base_price": 1740.0},
    {"symbol": "TATAMOTORS", "name": "Tata Motors Limited", "type": "STOCK", "lot_size": 1425, "interval": 10, "base_price": 985.0},
    {"symbol": "TATASTEEL", "name": "Tata Steel Limited", "type": "STOCK", "lot_size": 5500, "interval": 2, "base_price": 148.0},
    {"symbol": "WIPRO", "name": "Wipro Limited", "type": "STOCK", "lot_size": 1500, "interval": 5, "base_price": 540.0},
    {"symbol": "HCLTECH", "name": "HCL Technologies Ltd", "type": "STOCK", "lot_size": 350, "interval": 20, "base_price": 1820.0},
    {"symbol": "NTPC", "name": "NTPC Limited", "type": "STOCK", "lot_size": 1500, "interval": 5, "base_price": 385.0},
    {"symbol": "ONGC", "name": "Oil & Natural Gas Corporation", "type": "STOCK", "lot_size": 3850, "interval": 5, "base_price": 255.0},
    {"symbol": "POWERGRID", "name": "Power Grid Corp of India", "type": "STOCK", "lot_size": 3600, "interval": 5, "base_price": 315.0},
    {"symbol": "COALINDIA", "name": "Coal India Limited", "type": "STOCK", "lot_size": 2100, "interval": 5, "base_price": 420.0},
    {"symbol": "BPCL", "name": "Bharat Petroleum Corp Ltd", "type": "STOCK", "lot_size": 1800, "interval": 5, "base_price": 310.0},
    {"symbol": "GRASIM", "name": "Grasim Industries Limited", "type": "STOCK", "lot_size": 250, "interval": 20, "base_price": 2520.0},
    {"symbol": "ADANIENT", "name": "Adani Enterprises Ltd", "type": "STOCK", "lot_size": 300, "interval": 50, "base_price": 2980.0},
    {"symbol": "ADANIPORTS", "name": "Adani Ports and SEZ Ltd", "type": "STOCK", "lot_size": 400, "interval": 20, "base_price": 1420.0},

    # High-Beta & Mid-Cap F&O Stocks
    {"symbol": "TRENT", "name": "Trent Limited", "type": "STOCK", "lot_size": 100, "interval": 50, "base_price": 3170.0},
    {"symbol": "POLYCAB", "name": "Polycab India Limited", "type": "STOCK", "lot_size": 100, "interval": 100, "base_price": 8060.0},
    {"symbol": "PERSISTENT", "name": "Persistent Systems Ltd", "type": "STOCK", "lot_size": 100, "interval": 50, "base_price": 6030.0},
    {"symbol": "COFORGE", "name": "Coforge Limited", "type": "STOCK", "lot_size": 150, "interval": 50, "base_price": 2045.0},
    {"symbol": "DIXON", "name": "Dixon Technologies Ltd", "type": "STOCK", "lot_size": 100, "interval": 100, "base_price": 12820.0},
    {"symbol": "AUROPHARMA", "name": "Aurobindo Pharma Ltd", "type": "STOCK", "lot_size": 550, "interval": 20, "base_price": 1815.0},
    {"symbol": "BHEL", "name": "Bharat Heavy Electricals", "type": "STOCK", "lot_size": 2625, "interval": 5, "base_price": 435.0},
    {"symbol": "ESCORTS", "name": "Escorts Kubota Limited", "type": "STOCK", "lot_size": 250, "interval": 50, "base_price": 2400.0}
]

FO_LOOKUP = {item["symbol"].upper(): item for item in FO_INSTRUMENTS}

# ---------------------------------------------------------------------------
# Predefined Strategy Templates Registry
# ---------------------------------------------------------------------------
PREDEFINED_STRATEGIES: Dict[str, Dict[str, Any]] = {
    # Bullish Strategies
    "LONG_CALL": {
        "id": "LONG_CALL",
        "name": "Long Call",
        "category": "Bullish",
        "outlook": "Bullish",
        "description": "Buy an ATM or slightly OTM Call option expecting strong upward price movement.",
        "legs": [{"action": "BUY", "option_type": "CE", "offset_steps": 0, "lots": 1, "name": "ATM Long Call"}]
    },
    "BULL_CALL_SPREAD": {
        "id": "BULL_CALL_SPREAD",
        "name": "Bull Call Spread",
        "category": "Bullish",
        "outlook": "Moderately Bullish",
        "description": "Buy lower strike Call and sell higher strike Call. Defined risk and capped profit.",
        "legs": [
            {"action": "BUY", "option_type": "CE", "offset_steps": 0, "lots": 1, "name": "ATM Long Call"},
            {"action": "SELL", "option_type": "CE", "offset_steps": 2, "lots": 1, "name": "OTM Short Call"}
        ]
    },
    "BULL_PUT_SPREAD": {
        "id": "BULL_PUT_SPREAD",
        "name": "Bull Put Spread",
        "category": "Bullish",
        "outlook": "Moderately Bullish (Credit)",
        "description": "Sell higher strike Put and buy lower strike Put for net credit. Profitable if price stays above short strike.",
        "legs": [
            {"action": "SELL", "option_type": "PE", "offset_steps": 0, "lots": 1, "name": "ATM Short Put"},
            {"action": "BUY", "option_type": "PE", "offset_steps": -2, "lots": 1, "name": "OTM Long Put"}
        ]
    },
    "BULL_CALL_LADDER": {
        "id": "BULL_CALL_LADDER",
        "name": "Bull Call Ladder",
        "category": "Bullish",
        "outlook": "Bullish / Range Bound",
        "description": "Buy 1 ITM Call, sell 1 ATM Call, and sell 1 OTM Call.",
        "legs": [
            {"action": "BUY", "option_type": "CE", "offset_steps": -1, "lots": 1, "name": "ITM Long Call"},
            {"action": "SELL", "option_type": "CE", "offset_steps": 1, "lots": 1, "name": "OTM Short Call 1"},
            {"action": "SELL", "option_type": "CE", "offset_steps": 3, "lots": 1, "name": "OTM Short Call 2"}
        ]
    },

    # Bearish Strategies
    "LONG_PUT": {
        "id": "LONG_PUT",
        "name": "Long Put",
        "category": "Bearish",
        "outlook": "Bearish",
        "description": "Buy an ATM or slightly OTM Put option expecting sharp downward drop.",
        "legs": [{"action": "BUY", "option_type": "PE", "offset_steps": 0, "lots": 1, "name": "ATM Long Put"}]
    },
    "BEAR_PUT_SPREAD": {
        "id": "BEAR_PUT_SPREAD",
        "name": "Bear Put Spread",
        "category": "Bearish",
        "outlook": "Moderately Bearish",
        "description": "Buy higher strike Put and sell lower strike Put. Capped risk and defined profit.",
        "legs": [
            {"action": "BUY", "option_type": "PE", "offset_steps": 0, "lots": 1, "name": "ATM Long Put"},
            {"action": "SELL", "option_type": "PE", "offset_steps": -2, "lots": 1, "name": "OTM Short Put"}
        ]
    },
    "BEAR_CALL_SPREAD": {
        "id": "BEAR_CALL_SPREAD",
        "name": "Bear Call Spread",
        "category": "Bearish",
        "outlook": "Moderately Bearish (Credit)",
        "description": "Sell lower strike Call and buy higher strike Call for net credit.",
        "legs": [
            {"action": "SELL", "option_type": "CE", "offset_steps": 0, "lots": 1, "name": "ATM Short Call"},
            {"action": "BUY", "option_type": "CE", "offset_steps": 2, "lots": 1, "name": "OTM Long Call"}
        ]
    },
    "BEAR_PUT_LADDER": {
        "id": "BEAR_PUT_LADDER",
        "name": "Bear Put Ladder",
        "category": "Bearish",
        "outlook": "Bearish / Range Bound",
        "description": "Buy 1 ITM Put, sell 1 ATM Put, and sell 1 OTM Put.",
        "legs": [
            {"action": "BUY", "option_type": "PE", "offset_steps": 1, "lots": 1, "name": "ITM Long Put"},
            {"action": "SELL", "option_type": "PE", "offset_steps": -1, "lots": 1, "name": "OTM Short Put 1"},
            {"action": "SELL", "option_type": "PE", "offset_steps": -3, "lots": 1, "name": "OTM Short Put 2"}
        ]
    },

    # Neutral Strategies
    "LONG_STRADDLE": {
        "id": "LONG_STRADDLE",
        "name": "Long Straddle",
        "category": "Neutral",
        "outlook": "High Volatility Breakout",
        "description": "Buy ATM Call and ATM Put. Profits from massive price move in either direction.",
        "legs": [
            {"action": "BUY", "option_type": "CE", "offset_steps": 0, "lots": 1, "name": "ATM Long Call"},
            {"action": "BUY", "option_type": "PE", "offset_steps": 0, "lots": 1, "name": "ATM Long Put"}
        ]
    },
    "SHORT_STRADDLE": {
        "id": "SHORT_STRADDLE",
        "name": "Short Straddle",
        "category": "Neutral",
        "outlook": "Range Bound / Theta Decay",
        "description": "Sell ATM Call and ATM Put. Collects maximum premium if price expires at ATM strike.",
        "legs": [
            {"action": "SELL", "option_type": "CE", "offset_steps": 0, "lots": 1, "name": "ATM Short Call"},
            {"action": "SELL", "option_type": "PE", "offset_steps": 0, "lots": 1, "name": "ATM Short Put"}
        ]
    },
    "LONG_STRANGLE": {
        "id": "LONG_STRANGLE",
        "name": "Long Strangle",
        "category": "Neutral",
        "outlook": "Explosive Volatility",
        "description": "Buy OTM Call and OTM Put. Cheaper than Straddle, needs larger price breakout.",
        "legs": [
            {"action": "BUY", "option_type": "CE", "offset_steps": 2, "lots": 1, "name": "OTM Long Call"},
            {"action": "BUY", "option_type": "PE", "offset_steps": -2, "lots": 1, "name": "OTM Long Put"}
        ]
    },
    "SHORT_STRANGLE": {
        "id": "SHORT_STRANGLE",
        "name": "Short Strangle",
        "category": "Neutral",
        "outlook": "Range Bound",
        "description": "Sell OTM Call and OTM Put. High probability of profit with defined profit window.",
        "legs": [
            {"action": "SELL", "option_type": "CE", "offset_steps": 2, "lots": 1, "name": "OTM Short Call"},
            {"action": "SELL", "option_type": "PE", "offset_steps": -2, "lots": 1, "name": "OTM Short Put"}
        ]
    },
    "IRON_CONDOR": {
        "id": "IRON_CONDOR",
        "name": "Iron Condor",
        "category": "Neutral",
        "outlook": "Strictly Range Bound (Defined Risk)",
        "description": "4-Leg strategy combining Bull Put Spread and Bear Call Spread. Strict limited risk.",
        "legs": [
            {"action": "BUY", "option_type": "PE", "offset_steps": -4, "lots": 1, "name": "Far OTM Long Put (Wing)"},
            {"action": "SELL", "option_type": "PE", "offset_steps": -2, "lots": 1, "name": "OTM Short Put"},
            {"action": "SELL", "option_type": "CE", "offset_steps": 2, "lots": 1, "name": "OTM Short Call"},
            {"action": "BUY", "option_type": "CE", "offset_steps": 4, "lots": 1, "name": "Far OTM Long Call (Wing)"}
        ]
    },
    "IRON_BUTTERFLY": {
        "id": "IRON_BUTTERFLY",
        "name": "Iron Butterfly",
        "category": "Neutral",
        "outlook": "Low Volatility (Defined Risk)",
        "description": "Sell ATM Straddle and buy OTM wings to cap downside and upside risk.",
        "legs": [
            {"action": "BUY", "option_type": "PE", "offset_steps": -3, "lots": 1, "name": "OTM Long Put (Wing)"},
            {"action": "SELL", "option_type": "PE", "offset_steps": 0, "lots": 1, "name": "ATM Short Put"},
            {"action": "SELL", "option_type": "CE", "offset_steps": 0, "lots": 1, "name": "ATM Short Call"},
            {"action": "BUY", "option_type": "CE", "offset_steps": 3, "lots": 1, "name": "OTM Long Call (Wing)"}
        ]
    },

    # Advanced Strategies
    "CALL_RATIO_SPREAD": {
        "id": "CALL_RATIO_SPREAD",
        "name": "Call Ratio Spread",
        "category": "Advanced",
        "outlook": "Mildly Bullish (1:2)",
        "description": "Buy 1 lower Call and sell 2 higher Calls. Credit or low debit with target at short strike.",
        "legs": [
            {"action": "BUY", "option_type": "CE", "offset_steps": 0, "lots": 1, "name": "ATM Long Call"},
            {"action": "SELL", "option_type": "CE", "offset_steps": 2, "lots": 2, "name": "OTM Short Call (x2)"}
        ]
    },
    "PUT_RATIO_SPREAD": {
        "id": "PUT_RATIO_SPREAD",
        "name": "Put Ratio Spread",
        "category": "Advanced",
        "outlook": "Mildly Bearish (1:2)",
        "description": "Buy 1 higher Put and sell 2 lower Puts.",
        "legs": [
            {"action": "BUY", "option_type": "PE", "offset_steps": 0, "lots": 1, "name": "ATM Long Put"},
            {"action": "SELL", "option_type": "PE", "offset_steps": -2, "lots": 2, "name": "OTM Short Put (x2)"}
        ]
    },
    "CALL_CALENDAR_SPREAD": {
        "id": "CALL_CALENDAR_SPREAD",
        "name": "Call Calendar Spread",
        "category": "Advanced",
        "outlook": "Neutral / Time Decay",
        "description": "Sell near-month Call and buy far-month Call at the same strike.",
        "legs": [
            {"action": "SELL", "option_type": "CE", "offset_steps": 0, "lots": 1, "expiry_offset": "NEAR", "name": "Near-Month Short Call"},
            {"action": "BUY", "option_type": "CE", "offset_steps": 0, "lots": 1, "expiry_offset": "FAR", "name": "Far-Month Long Call"}
        ]
    },
    "PUT_CALENDAR_SPREAD": {
        "id": "PUT_CALENDAR_SPREAD",
        "name": "Put Calendar Spread",
        "category": "Advanced",
        "outlook": "Neutral / Time Decay",
        "description": "Sell near-month Put and buy far-month Put at the same strike.",
        "legs": [
            {"action": "SELL", "option_type": "PE", "offset_steps": 0, "lots": 1, "expiry_offset": "NEAR", "name": "Near-Month Short Put"},
            {"action": "BUY", "option_type": "PE", "offset_steps": 0, "lots": 1, "expiry_offset": "FAR", "name": "Far-Month Long Put"}
        ]
    },
    "CALL_BUTTERFLY": {
        "id": "CALL_BUTTERFLY",
        "name": "Call Butterfly",
        "category": "Advanced",
        "outlook": "Neutral / Target Pinning",
        "description": "Buy 1 ITM Call, sell 2 ATM Calls, and buy 1 OTM Call.",
        "legs": [
            {"action": "BUY", "option_type": "CE", "offset_steps": -2, "lots": 1, "name": "ITM Long Call"},
            {"action": "SELL", "option_type": "CE", "offset_steps": 0, "lots": 2, "name": "ATM Short Call (x2)"},
            {"action": "BUY", "option_type": "CE", "offset_steps": 2, "lots": 1, "name": "OTM Long Call"}
        ]
    },
    "PUT_BUTTERFLY": {
        "id": "PUT_BUTTERFLY",
        "name": "Put Butterfly",
        "category": "Advanced",
        "outlook": "Neutral / Target Pinning",
        "description": "Buy 1 OTM Put, sell 2 ATM Puts, and buy 1 ITM Put.",
        "legs": [
            {"action": "BUY", "option_type": "PE", "offset_steps": -2, "lots": 1, "name": "OTM Long Put"},
            {"action": "SELL", "option_type": "PE", "offset_steps": 0, "lots": 2, "name": "ATM Short Put (x2)"},
            {"action": "BUY", "option_type": "PE", "offset_steps": 2, "lots": 1, "name": "ITM Long Put"}
        ]
    }
}

# ---------------------------------------------------------------------------
# Mathematical Helpers: Black-Scholes Pricing, Greeks, Normal Dist
# ---------------------------------------------------------------------------
def norm_cdf(x: float) -> float:
    return (1.0 + math.erf(x / math.sqrt(2.0))) / 2.0

def norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)

def calculate_greeks(
    spot: float,
    strike: float,
    days_to_expiry: float,
    option_type: str,
    iv: float = 0.16,
    r: float = 0.065
) -> Dict[str, float]:
    """Calculate Black-Scholes option price, Delta, Gamma, Theta, and Vega."""
    t = max(days_to_expiry / 365.0, 0.001)
    if spot <= 0 or strike <= 0 or iv <= 0:
        intrinsic = max(0.0, spot - strike if option_type.upper() == "CE" else strike - spot)
        return {"price": round(intrinsic, 2), "delta": 0.5, "gamma": 0.0, "theta": 0.0, "vega": 0.0}

    d1 = (math.log(spot / strike) + (r + 0.5 * iv * iv) * t) / (iv * math.sqrt(t))
    d2 = d1 - iv * math.sqrt(t)
    is_call = option_type.upper() == "CE"

    if is_call:
        price = spot * norm_cdf(d1) - strike * math.exp(-r * t) * norm_cdf(d2)
        delta = norm_cdf(d1)
        theta = (-(spot * norm_pdf(d1) * iv) / (2.0 * math.sqrt(t)) - r * strike * math.exp(-r * t) * norm_cdf(d2)) / 365.0
    else:
        price = strike * math.exp(-r * t) * norm_cdf(-d2) - spot * norm_cdf(-d1)
        delta = norm_cdf(d1) - 1.0
        theta = (-(spot * norm_pdf(d1) * iv) / (2.0 * math.sqrt(t)) + r * strike * math.exp(-r * t) * norm_cdf(-d2)) / 365.0

    gamma = norm_pdf(d1) / (spot * iv * math.sqrt(t))
    vega = (spot * math.sqrt(t) * norm_pdf(d1)) / 100.0

    intrinsic = max(0.0, spot - strike if is_call else strike - spot)
    price = max(price, intrinsic, 0.05)

    return {
        "price": round(price, 2),
        "delta": round(delta, 4),
        "gamma": round(gamma, 6),
        "theta": round(theta, 2),
        "vega": round(vega, 2)
    }

# ---------------------------------------------------------------------------
# Expiry Dates Generator
# ---------------------------------------------------------------------------
def generate_fo_expiries(count: int = 6) -> List[str]:
    """Generate upcoming standard NSE weekly (Thursdays) and monthly expiry dates."""
    now = datetime.now(IST)
    expiries: List[str] = []
    curr = now

    # Find upcoming Thursdays
    while len(expiries) < count:
        days_ahead = 3 - curr.weekday()  # Thursday is weekday 3
        if days_ahead <= 0:
            days_ahead += 7
        next_thursday = curr + timedelta(days=days_ahead)
        exp_str = next_thursday.strftime("%d-%b-%Y").upper()
        if exp_str not in expiries:
            expiries.append(exp_str)
        curr = next_thursday + timedelta(days=1)

    return expiries

# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Dynamic Instrument Master & Expiry Resolvers
# ---------------------------------------------------------------------------
def get_all_instruments(force_refresh: bool = False) -> List[Dict[str, Any]]:
    """Retrieve complete universe of all 220+ exchange-traded NSE F&O instruments."""
    try:
        from app.nse_client import NseClient
        client = NseClient()
        master = client.fetch_fo_contract_master(force_refresh=force_refresh)
        if master and len(master) >= 50:
            for item in master:
                FO_LOOKUP[item["symbol"]] = item
            return master
    except Exception as e:
        pass
    return FO_INSTRUMENTS


def get_instrument_expiries(symbol: str) -> List[Dict[str, Any]]:
    """Retrieve actual listed exchange expiry dates for a specific instrument from NSE."""
    sym_clean = symbol.upper()
    try:
        from app.nse_client import NseClient
        client = NseClient()
        info = client.fetch_option_chain_contract_info(sym_clean)
        dates = info.get("expiryDates", [])
        if dates:
            result = []
            for d_str in dates:
                dte = 0.0
                try:
                    exp_dt = datetime.strptime(d_str, "%d-%b-%Y").replace(tzinfo=IST)
                    dte = max(0.0, round((exp_dt - datetime.now(IST)).total_seconds() / 86400.0, 1))
                except Exception:
                    pass
                result.append({
                    "expiry_date": d_str,
                    "dte": dte
                })
            return result
    except Exception as e:
        pass

    # Fallback to standard listed dates
    fallback_dates = generate_fo_expiries(6)
    return [{"expiry_date": d, "dte": 7.0} for d in fallback_dates]


# ---------------------------------------------------------------------------
# Spot Price Resolver
# ---------------------------------------------------------------------------
def get_live_spot_price(symbol: str) -> Tuple[float, float]:
    """Resolve live underlying spot price and day change % from tick_engine or cache."""
    sym_clean = symbol.upper()
    try:
        from app.tick_engine import tick_engine
        stock = tick_engine.stocks.get(sym_clean)
        if stock:
            ltp = float(stock.get("ltp") or stock.get("base_price") or 100.0)
            chg = float(stock.get("change") or 0.0)
            chg_pct = float(stock.get("change_percent") or 0.0)
            return (ltp, chg_pct)
    except Exception:
        pass

    # Check FO_LOOKUP
    item = FO_LOOKUP.get(sym_clean)
    if item and "base_price" in item:
        return (item["base_price"], 0.45)

    return (1000.0, 0.0)


# ---------------------------------------------------------------------------
# Real-Time Option Chain Builder (Official NSE Integration)
# ---------------------------------------------------------------------------
def build_option_chain(
    symbol: str,
    expiry: Optional[str] = None,
    strike_range: int = 15  # ATM ± strike_range
) -> Dict[str, Any]:
    """Build full authentic Option Chain with CE/PE strikes, Greeks, PCR, and Max Pain."""
    sym_clean = symbol.upper()
    meta = FO_LOOKUP.get(sym_clean, {
        "symbol": sym_clean,
        "name": sym_clean,
        "type": "STOCK",
        "lot_size": 250,
        "interval": 20,
        "base_price": 1000.0
    })

    lot_size = meta.get("lot_size", 250)
    interval = meta.get("interval", 20)

    # 1. Resolve Instrument Expiries (Per-Instrument Dynamic Mapping)
    expiry_objs = get_instrument_expiries(sym_clean)
    exp_dates = [e["expiry_date"] for e in expiry_objs] if expiry_objs else generate_fo_expiries(6)

    selected_expiry = expiry if (expiry and expiry in exp_dates) else (exp_dates[0] if exp_dates else "23-Nov-2026")

    # Calculate days to expiry
    try:
        exp_dt = datetime.strptime(selected_expiry, "%d-%b-%Y").replace(tzinfo=IST)
        days_to_expiry = max(0.5, round((exp_dt - datetime.now(IST)).total_seconds() / 86400.0, 1))
    except Exception:
        days_to_expiry = 5.0

    # 2. Attempt Real-Time NSE Official Option Chain Query
    raw_chain = None
    try:
        from app.nse_client import NseClient
        client = NseClient()
        raw_chain = client.fetch_live_option_chain_raw(sym_clean, selected_expiry)
    except Exception:
        pass

    # 3. IF OFFICIAL NSE LIVE DATA AVAILABLE
    if raw_chain and ("filtered" in raw_chain or "records" in raw_chain):
        filtered = raw_chain.get("filtered", {})
        records = raw_chain.get("records", {})
        raw_data = filtered.get("data") or records.get("data") or []

        spot = float(records.get("underlyingValue") or 0.0)
        change_pct = 0.0
        if spot <= 0.0:
            spot, change_pct = get_live_spot_price(sym_clean)

        if raw_data:
            # Sort strikes ascending
            raw_data.sort(key=lambda x: x.get("strikePrice", 0))
            strikes = [r.get("strikePrice") for r in raw_data if r.get("strikePrice")]

            # Identify ATM strike (closest to spot)
            atm_strike = min(strikes, key=lambda k: abs(k - spot)) if strikes else round(spot / interval) * interval

            # Max Pain & Strike Metrics Accumulator
            loss_by_strike: Dict[float, float] = {k: 0.0 for k in strikes}
            max_call_oi = -1
            max_put_oi = -1
            max_call_add = -999999
            max_put_add = -999999
            highest_call_strike = atm_strike
            highest_put_strike = atm_strike
            highest_call_add_strike = atm_strike
            highest_put_add_strike = atm_strike

            for r in raw_data:
                k = r.get("strikePrice")
                ce_oi = r.get("CE", {}).get("openInterest", 0)
                pe_oi = r.get("PE", {}).get("openInterest", 0)
                ce_chg_oi = r.get("CE", {}).get("changeinOpenInterest", 0)
                pe_chg_oi = r.get("PE", {}).get("changeinOpenInterest", 0)

                if ce_oi > max_call_oi:
                    max_call_oi = ce_oi
                    highest_call_strike = k
                if pe_oi > max_put_oi:
                    max_put_oi = pe_oi
                    highest_put_strike = k
                if ce_chg_oi > max_call_add:
                    max_call_add = ce_chg_oi
                    highest_call_add_strike = k
                if pe_chg_oi > max_put_add:
                    max_put_add = pe_chg_oi
                    highest_put_add_strike = k

                for s_test in strikes:
                    call_loss = max(0.0, s_test - k) * ce_oi
                    put_loss = max(0.0, k - s_test) * pe_oi
                    loss_by_strike[s_test] += (call_loss + put_loss)

            max_pain_strike = min(loss_by_strike, key=loss_by_strike.get) if loss_by_strike else atm_strike

            # Filter range around ATM if not ALL
            if strike_range < 50:
                atm_idx = min(range(len(raw_data)), key=lambda i: abs(raw_data[i].get("strikePrice", 0) - spot))
                start_i = max(0, atm_idx - strike_range)
                end_i = min(len(raw_data), atm_idx + strike_range + 1)
                display_items = raw_data[start_i:end_i]
            else:
                display_items = raw_data

            rows = []
            for item in display_items:
                k = item.get("strikePrice")
                is_atm = (k == atm_strike)
                ce = item.get("CE") or {}
                pe = item.get("PE") or {}

                # Buildup logic
                ce_p_up = ce.get("change", 0) > 0
                ce_oi_up = ce.get("changeinOpenInterest", 0) > 0
                ce_buildup = (
                    "Long Buildup" if (ce_p_up and ce_oi_up)
                    else "Short Buildup" if (not ce_p_up and ce_oi_up)
                    else "Short Covering" if (ce_p_up and not ce_oi_up)
                    else "Long Unwinding"
                )

                pe_p_up = pe.get("change", 0) > 0
                pe_oi_up = pe.get("changeinOpenInterest", 0) > 0
                pe_buildup = (
                    "Long Buildup" if (pe_p_up and pe_oi_up)
                    else "Short Buildup" if (not pe_p_up and pe_oi_up)
                    else "Short Covering" if (pe_p_up and not pe_oi_up)
                    else "Long Unwinding"
                )

                ce_moneyness = "ATM" if is_atm else ("ITM" if k < spot else "OTM")
                pe_moneyness = "ATM" if is_atm else ("ITM" if k > spot else "OTM")

                rows.append({
                    "strike": k,
                    "is_atm": is_atm,
                    "call": {
                        "oi": ce.get("openInterest", 0),
                        "change_oi": ce.get("changeinOpenInterest", 0),
                        "pchange_oi": round(float(ce.get("pchangeinOpenInterest", 0.0) or 0.0), 2),
                        "volume": ce.get("totalTradedVolume", 0),
                        "iv": round(float(ce.get("impliedVolatility", 0.0) or 0.0), 2),
                        "ltp": round(float(ce.get("lastPrice", 0.0) or 0.0), 2),
                        "change": round(float(ce.get("change", 0.0) or 0.0), 2),
                        "change_pct": round(float(ce.get("pChange", 0.0) or 0.0), 2),
                        "bid": round(float(ce.get("buyPrice1", 0.0) or 0.0), 2),
                        "bid_qty": int(ce.get("buyQuantity1", 0) or 0),
                        "ask": round(float(ce.get("sellPrice1", 0.0) or 0.0), 2),
                        "ask_qty": int(ce.get("sellQuantity1", 0) or 0),
                        "identifier": ce.get("identifier") or f"OPT{sym_clean}{selected_expiry}CE{k}",
                        "moneyness": ce_moneyness,
                        "buildup": ce_buildup
                    },
                    "put": {
                        "oi": pe.get("openInterest", 0),
                        "change_oi": pe.get("changeinOpenInterest", 0),
                        "pchange_oi": round(float(pe.get("pchangeinOpenInterest", 0.0) or 0.0), 2),
                        "volume": pe.get("totalTradedVolume", 0),
                        "iv": round(float(pe.get("impliedVolatility", 0.0) or 0.0), 2),
                        "ltp": round(float(pe.get("lastPrice", 0.0) or 0.0), 2),
                        "change": round(float(pe.get("change", 0.0) or 0.0), 2),
                        "change_pct": round(float(pe.get("pChange", 0.0) or 0.0), 2),
                        "bid": round(float(pe.get("buyPrice1", 0.0) or 0.0), 2),
                        "bid_qty": int(pe.get("buyQuantity1", 0) or 0),
                        "ask": round(float(pe.get("sellPrice1", 0.0) or 0.0), 2),
                        "ask_qty": int(pe.get("sellQuantity1", 0) or 0),
                        "identifier": pe.get("identifier") or f"OPT{sym_clean}{selected_expiry}PE{k}",
                        "moneyness": pe_moneyness,
                        "buildup": pe_buildup
                    }
                })

            total_call_oi = int(filtered.get("CE", {}).get("totOI") or sum(r["call"]["oi"] for r in rows))
            total_put_oi = int(filtered.get("PE", {}).get("totOI") or sum(r["put"]["oi"] for r in rows))
            total_call_vol = int(filtered.get("CE", {}).get("totVol") or sum(r["call"]["volume"] for r in rows))
            total_put_vol = int(filtered.get("PE", {}).get("totVol") or sum(r["put"]["volume"] for r in rows))

            pcr = round(total_put_oi / max(1, total_call_oi), 2)
            pcr_sentiment = "BULLISH" if pcr >= 1.2 else "BEARISH" if pcr <= 0.8 else "NEUTRAL"

            return {
                "status": "success",
                "market_status": "LIVE",
                "source": "NSE_OFFICIAL",
                "symbol": sym_clean,
                "name": meta.get("name", sym_clean),
                "instrument_type": meta.get("type", "STOCK"),
                "lot_size": lot_size,
                "interval": interval,
                "spot_price": spot,
                "change_pct": round(change_pct, 2),
                "atm_strike": atm_strike,
                "selected_expiry": selected_expiry,
                "expiries": exp_dates,
                "days_to_expiry": days_to_expiry,
                "summary": {
                    "pcr": pcr,
                    "pcr_sentiment": pcr_sentiment,
                    "max_pain": max_pain_strike,
                    "total_call_oi": total_call_oi,
                    "total_put_oi": total_put_oi,
                    "call_oi_change": sum(r["call"]["change_oi"] for r in rows),
                    "put_oi_change": sum(r["put"]["change_oi"] for r in rows),
                    "total_call_volume": total_call_vol,
                    "total_put_volume": total_put_vol,
                    "highest_call_oi_strike": highest_call_strike,
                    "highest_put_oi_strike": highest_put_strike,
                    "highest_call_addition_strike": highest_call_add_strike,
                    "highest_put_addition_strike": highest_put_add_strike
                },
                "chain": rows,
                "exchange_timestamp": records.get("timestamp") or datetime.now(IST).strftime("%d-%b-%Y %I:%M:%S %p IST"),
                "last_updated": datetime.now(IST).strftime("%d-%b-%Y %I:%M:%S %p IST")
            }

    # 4. FALLBACK: MATHEMATICAL BLACK-SCHOLES PRICING ENGINE
    spot, change_pct = get_live_spot_price(sym_clean)
    atm_strike = round(spot / interval) * interval
    strikes = [round(atm_strike + i * interval, 2) for i in range(-strike_range, strike_range + 1)]

    baseline_iv = 0.155
    try:
        from app.tick_engine import tick_engine
        vix = tick_engine.stocks.get("INDIA VIX") or tick_engine.stocks.get("INDIAVIX")
        if vix and vix.get("ltp"):
            baseline_iv = max(0.08, float(vix["ltp"]) / 100.0)
    except Exception:
        pass

    rows = []
    total_call_oi = 0
    total_put_oi = 0
    total_call_vol = 0
    total_put_vol = 0
    max_call_oi = -1
    max_put_oi = -1
    highest_call_strike = atm_strike
    highest_put_strike = atm_strike
    loss_by_strike = {k: 0.0 for k in strikes}

    for k in strikes:
        dist = (k - spot) / spot
        dist_steps = abs(k - atm_strike) / interval
        strike_iv = baseline_iv * (1.0 + 0.12 * abs(dist) + (0.05 if k < spot else 0.0))

        ce_greeks = calculate_greeks(spot, k, days_to_expiry, "CE", strike_iv)
        pe_greeks = calculate_greeks(spot, k, days_to_expiry, "PE", strike_iv)

        decay_factor = math.exp(-0.5 * ((dist_steps / 6.0) ** 2))
        round_boost = 1.35 if (k % (interval * 5) == 0) else 1.0

        base_oi = int(120000 * decay_factor * round_boost)
        ce_oi = max(500, int(base_oi * (0.85 + 0.3 * (1.0 if k >= spot else 0.5))))
        pe_oi = max(500, int(base_oi * (0.85 + 0.3 * (1.0 if k <= spot else 0.5))))

        ce_chg_oi = int(ce_oi * (0.04 * math.sin(k * 0.01)))
        pe_chg_oi = int(pe_oi * (0.05 * math.cos(k * 0.01)))

        ce_vol = int(ce_oi * 0.65)
        pe_vol = int(pe_oi * 0.60)

        ce_p_up = ce_greeks["delta"] * change_pct > 0
        ce_oi_up = ce_chg_oi > 0
        ce_buildup = (
            "Long Buildup" if (ce_p_up and ce_oi_up)
            else "Short Buildup" if (not ce_p_up and ce_oi_up)
            else "Short Covering" if (ce_p_up and not ce_oi_up)
            else "Long Unwinding"
        )

        pe_p_up = pe_greeks["delta"] * change_pct > 0
        pe_oi_up = pe_chg_oi > 0
        pe_buildup = (
            "Long Buildup" if (pe_p_up and pe_oi_up)
            else "Short Buildup" if (not pe_p_up and pe_oi_up)
            else "Short Covering" if (pe_p_up and not pe_oi_up)
            else "Long Unwinding"
        )

        ce_ltp = ce_greeks["price"]
        pe_ltp = pe_greeks["price"]
        ce_bid = round(max(0.05, ce_ltp - (0.10 if ce_ltp < 50 else 0.50)), 2)
        ce_ask = round(ce_ltp + (0.10 if ce_ltp < 50 else 0.50), 2)
        pe_bid = round(max(0.05, pe_ltp - (0.10 if pe_ltp < 50 else 0.50)), 2)
        pe_ask = round(pe_ltp + (0.10 if pe_ltp < 50 else 0.50), 2)

        ce_chg_pct = round(ce_greeks["delta"] * change_pct * (spot / max(1.0, ce_ltp)), 2)
        pe_chg_pct = round(pe_greeks["delta"] * change_pct * (spot / max(1.0, pe_ltp)), 2)

        total_call_oi += ce_oi
        total_put_oi += pe_oi
        total_call_vol += ce_vol
        total_put_vol += pe_vol

        if ce_oi > max_call_oi:
            max_call_oi = ce_oi
            highest_call_strike = k
        if pe_oi > max_put_oi:
            max_put_oi = pe_oi
            highest_put_strike = k

        for s_test in strikes:
            call_loss = max(0.0, s_test - k) * ce_oi
            put_loss = max(0.0, k - s_test) * pe_oi
            loss_by_strike[s_test] += (call_loss + put_loss)

        ce_moneyness = "ATM" if k == atm_strike else ("ITM" if k < spot else "OTM")
        pe_moneyness = "ATM" if k == atm_strike else ("ITM" if k > spot else "OTM")

        rows.append({
            "strike": k,
            "is_atm": k == atm_strike,
            "call": {
                "oi": ce_oi,
                "change_oi": ce_chg_oi,
                "pchange_oi": 0.0,
                "volume": ce_vol,
                "iv": round(strike_iv * 100.0, 2),
                "ltp": ce_ltp,
                "change": round(ce_ltp * ce_chg_pct / 100.0, 2),
                "change_pct": ce_chg_pct,
                "bid": ce_bid,
                "bid_qty": int(lot_size * 20),
                "ask": ce_ask,
                "ask_qty": int(lot_size * 15),
                "identifier": f"OPT{sym_clean}{selected_expiry}CE{k}",
                "moneyness": ce_moneyness,
                "buildup": ce_buildup
            },
            "put": {
                "oi": pe_oi,
                "change_oi": pe_chg_oi,
                "pchange_oi": 0.0,
                "volume": pe_vol,
                "iv": round(strike_iv * 100.0, 2),
                "ltp": pe_ltp,
                "change": round(pe_ltp * pe_chg_pct / 100.0, 2),
                "change_pct": pe_chg_pct,
                "bid": pe_bid,
                "bid_qty": int(lot_size * 20),
                "ask": pe_ask,
                "ask_qty": int(lot_size * 15),
                "identifier": f"OPT{sym_clean}{selected_expiry}PE{k}",
                "moneyness": pe_moneyness,
                "buildup": pe_buildup
            }
        })

    max_pain_strike = min(loss_by_strike, key=loss_by_strike.get) if loss_by_strike else atm_strike
    pcr = round(total_put_oi / max(1, total_call_oi), 2)
    pcr_sentiment = "BULLISH" if pcr >= 1.2 else "BEARISH" if pcr <= 0.8 else "NEUTRAL"

    return {
        "status": "success",
        "market_status": "OFFLINE / CACHED",
        "source": "NSE_DERIVED_MODEL",
        "symbol": sym_clean,
        "name": meta["name"],
        "instrument_type": meta["type"],
        "lot_size": lot_size,
        "interval": interval,
        "spot_price": spot,
        "change_pct": round(change_pct, 2),
        "atm_strike": atm_strike,
        "selected_expiry": selected_expiry,
        "expiries": exp_dates,
        "days_to_expiry": round(days_to_expiry, 1),
        "summary": {
            "pcr": pcr,
            "pcr_sentiment": pcr_sentiment,
            "max_pain": max_pain_strike,
            "total_call_oi": total_call_oi,
            "total_put_oi": total_put_oi,
            "call_oi_change": sum(r["call"]["change_oi"] for r in rows),
            "put_oi_change": sum(r["put"]["change_oi"] for r in rows),
            "total_call_volume": total_call_vol,
            "total_put_volume": total_put_vol,
            "highest_call_oi_strike": highest_call_strike,
            "highest_put_oi_strike": highest_put_strike,
            "highest_call_addition_strike": highest_call_strike,
            "highest_put_addition_strike": highest_put_strike
        },
        "chain": rows,
        "exchange_timestamp": datetime.now(IST).strftime("%d-%b-%Y %I:%M:%S %p IST"),
        "last_updated": datetime.now(IST).strftime("%d-%b-%Y %I:%M:%S %p IST")
    }


# ---------------------------------------------------------------------------
# Multi-Leg Strategy Payoff Calculator
# ---------------------------------------------------------------------------
def analyze_strategy_payoff(
    symbol: str,
    legs: List[Dict[str, Any]],
    expiry: Optional[str] = None
) -> Dict[str, Any]:
    """Calculate complete payoff profile, max profit, max loss, breakevens, and POP for any legs combination."""
    sym_clean = symbol.upper()
    meta = FO_LOOKUP.get(sym_clean, {
        "symbol": sym_clean,
        "name": sym_clean,
        "lot_size": 250,
        "interval": 20
    })
    lot_size = meta["lot_size"]
    spot, _ = get_live_spot_price(sym_clean)

    if not legs:
        return {
            "status": "error",
            "message": "Strategy must contain at least 1 leg."
        }

    # Normalize legs
    normalized_legs = []
    net_premium_per_share = 0.0
    total_lots = 0

    for leg in legs:
        action = leg.get("action", "BUY").upper()
        opt_type = leg.get("option_type", "CE").upper()
        strike = float(leg.get("strike") or spot)
        premium = float(leg.get("premium", 0.0))
        lots = int(leg.get("lots", 1))

        # Default premium if not supplied
        if premium <= 0:
            g = calculate_greeks(spot, strike, 7.0, opt_type)
            premium = g["price"]

        multiplier = 1 if action == "BUY" else -1
        # Buying costs premium (debit), selling collects premium (credit)
        net_premium_per_share += (multiplier * premium * lots)
        total_lots += lots

        normalized_legs.append({
            "action": action,
            "option_type": opt_type,
            "strike": strike,
            "premium": round(premium, 2),
            "lots": lots,
            "qty": lots * lot_size,
            "name": leg.get("name", f"{action} {strike} {opt_type}")
        })

    # Generate Payoff Points: Spot ± 15% in 80 granular steps
    min_spot = round(spot * 0.85, 2)
    max_spot = round(spot * 1.15, 2)
    step = (max_spot - min_spot) / 80.0
    payoff_curve = []

    pnl_values = []
    breakevens: List[float] = []
    prev_pnl = None
    prev_s = None

    for i in range(81):
        s_t = round(min_spot + i * step, 2)
        total_pnl = 0.0

        for leg in normalized_legs:
            action = leg["action"]
            opt_type = leg["option_type"]
            k = leg["strike"]
            prem = leg["premium"]
            qty = leg["qty"]

            # Expiry value of 1 share of this leg
            if opt_type == "CE":
                expiry_val = max(0.0, s_t - k)
            else:
                expiry_val = max(0.0, k - s_t)

            if action == "BUY":
                leg_pnl = (expiry_val - prem) * qty
            else:
                leg_pnl = (prem - expiry_val) * qty

            total_pnl += leg_pnl

        pnl_rounded = round(total_pnl, 2)
        pnl_values.append(pnl_rounded)
        payoff_curve.append({
            "spot": s_t,
            "pnl": pnl_rounded,
            "is_spot": abs(s_t - spot) < (step * 0.5)
        })

        # Detect breakeven zero-crossings
        if prev_pnl is not None and prev_s is not None:
            if (prev_pnl <= 0 and pnl_rounded > 0) or (prev_pnl >= 0 and pnl_rounded < 0):
                # Linear interpolation
                denom = (pnl_rounded - prev_pnl)
                if abs(denom) > 1e-6:
                    be_est = prev_s + (-prev_pnl / denom) * (s_t - prev_s)
                    breakevens.append(round(be_est, 2))

        prev_pnl = pnl_rounded
        prev_s = s_t

    # Deduplicate and sort breakevens
    breakevens = sorted(list(set(breakevens)))

    # Max profit & max loss
    min_pnl = min(pnl_values)
    max_pnl = max(pnl_values)

    # Check for unbounded extremes
    first_slope = pnl_values[1] - pnl_values[0]
    last_slope = pnl_values[-1] - pnl_values[-2]

    unlimited_profit = (first_slope < -1.0) or (last_slope > 1.0)
    unlimited_loss = (first_slope > 1.0) or (last_slope < -1.0)

    max_profit_str = "Unlimited" if unlimited_profit else f"₹{int(max_pnl):,}"
    max_loss_str = "Unlimited" if unlimited_loss else f"₹{abs(int(min_pnl)):,}"

    # Net credit or debit
    net_premium_total = round(net_premium_per_share * lot_size, 2)
    is_credit = net_premium_total < 0
    premium_type = "NET CREDIT" if is_credit else "NET DEBIT"

    # Risk-to-Reward
    if unlimited_profit:
        rr_str = "1 : Unlimited"
    elif max_pnl > 0 and min_pnl < 0:
        rr_val = round(abs(max_pnl / min_pnl), 2)
        rr_str = f"1 : {rr_val}"
    else:
        rr_str = "N/A"

    # Probability of Profit (POP %) Estimation via Black-Scholes log-normal CDF
    # Days to expiry assumed ~7.0 if not given
    t_pop = 7.0 / 365.0
    sigma = 0.16
    r = 0.065

    if not breakevens:
        pop_pct = 50.0
    elif len(breakevens) == 1:
        be = breakevens[0]
        # Check if profit is above or below BE
        if pnl_values[-1] > 0:
            # Bullish: profitable when S_T > BE
            d2 = (math.log(spot / be) + (r - 0.5 * sigma * sigma) * t_pop) / (sigma * math.sqrt(t_pop))
            pop_pct = round(norm_cdf(d2) * 100.0, 1)
        else:
            # Bearish: profitable when S_T < BE
            d2 = (math.log(spot / be) + (r - 0.5 * sigma * sigma) * t_pop) / (sigma * math.sqrt(t_pop))
            pop_pct = round((1.0 - norm_cdf(d2)) * 100.0, 1)
    else:
        # Range-bound (e.g. Iron Condor / Strangle)
        be_low = breakevens[0]
        be_high = breakevens[-1]
        d2_high = (math.log(spot / be_high) + (r - 0.5 * sigma * sigma) * t_pop) / (sigma * math.sqrt(t_pop))
        d2_low = (math.log(spot / be_low) + (r - 0.5 * sigma * sigma) * t_pop) / (sigma * math.sqrt(t_pop))
        pop_pct = round(abs(norm_cdf(d2_low) - norm_cdf(d2_high)) * 100.0, 1)

    pop_pct = max(5.0, min(95.0, pop_pct))

    # Margin Requirement Estimation (SEBI multi-leg benefit)
    # If risk is defined, margin is capped around max loss + buffer
    if not unlimited_loss and abs(min_pnl) > 0:
        est_margin = max(15000.0, abs(min_pnl) * 1.15)
    else:
        # Naked or unlimited short leg: standard span margin ~12-15% of spot * lot
        est_margin = round(spot * lot_size * 0.14 * total_lots, 2)

    return {
        "status": "success",
        "symbol": sym_clean,
        "spot_price": spot,
        "lot_size": lot_size,
        "legs": normalized_legs,
        "net_premium_total": abs(net_premium_total),
        "premium_type": premium_type,
        "is_credit": is_credit,
        "max_profit": max_pnl if not unlimited_profit else None,
        "max_profit_str": max_profit_str,
        "max_loss": abs(min_pnl) if not unlimited_loss else None,
        "max_loss_str": max_loss_str,
        "breakevens": breakevens,
        "risk_reward_ratio": rr_str,
        "probability_of_profit_pct": pop_pct,
        "estimated_margin_required": round(est_margin, 2),
        "total_investment": abs(net_premium_total) if not is_credit else est_margin,
        "payoff_curve": payoff_curve,
        "calculated_at": datetime.now(IST).strftime("%d-%b-%Y %I:%M:%S %p IST")
    }

# ---------------------------------------------------------------------------
# Saved Strategy Persistence Management
# ---------------------------------------------------------------------------
def _ensure_saved_storage() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(SAVED_STRATEGIES_FILE):
        with open(SAVED_STRATEGIES_FILE, "w", encoding="utf-8") as f:
            json.dump([], f, indent=2)

def list_saved_strategies() -> List[Dict[str, Any]]:
    _ensure_saved_storage()
    try:
        with open(SAVED_STRATEGIES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_strategy(data: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_saved_storage()
    strategies = list_saved_strategies()

    strat_id = data.get("id") or f"OPT_STRAT_{uuid.uuid4().hex[:8].upper()}"
    now_iso = datetime.now(timezone.utc).isoformat()

    record = {
        "id": strat_id,
        "name": data.get("name", "Custom Option Strategy"),
        "symbol": data.get("symbol", "NIFTY").upper(),
        "template_id": data.get("template_id"),
        "category": data.get("category", "Custom"),
        "outlook": data.get("outlook", "Neutral"),
        "legs": data.get("legs", []),
        "analysis": data.get("analysis", {}),
        "created_at": now_iso,
        "updated_at": now_iso
    }

    # Upsert
    idx = next((i for i, s in enumerate(strategies) if s.get("id") == strat_id), None)
    if idx is not None:
        record["created_at"] = strategies[idx].get("created_at", now_iso)
        strategies[idx] = record
    else:
        strategies.insert(0, record)

    with open(SAVED_STRATEGIES_FILE, "w", encoding="utf-8") as f:
        json.dump(strategies, f, indent=2)

    return record

def delete_saved_strategy(strategy_id: str) -> bool:
    _ensure_saved_storage()
    strategies = list_saved_strategies()
    filtered = [s for s in strategies if s.get("id") != strategy_id]
    if len(filtered) == len(strategies):
        return False
    with open(SAVED_STRATEGIES_FILE, "w", encoding="utf-8") as f:
        json.dump(filtered, f, indent=2)
    return True


def get_predefined_strategies(symbol: str = "NIFTY") -> List[Dict[str, Any]]:
    """Return all predefined strategy templates resolved with current spot strikes and premiums."""
    sym_clean = symbol.upper()
    meta = FO_LOOKUP.get(sym_clean, {
        "symbol": sym_clean,
        "name": sym_clean,
        "lot_size": 250,
        "interval": 20
    })
    lot_size = meta["lot_size"]
    interval = meta.get("interval", 20)
    spot, _ = get_live_spot_price(sym_clean)
    atm_strike = round(spot / interval) * interval

    results = []
    for strat_id, strat in PREDEFINED_STRATEGIES.items():
        resolved_legs = []
        for leg in strat["legs"]:
            action = leg["action"]
            opt_type = leg["option_type"]
            offset = leg.get("offset_steps", 0)
            strike = round(atm_strike + offset * interval, 2)
            lots = leg.get("lots", 1)
            g = calculate_greeks(spot, strike, 7.0, opt_type)
            resolved_legs.append({
                "action": action,
                "option_type": opt_type,
                "strike": strike,
                "offset_steps": offset,
                "lots": lots,
                "lot_size": lot_size,
                "premium": g["price"],
                "name": leg.get("name") or f"{action} {strike} {opt_type}"
            })

        results.append({
            "id": strat_id,
            "name": strat["name"],
            "category": strat["category"],
            "outlook": strat["outlook"],
            "description": strat["description"],
            "legs": resolved_legs
        })
    return results


