"""
ALGO ROBOT — Central Order Management Service (OMS)
===================================================
Coordinates pre-trade risk checks, order state machine, multi-broker routing,
real-time tick matching, database persistence, and WebSocket broadcasting.
"""

from __future__ import annotations
import asyncio
from datetime import datetime, timezone
import logging
import threading
import time
import uuid
from typing import Any, Callable, Dict, List, Optional, Set
from fastapi import WebSocket

from app.oms.order_state_machine import (
    ManagedOrder,
    OrderFill,
    OrderState,
    OrderType,
    TransactionType,
    ProductType,
    ExecutionMode,
)
from app.oms.paper_execution_engine import PaperExecutionEngine
from app.oms.broker_router import BrokerRouter
from app.risk.service import risk_service
from app.risk.pre_trade_validator import ProposedOrder
from app.risk.portfolio_risk_manager import portfolio_risk_manager
from app.db.session import SessionLocal
from app.db.models import Order as DBOrder, Trade as DBTrade, OrderStatus as DBOrderStatus, TransactionType as DBTxType
from app.market_data.base_adapter import NormalizedTick

logger = logging.getLogger("algo_robot.oms.service")


class OrderManagementService:
    """Institutional Order Management System (OMS) orchestrating execution, risk, and fills."""

    def __init__(self):
        self._lock = threading.RLock()
        self.paper_engine = PaperExecutionEngine()
        self.router = BrokerRouter(paper_engine=self.paper_engine)

        # In-Memory Master Order & Trade Ledger
        self._orders: Dict[str, ManagedOrder] = {}
        self._trades: List[Dict[str, Any]] = []

        # Real-time WebSocket clients
        self._connected_websockets: Set[WebSocket] = set()

    def place_order(
        self,
        symbol: str,
        transaction_type: str,
        order_type: str,
        quantity: int,
        price: float = 0.0,
        trigger_price: float = 0.0,
        product_type: str = "MIS",
        exchange: str = "NSE",
        execution_mode: str = "PAPER",
        broker_name: str = "PAPER",
        stop_loss: Optional[float] = None,
        target: Optional[float] = None,
        sector: Optional[str] = None,
        tag: str = "ALGO_ROBOT",
        user_id: int = 1,
        current_ltp: Optional[float] = None,
    ) -> ManagedOrder:
        """Processes order: Pre-Trade Risk -> State Machine -> Broker Routing -> Ledger Sync."""
        sym = symbol.upper()
        tx_type = TransactionType(transaction_type.upper())
        ord_type = OrderType(order_type.upper())
        prod_type = ProductType(product_type.upper())
        exec_mode = ExecutionMode(execution_mode.upper())

        # Determine reference price if not provided
        if current_ltp is None or current_ltp <= 0:
            from app.tick_engine import tick_engine
            quote = tick_engine.stocks.get(sym, {})
            current_ltp = float(quote.get("ltp", price if price > 0 else 100.0))

        order_price = price if (ord_type == OrderType.LIMIT and price > 0) else current_ltp

        # Instantiate Order
        order_id = f"ORD-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        order = ManagedOrder(
            order_id=order_id,
            symbol=sym,
            transaction_type=tx_type,
            order_type=ord_type,
            product_type=prod_type,
            quantity=quantity,
            price=order_price,
            trigger_price=trigger_price,
            exchange=exchange,
            execution_mode=exec_mode,
            broker_name=broker_name.upper(),
            user_id=user_id,
            stop_loss=stop_loss,
            target=target,
            tag=tag,
        )

        with self._lock:
            self._orders[order_id] = order

        # -------------------------------------------------------------
        # STEP 1: Mandatory Pre-Trade Risk Validation (Phase 8 Gate)
        # -------------------------------------------------------------
        order.transition_to(OrderState.VALIDATING_RISK, reason="Evaluating pre-trade risk gates")

        risk_order = ProposedOrder(
            symbol=sym,
            transaction_type=tx_type.value,
            order_type=ord_type.value,
            quantity=quantity,
            price=order_price,
            stop_loss=stop_loss,
            target=target,
            instrument_type="OPTIONS" if ("CE" in sym or "PE" in sym) else "EQUITY",
            sector=sector,
            required_margin=(order_price * quantity * 0.20) if prod_type == ProductType.MIS else (order_price * quantity),
        )

        risk_result = risk_service.validate_proposed_order(order=risk_order, current_ltp=current_ltp)

        if not risk_result.approved:
            order.transition_to(OrderState.REJECTED, reason=risk_result.rejection_reason or "Risk rejection")
            order.rejection_reason = risk_result.rejection_reason
            self._sync_order_to_db(order)
            self._broadcast_order_event(order)
            return order

        # -------------------------------------------------------------
        # STEP 2: Dispatch to Broker Router
        # -------------------------------------------------------------
        order, fill = self.router.route_order(order, current_ltp=current_ltp)

        # -------------------------------------------------------------
        # STEP 3: Handle Fills & Portfolio Risk Synchronization
        # -------------------------------------------------------------
        if fill:
            self._record_trade(order, fill)
            self._sync_portfolio_risk_manager()

        self._sync_order_to_db(order)
        self._broadcast_order_event(order)
        return order

    def cancel_order(self, order_id: str, reason: str = "User Cancelled") -> Optional[ManagedOrder]:
        """Cancels an open order."""
        with self._lock:
            order = self._orders.get(order_id)
            if not order:
                return None
            if not order.is_active:
                logger.warning("Order %s is not active (state: %s), cannot cancel", order_id, order.state.value)
                return order

            success = self.router.cancel_order(order)
            if success or order.state == OrderState.CANCELLED:
                self._sync_order_to_db(order)
                self._broadcast_order_event(order)
            return order

    def modify_order(
        self,
        order_id: str,
        new_price: Optional[float] = None,
        new_quantity: Optional[int] = None,
        new_trigger_price: Optional[float] = None,
    ) -> Optional[ManagedOrder]:
        """Modifies a working resting order."""
        with self._lock:
            order = self._orders.get(order_id)
            if not order or order.state != OrderState.OPEN:
                return None

            # Re-validate with Risk Engine if quantity or price changed
            check_price = new_price if new_price else order.price
            check_qty = new_quantity if new_quantity else order.quantity

            from app.tick_engine import tick_engine
            quote = tick_engine.stocks.get(order.symbol.upper(), {})
            current_ltp = float(quote.get("ltp", check_price))

            risk_order = ProposedOrder(
                symbol=order.symbol,
                transaction_type=order.transaction_type.value,
                order_type=order.order_type.value,
                quantity=check_qty,
                price=check_price,
                stop_loss=order.stop_loss,
                target=order.target,
            )
            risk_result = risk_service.validate_proposed_order(order=risk_order, current_ltp=current_ltp)
            if not risk_result.approved:
                logger.warning("Order modification rejected by risk: %s", risk_result.rejection_reason)
                return order

            # Modify in paper engine
            if order.execution_mode == ExecutionMode.PAPER:
                self.paper_engine.modify_order(
                    order_id=order_id,
                    new_price=new_price,
                    new_quantity=new_quantity,
                    new_trigger_price=new_trigger_price,
                )

            self._sync_order_to_db(order)
            self._broadcast_order_event(order)
            return order

    def on_tick(self, tick: NormalizedTick) -> None:
        """Processes live market ticks: evaluates resting orders, updates positions, and detects exits."""
        fills = self.paper_engine.on_tick(symbol=tick.symbol, ltp=tick.ltp)
        if fills:
            for order, fill in fills:
                self._record_trade(order, fill)
                self._sync_order_to_db(order)
                self._broadcast_order_event(order)
            self._sync_portfolio_risk_manager()

    def get_orders(
        self,
        status: Optional[str] = None,
        symbol: Optional[str] = None,
        execution_mode: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """Returns filtered list of orders from the master ledger."""
        with self._lock:
            orders = list(self._orders.values())

        if status:
            stat_upper = status.upper()
            orders = [o for o in orders if o.state.value == stat_upper]
        if symbol:
            sym_upper = symbol.upper()
            orders = [o for o in orders if o.symbol.upper() == sym_upper]
        if execution_mode:
            em_upper = execution_mode.upper()
            orders = [o for o in orders if o.execution_mode.value == em_upper]

        # Sort descending by creation timestamp
        orders.sort(key=lambda o: o.created_at, reverse=True)
        return [o.to_dict() for o in orders[offset: offset + limit]]

    def get_order_by_id(self, order_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            ord_obj = self._orders.get(order_id)
            return ord_obj.to_dict() if ord_obj else None

    def get_positions(self) -> List[Dict[str, Any]]:
        """Returns all open positions from paper desk and live broker adapters."""
        positions = []
        # Paper desk positions
        for p in self.paper_engine.positions.values():
            positions.append({
                **p.to_dict(),
                "broker": "PAPER",
            })
        return positions

    def get_trades(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._lock:
            return sorted(self._trades, key=lambda t: t.get("executed_at", 0), reverse=True)[:limit]

    def get_portfolio_summary(self) -> Dict[str, Any]:
        """Consolidates portfolio equity, cash, margin, and MTM across execution engines."""
        return self.paper_engine.get_portfolio_summary()

    def _record_trade(self, order: ManagedOrder, fill: OrderFill) -> None:
        """Records executed trade in memory and asynchronously to the database."""
        f_breakdown = fill.friction_charges
        trade_data = {
            "trade_id": fill.fill_id,
            "order_id": order.order_id,
            "symbol": order.symbol,
            "exchange": order.exchange,
            "transaction_type": order.transaction_type.value,
            "product_type": order.product_type.value,
            "quantity": fill.quantity,
            "execution_price": fill.price,
            "turnover": round(fill.price * fill.quantity, 2),
            "brokerage": f_breakdown.get("brokerage", 0.0),
            "stt_tax": f_breakdown.get("stt", 0.0),
            "exchange_fee": f_breakdown.get("exchange_fee", 0.0),
            "gst": f_breakdown.get("gst", 0.0),
            "sebi_fee": f_breakdown.get("sebi_fee", 0.0),
            "stamp_duty": f_breakdown.get("stamp_duty", 0.0),
            "total_charges": f_breakdown.get("total_charges", 0.0),
            "executed_at": fill.timestamp,
        }

        with self._lock:
            self._trades.append(trade_data)

        # Async DB persist
        def _db_task():
            db = SessionLocal()
            try:
                db_trade = DBTrade(
                    order_id=None,  # Or mapped DB order id
                    user_id=order.user_id,
                    symbol=order.symbol,
                    exchange=order.exchange,
                    transaction_type=DBTxType[order.transaction_type.value],
                    quantity=fill.quantity,
                    execution_price=fill.price,
                    brokerage=trade_data["brokerage"],
                    stt_tax=trade_data["stt_tax"],
                    exchange_turnover_fee=trade_data["exchange_fee"],
                    gst=trade_data["gst"],
                    sebi_turnover_fee=trade_data["sebi_fee"],
                    stamp_duty=trade_data["stamp_duty"],
                    total_charges=trade_data["total_charges"],
                    net_pnl=0.0,
                )
                db.add(db_trade)
                db.commit()
            except Exception as e:
                db.rollback()
                logger.debug("Failed saving DBTrade: %s", e)
            finally:
                db.close()

        threading.Thread(target=_db_task, daemon=True, name="oms_trade_db_writer").start()

    def _sync_order_to_db(self, order: ManagedOrder) -> None:
        """Asynchronously upserts order record into the database."""
        def _db_task():
            db = SessionLocal()
            try:
                rec = db.query(DBOrder).filter(DBOrder.broker_order_id == order.order_id).first()
                status_mapped = DBOrderStatus.COMPLETE if order.state == OrderState.FILLED else (
                    DBOrderStatus.REJECTED if order.state == OrderState.REJECTED else (
                        DBOrderStatus.CANCELLED if order.state == OrderState.CANCELLED else DBOrderStatus.OPEN
                    )
                )

                if not rec:
                    rec = DBOrder(
                        user_id=order.user_id,
                        broker_order_id=order.order_id,
                        symbol=order.symbol,
                        exchange=order.exchange,
                        transaction_type=DBTxType[order.transaction_type.value],
                        product_type=order.product_type.value,
                        order_type=order.order_type.value,
                        quantity=order.quantity,
                        filled_quantity=order.filled_quantity,
                        price=order.price,
                        trigger_price=order.trigger_price,
                        average_price=order.average_price,
                        status=status_mapped,
                        rejection_reason=order.rejection_reason,
                        is_paper=(order.execution_mode == ExecutionMode.PAPER),
                    )
                    db.add(rec)
                else:
                    rec.filled_quantity = order.filled_quantity
                    rec.average_price = order.average_price
                    rec.status = status_mapped
                    rec.rejection_reason = order.rejection_reason

                db.commit()
            except Exception as e:
                db.rollback()
                logger.debug("Failed saving DBOrder: %s", e)
            finally:
                db.close()

        threading.Thread(target=_db_task, daemon=True, name="oms_order_db_writer").start()

    def _sync_portfolio_risk_manager(self) -> None:
        """Syncs paper positions and equity into Phase 8 portfolio_risk_manager."""
        summary = self.paper_engine.get_portfolio_summary()
        portfolio_risk_manager.set_risk_limits(
            portfolio_equity=summary["net_equity"],
        )
        # Update each position in portfolio_risk_manager
        for pos in self.paper_engine.positions.values():
            portfolio_risk_manager.update_position(
                symbol=pos.symbol,
                quantity=pos.quantity,
                entry_price=pos.average_entry_price,
                current_price=pos.current_price,
            )

    async def register_websocket(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connected_websockets.add(websocket)

    def unregister_websocket(self, websocket: WebSocket) -> None:
        self._connected_websockets.discard(websocket)

    def _broadcast_order_event(self, order: ManagedOrder) -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self._broadcast_async(order.to_dict()))
        except RuntimeError:
            pass

    async def _broadcast_async(self, data: Dict[str, Any]) -> None:
        import orjson
        msg = orjson.dumps({
            "type": "ORDER_UPDATE",
            "data": data,
            "timestamp": time.time(),
        }).decode("utf-8")

        dead = []
        for ws in self._connected_websockets:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connected_websockets.discard(ws)


# Central OMS Singleton
order_management_service = OrderManagementService()
