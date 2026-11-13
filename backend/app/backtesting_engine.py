"""High-Performance Backtesting Engine for Algo Robot.
Simulates quantitative trading strategies on historical OHLCV candle series with:
1. Strict Chronological Bar-by-Bar Walkforward (Zero Lookahead Bias)
2. Realistic Order Execution (Market/Limit, Slippage, Stop Loss, Target 1 & 2)
3. Full Indian Statutory Charges & Brokerage (STT, Exchange Turnover, GST, SEBI, Stamp Duty)
4. Multi-Asset Class Support:
   - Cash Equities (Share sizing, Intraday STT)
   - Index & Stock Futures (Lot sizes, Basis adjustment, MTM risk)
   - Index & Stock Options (CE/PE contract pricing, Delta/Theta Greeks tracking)
5. Comprehensive Performance Analytics (Win Rate, Profit Factor, Max Drawdown, Sharpe, Sortino, Equity Curve)
6. Strategy Logic Consistency with Live Engine (Phase 7 Rule).
"""

from __future__ import annotations

import math
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional, Tuple

from app.strategy_engine import strategy_engine
from app.market_data_service import MarketDataService
from app.instrument_adapters import (
    NSE_FO_LOT_SIZES,
    adapt_futures_contract,
    adapt_options_contract,
    validate_instrument_for_strategy
)
from app.custom_strategies_manager import get_custom_strategy

logger = logging.getLogger("backtesting_engine")
IST = timezone(timedelta(hours=5, minutes=30))


class TransactionCostModel:
    """Calculates realistic Indian exchange brokerage and statutory taxes (NSE)."""

    @staticmethod
    def calculate_costs(
        instrument_type: str,
        side: str,  # 'BUY' or 'SELL'
        price: float,
        qty: int,
        brokerage_per_order: float = 20.0
    ) -> Dict[str, float]:
        turnover = price * qty
        inst = instrument_type.upper()

        # 1. Brokerage: flat ₹20 or 0.03% whichever is lower
        brokerage = min(brokerage_per_order, turnover * 0.0003)

        # 2. Securities Transaction Tax (STT) & Exchange fees
        if inst == "EQUITY":
            stt = (turnover * 0.00025) if side == "SELL" else 0.0  # 0.025% on sell
            turnover_charges = turnover * 0.0000325  # NSE: 0.00325%
            stamp_duty = (turnover * 0.00003) if side == "BUY" else 0.0  # 0.003% on buy
        elif inst == "FUTURES":
            stt = (turnover * 0.0002) if side == "SELL" else 0.0   # 0.02% on sell
            turnover_charges = turnover * 0.000019  # NSE: 0.0019%
            stamp_duty = (turnover * 0.00002) if side == "BUY" else 0.0  # 0.002% on buy
        else:  # OPTIONS
            stt = (turnover * 0.001) if side == "SELL" else 0.0    # 0.1% on sell premium
            turnover_charges = turnover * 0.0005  # NSE: 0.05% on premium
            stamp_duty = (turnover * 0.00003) if side == "BUY" else 0.0

        # 3. GST: 18% on (Brokerage + Exchange Turnover charges)
        gst = (brokerage + turnover_charges) * 0.18

        # 4. SEBI Charges: ₹10 per crore (0.0001%)
        sebi = turnover * 0.000001

        total_charges = round(brokerage + stt + turnover_charges + gst + sebi + stamp_duty, 2)
        return {
            "turnover": round(turnover, 2),
            "brokerage": round(brokerage, 2),
            "stt": round(stt, 2),
            "exchange_charges": round(turnover_charges, 2),
            "gst": round(gst, 2),
            "sebi": round(sebi, 2),
            "stamp_duty": round(stamp_duty, 2),
            "total_charges": total_charges
        }


class BacktestingEngine:
    """Simulates trading strategies across historical candles with realistic market mechanics."""

    def __init__(self, market_data: Optional[MarketDataService] = None) -> None:
        self.market_data = market_data or MarketDataService()

    def run_backtest(
        self,
        strategy_id: str,
        symbols: List[str],
        timeframe: str = "15m",
        instrument_type: str = "EQUITY",  # 'EQUITY', 'FUTURES', 'OPTIONS'
        initial_capital: float = 500000.0,
        risk_per_trade_pct: float = 1.5,
        slippage_pct: float = 0.0005,  # 0.05% slippage
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        brokerage_per_order: float = 20.0
    ) -> Dict[str, Any]:
        """Executes full chronological simulation with zero lookahead bias."""
        capital = float(initial_capital)
        peak_capital = capital
        trades: List[Dict[str, Any]] = []
        equity_curve: List[Dict[str, Any]] = []

        # Validate Strategy & Compatibility
        custom_strat = None
        if strategy_id.startswith("custom_"):
            custom_strat = get_custom_strategy(strategy_id)
            if not custom_strat:
                raise ValueError(f"Custom strategy '{strategy_id}' not found.")
        else:
            is_compat, note = validate_instrument_for_strategy(strategy_id, instrument_type)
            if not is_compat:
                logger.warning("Compatibility note for %s on %s: %s", strategy_id, instrument_type, note)

        # Initial baseline equity curve point
        equity_curve.append({
            "timestamp": int(datetime.now(IST).timestamp() * 1000) - 30 * 86400 * 1000,
            "date": "Initial Capital",
            "equity": round(capital, 2),
            "drawdown_pct": 0.0
        })

        # Process each symbol in backtest universe
        for sym in symbols:
            candles = self.market_data.get_candles(sym, timeframe=timeframe, limit=200)
            if not candles or len(candles) < 25:
                continue

            if start_date:
                candles = [c for c in candles if c.get("time", "") >= start_date]
            if end_date:
                candles = [c for c in candles if c.get("time", "") <= end_date]

            if len(candles) < 25:
                continue

            active_trade: Optional[Dict[str, Any]] = None

            for i in range(25, len(candles)):
                current_candle = candles[i]
                c_high = float(current_candle["high"])
                c_low = float(current_candle["low"])
                c_close = float(current_candle["close"])
                c_open = float(current_candle["open"])
                c_time = current_candle.get("time", "")
                c_ts = current_candle.get("timestamp", int(datetime.now(IST).timestamp() * 1000))

                # -------------------------------------------------------------
                # 1. Evaluate Open Position Management
                # -------------------------------------------------------------
                if active_trade is not None:
                    side = active_trade["side"]  # 'BUY' or 'SELL'
                    qty = active_trade["quantity"]
                    inst = active_trade["instrument_type"]

                    # Underlying spot trigger levels
                    spot_entry = active_trade["spot_entry"]
                    spot_sl = active_trade["spot_sl"]
                    spot_t1 = active_trade["spot_t1"]
                    spot_t2 = active_trade["spot_t2"]

                    # Contract prices
                    contract_entry = active_trade["entry_price"]
                    contract_sl = active_trade["contract_sl"]
                    contract_t1 = active_trade["contract_t1"]
                    contract_t2 = active_trade["contract_t2"]

                    # Excursion tracking on spot movement
                    if side == "BUY":
                        bar_gain = ((c_high - spot_entry) / spot_entry) * 100.0
                        bar_dd = ((c_low - spot_entry) / spot_entry) * 100.0
                        active_trade["mfe_pct"] = max(active_trade["mfe_pct"], max(0.0, bar_gain))
                        active_trade["mae_pct"] = min(active_trade["mae_pct"], min(0.0, bar_dd))
                    else:  # SELL
                        bar_gain = ((spot_entry - c_low) / spot_entry) * 100.0
                        bar_dd = ((spot_entry - c_high) / spot_entry) * 100.0
                        active_trade["mfe_pct"] = max(active_trade["mfe_pct"], max(0.0, bar_gain))
                        active_trade["mae_pct"] = min(active_trade["mae_pct"], min(0.0, bar_dd))

                    exit_occurred = False
                    exit_price = 0.0
                    outcome = ""

                    if side == "BUY":
                        # Stop Loss check
                        if c_low <= spot_sl:
                            exit_occurred = True
                            outcome = "STOP_LOSS_HIT"
                            if inst == "EQUITY":
                                fill_p = min(c_open, spot_sl)
                                exit_price = round(fill_p * (1.0 - slippage_pct), 2)
                            elif inst == "FUTURES":
                                fill_p = min(c_open + active_trade["basis"], contract_sl)
                                exit_price = round(fill_p * (1.0 - slippage_pct), 2)
                            else:  # OPTIONS
                                exit_price = round(contract_sl * (1.0 - slippage_pct), 2)

                        # Target 2 check
                        elif c_high >= spot_t2:
                            exit_occurred = True
                            outcome = "TARGET_2_HIT"
                            exit_price = round(contract_t2 * (1.0 - slippage_pct), 2)

                        # Target 1 check
                        elif c_high >= spot_t1:
                            exit_occurred = True
                            outcome = "TARGET_1_HIT"
                            exit_price = round(contract_t1 * (1.0 - slippage_pct), 2)

                    else:  # SELL / SHORT
                        # Stop Loss check
                        if c_high >= spot_sl:
                            exit_occurred = True
                            outcome = "STOP_LOSS_HIT"
                            if inst == "EQUITY":
                                fill_p = max(c_open, spot_sl)
                                exit_price = round(fill_p * (1.0 + slippage_pct), 2)
                            elif inst == "FUTURES":
                                fill_p = max(c_open + active_trade["basis"], contract_sl)
                                exit_price = round(fill_p * (1.0 + slippage_pct), 2)
                            else:  # OPTIONS
                                exit_price = round(contract_sl * (1.0 - slippage_pct), 2)

                        # Target 2 check
                        elif c_low <= spot_t2:
                            exit_occurred = True
                            outcome = "TARGET_2_HIT"
                            if inst == "OPTIONS":
                                exit_price = round(contract_t2 * (1.0 - slippage_pct), 2)
                            else:
                                exit_price = round(contract_t2 * (1.0 + slippage_pct), 2)

                        # Target 1 check
                        elif c_low <= spot_t1:
                            exit_occurred = True
                            outcome = "TARGET_1_HIT"
                            if inst == "OPTIONS":
                                exit_price = round(contract_t1 * (1.0 - slippage_pct), 2)
                            else:
                                exit_price = round(contract_t1 * (1.0 + slippage_pct), 2)

                    # Close open position at end of candle series
                    if not exit_occurred and i == len(candles) - 1:
                        exit_occurred = True
                        outcome = "CLOSED_AT_SERIES_END"
                        if inst == "EQUITY":
                            exit_price = round(c_close * (1.0 - slippage_pct if side == "BUY" else 1.0 + slippage_pct), 2)
                        elif inst == "FUTURES":
                            exit_price = round((c_close + active_trade["basis"]) * (1.0 - slippage_pct if side == "BUY" else 1.0 + slippage_pct), 2)
                        else:  # OPTIONS
                            # Delta-adjusted option exit
                            delta_s = (c_close - spot_entry) if side == "BUY" else (spot_entry - c_close)
                            approx_opt_val = max(0.05, contract_entry + (active_trade["delta"] * delta_s))
                            exit_price = round(approx_opt_val * (1.0 - slippage_pct), 2)

                    if exit_occurred:
                        # Transaction costs on exit
                        exit_side = "SELL" if (inst == "OPTIONS" or side == "BUY") else "BUY"
                        exit_costs = TransactionCostModel.calculate_costs(
                            instrument_type=inst,
                            side=exit_side,
                            price=exit_price,
                            qty=qty,
                            brokerage_per_order=brokerage_per_order
                        )

                        total_trade_costs = active_trade["entry_costs"]["total_charges"] + exit_costs["total_charges"]

                        if inst == "OPTIONS":
                            # For options buyer: PnL is (Sell Premium - Buy Premium) * Qty
                            gross_pnl = round((exit_price - contract_entry) * qty, 2)
                        elif side == "BUY":
                            gross_pnl = round((exit_price - contract_entry) * qty, 2)
                        else:  # SELL (Equity Short or Futures Short)
                            gross_pnl = round((contract_entry - exit_price) * qty, 2)

                        net_pnl = round(gross_pnl - total_trade_costs, 2)
                        inv_capital = max(100.0, active_trade["invested_capital"])
                        return_pct = round((net_pnl / inv_capital) * 100.0, 2)

                        capital += net_pnl
                        peak_capital = max(peak_capital, capital)
                        current_dd = round(((peak_capital - capital) / peak_capital) * 100.0, 2)

                        trade_record = {
                            "trade_id": f"BT-{sym}-{len(trades) + 1}",
                            "symbol": sym,
                            "instrument_type": inst,
                            "contract_symbol": active_trade.get("contract_symbol", sym),
                            "side": side,
                            "entry_time": active_trade["entry_time"],
                            "entry_price": contract_entry,
                            "exit_time": c_time,
                            "exit_price": exit_price,
                            "quantity": qty,
                            "invested_capital": active_trade["invested_capital"],
                            "stop_loss": contract_sl,
                            "target_1": contract_t1,
                            "target_2": contract_t2,
                            "outcome": outcome,
                            "gross_pnl": gross_pnl,
                            "total_charges": total_trade_costs,
                            "net_pnl": net_pnl,
                            "return_pct": return_pct,
                            "holding_bars": i - active_trade["entry_index"],
                            "mfe_pct": round(active_trade["mfe_pct"], 2),
                            "mae_pct": round(active_trade["mae_pct"], 2),
                            "capital_after_trade": round(capital, 2),
                            "drawdown_pct": current_dd
                        }
                        trades.append(trade_record)

                        equity_curve.append({
                            "timestamp": c_ts,
                            "date": c_time,
                            "equity": round(capital, 2),
                            "drawdown_pct": current_dd
                        })

                        active_trade = None
                        continue

                # -------------------------------------------------------------
                # 2. Strict Zero Lookahead Slice & Strategy Evaluation
                # -------------------------------------------------------------
                if active_trade is None and i < len(candles) - 1:
                    historical_slice = candles[: i + 1]  # Zero lookahead! Only candles up to bar i

                    # Evaluate using the exact same strategy engine as live signals!
                    sig = strategy_engine.evaluate_strategy(
                        strategy_id=strategy_id,
                        symbol=sym,
                        company_info={"name": sym, "sector": "NSE", "cap": "LARGE_CAP"},
                        candles=historical_slice,
                        timeframe=timeframe
                    )

                    if sig and sig.get("type") in ("BUY", "SELL"):
                        sig_type = sig["type"]
                        spot_entry = float(sig["entry_price"])
                        spot_sl = float(sig["stop_loss"])
                        spot_t1 = float(sig["target_1"])
                        spot_t2 = float(sig["target_2"])

                        contract_symbol = sym
                        basis_val = 0.0
                        opt_delta = 0.50

                        # Instrument Adaptation
                        lot_size = 1
                        if instrument_type == "EQUITY":
                            contract_entry = round(spot_entry * (1.0 + slippage_pct if sig_type == "BUY" else 1.0 - slippage_pct), 2)
                            contract_sl = spot_sl
                            contract_t1 = spot_t1
                            contract_t2 = spot_t2
                            risk_per_unit = max(0.05, abs(contract_entry - contract_sl))
                            risk_budget = capital * (risk_per_trade_pct / 100.0)
                            total_qty = max(1, int(risk_budget / risk_per_unit))
                            invested_cap = round(contract_entry * total_qty, 2)

                        elif instrument_type == "FUTURES":
                            lot_size = NSE_FO_LOT_SIZES.get(sym, 100)
                            fut_data = adapt_futures_contract(sym, spot_entry)
                            contract_symbol = fut_data["contract_symbol"]
                            basis_val = fut_data["basis"]
                            raw_fut_p = fut_data["futures_price"]
                            contract_entry = round(raw_fut_p * (1.0 + slippage_pct if sig_type == "BUY" else 1.0 - slippage_pct), 2)
                            contract_sl = round(spot_sl + basis_val, 2)
                            contract_t1 = round(spot_t1 + basis_val, 2)
                            contract_t2 = round(spot_t2 + basis_val, 2)
                            risk_per_unit = max(0.05, abs(contract_entry - contract_sl))
                            risk_budget = capital * (risk_per_trade_pct / 100.0)
                            lots = max(1, int(risk_budget / (risk_per_unit * lot_size)))
                            total_qty = lots * lot_size
                            invested_cap = round(contract_entry * total_qty * 0.20, 2)  # ~20% SPAN margin

                        else:  # OPTIONS
                            lot_size = NSE_FO_LOT_SIZES.get(sym, 100)
                            opt_data = adapt_options_contract(sym, spot_entry, sig_type)
                            contract_symbol = opt_data["contract_symbol"]
                            opt_delta = opt_data["greeks"]["delta"]
                            raw_opt_p = opt_data["premium"]
                            contract_entry = round(raw_opt_p * (1.0 + slippage_pct), 2)
                            contract_sl = opt_data["option_stop_loss"]
                            contract_t1 = opt_data["option_target_1"]
                            contract_t2 = opt_data["option_target_2"]
                            risk_per_unit = max(0.05, abs(contract_entry - contract_sl))
                            risk_budget = capital * (risk_per_trade_pct / 100.0)
                            lots = max(1, int(risk_budget / (risk_per_unit * lot_size)))
                            total_qty = lots * lot_size
                            invested_cap = round(contract_entry * total_qty, 2)  # 100% premium cost

                        # Calculate Entry Transaction Costs
                        entry_costs = TransactionCostModel.calculate_costs(
                            instrument_type=instrument_type,
                            side="BUY" if (instrument_type == "OPTIONS" or sig_type == "BUY") else "SELL",
                            price=contract_entry,
                            qty=total_qty,
                            brokerage_per_order=brokerage_per_order
                        )

                        active_trade = {
                            "side": sig_type,
                            "instrument_type": instrument_type,
                            "contract_symbol": contract_symbol,
                            "spot_entry": spot_entry,
                            "spot_sl": spot_sl,
                            "spot_t1": spot_t1,
                            "spot_t2": spot_t2,
                            "entry_price": contract_entry,
                            "contract_sl": contract_sl,
                            "contract_t1": contract_t1,
                            "contract_t2": contract_t2,
                            "quantity": total_qty,
                            "invested_capital": invested_cap,
                            "entry_costs": entry_costs,
                            "entry_time": c_time,
                            "entry_index": i,
                            "basis": basis_val,
                            "delta": opt_delta,
                            "mfe_pct": 0.0,
                            "mae_pct": 0.0
                        }

        # -----------------------------------------------------------------
        # 3. Compute Comprehensive Quantitative Performance Metrics
        # -----------------------------------------------------------------
        metrics = self._calculate_metrics(trades, initial_capital, capital, peak_capital)
        monthly_breakdown = self._compute_monthly_breakdown(trades)

        return {
            "status": "success",
            "strategy_id": strategy_id,
            "strategy_name": custom_strat["name"] if custom_strat else strategy_id,
            "timeframe": timeframe,
            "instrument_type": instrument_type,
            "symbols_tested": symbols,
            "initial_capital": initial_capital,
            "final_capital": round(capital, 2),
            "metrics": metrics,
            "equity_curve": equity_curve,
            "monthly_breakdown": monthly_breakdown,
            "trades": trades
        }

    def _calculate_metrics(
        self,
        trades: List[Dict[str, Any]],
        initial_capital: float,
        final_capital: float,
        peak_capital: float
    ) -> Dict[str, Any]:
        """Calculates advanced quantitative trading performance metrics."""
        total_trades = len(trades)
        if total_trades == 0:
            return {
                "total_trades": 0,
                "winning_trades": 0,
                "losing_trades": 0,
                "win_rate_pct": 0.0,
                "profit_factor": 0.0,
                "gross_profit": 0.0,
                "gross_loss": 0.0,
                "net_profit": 0.0,
                "net_return_pct": 0.0,
                "max_drawdown_amount": 0.0,
                "max_drawdown_pct": 0.0,
                "total_charges": 0.0,
                "average_trade_pnl": 0.0,
                "average_win": 0.0,
                "average_loss": 0.0,
                "win_loss_ratio": 0.0,
                "risk_reward_achieved": 0.0,
                "sharpe_ratio": 0.0,
                "sortino_ratio": 0.0,
                "max_consecutive_wins": 0,
                "max_consecutive_losses": 0,
                "avg_holding_bars": 0.0,
                "avg_mfe_pct": 0.0,
                "avg_mae_pct": 0.0
            }

        winning_trades = [t for t in trades if t["net_pnl"] > 0]
        losing_trades = [t for t in trades if t["net_pnl"] <= 0]

        win_count = len(winning_trades)
        loss_count = len(losing_trades)
        win_rate = round((win_count / total_trades) * 100.0, 2)

        gross_profit = round(sum(t["gross_pnl"] for t in winning_trades), 2)
        gross_loss = round(abs(sum(t["gross_pnl"] for t in losing_trades)), 2)
        total_charges = round(sum(t["total_charges"] for t in trades), 2)

        net_profit = round(final_capital - initial_capital, 2)
        net_return_pct = round((net_profit / initial_capital) * 100.0, 2)

        profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else (99.0 if gross_profit > 0 else 0.0)

        # Drawdowns
        max_dd_pct = 0.0
        max_dd_amt = 0.0
        running_peak = initial_capital
        running_eq = initial_capital
        for t in trades:
            running_eq += t["net_pnl"]
            if running_eq > running_peak:
                running_peak = running_eq
            dd_amt = running_peak - running_eq
            dd_pct = (dd_amt / running_peak) * 100.0 if running_peak > 0 else 0.0
            if dd_pct > max_dd_pct:
                max_dd_pct = dd_pct
                max_dd_amt = dd_amt

        # Averages
        avg_trade_pnl = round(net_profit / total_trades, 2)
        avg_win = round(gross_profit / win_count, 2) if win_count > 0 else 0.0
        avg_loss = round(gross_loss / loss_count, 2) if loss_count > 0 else 0.0
        win_loss_ratio = round(avg_win / avg_loss, 2) if avg_loss > 0 else 0.0
        risk_reward_achieved = win_loss_ratio

        # Consecutive streaks
        max_cons_wins = 0
        max_cons_losses = 0
        cur_wins = 0
        cur_losses = 0
        for t in trades:
            if t["net_pnl"] > 0:
                cur_wins += 1
                cur_losses = 0
                max_cons_wins = max(max_cons_wins, cur_wins)
            else:
                cur_losses += 1
                cur_wins = 0
                max_cons_losses = max(max_cons_losses, cur_losses)

        # Sharpe & Sortino (Annualized based on trade returns)
        returns = [t["return_pct"] / 100.0 for t in trades]
        mean_return = sum(returns) / len(returns) if returns else 0.0
        variance = sum((r - mean_return) ** 2 for r in returns) / len(returns) if len(returns) > 1 else 0.0
        std_dev = math.sqrt(variance) if variance > 0 else 0.0

        rf_per_trade = 0.065 / 252.0  # Daily risk-free
        sharpe = round(((mean_return - rf_per_trade) / std_dev) * math.sqrt(252), 2) if std_dev > 0 else 0.0

        downside_returns = [min(0.0, r - rf_per_trade) for r in returns]
        downside_variance = sum(d ** 2 for d in downside_returns) / len(downside_returns) if downside_returns else 0.0
        downside_std = math.sqrt(downside_variance) if downside_variance > 0 else 0.0
        sortino = round(((mean_return - rf_per_trade) / downside_std) * math.sqrt(252), 2) if downside_std > 0 else 0.0

        avg_bars = round(sum(t["holding_bars"] for t in trades) / total_trades, 1)
        avg_mfe = round(sum(t.get("mfe_pct", 0.0) for t in trades) / total_trades, 2)
        avg_mae = round(sum(t.get("mae_pct", 0.0) for t in trades) / total_trades, 2)

        return {
            "total_trades": total_trades,
            "winning_trades": win_count,
            "losing_trades": loss_count,
            "win_rate_pct": win_rate,
            "profit_factor": profit_factor,
            "gross_profit": gross_profit,
            "gross_loss": gross_loss,
            "net_profit": net_profit,
            "net_return_pct": net_return_pct,
            "max_drawdown_amount": round(max_dd_amt, 2),
            "max_drawdown_pct": round(max_dd_pct, 2),
            "total_charges": total_charges,
            "average_trade_pnl": avg_trade_pnl,
            "average_win": avg_win,
            "average_loss": avg_loss,
            "win_loss_ratio": win_loss_ratio,
            "risk_reward_achieved": risk_reward_achieved,
            "sharpe_ratio": sharpe,
            "sortino_ratio": sortino,
            "max_consecutive_wins": max_cons_wins,
            "max_consecutive_losses": max_cons_losses,
            "avg_holding_bars": avg_bars,
            "avg_mfe_pct": avg_mfe,
            "avg_mae_pct": avg_mae
        }

    def _compute_monthly_breakdown(self, trades: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Groups backtest results into monthly performance buckets."""
        months: Dict[str, Dict[str, Any]] = {}

        for t in trades:
            time_str = t.get("entry_time", "")
            month_key = time_str[:7] if len(time_str) >= 7 else "Recent"
            if month_key not in months:
                months[month_key] = {
                    "month": month_key,
                    "trades_count": 0,
                    "wins": 0,
                    "losses": 0,
                    "net_pnl": 0.0,
                    "charges": 0.0
                }
            m = months[month_key]
            m["trades_count"] += 1
            if t["net_pnl"] > 0:
                m["wins"] += 1
            else:
                m["losses"] += 1
            m["net_pnl"] = round(m["net_pnl"] + t["net_pnl"], 2)
            m["charges"] = round(m["charges"] + t["total_charges"], 2)

        result = []
        for k, v in sorted(months.items()):
            win_rate = round((v["wins"] / v["trades_count"]) * 100.0, 1) if v["trades_count"] > 0 else 0.0
            v["win_rate_pct"] = win_rate
            result.append(v)
        return result


# Global Singleton Instance
backtesting_engine = BacktestingEngine()
