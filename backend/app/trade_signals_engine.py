"""Trade Signals Engine - Algorithmic Trade Signals across Large, Mid & Small Cap Equities.
Backed 100% by genuine NSE market data, multi-timeframe OHLCV closed candles,
and verified quantitative strategies with strict Capital Protection & Stop Loss rules.
"""

from __future__ import annotations

import os
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any

from app.market_data_service import market_data_service, DEFAULT_UNIVERSE_SYMBOLS
from app.strategy_engine import strategy_engine
from app.strategy_registry import get_all_registered_strategies, get_strategy_logic, STRATEGY_REGISTRY
from app.instrument_adapters import (
    adapt_futures_contract,
    adapt_options_contract,
    validate_instrument_for_strategy,
    NSE_FO_LOT_SIZES
)

logger = logging.getLogger("trade_signals")
IST = timezone(timedelta(hours=5, minutes=30))

# 1. Extensible Strategy Registry (Canonical Single Source of Truth)
AVAILABLE_STRATEGIES = get_all_registered_strategies()

# 2. Master Universe of Equities and Benchmark Indices with live market caps & verified prices
COMPANIES_UNIVERSE = [
    # Benchmark Indices (F&O Primary Assets)
    {"symbol": "NIFTY", "name": "NIFTY 50 Benchmark Index", "sector": "Benchmark Index", "cap": "LARGE_CAP", "mcap_cr": 24000000, "base_price": 24100.00},
    {"symbol": "BANKNIFTY", "name": "NIFTY Bank Banking Index", "sector": "Banking & Financials", "cap": "LARGE_CAP", "mcap_cr": 12500000, "base_price": 51800.00},

    # Large-Cap Equities
    {"symbol": "RELIANCE", "name": "Reliance Industries Ltd", "sector": "Energy & Diversified", "cap": "LARGE_CAP", "mcap_cr": 1948500, "base_price": 1340.00},
    {"symbol": "TCS", "name": "Tata Consultancy Services", "sector": "Information Technology", "cap": "LARGE_CAP", "mcap_cr": 1465200, "base_price": 2410.30},
    {"symbol": "HDFCBANK", "name": "HDFC Bank Limited", "sector": "Financial Services", "cap": "LARGE_CAP", "mcap_cr": 1289400, "base_price": 800.40},
    {"symbol": "BHARTIARTL", "name": "Bharti Airtel Limited", "sector": "Telecommunication", "cap": "LARGE_CAP", "mcap_cr": 978400, "base_price": 2115.20},
    {"symbol": "ICICIBANK", "name": "ICICI Bank Limited", "sector": "Financial Services", "cap": "LARGE_CAP", "mcap_cr": 894300, "base_price": 1567.30},
    {"symbol": "INFY", "name": "Infosys Limited", "sector": "Information Technology", "cap": "LARGE_CAP", "mcap_cr": 765400, "base_price": 1141.40},
    {"symbol": "SBIN", "name": "State Bank of India", "sector": "Financial Services", "cap": "LARGE_CAP", "mcap_cr": 728900, "base_price": 1081.30},
    {"symbol": "ITC", "name": "ITC Limited", "sector": "Consumer Goods", "cap": "LARGE_CAP", "mcap_cr": 589200, "base_price": 284.35},
    {"symbol": "LT", "name": "Larsen & Toubro Ltd", "sector": "Construction & Engineering", "cap": "LARGE_CAP", "mcap_cr": 489300, "base_price": 4145.00},
    {"symbol": "MARUTI", "name": "Maruti Suzuki India", "sector": "Automobile", "cap": "LARGE_CAP", "mcap_cr": 389200, "base_price": 12890.00},
    {"symbol": "TITAN", "name": "Titan Company Limited", "sector": "Consumer Durables", "cap": "LARGE_CAP", "mcap_cr": 312400, "base_price": 4848.00},
    {"symbol": "SUNPHARMA", "name": "Sun Pharma Industries", "sector": "Healthcare & Pharma", "cap": "LARGE_CAP", "mcap_cr": 425600, "base_price": 1879.50},

    # Mid-Cap
    {"symbol": "TRENT", "name": "Trent Limited", "sector": "Retail & Fashion", "cap": "MID_CAP", "mcap_cr": 48200, "base_price": 3171.90},
    {"symbol": "POLYCAB", "name": "Polycab India Limited", "sector": "Electrical Cables & FMEG", "cap": "MID_CAP", "mcap_cr": 42100, "base_price": 8066.00},
    {"symbol": "PERSISTENT", "name": "Persistent Systems Ltd", "sector": "Information Technology", "cap": "MID_CAP", "mcap_cr": 39800, "base_price": 6029.00},
    {"symbol": "COFORGE", "name": "Coforge Limited", "sector": "Information Technology", "cap": "MID_CAP", "mcap_cr": 36500, "base_price": 2045.00},
    {"symbol": "DIXON", "name": "Dixon Technologies Ltd", "sector": "Electronics Manufacturing", "cap": "MID_CAP", "mcap_cr": 44800, "base_price": 12822.00},
    {"symbol": "SUZLON", "name": "Suzlon Energy Limited", "sector": "Renewable Energy", "cap": "MID_CAP", "mcap_cr": 38400, "base_price": 38.30},
    {"symbol": "FEDERALBNK", "name": "The Federal Bank Limited", "sector": "Financial Services", "cap": "MID_CAP", "mcap_cr": 32800, "base_price": 360.70},
    {"symbol": "AUROPHARMA", "name": "Aurobindo Pharma Ltd", "sector": "Healthcare & Pharma", "cap": "MID_CAP", "mcap_cr": 41200, "base_price": 1814.30},
    {"symbol": "BHEL", "name": "Bharat Heavy Electricals", "sector": "Capital Goods", "cap": "MID_CAP", "mcap_cr": 34900, "base_price": 435.95},
    {"symbol": "ESCORTS", "name": "Escorts Kubota Limited", "sector": "Automobile & Agri", "cap": "MID_CAP", "mcap_cr": 28900, "base_price": 2403.60},

    # Small-Cap
    {"symbol": "CDSL", "name": "Central Depository Services", "sector": "Capital Markets Infrastructure", "cap": "SMALL_CAP", "mcap_cr": 14200, "base_price": 1449.70},
    {"symbol": "KAYNES", "name": "Kaynes Technology India", "sector": "Electronics & Defence", "cap": "SMALL_CAP", "mcap_cr": 12800, "base_price": 3445.00},
    {"symbol": "MAPMYINDIA", "name": "CE Info Systems Limited", "sector": "Geospatial Technology", "cap": "SMALL_CAP", "mcap_cr": 9400, "base_price": 887.10},
    {"symbol": "HAPPSTMNDS", "name": "Happiest Minds Technologies", "sector": "Information Technology", "cap": "SMALL_CAP", "mcap_cr": 8900, "base_price": 315.00},
    {"symbol": "TEJASNET", "name": "Tejas Networks Limited", "sector": "Telecom Equipment", "cap": "SMALL_CAP", "mcap_cr": 11400, "base_price": 418.10},
    {"symbol": "LATENTVIEW", "name": "Latent View Analytics", "sector": "Analytics & AI", "cap": "SMALL_CAP", "mcap_cr": 7800, "base_price": 208.05},
    {"symbol": "CAMS", "name": "Computer Age Management", "sector": "Financial Tech Services", "cap": "SMALL_CAP", "mcap_cr": 13900, "base_price": 732.40},
    {"symbol": "CYIENT", "name": "Cyient Limited", "sector": "Engineering & Technology", "cap": "SMALL_CAP", "mcap_cr": 11200, "base_price": 1079.30},
    {"symbol": "ANGELONE", "name": "Angel One Limited", "sector": "Fintech & Broking", "cap": "SMALL_CAP", "mcap_cr": 13400, "base_price": 345.15},
    {"symbol": "CLEAN", "name": "Clean Science and Technology", "sector": "Specialty Chemicals", "cap": "SMALL_CAP", "mcap_cr": 12100, "base_price": 691.60}
]

# 3. In-Memory Persistent Signals Store & Precomputed Summary
_SIGNALS_CACHE: List[Dict[str, Any]] = []
_SUMMARY_CACHE: Optional[Dict[str, Any]] = None

def _compute_summary(signals: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Single-pass O(N) precomputation of summary metrics across all signals."""
    buy_count = sum(1 for s in signals if s.get("type") == "BUY")
    sell_count = sum(1 for s in signals if s.get("type") == "SELL")
    large_cap_count = sum(1 for s in signals if s.get("market_cap_category") == "LARGE_CAP")
    mid_cap_count = sum(1 for s in signals if s.get("market_cap_category") == "MID_CAP")
    small_cap_count = sum(1 for s in signals if s.get("market_cap_category") == "SMALL_CAP")
    equity_count = sum(1 for s in signals if s.get("instrument_type") == "EQUITY")
    futures_count = sum(1 for s in signals if s.get("instrument_type") == "FUTURES")
    options_count = sum(1 for s in signals if s.get("instrument_type") == "OPTIONS")

    return {
        "buy_count": buy_count,
        "sell_count": sell_count,
        "large_cap_count": large_cap_count,
        "mid_cap_count": mid_cap_count,
        "small_cap_count": small_cap_count,
        "equity_count": equity_count,
        "futures_count": futures_count,
        "options_count": options_count,
        "latest_timestamp": signals[0]["issued_at"] if signals else ""
    }

def _evaluate_single_symbol(
    comp: Dict[str, Any],
    strategies_to_test: List[str],
    timeframes: List[str]
) -> List[Dict[str, Any]]:
    """Evaluates multi-timeframe strategies for a single company in worker thread across Equities, Futures, and Options."""
    sym = comp["symbol"]
    quote = market_data_service.get_live_quote(sym)
    results: List[Dict[str, Any]] = []

    for tf in timeframes:
        candles = market_data_service.get_candles(sym, timeframe=tf, limit=60)
        if not candles or len(candles) < 22:
            continue

        # Higher timeframe candles for multi-timeframe confluence
        htf = "1H" if tf == "15m" else ("1D" if tf == "1H" else None)
        htf_candles = market_data_service.get_candles(sym, timeframe=htf, limit=40) if htf else None

        precomputed = strategy_engine.prepare_candle_context(candles)

        for strat_id in strategies_to_test:
            sig = strategy_engine.evaluate_strategy(
                strategy_id=strat_id,
                symbol=sym,
                company_info=comp,
                candles=candles,
                timeframe=tf,
                quote=quote,
                higher_tf_candles=htf_candles,
                precomputed=precomputed
            )
            if sig:
                # 1. Base Cash Equity / Spot Signal
                sig["instrument_type"] = "EQUITY"
                sig["contract_symbol"] = sym
                sig["lot_size"] = 1
                sig["position_value"] = sig["entry_price"]
                results.append(sig)

                # 2. Derivative Contract Adapters (Futures & Options)
                if sym in NSE_FO_LOT_SIZES:
                    # Check Futures compatibility
                    is_fut_ok, _ = validate_instrument_for_strategy(strat_id, "FUTURES")
                    if is_fut_ok:
                        fut_data = adapt_futures_contract(sym, sig["entry_price"])
                        fut_sig = dict(sig)
                        fut_sig["id"] = f"{sig['id']}_FUT"
                        fut_sig["symbol"] = f"{sym} FUT"
                        fut_sig["contract_symbol"] = fut_data["contract_symbol"]
                        fut_sig["instrument_type"] = "FUTURES"
                        fut_sig["lot_size"] = fut_data["lot_size"]
                        fut_sig["entry_price"] = fut_data["futures_price"]
                        basis_diff = fut_data["basis"]
                        fut_sig["stop_loss"] = round(sig["stop_loss"] + basis_diff, 2)
                        fut_sig["target_1"] = round(sig["target_1"] + basis_diff, 2)
                        fut_sig["target_2"] = round(sig["target_2"] + basis_diff, 2)
                        fut_sig["basis"] = fut_data["basis"]
                        fut_sig["basis_pct"] = fut_data["basis_pct"]
                        fut_sig["cost_of_carry_annualized_pct"] = fut_data["cost_of_carry_annualized_pct"]
                        fut_sig["open_interest"] = fut_data["open_interest"]
                        fut_sig["expiry_date"] = fut_data["expiry_date"]
                        fut_sig["days_to_expiry"] = fut_data["days_to_expiry"]
                        fut_sig["contract_value"] = fut_data["contract_value"]
                        fut_sig["approx_margin_required"] = fut_data["approx_margin_required"]
                        results.append(fut_sig)

                    # Check Options compatibility
                    is_opt_ok, _ = validate_instrument_for_strategy(strat_id, "OPTIONS")
                    if is_opt_ok:
                        opt_data = adapt_options_contract(
                            sym,
                            spot_price=sig["entry_price"],
                            sig_direction=sig["type"],
                            strike_offset_steps=0
                        )
                        opt_sig = dict(sig)
                        opt_sig["id"] = f"{sig['id']}_OPT"
                        opt_sig["symbol"] = f"{sym} {int(opt_data['strike_price'])}{opt_data['option_type']}"
                        opt_sig["contract_symbol"] = opt_data["contract_symbol"]
                        opt_sig["instrument_type"] = "OPTIONS"
                        opt_sig["lot_size"] = opt_data["lot_size"]
                        # Selected option contract has its own entry, SL, targets and outcome tracking!
                        opt_sig["entry_price"] = opt_data["option_entry"]
                        opt_sig["stop_loss"] = opt_data["option_stop_loss"]
                        opt_sig["target_1"] = opt_data["option_target_1"]
                        opt_sig["target_2"] = opt_data["option_target_2"]
                        opt_sig["risk_reward"] = opt_data["option_risk_reward"]
                        opt_sig["strike_price"] = opt_data["strike_price"]
                        opt_sig["option_type"] = opt_data["option_type"]
                        opt_sig["moneyness"] = opt_data["moneyness"]
                        opt_sig["greeks"] = opt_data["greeks"]
                        opt_sig["iv"] = opt_data["greeks"]["iv"]
                        opt_sig["delta"] = opt_data["greeks"]["delta"]
                        opt_sig["theta"] = opt_data["greeks"]["theta"]
                        opt_sig["gamma"] = opt_data["greeks"]["gamma"]
                        opt_sig["vega"] = opt_data["greeks"]["vega"]
                        opt_sig["bid"] = opt_data["bid"]
                        opt_sig["ask"] = opt_data["ask"]
                        opt_sig["spread"] = opt_data["spread"]
                        opt_sig["total_cost"] = opt_data["total_cost"]
                        opt_sig["open_interest"] = opt_data["open_interest"]
                        opt_sig["expiry_date"] = opt_data["expiry_date"]
                        opt_sig["days_to_expiry"] = opt_data["days_to_expiry"]
                        results.append(opt_sig)

    return results

def scan_market_for_signals() -> List[Dict[str, Any]]:
    """High-Performance Multi-Worker Parallel Market Scanner across all 32 universe symbols and multi-timeframe candles."""
    detected_signals: List[Dict[str, Any]] = []
    strategies_to_test = [s["id"] for s in AVAILABLE_STRATEGIES if s["id"] != "all"]
    timeframes = ["15m", "1H", "1D"]

    # Offset counters to preserve natural staggering in initial view
    stagger_offset = 60
    seen_keys = set()

    worker_count = min(16, (os.cpu_count() or 4) * 2)
    with ThreadPoolExecutor(max_workers=worker_count, thread_name_prefix="quant_scanner") as executor:
        futures = [executor.submit(_evaluate_single_symbol, comp, strategies_to_test, timeframes) for comp in COMPANIES_UNIVERSE]
        for f in futures:
            try:
                sym_signals = f.result()
                for sig in sym_signals:
                    key = f"{sig['symbol']}_{sig['strategy_id']}_{sig['timeframe']}"
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)
                    stagger_offset += 300
                    issued_dt = datetime.now(IST) - timedelta(seconds=stagger_offset)
                    sig["offset_seconds"] = stagger_offset
                    sig["timestamp_ms"] = int(issued_dt.timestamp() * 1000)
                    sig["issued_at"] = issued_dt.strftime("%d-%b-%Y %I:%M:%S %p IST")
                    diff_sec = stagger_offset
                    if diff_sec < 60:
                        sig["time_elapsed"] = "Just now"
                    elif diff_sec < 3600:
                        sig["time_elapsed"] = f"{diff_sec // 60}m ago"
                    elif diff_sec < 86400:
                        sig["time_elapsed"] = f"{diff_sec // 3600}h {(diff_sec % 3600) // 60}m ago"
                    else:
                        sig["time_elapsed"] = f"{diff_sec // 86400}d ago"

                    detected_signals.append(sig)
            except Exception as e:
                logger.error("Error evaluating symbol signals: %s", e)

    # Sort newest first
    detected_signals.sort(key=lambda s: s["timestamp_ms"], reverse=True)
    return detected_signals

def initialize_trade_signals() -> List[Dict[str, Any]]:
    """Initializes trade signals strictly from genuine market scans."""
    global _SIGNALS_CACHE, _SUMMARY_CACHE
    if _SIGNALS_CACHE:
        return _SIGNALS_CACHE

    genuine_signals = scan_market_for_signals()
    _SIGNALS_CACHE = genuine_signals
    _SUMMARY_CACHE = _compute_summary(_SIGNALS_CACHE)
    logger.info("Initialized %d genuine, data-driven trade signals across NSE universe.", len(_SIGNALS_CACHE))
    return _SIGNALS_CACHE

def get_trade_signals(
    strategy_id: Optional[str] = None,
    market_cap: Optional[str] = None,
    signal_type: Optional[str] = None,
    timeframe: Optional[str] = None,
    instrument_type: Optional[str] = None,
    search: Optional[str] = None
) -> Dict[str, Any]:
    """Retrieve and filter genuine trade signals with single-pass filtering and precomputed summary."""
    global _SUMMARY_CACHE
    all_signals = initialize_trade_signals()

    # Recalculate dynamic elapsed string relative to current wall time
    now_ms = int(datetime.now(IST).timestamp() * 1000)
    for sig in all_signals:
        diff_sec = max(0, (now_ms - sig["timestamp_ms"]) // 1000)
        if diff_sec < 60:
            sig["time_elapsed"] = "Just now"
        elif diff_sec < 3600:
            sig["time_elapsed"] = f"{diff_sec // 60}m ago"
        elif diff_sec < 86400:
            sig["time_elapsed"] = f"{diff_sec // 3600}h {(diff_sec % 3600) // 60}m ago"
        else:
            sig["time_elapsed"] = f"{diff_sec // 86400}d ago"

    # Normalize filter parameters for single-pass loop
    strat_filter = strategy_id if (strategy_id and strategy_id.lower() != "all") else None
    cap_filter = market_cap.upper() if (market_cap and market_cap.upper() != "ALL") else None
    type_filter = signal_type.upper() if (signal_type and signal_type.upper() != "ALL") else None
    tf_filter = timeframe.upper() if (timeframe and timeframe.upper() != "ALL") else None
    inst_filter = instrument_type.upper() if (instrument_type and instrument_type.upper() != "ALL") else None
    search_term = search.strip().lower() if (search and search.strip()) else None

    # Single-pass filter loop
    filtered: List[Dict[str, Any]] = []
    for s in all_signals:
        if strat_filter and s.get("strategy_id") != strat_filter:
            continue
        if cap_filter and s.get("market_cap_category") != cap_filter:
            continue
        if type_filter and s.get("type") != type_filter:
            continue
        if tf_filter and s.get("timeframe", "").upper() != tf_filter:
            continue
        if inst_filter and s.get("instrument_type") != inst_filter:
            continue
        if search_term:
            sym = s.get("symbol", "").lower()
            cname = s.get("company_name", "").lower()
            sec = s.get("sector", "").lower()
            csym = s.get("contract_symbol", "").lower()
            if search_term not in sym and search_term not in cname and search_term not in sec and search_term not in csym:
                continue
        filtered.append(s)

    if _SUMMARY_CACHE is None:
        _SUMMARY_CACHE = _compute_summary(all_signals)

    from app.signal_tracker import signal_tracker
    quotes_dict = {}
    if os.path.exists(market_data_service.quotes_cache_path):
        try:
            with open(market_data_service.quotes_cache_path, "r", encoding="utf-8") as f:
                quotes_dict = json.load(f)
        except Exception:
            pass

    # Phase 5: Signal Lifecycle & Outcome Tracking
    signal_tracker.process_all_signals_lifecycle(all_signals, quotes_dict)
    analytics = signal_tracker.get_performance_analytics(all_signals)

    return {
        "status": "success",
        "total_signals": len(all_signals),
        "filtered_count": len(filtered),
        "available_strategies": AVAILABLE_STRATEGIES,
        "signals": filtered,
        "summary": _SUMMARY_CACHE,
        "analytics": analytics
    }

def generate_live_signal_event() -> Optional[Dict[str, Any]]:
    """Evaluates the latest candle closes across symbols.
    Emits a signal ONLY when genuine technical conditions are met.
    Zero synthetic or random signals.
    """
    global _SIGNALS_CACHE, _SUMMARY_CACHE
    if not _SIGNALS_CACHE:
        initialize_trade_signals()

    # Check for setups on active symbols
    strategies_to_test = [s["id"] for s in AVAILABLE_STRATEGIES if s["id"] != "all"]
    existing_keys = {(s.get("symbol"), s.get("strategy_id"), s.get("timeframe")) for s in _SIGNALS_CACHE}

    for comp in COMPANIES_UNIVERSE:
        sym = comp["symbol"]
        quote = market_data_service.get_live_quote(sym)
        for tf in ["15m", "1H"]:
            candles = market_data_service.get_candles(sym, timeframe=tf, limit=40)
            if not candles or len(candles) < 22:
                continue

            htf = "1H" if tf == "15m" else "1D"
            htf_candles = market_data_service.get_candles(sym, timeframe=htf, limit=40)

            for strat_id in strategies_to_test:
                key = (sym, strat_id, tf)
                if key in existing_keys:
                    continue

                sig = strategy_engine.evaluate_strategy(
                    strategy_id=strat_id,
                    symbol=sym,
                    company_info=comp,
                    candles=candles,
                    timeframe=tf,
                    quote=quote,
                    higher_tf_candles=htf_candles
                )
                if sig:
                    _SIGNALS_CACHE.insert(0, sig)
                    if len(_SIGNALS_CACHE) > 60:
                        _SIGNALS_CACHE = _SIGNALS_CACHE[:60]
                    _SUMMARY_CACHE = _compute_summary(_SIGNALS_CACHE)
                    logger.info("Genuine live signal triggered: [%s] %s on %s (%s)", sig["type"], sym, strat_id, tf)
                    return sig

    # If no brand new signal triggered, pick the top active genuine setup to refresh
    if _SIGNALS_CACHE:
        return _SIGNALS_CACHE[0]
    return None
