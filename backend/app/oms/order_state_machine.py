"""
ALGO ROBOT — Institutional Order State Machine
==============================================
Manages lifecycle transitions, timestamps, partial fills, and audit trail for every order:
PENDING_SUBMISSION -> VALIDATING_RISK -> SUBMITTED -> OPEN -> PARTIALLY_FILLED -> FILLED / REJECTED / CANCELLED / EXPIRED
"""

from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
import logging
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger("algo_robot.oms.state_machine")


class OrderState(str, Enum):
    PENDING_SUBMISSION = "PENDING_SUBMISSION"
    VALIDATING_RISK = "VALIDATING_RISK"
    SUBMITTED = "SUBMITTED"
    OPEN = "OPEN"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    SL = "SL"
    SL_M = "SL-M"


class TransactionType(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class ProductType(str, Enum):
    MIS = "MIS"      # Intraday
    CNC = "CNC"      # Cash & Carry / Delivery
    NRML = "NRML"    # Normal Derivatives


class ExecutionMode(str, Enum):
    PAPER = "PAPER"
    LIVE = "LIVE"


# Valid state transitions lookup table
VALID_TRANSITIONS: Dict[OrderState, List[OrderState]] = {
    OrderState.PENDING_SUBMISSION: [OrderState.VALIDATING_RISK, OrderState.SUBMITTED, OrderState.REJECTED, OrderState.CANCELLED],
    OrderState.VALIDATING_RISK: [OrderState.SUBMITTED, OrderState.REJECTED, OrderState.CANCELLED],
    OrderState.SUBMITTED: [OrderState.OPEN, OrderState.PARTIALLY_FILLED, OrderState.FILLED, OrderState.REJECTED, OrderState.CANCELLED],
    OrderState.OPEN: [OrderState.PARTIALLY_FILLED, OrderState.FILLED, OrderState.CANCELLED, OrderState.EXPIRED],
    OrderState.PARTIALLY_FILLED: [OrderState.PARTIALLY_FILLED, OrderState.FILLED, OrderState.CANCELLED, OrderState.EXPIRED],
    OrderState.FILLED: [],       # Terminal state
    OrderState.CANCELLED: [],    # Terminal state
    OrderState.REJECTED: [],     # Terminal state
    OrderState.EXPIRED: [],      # Terminal state
}


@dataclass
class OrderFill:
    fill_id: str
    order_id: str
    quantity: int
    price: float
    timestamp: float = field(default_factory=time.time)
    friction_charges: Dict[str, float] = field(default_factory=dict)
    exchange_trade_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "fill_id": self.fill_id,
            "order_id": self.order_id,
            "quantity": self.quantity,
            "price": self.price,
            "timestamp": self.timestamp,
            "friction_charges": self.friction_charges,
            "exchange_trade_id": self.exchange_trade_id,
        }


@dataclass
class ManagedOrder:
    order_id: str
    symbol: str
    transaction_type: TransactionType
    order_type: OrderType
    quantity: int
    price: float
    trigger_price: float = 0.0
    product_type: ProductType = ProductType.MIS
    exchange: str = "NSE"
    execution_mode: ExecutionMode = ExecutionMode.PAPER
    broker_name: str = "PAPER"
    user_id: int = 1
    stop_loss: Optional[float] = None
    target: Optional[float] = None
    tag: str = "ALGO_ROBOT"

    # Dynamic lifecycle tracking
    state: OrderState = OrderState.PENDING_SUBMISSION
    filled_quantity: int = 0
    remaining_quantity: int = field(init=False)
    average_price: float = 0.0
    broker_order_id: Optional[str] = None
    rejection_reason: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    # Executions and audit trail
    fills: List[OrderFill] = field(default_factory=list)
    state_history: List[Dict[str, Any]] = field(default_factory=list)

    def __post_init__(self):
        self.remaining_quantity = self.quantity - self.filled_quantity
        if not self.state_history:
            self.state_history.append({
                "from_state": None,
                "to_state": self.state.value,
                "timestamp": self.created_at,
                "reason": "Order created",
            })

    @property
    def is_active(self) -> bool:
        """Returns True if order is still working and can be filled, modified, or cancelled."""
        return self.state in (
            OrderState.PENDING_SUBMISSION,
            OrderState.VALIDATING_RISK,
            OrderState.SUBMITTED,
            OrderState.OPEN,
            OrderState.PARTIALLY_FILLED,
        )

    @property
    def is_terminal(self) -> bool:
        """Returns True if order has reached a final immutable state."""
        return self.state in (
            OrderState.FILLED,
            OrderState.CANCELLED,
            OrderState.REJECTED,
            OrderState.EXPIRED,
        )

    def transition_to(self, new_state: OrderState, reason: str = "") -> None:
        """Transition order to a new state if valid under the state machine contract."""
        if self.state == new_state:
            return

        allowed = VALID_TRANSITIONS.get(self.state, [])
        if new_state not in allowed:
            err_msg = f"Illegal order transition from {self.state.value} to {new_state.value} for {self.order_id}"
            logger.error(err_msg)
            raise ValueError(err_msg)

        old_state = self.state
        self.state = new_state
        self.updated_at = time.time()
        self.state_history.append({
            "from_state": old_state.value,
            "to_state": new_state.value,
            "timestamp": self.updated_at,
            "reason": reason,
        })
        logger.info("Order %s: %s -> %s (Reason: %s)", self.order_id, old_state.value, new_state.value, reason)

    def add_fill(self, fill: OrderFill) -> None:
        """Record an execution fill, compute new weighted average price, and advance state."""
        self.fills.append(fill)
        new_filled = self.filled_quantity + fill.quantity
        if new_filled > self.quantity:
            raise ValueError(f"Fill quantity ({new_filled}) exceeds total order quantity ({self.quantity})")

        total_cost = (self.average_price * self.filled_quantity) + (fill.price * fill.quantity)
        self.filled_quantity = new_filled
        self.remaining_quantity = self.quantity - self.filled_quantity
        self.average_price = round(total_cost / self.filled_quantity, 2) if self.filled_quantity > 0 else 0.0
        self.updated_at = time.time()

        if self.filled_quantity >= self.quantity:
            self.transition_to(OrderState.FILLED, reason="Order completely filled")
        else:
            self.transition_to(OrderState.PARTIALLY_FILLED, reason=f"Partially filled ({self.filled_quantity}/{self.quantity})")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "order_id": self.order_id,
            "broker_order_id": self.broker_order_id,
            "symbol": self.symbol,
            "exchange": self.exchange,
            "transaction_type": self.transaction_type.value,
            "order_type": self.order_type.value,
            "product_type": self.product_type.value,
            "quantity": self.quantity,
            "filled_quantity": self.filled_quantity,
            "remaining_quantity": self.remaining_quantity,
            "price": self.price,
            "trigger_price": self.trigger_price,
            "average_price": self.average_price,
            "stop_loss": self.stop_loss,
            "target": self.target,
            "state": self.state.value,
            "execution_mode": self.execution_mode.value,
            "broker_name": self.broker_name,
            "rejection_reason": self.rejection_reason,
            "tag": self.tag,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "fills": [f.to_dict() for f in self.fills],
            "state_history": self.state_history,
        }
