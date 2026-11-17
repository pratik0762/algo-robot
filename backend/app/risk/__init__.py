"""
Pre-Trade Risk Engine & Portfolio Controls
Phase 8 implementation:
- Pre-Trade Order Risk Validation (Kill Switch, Daily Loss, Position Size, Freezes, Fat-Finger, Margin)
- Emergency Kill-Switch & Automated Circuit-Breaker State Machine
- Real-Time Portfolio Risk Monitor (Daily PnL, MTM, Sector & Stock Concentration, Margin Utilization)
- Central RiskService with SQLAlchemy DB persistence & WebSocket alerts
"""

from app.risk.pre_trade_validator import (
    ProposedOrder,
    OrderRiskValidationResult,
    PreTradeRiskValidator,
    EXCHANGE_FREEZE_LIMITS,
)
from app.risk.kill_switch import (
    KillSwitchState,
    KillSwitchEvent,
    KillSwitchManager,
    kill_switch_manager,
)
from app.risk.portfolio_risk_manager import (
    PositionRiskSnapshot,
    PortfolioRiskManager,
    portfolio_risk_manager,
)
from app.risk.service import RiskService, risk_service

__all__ = [
    "ProposedOrder",
    "OrderRiskValidationResult",
    "PreTradeRiskValidator",
    "EXCHANGE_FREEZE_LIMITS",
    "KillSwitchState",
    "KillSwitchEvent",
    "KillSwitchManager",
    "kill_switch_manager",
    "PositionRiskSnapshot",
    "PortfolioRiskManager",
    "portfolio_risk_manager",
    "RiskService",
    "risk_service",
]
