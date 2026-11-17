"""
Tests for Phase 7: Quantitative Backtesting Engine, Indian Friction Model & Walk-Forward Optimizer
"""

import math
import pytest
import numpy as np

from app.backtesting.friction_model import IndianFrictionModel, InstrumentClass
from app.backtesting.metrics import PerformanceMetricsCalculator
from app.backtesting.engine import QuantitativeBacktestingEngine
from app.backtesting.walk_forward import WalkForwardOptimizer
from app.backtest_storage import BacktestStorage


class TestIndianFrictionModel:
    """Test exact statutory Indian exchange taxes and brokerages."""

    def test_intraday_equity_friction(self):
        # Buy 100 shares at Rs 1000 = Turnover Rs 1,00,000
        buy_res = IndianFrictionModel.calculate_trade_friction(
            instrument_class=InstrumentClass.EQUITY_INTRADAY,
            side="BUY",
            price=1000.0,
            quantity=100,
            brokerage_per_order=20.0,
            slippage_pct=0.0003,
        )

        assert buy_res.turnover == 100000.0
        assert buy_res.brokerage == 20.0  # min(20, 100000 * 0.0003 = 30) -> 20.0
        assert buy_res.stt == 0.0        # No STT on intraday buy
        assert buy_res.stamp_duty == 3.0 # 0.003% of 1,00,000 = Rs 3
        assert buy_res.sebi_fee == 0.10  # 10 per crore = 0.0001% of 100000 = 0.10
        assert buy_res.total_friction > 25.0

        # Sell 100 shares at Rs 1050 = Turnover Rs 1,05,000
        sell_res = IndianFrictionModel.calculate_trade_friction(
            instrument_class=InstrumentClass.EQUITY_INTRADAY,
            side="SELL",
            price=1050.0,
            quantity=100,
            brokerage_per_order=20.0,
            slippage_pct=0.0003,
        )

        assert sell_res.turnover == 105000.0
        assert sell_res.brokerage == 20.0
        assert sell_res.stt == 26.25     # 0.025% on intraday sell = 105000 * 0.00025 = 26.25
        assert sell_res.stamp_duty == 0.0 # No stamp duty on sell

    def test_options_friction(self):
        # Sell 1 lot (25 qty) NIFTY Call option at premium Rs 200 = Turnover Rs 5,000
        opt_sell = IndianFrictionModel.calculate_trade_friction(
            instrument_class=InstrumentClass.OPTIONS,
            side="SELL",
            price=200.0,
            quantity=25,
            brokerage_per_order=20.0,
            slippage_pct=0.0,
        )

        assert opt_sell.turnover == 5000.0
        assert opt_sell.brokerage == 20.0  # Flat Rs 20 on options
        assert opt_sell.stt == 3.125      # 0.0625% on sell premium = 5000 * 0.000625 = 3.125
        assert opt_sell.exchange_turnover_fee == round(5000.0 * 0.0003503, 6)

    def test_round_trip_friction(self):
        rt = IndianFrictionModel.calculate_round_trip_friction(
            instrument_class=InstrumentClass.EQUITY_INTRADAY,
            entry_price=1000.0,
            exit_price=1050.0,
            quantity=100,
        )

        assert rt["total_turnover"] == 205000.0
        assert rt["total_brokerage"] == 40.0  # 20 entry + 20 exit
        assert rt["total_stt"] == 26.25      # sell only
        assert rt["total_friction"] > 65.0


class TestPerformanceMetricsCalculator:
    """Test quantitative risk-adjusted performance metrics."""

    def test_metrics_calculation(self):
        trades = [
            {"net_pnl": 5000.0, "friction": 50.0},
            {"net_pnl": -2000.0, "friction": 50.0},
            {"net_pnl": 7000.0, "friction": 50.0},
            {"net_pnl": -1500.0, "friction": 50.0},
            {"net_pnl": 4500.0, "friction": 50.0},
        ]
        initial_cap = 100000.0
        final_cap = 113000.0
        equity_curve = [
            {"equity": 100000.0},
            {"equity": 105000.0},
            {"equity": 103000.0},
            {"equity": 110000.0},
            {"equity": 108500.0},
            {"equity": 113000.0},
        ]

        m = PerformanceMetricsCalculator.calculate_metrics(
            trades=trades,
            initial_capital=initial_cap,
            final_capital=final_cap,
            equity_curve=equity_curve,
        )

        assert m["total_trades"] == 5
        assert m["winning_trades"] == 3
        assert m["losing_trades"] == 2
        assert m["win_rate"] == 60.0
        assert m["gross_profit"] == 16500.0
        assert m["gross_loss"] == 3500.0
        assert m["profit_factor"] == round(16500.0 / 3500.0, 2)
        assert m["net_profit"] == 13000.0
        assert m["roi_percent"] == 13.0
        assert m["max_drawdown_amount"] == 2000.0  # 105000 down to 103000
        assert m["sharpe_ratio"] > 0
        assert m["sortino_ratio"] > 0
        assert m["calmar_ratio"] > 0
        assert m["expectancy"] > 0


class TestQuantitativeBacktestingEngine:
    """Test full chronological event-driven simulation."""

    def test_backtest_execution_smc_order_block(self):
        engine = QuantitativeBacktestingEngine()
        res = engine.run_backtest(
            strategy_id="SMC_ORDER_BLOCK",
            symbols=["RELIANCE"],
            timeframe="15m",
            instrument_type="EQUITY_INTRADAY",
            initial_capital=500000.0,
            risk_per_trade_pct=1.5,
        )

        assert res["strategy_id"] == "SMC_ORDER_BLOCK"
        assert "metrics" in res
        assert "equity_curve" in res
        assert "trades" in res
        assert res["initial_capital"] == 500000.0
        assert len(res["equity_curve"]) >= 1

        # Check charges breakdown exists if any trades were executed
        if res["trades"]:
            first_trade = res["trades"][0]
            assert "charges_breakdown" in first_trade
            assert "mfe_pct" in first_trade
            assert "mae_pct" in first_trade
            assert "friction" in first_trade


class TestWalkForwardOptimizer:
    """Test Walk-Forward Analysis and Out-of-Sample efficiency."""

    def test_walk_forward_optimization_execution(self):
        optimizer = WalkForwardOptimizer()
        res = optimizer.run_walk_forward_optimization(
            strategy_id="SMC_ORDER_BLOCK",
            symbols=["RELIANCE"],
            timeframe="15m",
            initial_capital=500000.0,
            n_windows=3,
            train_ratio=0.70,
            param_grid=[
                {"risk_per_trade_pct": 1.0, "slippage_pct": 0.0002},
                {"risk_per_trade_pct": 1.5, "slippage_pct": 0.0003},
            ],
        )

        assert "walk_forward_efficiency" in res
        assert "is_robust" in res
        assert "overall_oos_metrics" in res
        assert res["walk_forward_efficiency"] >= 0.0
        assert res["n_windows"] >= 1
