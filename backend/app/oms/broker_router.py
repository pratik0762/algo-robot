"""
ALGO ROBOT — Broker Order Router & Dispatcher
==============================================
Routes orders dynamically to either the Paper Execution Desk or authorized Live Broker Adapters
(Zerodha Kite Connect, Angel One SmartAPI, Dhan, Upstox).
"""

from __future__ import annotations
import logging
from typing import Any, Dict, Optional, Tuple

from app.oms.order_state_machine import (
    ManagedOrder,
    OrderFill,
    OrderState,
    ExecutionMode,
)
from app.oms.paper_execution_engine import PaperExecutionEngine
from app.broker_connectors.broker_manager import broker_manager

logger = logging.getLogger("algo_robot.oms.router")


class BrokerRouter:
    """Dispatches orders to either internal paper simulator or external live broker adapters."""

    def __init__(self, paper_engine: Optional[PaperExecutionEngine] = None):
        self.paper_engine = paper_engine or PaperExecutionEngine()

    def route_order(self, order: ManagedOrder, current_ltp: float) -> Tuple[ManagedOrder, Optional[OrderFill]]:
        """Dispatches an order to the designated execution target."""
        if order.execution_mode == ExecutionMode.PAPER:
            return self.paper_engine.submit_order(order, current_ltp=current_ltp)

        # LIVE Broker Execution
        broker_id = order.broker_name.upper()
        adapter = broker_manager.adapters.get(broker_id)

        if not adapter:
            order.transition_to(OrderState.REJECTED, reason=f"Unsupported broker destination: {broker_id}")
            order.rejection_reason = f"Broker '{broker_id}' is not supported."
            return order, None

        if not adapter.is_connected:
            order.transition_to(OrderState.REJECTED, reason=f"Broker {broker_id} is not connected. Configure credentials or switch to PAPER mode.")
            order.rejection_reason = f"Broker '{broker_id}' has no active session. Please authenticate first."
            return order, None

        try:
            res = adapter.place_order(
                symbol=order.symbol,
                exchange=order.exchange,
                transaction_type=order.transaction_type.value,
                quantity=order.quantity,
                order_type=order.order_type.value,
                product=order.product_type.value,
                price=order.price,
                trigger_price=order.trigger_price,
                tag=order.tag,
            )

            if res.get("status") == "success":
                order.broker_order_id = res.get("order_id")
                order.transition_to(OrderState.OPEN, reason=f"Successfully routed to {broker_id}: Order ID #{order.broker_order_id}")
            else:
                order.transition_to(OrderState.REJECTED, reason=res.get("message", "Broker rejection"))
                order.rejection_reason = res.get("message", "Broker rejection")

            return order, None

        except Exception as e:
            logger.error("Error executing order on %s: %s", broker_id, e)
            order.transition_to(OrderState.REJECTED, reason=f"Execution error on {broker_id}: {str(e)}")
            order.rejection_reason = str(e)
            return order, None

    def cancel_order(self, order: ManagedOrder) -> bool:
        """Cancels an order on the appropriate destination."""
        if order.execution_mode == ExecutionMode.PAPER:
            cancelled = self.paper_engine.cancel_order(order.order_id)
            return cancelled is not None

        broker_id = order.broker_name.upper()
        adapter = broker_manager.adapters.get(broker_id)
        if adapter and order.broker_order_id:
            try:
                res = adapter.cancel_order(order.broker_order_id)
                if res.get("status") == "success":
                    order.transition_to(OrderState.CANCELLED, reason="Cancelled via broker API")
                    return True
            except Exception as e:
                logger.error("Error cancelling order on %s: %s", broker_id, e)
        return False
