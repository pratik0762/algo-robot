"""
ALGO ROBOT — Institutional Order Management System (OMS) Package
Phase 9 implementation:
- Multi-state Order State Machine with partial fills and audit trails
- High-fidelity Paper Execution Engine with Indian statutory friction model
- Multi-Broker Router (Paper, Kite, Angel One, Upstox, Dhan)
- Central OrderManagementService coordinating pre-trade risk, DB persistence, and WebSockets
"""

from app.oms.order_state_machine import (
    OrderState,
    OrderType,
    TransactionType,
    ProductType,
    ExecutionMode,
    OrderFill,
    ManagedOrder,
)
from app.oms.paper_execution_engine import (
    PaperPosition,
    PaperExecutionEngine,
)
from app.oms.broker_router import (
    BrokerRouter,
)
from app.oms.order_management_service import (
    OrderManagementService,
    order_management_service,
)

__all__ = [
    "OrderState",
    "OrderType",
    "TransactionType",
    "ProductType",
    "ExecutionMode",
    "OrderFill",
    "ManagedOrder",
    "PaperPosition",
    "PaperExecutionEngine",
    "BrokerRouter",
    "OrderManagementService",
    "order_management_service",
]
