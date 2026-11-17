"""
Quantitative Backtesting & Walk-Forward Optimizer Engine
Phase 7 implementation:
- Exact Indian Statutory Regulatory Friction & Slippage Model (STT, GST, Exchange fee, SEBI, Stamp Duty)
- Advanced Institutional Performance Metrics (Sharpe, Sortino, Calmar, Max Drawdown, Expectancy)
- Event-driven Bar-by-Bar Chronological Simulation with zero lookahead bias
- Walk-Forward Analysis (WFA) Optimizer computing Walk-Forward Efficiency (WFE)
- Integration with BacktestStorage ledger
"""

from app.backtesting.friction_model import IndianFrictionModel, InstrumentClass, TradeFrictionBreakdown
from app.backtesting.metrics import PerformanceMetricsCalculator
from app.backtesting.engine import QuantitativeBacktestingEngine, backtest_engine
from app.backtesting.walk_forward import WalkForwardOptimizer, walk_forward_optimizer
from app.backtest_storage import BacktestStorage

__all__ = [
    "IndianFrictionModel",
    "InstrumentClass",
    "TradeFrictionBreakdown",
    "PerformanceMetricsCalculator",
    "QuantitativeBacktestingEngine",
    "backtest_engine",
    "WalkForwardOptimizer",
    "walk_forward_optimizer",
    "BacktestStorage",
]
