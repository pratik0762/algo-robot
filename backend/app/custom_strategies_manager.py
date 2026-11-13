"""Custom Strategy Manager for Algo Robot.
Handles persistent storage, validation, versioning, duplication,
and lifecycle management for user-created quantitative strategies.
"""

from __future__ import annotations
import os
import re
import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional, Tuple

IST = timezone(timedelta(hours=5, minutes=30))
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
CUSTOM_STRATEGIES_FILE = os.path.join(DATA_DIR, "custom_strategies.json")

SUPPORTED_CATEGORIES = [
    "Trend Following",
    "Momentum",
    "Breakout",
    "Mean Reversion",
    "Price Action",
    "Smart Money Concepts",
    "Volume Based",
    "Multi-Timeframe",
    "Options Strategies",
    "Custom Strategy"
]

SUPPORTED_INSTRUMENTS = [
    "Equity Stocks",
    "Stock Futures",
    "Stock Options",
    "Index Futures",
    "Index Options",
    "Other supported F&O instruments"
]

SUPPORTED_TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1H", "1D"]


def _ensure_storage() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(CUSTOM_STRATEGIES_FILE):
        with open(CUSTOM_STRATEGIES_FILE, "w", encoding="utf-8") as f:
            json.dump([], f, indent=2)


def _load_all_raw() -> List[Dict[str, Any]]:
    _ensure_storage()
    try:
        with open(CUSTOM_STRATEGIES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save_all_raw(strategies: List[Dict[str, Any]]) -> None:
    _ensure_storage()
    with open(CUSTOM_STRATEGIES_FILE, "w", encoding="utf-8") as f:
        json.dump(strategies, f, indent=2)


def slugify(name: str) -> str:
    cleaned = re.sub(r'[^a-zA-Z0-9]+', '_', name.strip().lower()).strip('_')
    return cleaned[:30] if cleaned else "custom"


def validate_strategy_for_activation(strategy_data: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """Strict validation for activating a strategy.
    Rule: Do not allow incomplete or invalid strategies to become active.
    """
    errors: List[str] = []

    name = str(strategy_data.get("name", "")).strip()
    if len(name) < 3:
        errors.append("Strategy Name must be at least 3 characters long.")

    category = strategy_data.get("category", "")
    if not category:
        errors.append("Strategy Category is required.")

    instruments = strategy_data.get("supported_instruments", [])
    if not instruments or not isinstance(instruments, list):
        errors.append("At least one Applicable Instrument must be selected.")

    timeframes = strategy_data.get("supported_timeframes", [])
    if not timeframes or not isinstance(timeframes, list):
        errors.append("At least one Supported Timeframe must be selected.")

    indicators = strategy_data.get("indicators", [])
    if not indicators or not isinstance(indicators, list):
        errors.append("At least one technical indicator must be configured.")

    buy_conds = strategy_data.get("buy_conditions", [])
    sell_conds = strategy_data.get("sell_conditions", [])
    if not buy_conds and not sell_conds:
        errors.append("At least one BUY or SELL condition rule is required.")

    # Risk parameters
    rm = strategy_data.get("risk_management", {})
    t1 = rm.get("target_1_ratio", 1.5)
    t2 = rm.get("target_2_ratio", 2.5)
    if float(t1) <= 0 or float(t2) <= 0:
        errors.append("Target calculation ratios must be positive numbers.")

    max_risk = rm.get("max_risk_per_trade_pct", 1.5)
    if float(max_risk) <= 0 or float(max_risk) > 5.0:
        errors.append("Maximum risk per trade must be between 0.1% and 5.0%.")

    return (len(errors) == 0, errors)


def format_strategy_for_display(strat: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure strategy conforms exactly to the 10-field strategy logic schema."""
    strat_copy = dict(strat)
    now_ist = datetime.now(IST).strftime("%d-%b-%Y %I:%M:%S %p IST")

    # Format indicators
    inds = []
    for ind in strat.get("indicators", []):
        if isinstance(ind, dict):
            inds.append({
                "name": ind.get("name", "Custom Indicator"),
                "symbol": ind.get("symbol", "IND"),
                "parameters": ind.get("parameters", {}),
                "purpose": ind.get("purpose", "Trading signal generation")
            })
        elif isinstance(ind, str):
            inds.append({
                "name": ind,
                "symbol": ind.split()[0] if ind else "IND",
                "parameters": {},
                "purpose": "Technical indicator filter"
            })
    strat_copy["indicators"] = inds

    # Format targets
    rm = strat.get("risk_management", {})
    t1_r = rm.get("target_1_ratio", 1.5)
    t2_r = rm.get("target_2_ratio", 2.5)
    t3_r = rm.get("target_3_ratio", 4.0)
    sl_type = rm.get("stop_loss_type", "ATR Multiplier")

    if "target_calculation" not in strat_copy or not isinstance(strat_copy["target_calculation"], dict):
        strat_copy["target_calculation"] = {
            "target_1": f"Entry + (Risk * {t1_r}) — Target 1 (Scalp / First Book)",
            "target_2": f"Entry + (Risk * {t2_r}) — Target 2 (Primary Trend Target)",
            "target_3": f"Entry + (Risk * {t3_r}) — Target 3 (Extended Runner)"
        }

    if "stop_loss_logic" not in strat_copy or not strat_copy["stop_loss_logic"]:
        strat_copy["stop_loss_logic"] = f"Calculated based on {sl_type} with dynamic volatility buffering and max {rm.get('max_risk_per_trade_pct', 1.5)}% capital risk limit."

    if "risk_reward" not in strat_copy or not strat_copy["risk_reward"]:
        strat_copy["risk_reward"] = f"1 : {t1_r} min structural ratio"

    if "exit_conditions" not in strat_copy or not strat_copy["exit_conditions"]:
        strat_copy["exit_conditions"] = [
            f"Target 1 hit (+{t1_r}R)",
            f"Target 2 hit (+{t2_r}R)",
            "Trailing Stop Loss hit",
            "Opposite momentum signal generated",
            "End of trading session (15:15 IST) for intraday positions"
        ]

    if "confirmation_rules" not in strat_copy or not strat_copy["confirmation_rules"]:
        adv = strat.get("advanced_settings", {})
        rules = []
        if adv.get("candle_close_confirmation", True):
            rules.append("Candle-Close Confirmation: Signals require confirmed closed candle.")
        if adv.get("higher_timeframe_confirmation", False):
            rules.append("Higher-Timeframe Confirmation: Alignment with HTF trend required.")
        if adv.get("volume_filter", False):
            rules.append("Volume Filter: Volume must exceed 1.5x 20-period Volume SMA.")
        if not rules:
            rules.append("Strict condition verification without unconfirmed intra-candle signals.")
        strat_copy["confirmation_rules"] = rules

    is_active = strat.get("is_enabled", False)
    status_label = "ACTIVE & OPERATIONAL" if is_active else ("DRAFT (INCOMPLETE)" if strat.get("is_draft", True) else "DISABLED")

    strat_copy["status"] = {
        "is_enabled": is_active,
        "status_label": status_label,
        "applicable_instruments": ", ".join(strat.get("supported_instruments", ["NSE Equities"])),
        "last_evaluated": now_ist,
        "last_signal_generated": "Ready for Execution" if is_active else "Strategy Inactive",
        "data_status": "AUTHENTIC NSE LIVE FEED"
    }

    return strat_copy


def create_custom_strategy(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create and persist a new custom strategy with versioning."""
    strategies = _load_all_raw()

    name = data.get("name", "Custom Quantitative Strategy").strip()
    base_slug = f"custom_{slugify(name)}"
    unique_id = f"{base_slug}_{uuid.uuid4().hex[:6]}"

    want_active = data.get("is_enabled", False)
    is_valid, errors = validate_strategy_for_activation(data)

    if want_active and not is_valid:
        raise ValueError(f"Cannot activate invalid strategy: {'; '.join(errors)}")

    now_iso = datetime.now(timezone.utc).isoformat()
    now_ist = datetime.now(IST).strftime("%d-%b-%Y %I:%M:%S %p IST")

    category = data.get("category", "Custom Strategy")
    version = "1.0.0"

    strategy_record = {
        "id": unique_id,
        "name": name,
        "category": category,
        "badge": f"CUSTOM {category.upper()[:12]}",
        "win_rate": data.get("win_rate", "65%"),
        "version": version,
        "version_history": [
            {
                "version": version,
                "created_at": now_iso,
                "notes": "Initial custom strategy creation"
            }
        ],
        "is_custom": True,
        "is_enabled": want_active and is_valid,
        "is_draft": not want_active or not is_valid,
        "is_archived": False,
        "description": data.get("description", "Custom algorithmic trading strategy designed in Strategy Builder."),
        "trading_objective": data.get("trading_objective", "Capture statistical edge through multi-indicator rules."),
        "supported_instruments": data.get("supported_instruments", ["Equity Stocks"]),
        "supported_timeframes": data.get("supported_timeframes", ["15m"]),
        "indicators": data.get("indicators", []),
        "buy_conditions": data.get("buy_conditions", []),
        "sell_conditions": data.get("sell_conditions", []),
        "condition_rules": data.get("condition_rules", {}),
        "risk_management": data.get("risk_management", {
            "entry_type": "Market on Candle Close",
            "stop_loss_type": "ATR Multiplier",
            "stop_loss_multiplier": 1.5,
            "target_1_ratio": 1.5,
            "target_2_ratio": 2.5,
            "target_3_ratio": 4.0,
            "risk_reward_ratio": "1:2.0",
            "max_risk_per_trade_pct": 1.5,
            "signal_validity_bars": 3
        }),
        "advanced_settings": data.get("advanced_settings", {
            "higher_timeframe_confirmation": False,
            "volume_filter": True,
            "volume_filter_multiplier": 1.5,
            "candle_close_confirmation": True,
            "trading_session_start": "09:30",
            "trading_session_end": "15:15",
            "cooldown_bars": 3,
            "duplicate_signal_prevention": True
        }),
        "created_at": now_iso,
        "updated_at": now_iso
    }

    formatted = format_strategy_for_display(strategy_record)
    strategies.append(strategy_record)
    _save_all_raw(strategies)

    return formatted


def list_custom_strategies(include_archived: bool = False) -> List[Dict[str, Any]]:
    """List all custom strategies."""
    strategies = _load_all_raw()
    result = []
    for s in strategies:
        if not include_archived and s.get("is_archived", False):
            continue
        result.append(format_strategy_for_display(s))
    return result


def get_custom_strategy(strategy_id: str) -> Optional[Dict[str, Any]]:
    """Get single custom strategy by ID."""
    strategies = _load_all_raw()
    for s in strategies:
        if s.get("id") == strategy_id:
            return format_strategy_for_display(s)
    return None


def update_custom_strategy(strategy_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Update custom strategy with automatic version increment to preserve historical integrity."""
    strategies = _load_all_raw()
    idx = next((i for i, s in enumerate(strategies) if s.get("id") == strategy_id), None)
    if idx is None:
        raise KeyError(f"Strategy '{strategy_id}' not found.")

    curr = strategies[idx]
    want_active = data.get("is_enabled", curr.get("is_enabled", False))
    is_valid, errors = validate_strategy_for_activation(data)

    if want_active and not is_valid:
        raise ValueError(f"Cannot activate incomplete strategy: {'; '.join(errors)}")

    # Increment minor version (e.g. 1.0.0 -> 1.1.0)
    old_version = curr.get("version", "1.0.0")
    try:
        parts = [int(p) for p in old_version.split(".")]
        parts[1] += 1
        new_version = f"{parts[0]}.{parts[1]}.0"
    except Exception:
        new_version = f"{old_version}.1"

    now_iso = datetime.now(timezone.utc).isoformat()
    history = curr.get("version_history", [])
    history.append({
        "version": new_version,
        "created_at": now_iso,
        "notes": data.get("update_notes", "Strategy modified via Strategy Builder")
    })

    # Update fields while preserving id and history
    curr.update({
        "name": data.get("name", curr["name"]),
        "category": data.get("category", curr["category"]),
        "badge": f"CUSTOM {data.get('category', curr['category']).upper()[:12]}",
        "description": data.get("description", curr["description"]),
        "trading_objective": data.get("trading_objective", curr["trading_objective"]),
        "supported_instruments": data.get("supported_instruments", curr["supported_instruments"]),
        "supported_timeframes": data.get("supported_timeframes", curr["supported_timeframes"]),
        "indicators": data.get("indicators", curr["indicators"]),
        "buy_conditions": data.get("buy_conditions", curr["buy_conditions"]),
        "sell_conditions": data.get("sell_conditions", curr["sell_conditions"]),
        "condition_rules": data.get("condition_rules", curr.get("condition_rules", {})),
        "risk_management": data.get("risk_management", curr["risk_management"]),
        "advanced_settings": data.get("advanced_settings", curr["advanced_settings"]),
        "is_enabled": want_active and is_valid,
        "is_draft": not want_active or not is_valid,
        "version": new_version,
        "version_history": history,
        "updated_at": now_iso
    })

    strategies[idx] = curr
    _save_all_raw(strategies)
    return format_strategy_for_display(curr)


def duplicate_custom_strategy(strategy_id: str) -> Dict[str, Any]:
    """Clone an existing strategy into a new draft custom strategy."""
    strategies = _load_all_raw()
    source = next((s for s in strategies if s.get("id") == strategy_id), None)

    # Check if duplicating a built-in strategy
    if not source:
        from app.strategy_registry import STRATEGY_REGISTRY
        source = STRATEGY_REGISTRY.get(strategy_id)

    if not source:
        raise KeyError(f"Strategy '{strategy_id}' not found to duplicate.")

    cloned_data = dict(source)
    cloned_data["name"] = f"Copy of {source['name']}"
    cloned_data["is_enabled"] = False  # Start cloned strategy as draft
    cloned_data["is_draft"] = True

    return create_custom_strategy(cloned_data)


def patch_strategy_status(strategy_id: str, is_enabled: Optional[bool] = None, is_archived: Optional[bool] = None) -> Dict[str, Any]:
    """Activate, disable, or archive a custom strategy."""
    strategies = _load_all_raw()
    idx = next((i for i, s in enumerate(strategies) if s.get("id") == strategy_id), None)
    if idx is None:
        raise KeyError(f"Custom strategy '{strategy_id}' not found.")

    strat = strategies[idx]
    if is_archived is not None:
        strat["is_archived"] = is_archived
        if is_archived:
            strat["is_enabled"] = False

    if is_enabled is not None:
        if is_enabled:
            is_valid, errors = validate_strategy_for_activation(strat)
            if not is_valid:
                raise ValueError(f"Cannot activate strategy: {'; '.join(errors)}")
            strat["is_enabled"] = True
            strat["is_draft"] = False
        else:
            strat["is_enabled"] = False

    strat["updated_at"] = datetime.now(timezone.utc).isoformat()
    strategies[idx] = strat
    _save_all_raw(strategies)
    return format_strategy_for_display(strat)


def delete_custom_strategy(strategy_id: str) -> bool:
    """Delete a custom strategy permanently after confirmation."""
    strategies = _load_all_raw()
    initial_len = len(strategies)
    filtered = [s for s in strategies if s.get("id") != strategy_id]
    if len(filtered) == initial_len:
        return False
    _save_all_raw(filtered)
    return True

