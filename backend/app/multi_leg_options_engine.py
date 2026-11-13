"""
Multi-Leg Options Spread Engine
================================
Supports institutional multi-leg option strategies for NSE Index & Stock Options:
- Bull Call Spread (Debit)
- Bear Put Spread (Debit)
- Short Straddle (Credit / Delta Neutral)
- Short Strangle (Credit / Volatility Contraction)
- Iron Condor (4-Leg Defined Risk Credit Spread)
- Long Straddle (Volatility Expansion)

Computes:
- Real strike selection (ATM, OTM wings, strike steps)
- Black-Scholes Greeks (Delta, Gamma, Theta, Vega)
- Net Premium (Debit/Credit)
- Payoff at Expiry across spot variations (-10% to +10%)
- Max Profit, Max Loss, Risk-to-Reward, Break-Even points
- SEBI Multi-Leg Margin Benefit Estimation
"""

import math
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

try:
    from app.instrument_adapters import NSE_FO_LOT_SIZES
except ImportError:
    NSE_FO_LOT_SIZES = {"NIFTY": 25, "BANKNIFTY": 15, "FINNIFTY": 25, "RELIANCE": 250, "TCS": 175}

STRIKE_INTERVALS = {
    "NIFTY": 50,
    "BANKNIFTY": 100,
    "FINNIFTY": 50,
    "MIDCPNIFTY": 25,
    "RELIANCE": 20,
    "TCS": 20,
    "HDFCBANK": 10,
    "INFY": 10,
    "ICICIBANK": 10,
    "DEFAULT": 20
}

def get_strike_interval(symbol: str) -> int:
    return STRIKE_INTERVALS.get(symbol.upper(), STRIKE_INTERVALS["DEFAULT"])

def get_lot_size(symbol: str) -> int:
    return NSE_FO_LOT_SIZES.get(symbol.upper(), 50)

def round_to_strike(price: float, interval: int) -> float:
    return round(price / interval) * interval

# -----------------------------------------------------------------------------
# Black-Scholes Pricing & Greeks Helper
# -----------------------------------------------------------------------------
def norm_cdf(x: float) -> float:
    """Standard normal cumulative distribution function (Abramowitz & Stegun approximation)."""
    return (1.0 + math.erf(x / math.sqrt(2.0))) / 2.0

def norm_pdf(x: float) -> float:
    """Standard normal probability density function."""
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)

def calculate_option_price_and_greeks(
    spot: float,
    strike: float,
    days_to_expiry: float,
    option_type: str,
    iv: float = 0.16,
    r: float = 0.065
) -> Dict[str, float]:
    """Calculate Black-Scholes theoretical price and Greeks."""
    t = max(days_to_expiry / 365.0, 0.001)
    if spot <= 0 or strike <= 0 or iv <= 0:
        return {"price": max(0.0, spot - strike if option_type.upper() == "CE" else strike - spot),
                "delta": 0.5, "gamma": 0.0, "theta": 0.0, "vega": 0.0}

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

    # Minimum intrinsic value clamp
    intrinsic = max(0.0, spot - strike if is_call else strike - spot)
    price = max(price, intrinsic, 0.05)

    return {
        "price": round(price, 2),
        "delta": round(delta, 4),
        "gamma": round(gamma, 6),
        "theta": round(theta, 2),
        "vega": round(vega, 2)
    }

# -----------------------------------------------------------------------------
# Multi-Leg Strategy Definitions
# -----------------------------------------------------------------------------
MULTI_LEG_STRATEGIES = {
    "BULL_CALL_SPREAD": {
        "name": "Bull Call Spread",
        "type": "DEBIT",
        "description": "Moderately bullish strategy with capped profit and strictly defined limited risk.",
        "legs": [
            {"action": "BUY", "option_type": "CE", "offset_steps": 0, "name": "ATM Long Call"},
            {"action": "SELL", "option_type": "CE", "offset_steps": 2, "name": "OTM Short Call"}
        ]
    },
    "BEAR_PUT_SPREAD": {
        "name": "Bear Put Spread",
        "type": "DEBIT",
        "description": "Moderately bearish strategy profiting from downside momentum with capped risk.",
        "legs": [
            {"action": "BUY", "option_type": "PE", "offset_steps": 0, "name": "ATM Long Put"},
            {"action": "SELL", "option_type": "PE", "offset_steps": -2, "name": "OTM Short Put"}
        ]
    },
    "SHORT_STRADDLE": {
        "name": "Short Straddle",
        "type": "CREDIT",
        "description": "Non-directional delta-neutral strategy profiting from theta decay in range-bound markets.",
        "legs": [
            {"action": "SELL", "option_type": "CE", "offset_steps": 0, "name": "ATM Short Call"},
            {"action": "SELL", "option_type": "PE", "offset_steps": 0, "name": "ATM Short Put"}
        ]
    },
    "SHORT_STRANGLE": {
        "name": "Short Strangle",
        "type": "CREDIT",
        "description": "Wide-range market neutral strategy selling OTM Call and Put with higher win rate.",
        "legs": [
            {"action": "SELL", "option_type": "CE", "offset_steps": 2, "name": "OTM Short Call"},
            {"action": "SELL", "option_type": "PE", "offset_steps": -2, "name": "OTM Short Put"}
        ]
    },
    "IRON_CONDOR": {
        "name": "Iron Condor",
        "type": "CREDIT",
        "description": "Defined-risk market-neutral 4-leg spread selling OTM strangle with outer wing protection.",
        "legs": [
            {"action": "SELL", "option_type": "PE", "offset_steps": -2, "name": "OTM Short Put"},
            {"action": "BUY", "option_type": "PE", "offset_steps": -4, "name": "Wing Long Put (Hedge)"},
            {"action": "SELL", "option_type": "CE", "offset_steps": 2, "name": "OTM Short Call"},
            {"action": "BUY", "option_type": "CE", "offset_steps": 4, "name": "Wing Long Call (Hedge)"}
        ]
    },
    "LONG_STRADDLE": {
        "name": "Long Straddle",
        "type": "DEBIT",
        "description": "High volatility strategy profiting from massive explosive moves in either direction.",
        "legs": [
            {"action": "BUY", "option_type": "CE", "offset_steps": 0, "name": "ATM Long Call"},
            {"action": "BUY", "option_type": "PE", "offset_steps": 0, "name": "ATM Long Put"}
        ]
    }
}

class MultiLegOptionsEngine:
    """Quantitative calculation engine for institutional multi-leg option spreads."""

    def build_spread(
        self,
        strategy_key: str,
        symbol: str,
        spot_price: float,
        days_to_expiry: float = 7.0,
        iv: float = 0.16,
        lots: int = 1
    ) -> Dict[str, Any]:
        """Construct full multi-leg spread with exact strikes, pricing, Greeks, and payoff curve."""
        strategy_key = strategy_key.upper()
        if strategy_key not in MULTI_LEG_STRATEGIES:
            raise ValueError(f"Unknown multi-leg strategy '{strategy_key}'. Available: {list(MULTI_LEG_STRATEGIES.keys())}")

        strat_def = MULTI_LEG_STRATEGIES[strategy_key]
        interval = get_strike_interval(symbol)
        lot_size = get_lot_size(symbol)
        total_qty = lots * lot_size
        atm_strike = round_to_strike(spot_price, interval)

        resolved_legs = []
        net_delta = 0.0
        net_gamma = 0.0
        net_theta = 0.0
        net_vega = 0.0
        net_premium_per_share = 0.0

        for leg_def in strat_def["legs"]:
            strike = atm_strike + (leg_def["offset_steps"] * interval)
            greeks = calculate_option_price_and_greeks(
                spot=spot_price,
                strike=strike,
                days_to_expiry=days_to_expiry,
                option_type=leg_def["option_type"],
                iv=iv
            )
            price = greeks["price"]
            multiplier = 1.0 if leg_def["action"] == "BUY" else -1.0

            net_delta += multiplier * greeks["delta"]
            net_gamma += multiplier * greeks["gamma"]
            net_theta += multiplier * greeks["theta"]
            net_vega += multiplier * greeks["vega"]
            net_premium_per_share += multiplier * price

            resolved_legs.append({
                "name": leg_def["name"],
                "action": leg_def["action"],
                "option_type": leg_def["option_type"],
                "strike": strike,
                "price": price,
                "delta": greeks["delta"],
                "gamma": greeks["gamma"],
                "theta": greeks["theta"],
                "vega": greeks["vega"],
                "total_cost": round(price * total_qty, 2)
            })

        net_premium_total = round(net_premium_per_share * total_qty, 2)
        spread_type = "NET_DEBIT" if net_premium_per_share > 0 else "NET_CREDIT"

        # Generate Payoff Profile across range of underlying prices at expiry
        price_range_pct = 0.08  # +/- 8%
        step_pts = max(interval, int(spot_price * 0.005))
        min_p = round_to_strike(spot_price * (1.0 - price_range_pct), interval)
        max_p = round_to_strike(spot_price * (1.0 + price_range_pct), interval)

        payoff_curve = []
        curr = min_p
        max_profit = -999999999.0
        max_loss = 999999999.0
        break_evens = []
        prev_pnl = None

        while curr <= max_p:
            pnl_per_share = 0.0
            for leg in resolved_legs:
                is_call = leg["option_type"] == "CE"
                intrinsic = max(0.0, curr - leg["strike"]) if is_call else max(0.0, leg["strike"] - curr)
                if leg["action"] == "BUY":
                    pnl_per_share += (intrinsic - leg["price"])
                else:
                    pnl_per_share += (leg["price"] - intrinsic)

            tot_pnl = round(pnl_per_share * total_qty, 2)
            max_profit = max(max_profit, tot_pnl)
            max_loss = min(max_loss, tot_pnl)

            # Check break-even crossings
            if prev_pnl is not None and ((prev_pnl < 0 and tot_pnl >= 0) or (prev_pnl > 0 and tot_pnl <= 0)):
                break_evens.append(curr)
            prev_pnl = tot_pnl

            payoff_curve.append({
                "spot_at_expiry": curr,
                "pnl": tot_pnl,
                "pnl_pct": round((tot_pnl / (abs(net_premium_total) or 1.0)) * 100, 2)
            })
            curr += step_pts

        # Margin Requirement with SEBI multi-leg hedging benefits
        if spread_type == "NET_DEBIT":
            estimated_margin = abs(net_premium_total)
        else:
            # Credit spreads: Margin capped at wing difference minus premium collected
            spread_width = abs(resolved_legs[0]["strike"] - resolved_legs[1]["strike"]) * total_qty
            estimated_margin = max(abs(net_premium_total), spread_width * 0.7)

        return {
            "strategy_key": strategy_key,
            "strategy_name": strat_def["name"],
            "description": strat_def["description"],
            "symbol": symbol.upper(),
            "spot_price": spot_price,
            "atm_strike": atm_strike,
            "strike_interval": interval,
            "lot_size": lot_size,
            "lots": lots,
            "total_quantity": total_qty,
            "days_to_expiry": days_to_expiry,
            "spread_type": spread_type,
            "net_premium_per_share": round(abs(net_premium_per_share), 2),
            "net_premium_total": abs(net_premium_total),
            "max_profit": round(max_profit, 2) if max_profit < 9999999 else "UNLIMITED",
            "max_loss": round(abs(max_loss), 2) if max_loss > -9999999 else "UNLIMITED",
            "risk_reward_ratio": round(abs(max_profit / max_loss), 2) if (max_loss != 0 and isinstance(max_profit, (int, float)) and isinstance(max_loss, (int, float))) else "N/A",
            "break_even_points": break_evens or [round(atm_strike + net_premium_per_share, 2)],
            "estimated_margin_required": round(estimated_margin, 2),
            "net_greeks": {
                "delta": round(net_delta, 4),
                "gamma": round(net_gamma, 6),
                "theta": round(net_theta, 2),
                "vega": round(net_vega, 2)
            },
            "legs": resolved_legs,
            "payoff_curve": payoff_curve
        }

    def backtest_multi_leg_spread(
        self,
        strategy_key: str,
        symbol: str,
        ohlcv_candles: List[Dict[str, Any]],
        entry_trigger: str = "EMA_CROSS",
        holding_bars: int = 15,
        lots: int = 1
    ) -> Dict[str, Any]:
        """Simulate multi-leg spread execution across historical candle series."""
        trades = []
        lot_size = get_lot_size(symbol)
        total_qty = lots * lot_size
        capital = 500000.0

        i = 20
        while i < len(ohlcv_candles) - holding_bars:
            candle = ohlcv_candles[i]
            spot_entry = candle["close"]

            # Generate multi-leg structure at entry
            spread = self.build_spread(
                strategy_key=strategy_key,
                symbol=symbol,
                spot_price=spot_entry,
                days_to_expiry=7.0,
                lots=lots
            )

            # Fast forward to exit candle
            exit_candle = ohlcv_candles[i + holding_bars]
            spot_exit = exit_candle["close"]

            # Calculate payoff at exit
            net_pnl = 0.0
            for leg in spread["legs"]:
                is_call = leg["option_type"] == "CE"
                # Theoretical value at exit (decayed theta + spot move)
                exit_greeks = calculate_option_price_and_greeks(
                    spot=spot_exit,
                    strike=leg["strike"],
                    days_to_expiry=max(1.0, 7.0 - (holding_bars * 0.1)),
                    option_type=leg["option_type"]
                )
                leg_exit_price = exit_greeks["price"]
                if leg["action"] == "BUY":
                    net_pnl += (leg_exit_price - leg["price"]) * total_qty
                else:
                    net_pnl += (leg["price"] - leg_exit_price) * total_qty

            charges = round(40.0 * len(spread["legs"]) + (abs(net_pnl) * 0.001), 2)
            final_pnl = round(net_pnl - charges, 2)

            trades.append({
                "trade_id": f"ML-{symbol}-{len(trades)+1}",
                "strategy": spread["strategy_name"],
                "entry_time": candle.get("date", candle.get("timestamp")),
                "entry_spot": spot_entry,
                "exit_time": exit_candle.get("date", exit_candle.get("timestamp")),
                "exit_spot": spot_exit,
                "net_premium": spread["net_premium_total"],
                "gross_pnl": round(net_pnl, 2),
                "charges": charges,
                "net_pnl": final_pnl,
                "return_pct": round((final_pnl / spread["estimated_margin_required"]) * 100, 2),
                "outcome": "PROFIT" if final_pnl > 0 else "LOSS"
            })
            i += (holding_bars + 5)  # Jump ahead to prevent overlapping identical bars

        total_trades = len(trades)
        wins = sum(1 for t in trades if t["net_pnl"] > 0)
        losses = sum(1 for t in trades if t["net_pnl"] <= 0)
        net_profit = round(sum(t["net_pnl"] for t in trades), 2)
        win_rate = round((wins / total_trades) * 100, 2) if total_trades > 0 else 0.0

        return {
            "status": "success",
            "strategy": strategy_key,
            "symbol": symbol,
            "total_trades": total_trades,
            "winning_trades": wins,
            "losing_trades": losses,
            "win_rate_pct": win_rate,
            "net_profit": net_profit,
            "trades": trades
        }

multi_leg_engine = MultiLegOptionsEngine()

