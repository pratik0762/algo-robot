"""
ALGO ROBOT — Real-Time Portfolio Risk Monitor & Concentration Manager
Monitors daily realized & unrealized PnL, single stock & sector concentration caps,
margin utilization, and enforces the automated daily loss circuit breaker.
"""

from __future__ import annotations
from dataclasses import dataclass, field
import logging
import threading
import time
from typing import Any, Dict, List, Optional

from app.risk.kill_switch import kill_switch_manager

logger = logging.getLogger("algo_robot.risk.portfolio")


@dataclass
class PositionRiskSnapshot:
    symbol: str
    sector: str
    quantity: int
    entry_price: float
    current_price: float
    unrealized_pnl: float
    exposure_amount: float
    exposure_pct: float


class PortfolioRiskManager:
    """Monitors live exposure, sector concentrations, and daily drawdown."""

    def __init__(self):
        self._lock = threading.RLock()
        self.portfolio_equity: float = 500000.0
        self.available_margin: float = 500000.0
        self.max_daily_loss: float = 15000.0  # ₹15,000 or 3% default
        self.max_single_stock_pct: float = 20.0  # Max 20% in any one stock
        self.max_sector_pct: float = 35.0        # Max 35% in any one sector
        self.realized_daily_pnl: float = 0.0
        self._open_positions: Dict[str, Dict[str, Any]] = {}

    def set_risk_limits(
        self,
        portfolio_equity: Optional[float] = None,
        max_daily_loss: Optional[float] = None,
        max_single_stock_pct: Optional[float] = None,
        max_sector_pct: Optional[float] = None,
    ) -> None:
        with self._lock:
            if portfolio_equity is not None:
                self.portfolio_equity = float(portfolio_equity)
            if max_daily_loss is not None:
                self.max_daily_loss = float(max_daily_loss)
            if max_single_stock_pct is not None:
                self.max_single_stock_pct = float(max_single_stock_pct)
            if max_sector_pct is not None:
                self.max_sector_pct = float(max_sector_pct)

    def record_realized_trade(self, net_pnl: float) -> None:
        """Records realized PnL and verifies if daily circuit breaker should trip."""
        with self._lock:
            self.realized_daily_pnl += net_pnl
            self.portfolio_equity += net_pnl
            self.available_margin += net_pnl
            self._check_daily_loss_trip()

    def update_position(
        self,
        symbol: str,
        quantity: int,
        entry_price: float,
        current_price: float,
        sector: str = "DIVERSIFIED",
    ) -> None:
        """Updates or adds an active position and re-evaluates risk exposures."""
        with self._lock:
            sym = symbol.upper()
            if quantity == 0:
                self._open_positions.pop(sym, None)
            else:
                unrealized = (current_price - entry_price) * quantity
                self._open_positions[sym] = {
                    "symbol": sym,
                    "sector": sector.upper(),
                    "quantity": quantity,
                    "entry_price": entry_price,
                    "current_price": current_price,
                    "unrealized_pnl": round(unrealized, 2),
                    "exposure_amount": round(current_price * abs(quantity), 2),
                }
            self._check_daily_loss_trip()

    def get_portfolio_risk_status(self) -> Dict[str, Any]:
        """Calculates full live portfolio risk summary."""
        with self._lock:
            unrealized_total = sum(p["unrealized_pnl"] for p in self._open_positions.values())
            total_daily_pnl = round(self.realized_daily_pnl + unrealized_total, 2)
            total_exposure = sum(p["exposure_amount"] for p in self._open_positions.values())

            # Sector exposures
            sector_exposures: Dict[str, float] = {}
            for p in self._open_positions.values():
                sec = p["sector"]
                sector_exposures[sec] = sector_exposures.get(sec, 0.0) + p["exposure_amount"]

            sector_pcts = {
                sec: round((amt / max(self.portfolio_equity, 1.0)) * 100.0, 2)
                for sec, amt in sector_exposures.items()
            }

            # Single stock exposures
            stock_pcts = {
                sym: round((p["exposure_amount"] / max(self.portfolio_equity, 1.0)) * 100.0, 2)
                for sym, p in self._open_positions.items()
            }

            daily_loss_consumed_pct = (
                round((abs(total_daily_pnl) / self.max_daily_loss) * 100.0, 2)
                if total_daily_pnl < 0
                else 0.0
            )

            margin_utilized = max(0.0, self.portfolio_equity - self.available_margin)
            margin_utilized_pct = round((margin_utilized / max(self.portfolio_equity, 1.0)) * 100.0, 2)

            return {
                "portfolio_equity": round(self.portfolio_equity, 2),
                "available_margin": round(self.available_margin, 2),
                "margin_utilized": round(margin_utilized, 2),
                "margin_utilized_pct": margin_utilized_pct,
                "realized_daily_pnl": round(self.realized_daily_pnl, 2),
                "unrealized_mtm_pnl": round(unrealized_total, 2),
                "total_daily_pnl": total_daily_pnl,
                "max_daily_loss": self.max_daily_loss,
                "daily_loss_consumed_pct": daily_loss_consumed_pct,
                "open_positions_count": len(self._open_positions),
                "total_exposure_amount": round(total_exposure, 2),
                "stock_exposures_pct": stock_pcts,
                "sector_exposures_pct": sector_pcts,
                "is_kill_switch_active": kill_switch_manager.is_active,
                "kill_switch_state": kill_switch_manager.state.value,
                "timestamp": time.time(),
            }

    def _check_daily_loss_trip(self) -> None:
        """Internal guard checking if cumulative daily drawdown trips the circuit breaker."""
        unrealized = sum(p["unrealized_pnl"] for p in self._open_positions.values())
        total_pnl = self.realized_daily_pnl + unrealized

        if total_pnl < 0 and abs(total_pnl) >= self.max_daily_loss:
            if not kill_switch_manager.is_active:
                kill_switch_manager.trip_circuit_breaker(
                    reason=f"Cumulative daily loss (₹{abs(total_pnl):,.2f}) breached max limit of ₹{self.max_daily_loss:,.2f}",
                    metric_value=abs(total_pnl),
                    threshold=self.max_daily_loss,
                )


# Singleton instance
portfolio_risk_manager = PortfolioRiskManager()
