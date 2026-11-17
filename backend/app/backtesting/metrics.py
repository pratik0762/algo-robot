"""
ALGO ROBOT — Advanced Quantitative Backtesting Performance Metrics
Computes Sharpe Ratio, Sortino Ratio, Calmar Ratio, Maximum Drawdown, Profit Factor,
Win Rate, Expectancy, and Equity Curves.
"""

from __future__ import annotations
import math
from typing import Any, Dict, List, Optional
import numpy as np


class PerformanceMetricsCalculator:
    """Calculates comprehensive quantitative backtesting performance metrics."""

    @staticmethod
    def calculate_metrics(
        trades: List[Dict[str, Any]],
        initial_capital: float,
        final_capital: float,
        equity_curve: List[Dict[str, Any]],
        risk_free_rate: float = 0.065,  # 6.5% RBI repo rate benchmark
    ) -> Dict[str, Any]:
        total_trades = len(trades)
        if total_trades == 0:
            return {
                "total_trades": 0,
                "winning_trades": 0,
                "losing_trades": 0,
                "win_rate": 0.0,
                "profit_factor": 0.0,
                "net_profit": 0.0,
                "roi_percent": 0.0,
                "gross_profit": 0.0,
                "gross_loss": 0.0,
                "total_friction": 0.0,
                "max_drawdown_amount": 0.0,
                "max_drawdown_percent": 0.0,
                "sharpe_ratio": 0.0,
                "sortino_ratio": 0.0,
                "calmar_ratio": 0.0,
                "average_trade_pnl": 0.0,
                "average_win": 0.0,
                "average_loss": 0.0,
                "win_loss_ratio": 0.0,
                "expectancy": 0.0,
            }

        # 1. PnL and Win/Loss categorization
        net_pnls = [float(t.get("net_pnl", 0.0)) for t in trades]
        wins = [p for p in net_pnls if p > 0]
        losses = [p for p in net_pnls if p < 0]

        total_wins = len(wins)
        total_losses = len(losses)
        win_rate = round((total_wins / total_trades) * 100.0, 2)

        gross_profit = round(sum(wins), 2)
        gross_loss = round(abs(sum(losses)), 2)
        total_friction = round(sum(float(t.get("friction", 0.0)) for t in trades), 2)
        net_profit = round(final_capital - initial_capital, 2)
        roi_pct = round((net_profit / initial_capital) * 100.0, 2) if initial_capital > 0 else 0.0

        profit_factor = round(gross_profit / max(gross_loss, 0.01), 2)

        avg_win = round(float(np.mean(wins)), 2) if wins else 0.0
        avg_loss = round(float(np.mean(losses)), 2) if losses else 0.0
        avg_trade = round(float(np.mean(net_pnls)), 2) if net_pnls else 0.0
        win_loss_ratio = round(abs(avg_win / avg_loss), 2) if avg_loss != 0 else 0.0

        # Mathematical Expectancy: (Win% * AvgWin) - (Loss% * AvgLoss)
        win_prob = total_wins / total_trades
        loss_prob = total_losses / total_trades
        expectancy = round((win_prob * avg_win) + (loss_prob * avg_loss), 2)

        # 2. Maximum Drawdown from Equity Curve
        equities = [float(e.get("equity", initial_capital)) for e in equity_curve]
        if not equities:
            equities = [initial_capital, final_capital]

        peak = equities[0]
        max_dd_amount = 0.0
        max_dd_pct = 0.0

        for eq in equities:
            if eq > peak:
                peak = eq
            dd_amt = peak - eq
            dd_pct = (dd_amt / peak) * 100.0 if peak > 0 else 0.0
            if dd_amt > max_dd_amount:
                max_dd_amount = dd_amt
            if dd_pct > max_dd_pct:
                max_dd_pct = dd_pct

        # 3. Sharpe & Sortino Ratios (from trade returns or equity step returns)
        eq_arr = np.array(equities, dtype=np.float64)
        if len(eq_arr) > 1:
            step_returns = (eq_arr[1:] - eq_arr[:-1]) / eq_arr[:-1]
        else:
            step_returns = np.array([roi_pct / 100.0])

        n_steps = len(step_returns)
        mean_ret = float(np.mean(step_returns)) if n_steps > 0 else 0.0
        std_ret = float(np.std(step_returns, ddof=1)) if n_steps > 1 else (abs(mean_ret) + 1e-4)

        # Annualized scaling factor (approx 252 trading sessions)
        annual_factor = math.sqrt(252)
        rf_daily = risk_free_rate / 252.0

        excess_returns = step_returns - rf_daily
        sharpe_ratio = round(float(np.mean(excess_returns) / max(std_ret, 1e-5)) * annual_factor, 2)

        # Sortino: Only negative excess returns in denominator
        downside_returns = excess_returns[excess_returns < 0]
        downside_std = float(np.std(downside_returns, ddof=1)) if len(downside_returns) > 1 else std_ret
        sortino_ratio = round(float(np.mean(excess_returns) / max(downside_std, 1e-5)) * annual_factor, 2)

        # Calmar Ratio: Annualized Return / Max Drawdown %
        annualized_return_pct = roi_pct * (252.0 / max(total_trades, 20.0))
        calmar_ratio = round(annualized_return_pct / max(max_dd_pct, 1.0), 2)

        return {
            "total_trades": total_trades,
            "winning_trades": total_wins,
            "losing_trades": total_losses,
            "win_rate": win_rate,
            "profit_factor": profit_factor,
            "net_profit": net_profit,
            "roi_percent": roi_pct,
            "gross_profit": gross_profit,
            "gross_loss": gross_loss,
            "total_friction": total_friction,
            "max_drawdown_amount": round(max_dd_amount, 2),
            "max_drawdown_percent": round(max_dd_pct, 2),
            "sharpe_ratio": sharpe_ratio,
            "sortino_ratio": sortino_ratio,
            "calmar_ratio": calmar_ratio,
            "average_trade_pnl": avg_trade,
            "average_win": avg_win,
            "average_loss": avg_loss,
            "win_loss_ratio": win_loss_ratio,
            "expectancy": expectancy,
        }
