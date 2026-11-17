"""
ALGO ROBOT — Institutional Event-Driven Quantitative Backtesting Engine
Executes chronological bar-by-bar simulations without lookahead bias,
supporting Phase 6 Smart Money Concepts, exact Indian exchange friction,
and advanced risk-adjusted performance metrics.
"""

from __future__ import annotations
import math
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np

from app.backtesting.friction_model import IndianFrictionModel, InstrumentClass
from app.backtesting.metrics import PerformanceMetricsCalculator
from app.market_data_service import MarketDataService
from app.instrument_adapters import NSE_FO_LOT_SIZES
from app.strategies.smc_strategies import (
    OrderBlockMitigationStrategy,
    FairValueGapImbalanceStrategy,
    BreakOfStructureStrategy,
    SupertrendTrendRiderStrategy,
    VwapBandMeanReversionStrategy,
    StrategySignalCandidate,
)

logger = logging.getLogger("algo_robot.backtesting.engine")
IST = timezone(timedelta(hours=5, minutes=30))


class QuantitativeBacktestingEngine:
    """Event-driven chronological backtesting engine for quantitative & SMC strategies."""

    def __init__(self, market_data: Optional[MarketDataService] = None):
        self.market_data = market_data or MarketDataService()
        self._strategy_registry = {
            "SMC_ORDER_BLOCK": OrderBlockMitigationStrategy,
            "SMC_FAIR_VALUE_GAP": FairValueGapImbalanceStrategy,
            "SMC_BOS_CHOCH": BreakOfStructureStrategy,
            "QUANT_SUPERTREND_RIDER": SupertrendTrendRiderStrategy,
            "QUANT_VWAP_MEAN_REVERSION": VwapBandMeanReversionStrategy,
        }

    def run_backtest(
        self,
        strategy_id: str,
        symbols: List[str],
        timeframe: str = "15m",
        instrument_type: str = "EQUITY_INTRADAY",
        initial_capital: float = 500000.0,
        risk_per_trade_pct: float = 1.5,
        slippage_pct: float = 0.0003,
        brokerage_per_order: float = 20.0,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        strategy_params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Executes full chronological simulation with zero lookahead bias."""
        capital = float(initial_capital)
        peak_capital = capital
        trades: List[Dict[str, Any]] = []
        equity_curve: List[Dict[str, Any]] = []

        # Determine Instrument Class
        inst_upper = instrument_type.upper()
        if "DELIVERY" in inst_upper:
            inst_class = InstrumentClass.EQUITY_DELIVERY
        elif "FUT" in inst_upper:
            inst_class = InstrumentClass.FUTURES
        elif "OPT" in inst_upper:
            inst_class = InstrumentClass.OPTIONS
        else:
            inst_class = InstrumentClass.EQUITY_INTRADAY

        # Initial baseline equity curve point
        equity_curve.append({
            "timestamp": int(datetime.now(IST).timestamp() * 1000) - 30 * 86400 * 1000,
            "date": "Initial Capital",
            "equity": round(capital, 2),
            "drawdown_pct": 0.0,
        })

        strat_cls = self._strategy_registry.get(strategy_id)

        for sym in symbols:
            candles = self.market_data.get_candles(sym, timeframe=timeframe, limit=300)
            if not candles or len(candles) < 30:
                continue

            if start_date:
                candles = [c for c in candles if c.get("time", "") >= start_date]
            if end_date:
                candles = [c for c in candles if c.get("time", "") <= end_date]

            if len(candles) < 30:
                continue

            active_trade: Optional[Dict[str, Any]] = None

            # Chronological walk: bar-by-bar
            for i in range(25, len(candles)):
                current_candle = candles[i]
                c_open = float(current_candle["open"])
                c_high = float(current_candle["high"])
                c_low = float(current_candle["low"])
                c_close = float(current_candle["close"])
                c_vol = float(current_candle.get("volume", 1000.0))
                c_time = current_candle.get("time", str(i))
                c_ts = current_candle.get("timestamp", int(datetime.now(IST).timestamp() * 1000))

                # 1. Manage Active Trade
                if active_trade is not None:
                    side = active_trade["side"]
                    qty = active_trade["quantity"]
                    entry_p = active_trade["entry_price"]
                    sl = active_trade["stop_loss"]
                    t1 = active_trade["target_1"]
                    t2 = active_trade["target_2"]

                    exit_occurred = False
                    exit_p = 0.0
                    exit_reason = ""

                    # Excursion Tracking
                    if side == "BUY":
                        bar_mfe = max(0.0, ((c_high - entry_p) / entry_p) * 100.0)
                        bar_mae = min(0.0, ((c_low - entry_p) / entry_p) * 100.0)
                        active_trade["mfe_pct"] = max(active_trade["mfe_pct"], bar_mfe)
                        active_trade["mae_pct"] = min(active_trade["mae_pct"], bar_mae)

                        # SL Check
                        if c_low <= sl:
                            exit_occurred = True
                            exit_p = round(min(c_open, sl) * (1.0 - slippage_pct), 2)
                            exit_reason = "STOP_LOSS_HIT"
                        # Target 2 Check
                        elif c_high >= t2:
                            exit_occurred = True
                            exit_p = round(max(c_open, t2) * (1.0 - slippage_pct), 2)
                            exit_reason = "TARGET_2_HIT"
                        # Target 1 Check
                        elif c_high >= t1 and not active_trade.get("t1_hit"):
                            active_trade["t1_hit"] = True
                            active_trade["stop_loss"] = entry_p  # Trail SL to breakeven

                    else:  # SELL / SHORT
                        bar_mfe = max(0.0, ((entry_p - c_low) / entry_p) * 100.0)
                        bar_mae = min(0.0, ((entry_p - c_high) / entry_p) * 100.0)
                        active_trade["mfe_pct"] = max(active_trade["mfe_pct"], bar_mfe)
                        active_trade["mae_pct"] = min(active_trade["mae_pct"], bar_mae)

                        # SL Check
                        if c_high >= sl:
                            exit_occurred = True
                            exit_p = round(max(c_open, sl) * (1.0 + slippage_pct), 2)
                            exit_reason = "STOP_LOSS_HIT"
                        # Target 2 Check
                        elif c_low <= t2:
                            exit_occurred = True
                            exit_p = round(min(c_open, t2) * (1.0 + slippage_pct), 2)
                            exit_reason = "TARGET_2_HIT"
                        # Target 1 Check
                        elif c_low <= t1 and not active_trade.get("t1_hit"):
                            active_trade["t1_hit"] = True
                            active_trade["stop_loss"] = entry_p  # Trail to breakeven

                    if exit_occurred:
                        # Compute Gross PnL
                        if side == "BUY":
                            gross_pnl = (exit_p - entry_p) * qty
                        else:
                            gross_pnl = (entry_p - exit_p) * qty

                        # Exact Statutory Regulatory Friction
                        friction_data = IndianFrictionModel.calculate_round_trip_friction(
                            instrument_class=inst_class,
                            entry_price=entry_p,
                            exit_price=exit_p,
                            quantity=qty,
                            brokerage_per_order=brokerage_per_order,
                            slippage_pct=slippage_pct,
                        )
                        friction_cost = friction_data["total_friction"]
                        net_pnl = round(gross_pnl - friction_cost, 2)
                        pnl_pct = round((net_pnl / (entry_p * qty)) * 100.0, 2)

                        capital += net_pnl
                        peak_capital = max(peak_capital, capital)
                        dd_pct = round(((peak_capital - capital) / peak_capital) * 100.0, 2) if peak_capital > 0 else 0.0

                        trades.append({
                            "trade_id": f"TRD-{len(trades) + 1}",
                            "symbol": sym,
                            "side": side,
                            "quantity": qty,
                            "entry_time": active_trade["entry_time"],
                            "entry_price": entry_p,
                            "exit_time": c_time,
                            "exit_price": exit_p,
                            "gross_pnl": round(gross_pnl, 2),
                            "friction": friction_cost,
                            "net_pnl": net_pnl,
                            "pnl_percent": pnl_pct,
                            "outcome": exit_reason,
                            "mfe_pct": round(active_trade["mfe_pct"], 2),
                            "mae_pct": round(active_trade["mae_pct"], 2),
                            "charges_breakdown": friction_data,
                        })

                        equity_curve.append({
                            "timestamp": c_ts,
                            "date": c_time,
                            "equity": round(capital, 2),
                            "drawdown_pct": dd_pct,
                        })

                        active_trade = None

                # 2. Evaluate Strategy Trigger (if no active position)
                if active_trade is None and i < len(candles) - 1:
                    past_slice = candles[:i + 1]
                    opens_arr = np.array([c["open"] for c in past_slice], dtype=np.float64)
                    highs_arr = np.array([c["high"] for c in past_slice], dtype=np.float64)
                    lows_arr = np.array([c["low"] for c in past_slice], dtype=np.float64)
                    closes_arr = np.array([c["close"] for c in past_slice], dtype=np.float64)
                    vols_arr = np.array([c.get("volume", 1000.0) for c in past_slice], dtype=np.float64)

                    cand: Optional[StrategySignalCandidate] = None
                    if strat_cls:
                        cand = strat_cls.evaluate(
                            symbol=sym,
                            opens=opens_arr,
                            highs=highs_arr,
                            lows=lows_arr,
                            closes=closes_arr,
                            volumes=vols_arr,
                            timeframe=timeframe,
                        )
                    else:
                        # Legacy strategy fallback via custom indicators or simple SMA cross
                        fast = np.mean(closes_arr[-9:])
                        slow = np.mean(closes_arr[-21:])
                        if fast > slow and closes_arr[-1] > closes_arr[-2]:
                            cand = StrategySignalCandidate(
                                strategy_id=strategy_id,
                                strategy_name=strategy_id,
                                symbol=sym,
                                timeframe=timeframe,
                                signal_type="BUY",
                                entry_price=c_close,
                                stop_loss=round(c_close * 0.985, 2),
                                target_1=round(c_close * 1.02, 2),
                                target_2=round(c_close * 1.04, 2),
                                risk_reward=2.0,
                                confidence_score=80.0,
                            )

                    if cand:
                        risk_capital = capital * (risk_per_trade_pct / 100.0)
                        per_unit_risk = max(abs(cand.entry_price - cand.stop_loss), cand.entry_price * 0.005)

                        if inst_class in (InstrumentClass.FUTURES, InstrumentClass.OPTIONS):
                            lot_size = NSE_FO_LOT_SIZES.get(sym, 25)
                            lots = max(1, int(risk_capital / (per_unit_risk * lot_size)))
                            qty = lots * lot_size
                        else:
                            qty = max(1, int(risk_capital / per_unit_risk))

                        # Apply execution slippage on entry
                        if cand.signal_type == "BUY":
                            exec_entry = round(cand.entry_price * (1.0 + slippage_pct), 2)
                        else:
                            exec_entry = round(cand.entry_price * (1.0 - slippage_pct), 2)

                        active_trade = {
                            "symbol": sym,
                            "side": cand.signal_type,
                            "quantity": qty,
                            "entry_price": exec_entry,
                            "stop_loss": cand.stop_loss,
                            "target_1": cand.target_1,
                            "target_2": cand.target_2,
                            "entry_time": c_time,
                            "mfe_pct": 0.0,
                            "mae_pct": 0.0,
                            "t1_hit": False,
                        }

        # Calculate final analytics
        metrics = PerformanceMetricsCalculator.calculate_metrics(
            trades=trades,
            initial_capital=initial_capital,
            final_capital=capital,
            equity_curve=equity_curve,
        )

        return {
            "strategy_id": strategy_id,
            "strategy_name": getattr(strat_cls, "NAME", strategy_id),
            "symbols_tested": symbols,
            "timeframe": timeframe,
            "instrument_type": inst_class.value,
            "initial_capital": initial_capital,
            "final_capital": round(capital, 2),
            "metrics": metrics,
            "equity_curve": equity_curve,
            "trades": trades,
            "total_trades": len(trades),
            "executed_at": datetime.now(IST).strftime("%d-%b-%Y %I:%M:%S %p IST"),
        }


# Singleton engine
backtest_engine = QuantitativeBacktestingEngine()
