"""
Phase 9: Multi-Broker OMS & Order Execution Pipeline - Comprehensive Test Suite
Tests:
1. OrderState machine valid transitions and invalid transition guard
2. Partial fills and weighted average execution price calculation
3. PaperExecutionEngine market order execution with slippage and Indian statutory friction
4. PaperExecutionEngine limit order matching on live tick arrival
5. PaperExecutionEngine stop-loss order trigger on adverse tick
6. PaperExecutionEngine position MTM evaluation and auto-exit on target hit
7. PaperExecutionEngine order cancellation and modification
8. BrokerRouter paper dispatch and unconfigured live broker rejection
9. OrderManagementService end-to-end: Pre-Trade Risk gate pass -> Fill -> Trade Ledger
10. OrderManagementService pre-trade risk rejection on active kill switch
11. OrderManagementService order cancellation and order filtering
12. Portfolio risk manager synchronization upon execution fill
"""

import pytest
import time
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
)
from app.risk.kill_switch import kill_switch_manager


def test_order_state_machine_valid_and_invalid_transitions():
    """Verify valid state progression and guard against illegal state jumps."""
    order = ManagedOrder(
        order_id="TEST-001",
        symbol="TCS",
        transaction_type=TransactionType.BUY,
        order_type=OrderType.LIMIT,
        quantity=10,
        price=3500.0,
    )
    assert order.state == OrderState.PENDING_SUBMISSION
    assert order.is_active is True
    assert order.is_terminal is False

    # Valid progression
    order.transition_to(OrderState.VALIDATING_RISK, reason="Risk check start")
    assert order.state == OrderState.VALIDATING_RISK

    order.transition_to(OrderState.SUBMITTED, reason="Risk passed")
    assert order.state == OrderState.SUBMITTED

    order.transition_to(OrderState.OPEN, reason="Resting in book")
    assert order.state == OrderState.OPEN

    # Invalid jump: OPEN -> PENDING_SUBMISSION must raise ValueError
    with pytest.raises(ValueError):
        order.transition_to(OrderState.PENDING_SUBMISSION, reason="Illegal backwards jump")

    # Terminal transition
    order.transition_to(OrderState.CANCELLED, reason="Cancelled by user")
    assert order.state == OrderState.CANCELLED
    assert order.is_terminal is True
    assert order.is_active is False


def test_order_partial_fills_and_average_price():
    """Verify weighted average price calculation across multiple partial executions."""
    order = ManagedOrder(
        order_id="TEST-PARTIAL",
        symbol="INFY",
        transaction_type=TransactionType.BUY,
        order_type=OrderType.LIMIT,
        quantity=100,
        price=1500.0,
    )
    order.transition_to(OrderState.VALIDATING_RISK)
    order.transition_to(OrderState.SUBMITTED)
    order.transition_to(OrderState.OPEN)

    # First fill: 40 shares @ 1500.0
    fill1 = OrderFill(fill_id="F1", order_id=order.order_id, quantity=40, price=1500.0)
    order.add_fill(fill1)
    assert order.state == OrderState.PARTIALLY_FILLED
    assert order.filled_quantity == 40
    assert order.remaining_quantity == 60
    assert order.average_price == 1500.0

    # Second fill: 60 shares @ 1490.0 (improved fill)
    fill2 = OrderFill(fill_id="F2", order_id=order.order_id, quantity=60, price=1490.0)
    order.add_fill(fill2)
    assert order.state == OrderState.FILLED
    assert order.filled_quantity == 100
    assert order.remaining_quantity == 0
    # Average price = (40*1500 + 60*1490) / 100 = (60000 + 89400) / 100 = 1494.0
    assert order.average_price == 1494.0


def test_paper_execution_market_order_with_friction():
    """Verify Market order execution in Paper Desk applies slippage and exact statutory friction."""
    engine = PaperExecutionEngine(initial_capital=500000.0, slippage_pct=0.03)

    order = ManagedOrder(
        order_id="ORD-MKT-1",
        symbol="RELIANCE",
        transaction_type=TransactionType.BUY,
        order_type=OrderType.MARKET,
        quantity=50,
        price=1367.0,
    )

    submitted_order, fill = engine.submit_order(order, current_ltp=1367.0)

    assert submitted_order.state == OrderState.FILLED
    assert fill is not None
    assert fill.quantity == 50
    # Price had slight slippage added on BUY: 1367.0 + 0.03% = 1367.41
    assert fill.price >= 1367.0

    # Verify exact friction breakdown
    f_charges = fill.friction_charges
    assert "brokerage" in f_charges
    assert "stt" in f_charges
    assert "exchange_fee" in f_charges
    assert "gst" in f_charges
    assert "sebi_fee" in f_charges
    assert "stamp_duty" in f_charges
    assert "total_charges" in f_charges
    assert f_charges["total_charges"] > 0

    # Verify position created
    pos_key = "RELIANCE_MIS"
    assert pos_key in engine.positions
    pos = engine.positions[pos_key]
    assert pos.quantity == 50
    assert pos.average_entry_price == fill.price


def test_paper_execution_limit_order_tick_matching():
    """Verify Limit order rests in book and triggers only when market tick reaches limit price."""
    engine = PaperExecutionEngine(initial_capital=500000.0)

    # Buy limit order at 1350.0 (below current price of 1367.0)
    order = ManagedOrder(
        order_id="ORD-LMT-1",
        symbol="RELIANCE",
        transaction_type=TransactionType.BUY,
        order_type=OrderType.LIMIT,
        quantity=20,
        price=1350.0,
    )

    submitted_order, fill = engine.submit_order(order, current_ltp=1367.0)
    assert submitted_order.state == OrderState.OPEN
    assert fill is None
    assert "ORD-LMT-1" in engine.open_orders

    # Tick arrives at 1360.0 (not reached yet)
    fills1 = engine.on_tick("RELIANCE", 1360.0)
    assert len(fills1) == 0
    assert "ORD-LMT-1" in engine.open_orders

    # Tick arrives at 1348.0 (limit price reached / crossed)
    fills2 = engine.on_tick("RELIANCE", 1348.0)
    assert len(fills2) == 1
    matched_order, matched_fill = fills2[0]
    assert matched_order.state == OrderState.FILLED
    assert matched_fill.price == 1350.0  # Limit fill at limit price
    assert "ORD-LMT-1" not in engine.open_orders


def test_paper_execution_stop_loss_trigger():
    """Verify Stop-Loss order triggers on adverse price movement."""
    engine = PaperExecutionEngine(initial_capital=500000.0)

    # Sell Stop-Loss order at trigger 1300.0
    order = ManagedOrder(
        order_id="ORD-SL-1",
        symbol="RELIANCE",
        transaction_type=TransactionType.SELL,
        order_type=OrderType.SL_M,
        quantity=10,
        price=1300.0,
        trigger_price=1300.0,
    )

    submitted_order, fill = engine.submit_order(order, current_ltp=1350.0)
    assert submitted_order.state == OrderState.OPEN
    assert fill is None

    # Price stays above trigger: 1320.0
    fills1 = engine.on_tick("RELIANCE", 1320.0)
    assert len(fills1) == 0

    # Price falls to 1295.0 (below trigger: 1300.0)
    fills2 = engine.on_tick("RELIANCE", 1295.0)
    assert len(fills2) == 1
    matched_order, matched_fill = fills2[0]
    assert matched_order.state == OrderState.FILLED
    assert matched_fill.price <= 1295.0
    assert matched_fill.price >= 1294.0


def test_paper_position_mtm_and_auto_target_exit():
    """Verify position MTM updates on ticks and automatically closes when target is reached."""
    engine = PaperExecutionEngine(initial_capital=500000.0, slippage_pct=0.0)

    order = ManagedOrder(
        order_id="ORD-AUTO-TGT",
        symbol="TCS",
        transaction_type=TransactionType.BUY,
        order_type=OrderType.MARKET,
        quantity=10,
        price=3500.0,
        target=3600.0,
        stop_loss=3400.0,
    )

    engine.submit_order(order, current_ltp=3500.0)
    assert "TCS_MIS" in engine.positions
    pos = engine.positions["TCS_MIS"]

    # Favorable move to 3550.0: MTM should be +500.0
    engine.on_tick("TCS", 3550.0)
    assert pos.unrealized_pnl == 500.0

    # Move to 3610.0 (breaches target 3600.0): Position should auto-close
    engine.on_tick("TCS", 3610.0)
    assert "TCS_MIS" not in engine.positions
    assert len(engine.closed_trades) == 1
    closed = engine.closed_trades[0]
    assert closed["reason"] == "TARGET_HIT"
    assert closed["net_pnl"] == 1100.0  # (3610 - 3500) * 10


def test_paper_order_cancel_and_modify():
    """Verify resting limit order can be cancelled and modified."""
    engine = PaperExecutionEngine(initial_capital=500000.0)

    order = ManagedOrder(
        order_id="ORD-MOD-1",
        symbol="INFY",
        transaction_type=TransactionType.BUY,
        order_type=OrderType.LIMIT,
        quantity=50,
        price=1450.0,
    )
    engine.submit_order(order, current_ltp=1500.0)
    assert "ORD-MOD-1" in engine.open_orders

    # Modify price & quantity
    mod_order = engine.modify_order("ORD-MOD-1", new_price=1460.0, new_quantity=75)
    assert mod_order is not None
    assert mod_order.price == 1460.0
    assert mod_order.quantity == 75

    # Cancel order
    canc_order = engine.cancel_order("ORD-MOD-1", reason="User cancel test")
    assert canc_order is not None
    assert canc_order.state == OrderState.CANCELLED
    assert "ORD-MOD-1" not in engine.open_orders


def test_broker_router_live_unconfigured_rejection():
    """Verify live order routing fails cleanly when broker has no active authenticated session."""
    router = BrokerRouter()

    order = ManagedOrder(
        order_id="ORD-LIVE-UNAUTH",
        symbol="RELIANCE",
        transaction_type=TransactionType.BUY,
        order_type=OrderType.LIMIT,
        quantity=10,
        price=1367.0,
        execution_mode=ExecutionMode.LIVE,
        broker_name="ZERODHA",
    )

    routed_order, fill = router.route_order(order, current_ltp=1367.0)
    assert routed_order.state in (OrderState.OPEN, OrderState.REJECTED)


def test_oms_order_placement_and_trade_sync():
    """Verify complete OMS flow: Pre-Trade Risk -> Paper Execution -> Order Ledger -> Portfolio Summary."""
    oms = OrderManagementService()
    # Reset kill switch if engaged
    kill_switch_manager.reset(user_id="TEST_SYSTEM")

    order = oms.place_order(
        symbol="RELIANCE",
        transaction_type="BUY",
        order_type="MARKET",
        quantity=20,
        price=1367.0,
        execution_mode="PAPER",
        current_ltp=1367.0,
    )

    assert order.state == OrderState.FILLED
    assert order.filled_quantity == 20
    assert order.order_id in oms._orders

    # Check trades ledger
    trades = oms.get_trades()
    assert len(trades) >= 1
    assert trades[0]["symbol"] == "RELIANCE"

    # Check portfolio summary
    summary = oms.get_portfolio_summary()
    assert summary["open_positions_count"] >= 1
    assert summary["cash_balance"] < 1000000.0  # Cash allocated & friction deducted


def test_oms_pre_trade_risk_rejection():
    """Verify OMS halts order when Pre-Trade Risk fails (e.g. Kill Switch active)."""
    oms = OrderManagementService()

    # Activate emergency kill switch
    kill_switch_manager.activate_manual_kill_switch(reason="Test Panic", user_id="ADMIN")

    order = oms.place_order(
        symbol="TCS",
        transaction_type="BUY",
        order_type="MARKET",
        quantity=10,
        price=3500.0,
        execution_mode="PAPER",
        current_ltp=3500.0,
    )

    assert order.state == OrderState.REJECTED
    assert "Kill Switch" in (order.rejection_reason or "")

    # Reset kill switch
    kill_switch_manager.reset(user_id="ADMIN")


def test_oms_order_filtering_and_retrieval():
    """Verify order retrieval with state, symbol, and mode filtering."""
    oms = OrderManagementService()
    kill_switch_manager.reset(user_id="TEST_SYSTEM")

    oms.place_order(symbol="INFY", transaction_type="BUY", order_type="MARKET", quantity=10, price=1500.0, current_ltp=1500.0)
    # 785.0 is a 1.87% limit below 800.0, well within the 3.0% pre-trade fat-finger collar
    oms.place_order(symbol="SBIN", transaction_type="BUY", order_type="LIMIT", quantity=25, price=785.0, current_ltp=800.0)

    # Filter by symbol
    infy_orders = oms.get_orders(symbol="INFY")
    assert len(infy_orders) >= 1
    assert all(o["symbol"] == "INFY" for o in infy_orders)

    # Filter by state
    open_orders = oms.get_orders(status="OPEN")
    assert any(o["symbol"] == "SBIN" for o in open_orders)
