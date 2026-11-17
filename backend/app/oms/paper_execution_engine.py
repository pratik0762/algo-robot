"""
ALGO ROBOT — High-Fidelity Paper Trading Execution Engine
=========================================================
Simulates realistic broker fills, order matching, limit queue evaluation,
position lifecycle, MTM tracking, and exact Indian statutory friction deduction.
"""

from __future__ import annotations
from dataclasses import dataclass, field
import logging
import threading
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from app.backtesting.friction_model import IndianFrictionModel, InstrumentClass
from app.oms.order_state_machine import (
    ManagedOrder,
    OrderFill,
    OrderState,
    OrderType,
    TransactionType,
    ProductType,
)

logger = logging.getLogger("algo_robot.oms.paper_engine")


@dataclass
class PaperPosition:
    position_id: str
    symbol: str
    product_type: str
    quantity: int            # Positive for LONG, negative for SHORT
    average_entry_price: float
    current_price: float
    unrealized_pnl: float = 0.0
    pnl_pct: float = 0.0
    margin_allocated: float = 0.0
    stop_loss: Optional[float] = None
    target: Optional[float] = None
    opened_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def update_mtm(self, ltp: float) -> None:
        self.current_price = ltp
        self.updated_at = time.time()
        if self.quantity > 0:
            self.unrealized_pnl = round((ltp - self.average_entry_price) * self.quantity, 2)
            invested = self.average_entry_price * self.quantity
            self.pnl_pct = round((self.unrealized_pnl / invested) * 100.0, 2) if invested > 0 else 0.0
        elif self.quantity < 0:
            self.unrealized_pnl = round((self.average_entry_price - ltp) * abs(self.quantity), 2)
            invested = self.average_entry_price * abs(self.quantity)
            self.pnl_pct = round((self.unrealized_pnl / invested) * 100.0, 2) if invested > 0 else 0.0
        else:
            self.unrealized_pnl = 0.0
            self.pnl_pct = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "position_id": self.position_id,
            "symbol": self.symbol,
            "product_type": self.product_type,
            "quantity": self.quantity,
            "side": "BUY" if self.quantity > 0 else "SELL",
            "average_entry_price": self.average_entry_price,
            "current_price": self.current_price,
            "unrealized_pnl": self.unrealized_pnl,
            "pnl_pct": self.pnl_pct,
            "margin_allocated": self.margin_allocated,
            "stop_loss": self.stop_loss,
            "target": self.target,
            "opened_at": self.opened_at,
            "updated_at": self.updated_at,
        }


class PaperExecutionEngine:
    """Institutional simulated execution desk with real tick matching and exact friction."""

    def __init__(self, initial_capital: float = 1000000.0, slippage_pct: float = 0.03):
        self._lock = threading.RLock()
        self.initial_capital = initial_capital
        self.cash_balance = initial_capital
        self.used_margin = 0.0
        self.realized_pnl = 0.0
        self.total_charges = 0.0
        self.slippage_pct = slippage_pct  # 0.03% default realistic market slippage

        # Active working orders & positions
        self.open_orders: Dict[str, ManagedOrder] = {}
        self.positions: Dict[str, PaperPosition] = {}  # key: f"{symbol}_{product_type}"
        self.closed_trades: List[Dict[str, Any]] = []

    def reset_portfolio(self, capital: float = 1000000.0) -> None:
        with self._lock:
            self.initial_capital = capital
            self.cash_balance = capital
            self.used_margin = 0.0
            self.realized_pnl = 0.0
            self.total_charges = 0.0
            self.open_orders.clear()
            self.positions.clear()
            self.closed_trades.clear()

    def submit_order(self, order: ManagedOrder, current_ltp: float) -> Tuple[ManagedOrder, Optional[OrderFill]]:
        """Submits an order to the paper execution desk."""
        with self._lock:
            order.transition_to(OrderState.SUBMITTED, reason="Order received by Paper Execution Desk")
            order.broker_order_id = f"PAPER-{uuid.uuid4().hex[:10].upper()}"

            # If MARKET order, execute fill immediately
            if order.order_type == OrderType.MARKET:
                fill = self._execute_fill(order, fill_price=current_ltp, is_market=True)
                return order, fill

            # If LIMIT order: check if immediately matchable
            if order.order_type == OrderType.LIMIT:
                if (order.transaction_type == TransactionType.BUY and current_ltp <= order.price) or \
                   (order.transaction_type == TransactionType.SELL and current_ltp >= order.price):
                    fill = self._execute_fill(order, fill_price=order.price, is_market=False)
                    return order, fill
                else:
                    order.transition_to(OrderState.OPEN, reason=f"Limit order resting in book (LTP: ₹{current_ltp}, Limit: ₹{order.price})")
                    self.open_orders[order.order_id] = order
                    return order, None

            # If SL / SL-M order: rest in book until triggered
            if order.order_type in (OrderType.SL, OrderType.SL_M):
                order.transition_to(OrderState.OPEN, reason=f"Stop order resting in book (Trigger: ₹{order.trigger_price})")
                self.open_orders[order.order_id] = order
                return order, None

            return order, None

    def on_tick(self, symbol: str, ltp: float) -> List[Tuple[ManagedOrder, OrderFill]]:
        """Processes a market tick: evaluates resting limit/SL orders and updates position MTMs."""
        fills_generated: List[Tuple[ManagedOrder, OrderFill]] = []
        sym = symbol.upper()

        with self._lock:
            # 1. Evaluate working orders for this symbol
            order_ids_to_check = [
                oid for oid, ord_obj in self.open_orders.items()
                if ord_obj.symbol.upper() == sym and ord_obj.state == OrderState.OPEN
            ]

            for oid in order_ids_to_check:
                order = self.open_orders.get(oid)
                if not order:
                    continue

                # Check Limit Orders
                if order.order_type == OrderType.LIMIT:
                    if (order.transaction_type == TransactionType.BUY and ltp <= order.price) or \
                       (order.transaction_type == TransactionType.SELL and ltp >= order.price):
                        fill = self._execute_fill(order, fill_price=order.price, is_market=False)
                        self.open_orders.pop(oid, None)
                        fills_generated.append((order, fill))

                # Check Stop-Loss Orders
                elif order.order_type in (OrderType.SL, OrderType.SL_M):
                    triggered = False
                    if order.transaction_type == TransactionType.BUY and ltp >= order.trigger_price:
                        triggered = True
                    elif order.transaction_type == TransactionType.SELL and ltp <= order.trigger_price:
                        triggered = True

                    if triggered:
                        exec_price = order.price if (order.order_type == OrderType.SL and order.price > 0) else ltp
                        fill = self._execute_fill(order, fill_price=exec_price, is_market=(order.order_type == OrderType.SL_M))
                        self.open_orders.pop(oid, None)
                        fills_generated.append((order, fill))

            # 2. Update Position MTMs & Check auto stop-loss / target exits
            auto_exits: List[Tuple[str, str, int, float, str]] = []
            for pos_key, pos in list(self.positions.items()):
                if pos.symbol.upper() == sym:
                    pos.update_mtm(ltp)

                    # Check Target Hit
                    if pos.target and pos.target > 0:
                        if (pos.quantity > 0 and ltp >= pos.target) or (pos.quantity < 0 and ltp <= pos.target):
                            auto_exits.append((pos_key, "TARGET_HIT", abs(pos.quantity), ltp, "SELL" if pos.quantity > 0 else "BUY"))
                    # Check Stop-Loss Hit
                    if pos.stop_loss and pos.stop_loss > 0:
                        if (pos.quantity > 0 and ltp <= pos.stop_loss) or (pos.quantity < 0 and ltp >= pos.stop_loss):
                            auto_exits.append((pos_key, "STOP_LOSS_HIT", abs(pos.quantity), ltp, "SELL" if pos.quantity > 0 else "BUY"))

            for pos_key, exit_reason, exit_qty, exit_price, exit_side in auto_exits:
                pos = self.positions.get(pos_key)
                if pos:
                    self._close_position_internal(pos, exit_price=exit_price, reason=exit_reason)

        return fills_generated

    def cancel_order(self, order_id: str, reason: str = "User Cancelled") -> Optional[ManagedOrder]:
        """Cancels an open resting order."""
        with self._lock:
            order = self.open_orders.pop(order_id, None)
            if order and order.state in (OrderState.OPEN, OrderState.SUBMITTED, OrderState.PARTIALLY_FILLED):
                order.transition_to(OrderState.CANCELLED, reason=reason)
                return order
            return None

    def modify_order(
        self,
        order_id: str,
        new_price: Optional[float] = None,
        new_quantity: Optional[int] = None,
        new_trigger_price: Optional[float] = None,
    ) -> Optional[ManagedOrder]:
        """Modifies a resting open limit/SL order."""
        with self._lock:
            order = self.open_orders.get(order_id)
            if not order or order.state != OrderState.OPEN:
                return None

            if new_price is not None and new_price > 0:
                order.price = new_price
            if new_quantity is not None and new_quantity > 0:
                order.quantity = new_quantity
                order.remaining_quantity = order.quantity - order.filled_quantity
            if new_trigger_price is not None and new_trigger_price > 0:
                order.trigger_price = new_trigger_price

            order.updated_at = time.time()
            logger.info("Modified order %s: price=₹%s, qty=%s, trigger=₹%s", order_id, order.price, order.quantity, order.trigger_price)
            return order

    def _execute_fill(self, order: ManagedOrder, fill_price: float, is_market: bool = False) -> OrderFill:
        """Executes fill, applies slippage, exact regulatory friction, and updates positions."""
        # Realistic slippage on market orders
        slippage_cost = 0.0
        effective_price = fill_price
        if is_market and self.slippage_pct > 0:
            slip_amount = round(fill_price * (self.slippage_pct / 100.0), 2)
            if order.transaction_type == TransactionType.BUY:
                effective_price = round(fill_price + slip_amount, 2)
            else:
                effective_price = round(max(0.05, fill_price - slip_amount), 2)
            slippage_cost = abs(effective_price - fill_price) * order.remaining_quantity

        fill_qty = order.remaining_quantity

        # Compute exact statutory friction via IndianFrictionModel
        if "CE" in order.symbol or "PE" in order.symbol:
            inst_class = InstrumentClass.OPTIONS
        elif order.product_type == ProductType.CNC:
            inst_class = InstrumentClass.EQUITY_DELIVERY
        else:
            inst_class = InstrumentClass.EQUITY_INTRADAY

        f_breakdown = IndianFrictionModel.calculate_trade_friction(
            instrument_class=inst_class,
            side=order.transaction_type.value,
            price=effective_price,
            quantity=fill_qty,
            slippage_pct=0.0,  # Already factored into effective_price
        )

        fill = OrderFill(
            fill_id=f"FILL-{uuid.uuid4().hex[:10].upper()}",
            order_id=order.order_id,
            quantity=fill_qty,
            price=effective_price,
            timestamp=time.time(),
            friction_charges=f_breakdown.to_dict(),
            exchange_trade_id=f"EXCH-{uuid.uuid4().hex[:8].upper()}",
        )

        order.add_fill(fill)

        # Update portfolio accounting & positions
        total_charges = round(f_breakdown.total_friction - f_breakdown.slippage_cost, 4)
        self.total_charges += total_charges
        self.cash_balance -= total_charges

        self._update_position_from_fill(order, fill)
        return fill

    def _update_position_from_fill(self, order: ManagedOrder, fill: OrderFill) -> None:
        """Updates internal position and calculates realized PnL on squaring off."""
        pos_key = f"{order.symbol.upper()}_{order.product_type.value}"
        existing = self.positions.get(pos_key)

        delta_qty = fill.quantity if order.transaction_type == TransactionType.BUY else -fill.quantity

        if existing is None:
            # New Position
            margin_req = (fill.price * fill.quantity) if order.product_type == ProductType.CNC else (fill.price * fill.quantity * 0.20)
            self.used_margin += margin_req
            self.cash_balance -= margin_req

            self.positions[pos_key] = PaperPosition(
                position_id=f"POS-{uuid.uuid4().hex[:8].upper()}",
                symbol=order.symbol.upper(),
                product_type=order.product_type.value,
                quantity=delta_qty,
                average_entry_price=fill.price,
                current_price=fill.price,
                margin_allocated=margin_req,
                stop_loss=order.stop_loss,
                target=order.target,
            )
        else:
            prev_qty = existing.quantity
            new_qty = prev_qty + delta_qty

            if (prev_qty > 0 and delta_qty > 0) or (prev_qty < 0 and delta_qty < 0):
                # Adding to existing position (pyramiding)
                total_shares = abs(new_qty)
                total_cost = (existing.average_entry_price * abs(prev_qty)) + (fill.price * abs(delta_qty))
                existing.average_entry_price = round(total_cost / total_shares, 2)
                existing.quantity = new_qty
                add_margin = (fill.price * abs(delta_qty) * 0.20)
                existing.margin_allocated += add_margin
                self.used_margin += add_margin
                self.cash_balance -= add_margin
            elif new_qty == 0:
                # Fully closed position
                pnl = (fill.price - existing.average_entry_price) * prev_qty if prev_qty > 0 else (existing.average_entry_price - fill.price) * abs(prev_qty)
                self.realized_pnl += pnl
                self.cash_balance += (existing.margin_allocated + pnl)
                self.used_margin = max(0.0, self.used_margin - existing.margin_allocated)

                self.closed_trades.append({
                    "position_id": existing.position_id,
                    "symbol": existing.symbol,
                    "product_type": existing.product_type,
                    "quantity": abs(prev_qty),
                    "entry_price": existing.average_entry_price,
                    "exit_price": fill.price,
                    "net_pnl": round(pnl, 2),
                    "opened_at": existing.opened_at,
                    "closed_at": time.time(),
                })
                self.positions.pop(pos_key, None)
            else:
                # Partially closed position
                closed_part = min(abs(prev_qty), abs(delta_qty))
                pnl = (fill.price - existing.average_entry_price) * closed_part if prev_qty > 0 else (existing.average_entry_price - fill.price) * closed_part
                self.realized_pnl += pnl
                freed_margin = existing.margin_allocated * (closed_part / abs(prev_qty))
                existing.margin_allocated -= freed_margin
                self.used_margin = max(0.0, self.used_margin - freed_margin)
                self.cash_balance += (freed_margin + pnl)
                existing.quantity = new_qty

    def _close_position_internal(self, pos: PaperPosition, exit_price: float, reason: str) -> None:
        """Internal auto-close handler when SL or Target price is reached."""
        pnl = (exit_price - pos.average_entry_price) * pos.quantity if pos.quantity > 0 else (pos.average_entry_price - exit_price) * abs(pos.quantity)
        self.realized_pnl += pnl
        self.cash_balance += (pos.margin_allocated + pnl)
        self.used_margin = max(0.0, self.used_margin - pos.margin_allocated)

        self.closed_trades.append({
            "position_id": pos.position_id,
            "symbol": pos.symbol,
            "product_type": pos.product_type,
            "quantity": abs(pos.quantity),
            "entry_price": pos.average_entry_price,
            "exit_price": exit_price,
            "net_pnl": round(pnl, 2),
            "reason": reason,
            "opened_at": pos.opened_at,
            "closed_at": time.time(),
        })
        pos_key = f"{pos.symbol.upper()}_{pos.product_type}"
        self.positions.pop(pos_key, None)
        logger.info("Auto-closed position %s: reason=%s, exit_price=₹%s, PnL=₹%s", pos.position_id, reason, exit_price, pnl)

    def get_portfolio_summary(self) -> Dict[str, Any]:
        """Calculates current portfolio status, cash, margin, and MTM."""
        with self._lock:
            unrealized_total = sum(p.unrealized_pnl for p in self.positions.values())
            net_equity = round(self.cash_balance + self.used_margin + unrealized_total, 2)
            total_trades = len(self.closed_trades)
            winning_trades = sum(1 for t in self.closed_trades if t.get("net_pnl", 0) > 0)
            win_rate = round((winning_trades / total_trades) * 100.0, 2) if total_trades > 0 else 0.0

            return {
                "initial_capital": round(self.initial_capital, 2),
                "net_equity": net_equity,
                "cash_balance": round(self.cash_balance, 2),
                "available_margin": round(max(0.0, self.cash_balance), 2),
                "used_margin": round(self.used_margin, 2),
                "realized_pnl": round(self.realized_pnl, 2),
                "unrealized_pnl": round(unrealized_total, 2),
                "total_pnl": round(self.realized_pnl + unrealized_total, 2),
                "total_charges": round(self.total_charges, 2),
                "open_positions_count": len(self.positions),
                "open_orders_count": len(self.open_orders),
                "total_closed_trades": total_trades,
                "win_rate_pct": win_rate,
                "timestamp": time.time(),
            }
