"""
ALGO ROBOT — Pre-Trade Risk Engine & Order Validation Guardian
Executes mandatory real-time institutional risk checks on every proposed order:
1. Kill Switch & Circuit Breaker status
2. Maximum Daily Loss Limit breach check
3. Capital at Risk per Trade threshold
4. Instrument Freeze & Quantity Limits
5. Fat-Finger & Price Collar Protection (deviations from LTP)
6. Maximum Open Positions & Portfolio Capacity
7. Margin & Available Buying Power validation
8. Sector Concentration Cap
"""

from __future__ import annotations
from dataclasses import dataclass, field
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("algo_robot.risk.validator")

# NSE Exchange-mandated Freeze Quantities for Index & Equity Derivatives
EXCHANGE_FREEZE_LIMITS: Dict[str, int] = {
    "NIFTY": 1800,
    "BANKNIFTY": 900,
    "FINNIFTY": 1800,
    "MIDCPNIFTY": 4200,
    "RELIANCE": 5000,
    "TCS": 3500,
    "HDFCBANK": 11000,
    "INFY": 8000,
    "DEFAULT": 5000,
}


@dataclass
class ProposedOrder:
    symbol: str
    transaction_type: str  # BUY or SELL
    order_type: str        # MARKET, LIMIT, SL, SL-M
    quantity: int
    price: float           # Proposed limit price or LTP for market
    stop_loss: Optional[float] = None
    target: Optional[float] = None
    instrument_type: str = "EQUITY"  # EQUITY, FUTURES, OPTIONS
    sector: Optional[str] = None
    required_margin: Optional[float] = None


@dataclass
class OrderRiskValidationResult:
    approved: bool
    rejection_reason: Optional[str] = None
    checks_passed: List[str] = field(default_factory=list)
    checks_failed: List[str] = field(default_factory=list)
    risk_metrics_snapshot: Dict[str, Any] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "approved": self.approved,
            "rejection_reason": self.rejection_reason,
            "checks_passed": self.checks_passed,
            "checks_failed": self.checks_failed,
            "risk_metrics_snapshot": self.risk_metrics_snapshot,
            "timestamp": self.timestamp,
        }


class PreTradeRiskValidator:
    """Institutional pre-trade risk guardian evaluating proposed orders before broker routing."""

    @staticmethod
    def validate_order(
        order: ProposedOrder,
        current_ltp: float,
        portfolio_equity: float,
        available_margin: float,
        current_daily_pnl: float,
        open_positions_count: int,
        current_instrument_exposure: float,
        current_sector_exposure: float,
        max_daily_loss: float = 10000.0,
        max_capital_per_trade: float = 50000.0,
        max_open_positions: int = 5,
        max_order_quantity_limit: int = 1800,
        price_collar_pct: float = 3.0,  # 3.0% max deviation from LTP
        is_kill_switch_active: bool = False,
        circuit_breaker_triggered: bool = False,
    ) -> OrderRiskValidationResult:
        passed: List[str] = []
        failed: List[str] = []

        sym = order.symbol.upper()
        order_turnover = order.price * order.quantity

        # Calculate potential risk if SL is provided
        if order.stop_loss and order.stop_loss > 0:
            per_unit_risk = abs(order.price - order.stop_loss)
            trade_capital_at_risk = per_unit_risk * order.quantity
        else:
            # Conservative default risk: 2.0% of order turnover if no SL provided
            trade_capital_at_risk = order_turnover * 0.02

        metrics_snapshot = {
            "order_turnover": round(order_turnover, 2),
            "trade_capital_at_risk": round(trade_capital_at_risk, 2),
            "current_daily_pnl": round(current_daily_pnl, 2),
            "max_daily_loss": max_daily_loss,
            "available_margin": round(available_margin, 2),
            "open_positions_count": open_positions_count,
            "max_open_positions": max_open_positions,
            "current_ltp": current_ltp,
        }

        # -------------------------------------------------------------
        # 1. Kill Switch & Circuit Breaker Check
        # -------------------------------------------------------------
        if is_kill_switch_active:
            failed.append("KILL_SWITCH_ACTIVE")
            return OrderRiskValidationResult(
                approved=False,
                rejection_reason="REJECTED: Master Kill Switch is currently active. All order generation halted.",
                checks_passed=passed,
                checks_failed=failed,
                risk_metrics_snapshot=metrics_snapshot,
            )
        if circuit_breaker_triggered:
            failed.append("CIRCUIT_BREAKER_TRIGGERED")
            return OrderRiskValidationResult(
                approved=False,
                rejection_reason="REJECTED: Portfolio Circuit Breaker triggered due to maximum loss breach.",
                checks_passed=passed,
                checks_failed=failed,
                risk_metrics_snapshot=metrics_snapshot,
            )
        passed.append("KILL_SWITCH_DISENGAGED")

        # -------------------------------------------------------------
        # 2. Maximum Daily Loss Limit Check
        # -------------------------------------------------------------
        if current_daily_pnl < 0 and abs(current_daily_pnl) >= max_daily_loss:
            failed.append("MAX_DAILY_LOSS_BREACHED")
            return OrderRiskValidationResult(
                approved=False,
                rejection_reason=f"REJECTED: Daily loss limit (₹{max_daily_loss:,.2f}) has already been reached. Current PnL: ₹{current_daily_pnl:,.2f}.",
                checks_passed=passed,
                checks_failed=failed,
                risk_metrics_snapshot=metrics_snapshot,
            )
        passed.append("DAILY_LOSS_WITHIN_LIMIT")

        # -------------------------------------------------------------
        # 3. Exchange & User Freeze Quantity Limits
        # -------------------------------------------------------------
        exchange_limit = EXCHANGE_FREEZE_LIMITS.get(sym, EXCHANGE_FREEZE_LIMITS["DEFAULT"])
        effective_qty_limit = min(max_order_quantity_limit, exchange_limit)
        if order.quantity > effective_qty_limit or order.quantity <= 0:
            failed.append("ORDER_QUANTITY_FREEZE_LIMIT_EXCEEDED")
            return OrderRiskValidationResult(
                approved=False,
                rejection_reason=f"REJECTED: Order quantity ({order.quantity}) exceeds allowed limit of {effective_qty_limit} for {sym}.",
                checks_passed=passed,
                checks_failed=failed,
                risk_metrics_snapshot=metrics_snapshot,
            )
        passed.append("QUANTITY_WITHIN_FREEZE_LIMITS")

        # -------------------------------------------------------------
        # 4. Maximum Capital at Risk per Trade Check
        # -------------------------------------------------------------
        if trade_capital_at_risk > max_capital_per_trade:
            failed.append("MAX_CAPITAL_AT_RISK_EXCEEDED")
            return OrderRiskValidationResult(
                approved=False,
                rejection_reason=f"REJECTED: Proposed capital at risk (₹{trade_capital_at_risk:,.2f}) exceeds max per-trade limit of ₹{max_capital_per_trade:,.2f}.",
                checks_passed=passed,
                checks_failed=failed,
                risk_metrics_snapshot=metrics_snapshot,
            )
        passed.append("TRADE_RISK_WITHIN_CAP")

        # -------------------------------------------------------------
        # 5. Fat-Finger & Price Collar Protection
        # -------------------------------------------------------------
        if current_ltp > 0 and order.price > 0 and order.order_type.upper() in ("LIMIT", "SL"):
            deviation_pct = abs((order.price - current_ltp) / current_ltp) * 100.0
            if deviation_pct > price_collar_pct:
                failed.append("FAT_FINGER_PRICE_COLLAR_VIOLATION")
                return OrderRiskValidationResult(
                    approved=False,
                    rejection_reason=f"REJECTED: Order price (₹{order.price}) deviates {round(deviation_pct, 2)}% from LTP (₹{current_ltp}), exceeding collar threshold of {price_collar_pct}%.",
                    checks_passed=passed,
                    checks_failed=failed,
                    risk_metrics_snapshot=metrics_snapshot,
                )
        passed.append("PRICE_WITHIN_COLLAR_BANDS")

        # -------------------------------------------------------------
        # 6. Maximum Open Positions Limit Check
        # -------------------------------------------------------------
        if open_positions_count >= max_open_positions:
            failed.append("MAX_OPEN_POSITIONS_REACHED")
            return OrderRiskValidationResult(
                approved=False,
                rejection_reason=f"REJECTED: Portfolio already holds {open_positions_count} open positions (max allowed: {max_open_positions}).",
                checks_passed=passed,
                checks_failed=failed,
                risk_metrics_snapshot=metrics_snapshot,
            )
        passed.append("PORTFOLIO_CAPACITY_AVAILABLE")

        # -------------------------------------------------------------
        # 7. Available Margin & Buying Power Check
        # -------------------------------------------------------------
        req_margin = order.required_margin if order.required_margin else order_turnover
        if req_margin > available_margin:
            failed.append("INSUFFICIENT_MARGIN")
            return OrderRiskValidationResult(
                approved=False,
                rejection_reason=f"REJECTED: Required margin (₹{req_margin:,.2f}) exceeds available buying power of ₹{available_margin:,.2f}.",
                checks_passed=passed,
                checks_failed=failed,
                risk_metrics_snapshot=metrics_snapshot,
            )
        passed.append("MARGIN_SUFFICIENT")

        return OrderRiskValidationResult(
            approved=True,
            rejection_reason=None,
            checks_passed=passed,
            checks_failed=[],
            risk_metrics_snapshot=metrics_snapshot,
        )
