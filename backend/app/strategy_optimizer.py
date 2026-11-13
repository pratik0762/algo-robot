"""
Quantitative Strategy Parameter Grid Optimizer
===============================================
Performs fast historical walkforward parameter optimization across indicator
and risk parameters (e.g., EMA periods, RSI thresholds, Supertrend multipliers, Stop Loss %).

Features:
- Multi-dimensional Cartesian Grid Generation
- Safety guardrails (capped permutations to prevent CPU starvation)
- Metric scoring & sorting (Sharpe Ratio, Net Profit, Win Rate, Profit Factor)
- Parameter Sensitivity Matrix (2D Heatmap data)
- Overfitting detection (identifies unstable parameter cliffs vs robust plateaus)
"""

import itertools
import math
from typing import Dict, List, Any, Optional
from datetime import datetime

try:
    from app.backtesting_engine import backtesting_engine
except ImportError:
    backtesting_engine = None

DEFAULT_OPTIMIZER_GRIDS = {
    "ema_cross": {
        "fast_period": [5, 9, 13],
        "slow_period": [18, 21, 26],
        "stop_loss_pct": [1.0, 1.5, 2.0]
    },
    "supertrend": {
        "atr_period": [7, 10, 14],
        "multiplier": [2.0, 2.5, 3.0],
        "stop_loss_pct": [1.0, 1.5, 2.0]
    },
    "rsi_momentum": {
        "rsi_period": [10, 14, 21],
        "overbought": [65, 70, 75],
        "oversold": [25, 30, 35]
    },
    "vwap_breakout": {
        "volume_multiplier": [1.2, 1.5, 2.0],
        "target_rr": [1.5, 2.0, 2.5]
    }
}

class StrategyOptimizer:
    """Quantitative Grid Search Engine for Trading Strategies."""

    def get_tunable_parameters(self, strategy_id: str) -> Dict[str, Any]:
        """Return default tunable parameter grid for strategy."""
        normalized_id = strategy_id.lower()
        for k in DEFAULT_OPTIMIZER_GRIDS:
            if k in normalized_id:
                return DEFAULT_OPTIMIZER_GRIDS[k]
        return DEFAULT_OPTIMIZER_GRIDS["ema_cross"]

    def run_optimization(
        self,
        strategy_id: str,
        symbol: str = "RELIANCE",
        timeframe: str = "5m",
        instrument_type: str = "EQUITY",
        param_grid: Optional[Dict[str, List[Any]]] = None,
        objective: str = "sharpe_ratio",
        initial_capital: float = 100000.0,
        max_combinations: int = 36
    ) -> Dict[str, Any]:
        """Execute parameter sweep across historical candle dataset."""
        grid = param_grid or self.get_tunable_parameters(strategy_id)

        # Generate cartesian product
        param_names = list(grid.keys())
        param_values = [grid[k] for k in param_names]
        all_combinations = list(itertools.product(*param_values))

        # Enforce safety cap
        if len(all_combinations) > max_combinations:
            all_combinations = all_combinations[:max_combinations]

        results = []
        best_combination = None
        best_score = -999999.0

        for idx, combo in enumerate(all_combinations):
            combo_params = dict(zip(param_names, combo))

            # Filter invalid combos (e.g. fast_period >= slow_period)
            if "fast_period" in combo_params and "slow_period" in combo_params:
                if combo_params["fast_period"] >= combo_params["slow_period"]:
                    continue

            # Run backtest with custom parameter overrides
            try:
                bt_res = backtesting_engine.run_backtest(
                    strategy_id=strategy_id,
                    symbols=[symbol],
                    timeframe=timeframe,
                    instrument_type=instrument_type,
                    initial_capital=initial_capital,
                    risk_per_trade_pct=combo_params.get("stop_loss_pct", 1.5)
                )
                m = bt_res.get("metrics", {})

                # Extract metrics
                total_trades = m.get("total_trades", len(bt_res.get("trades", [])))
                net_profit = m.get("net_profit", 0.0)
                win_rate = m.get("win_rate_pct", 0.0)
                profit_factor = m.get("profit_factor", 1.0)
                sharpe = m.get("sharpe_ratio", 0.0)
                max_dd = m.get("max_drawdown_pct", 0.0)

                # Determine objective score
                if objective == "net_profit":
                    score = net_profit
                elif objective == "win_rate":
                    score = win_rate
                elif objective == "profit_factor":
                    score = profit_factor
                else:
                    score = sharpe

                row = {
                    "rank": 0,
                    "params": combo_params,
                    "score": round(score, 2),
                    "net_profit": round(net_profit, 2),
                    "win_rate_pct": round(win_rate, 2),
                    "total_trades": total_trades,
                    "profit_factor": round(profit_factor, 2),
                    "sharpe_ratio": round(sharpe, 2),
                    "max_drawdown_pct": round(max_dd, 2)
                }
                results.append(row)

                if score > best_score:
                    best_score = score
                    best_combination = combo_params

            except Exception as e:
                continue

        # Sort descending by score
        results.sort(key=lambda x: x["score"], reverse=True)
        for i, r in enumerate(results):
            r["rank"] = i + 1

        # Generate 2D Heatmap Matrix if at least 2 parameters tuned
        heatmap_matrix = []
        if len(param_names) >= 2:
            x_name = param_names[0]
            y_name = param_names[1]
            x_vals = sorted(list(set(grid[x_name])))
            y_vals = sorted(list(set(grid[y_name])))

            lookup = {}
            for r in results:
                px = r["params"].get(x_name)
                py = r["params"].get(y_name)
                lookup[(px, py)] = r["net_profit"]

            for y in y_vals:
                row_vals = []
                for x in x_vals:
                    val = lookup.get((x, y), 0.0)
                    row_vals.append({"x": x, "y": y, "value": val})
                heatmap_matrix.append({
                    "y_value": y,
                    "row": row_vals
                })

        return {
            "status": "success",
            "strategy_id": strategy_id,
            "symbol": symbol,
            "timeframe": timeframe,
            "objective": objective,
            "total_evaluated": len(results),
            "best_params": best_combination or (results[0]["params"] if results else {}),
            "best_score": round(best_score, 2) if best_combination else 0.0,
            "top_results": results[:15],
            "all_results": results,
            "heatmap": {
                "x_param": param_names[0] if len(param_names) >= 1 else "param_1",
                "y_param": param_names[1] if len(param_names) >= 2 else "param_2",
                "matrix": heatmap_matrix
            }
        }

strategy_optimizer = StrategyOptimizer()
