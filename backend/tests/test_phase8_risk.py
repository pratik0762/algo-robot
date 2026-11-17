"""
Phase 8: Pre-Trade Risk Engine & Portfolio Controls - Comprehensive Verification Suite
Tests:
1. PreTradeRiskValidator normal order approval with checks passed
2. Rejection on active kill switch
3. Rejection on tripped circuit breaker
4. Rejection on max daily loss breach
5. Rejection on max capital at risk per trade
6. Rejection on exchange freeze quantity limits
7. Rejection on fat-finger price collar violation (>3% deviation from LTP)
8. Rejection on maximum open positions reached
9. Rejection on insufficient available margin
10. KillSwitchManager state transitions and event listeners
11. PortfolioRiskManager MTM calculation, sector exposures, and auto circuit-breaker trip
12. RiskService pre-trade order validation flow
"""

import pytest
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
)
from app.risk.portfolio_risk_manager import (
    PortfolioRiskManager,
)
from app.risk.service import RiskService


def test_validator_approved_under_normal_conditions():
    """Verify that a compliant order is approved and passes all pre-trade safety gates."""
    order = ProposedOrder(
        symbol="RELIANCE",
        transaction_type="BUY",
        order_type="LIMIT",
        quantity=50,
        price=2500.0,
        stop_loss=2480.0,
        target=2550.0,
        instrument_type="EQUITY",
        sector="ENERGY",
        required_margin=25000.0,
    )

    result = PreTradeRiskValidator.validate_order(
        order=order,
        current_ltp=2500.0,
        portfolio_equity=500000.0,
        available_margin=100000.0,
        current_daily_pnl=500.0,
        open_positions_count=2,
        current_instrument_exposure=5.0,
        current_sector_exposure=10.0,
        max_daily_loss=15000.0,
        max_capital_per_trade=5000.0,  # Risk is (2500-2480)*50 = 1000 <= 5000
        max_open_positions=5,
        max_order_quantity_limit=1800,
        price_collar_pct=3.0,
        is_kill_switch_active=False,
        circuit_breaker_triggered=False,
    )

    assert result.approved is True
    assert result.rejection_reason is None
    assert "KILL_SWITCH_DISENGAGED" in result.checks_passed
    assert "DAILY_LOSS_WITHIN_LIMIT" in result.checks_passed
    assert "TRADE_RISK_WITHIN_CAP" in result.checks_passed
    assert "QUANTITY_WITHIN_FREEZE_LIMITS" in result.checks_passed
    assert "PRICE_WITHIN_COLLAR_BANDS" in result.checks_passed
    assert "PORTFOLIO_CAPACITY_AVAILABLE" in result.checks_passed
    assert "MARGIN_SUFFICIENT" in result.checks_passed
    assert len(result.checks_failed) == 0


def test_validator_rejected_on_kill_switch_active():
    """Verify orders are immediately blocked when the emergency kill-switch is engaged."""
    order = ProposedOrder(
        symbol="TCS",
        transaction_type="BUY",
        order_type="LIMIT",
        quantity=10,
        price=3500.0,
    )
    result = PreTradeRiskValidator.validate_order(
        order=order,
        current_ltp=3500.0,
        portfolio_equity=500000.0,
        available_margin=100000.0,
        current_daily_pnl=0.0,
        open_positions_count=0,
        current_instrument_exposure=0.0,
        current_sector_exposure=0.0,
        is_kill_switch_active=True,
    )
    assert result.approved is False
    assert "KILL_SWITCH_ACTIVE" in result.checks_failed
    assert "Master Kill Switch is currently active" in result.rejection_reason


def test_validator_rejected_on_circuit_breaker_tripped():
    """Verify orders are rejected if circuit breaker has tripped."""
    order = ProposedOrder(
        symbol="INFY",
        transaction_type="BUY",
        order_type="LIMIT",
        quantity=10,
        price=1500.0,
    )
    result = PreTradeRiskValidator.validate_order(
        order=order,
        current_ltp=1500.0,
        portfolio_equity=500000.0,
        available_margin=100000.0,
        current_daily_pnl=-16000.0,
        open_positions_count=0,
        current_instrument_exposure=0.0,
        current_sector_exposure=0.0,
        circuit_breaker_triggered=True,
    )
    assert result.approved is False
    assert "CIRCUIT_BREAKER_TRIGGERED" in result.checks_failed
    assert "Circuit Breaker triggered" in result.rejection_reason


def test_validator_rejected_on_max_daily_loss_breach():
    """Verify orders are rejected when cumulative daily loss reaches or exceeds limit."""
    order = ProposedOrder(
        symbol="HDFCBANK",
        transaction_type="BUY",
        order_type="LIMIT",
        quantity=20,
        price=1600.0,
    )
    result = PreTradeRiskValidator.validate_order(
        order=order,
        current_ltp=1600.0,
        portfolio_equity=500000.0,
        available_margin=100000.0,
        current_daily_pnl=-15500.0,
        open_positions_count=1,
        current_instrument_exposure=0.0,
        current_sector_exposure=0.0,
        max_daily_loss=15000.0,
    )
    assert result.approved is False
    assert "MAX_DAILY_LOSS_BREACHED" in result.checks_failed
    assert "Daily loss limit" in result.rejection_reason


def test_validator_rejected_on_capital_at_risk_exceeded():
    """Verify orders are rejected when stop loss distance * quantity exceeds max per-trade risk."""
    order = ProposedOrder(
        symbol="NIFTY",
        transaction_type="BUY",
        order_type="LIMIT",
        quantity=100,
        price=24000.0,
        stop_loss=23800.0,  # 200 pts risk * 100 qty = ₹20,000 risk
    )
    result = PreTradeRiskValidator.validate_order(
        order=order,
        current_ltp=24000.0,
        portfolio_equity=500000.0,
        available_margin=300000.0,
        current_daily_pnl=0.0,
        open_positions_count=1,
        current_instrument_exposure=0.0,
        current_sector_exposure=0.0,
        max_capital_per_trade=10000.0,  # Limit is 10k, order risk is 20k
    )
    assert result.approved is False
    assert "MAX_CAPITAL_AT_RISK_EXCEEDED" in result.checks_failed
    assert "Proposed capital at risk" in result.rejection_reason


def test_validator_rejected_on_exchange_freeze_limit():
    """Verify orders exceeding exchange freeze quantities are rejected."""
    order = ProposedOrder(
        symbol="NIFTY",
        transaction_type="BUY",
        order_type="LIMIT",
        quantity=2500,  # NIFTY freeze is 1800
        price=24000.0,
        stop_loss=23990.0,
    )
    result = PreTradeRiskValidator.validate_order(
        order=order,
        current_ltp=24000.0,
        portfolio_equity=10000000.0,
        available_margin=50000000.0,
        current_daily_pnl=0.0,
        open_positions_count=0,
        current_instrument_exposure=0.0,
        current_sector_exposure=0.0,
        max_capital_per_trade=5000000.0,
        max_order_quantity_limit=5000,
    )
    assert result.approved is False
    assert "ORDER_QUANTITY_FREEZE_LIMIT_EXCEEDED" in result.checks_failed
    assert "exceeds allowed limit of 1800 for NIFTY" in result.rejection_reason


def test_validator_rejected_on_fat_finger_collar_violation():
    """Verify orders deviating beyond the allowed price collar from LTP are rejected."""
    order = ProposedOrder(
        symbol="SBIN",
        transaction_type="BUY",
        order_type="LIMIT",
        quantity=100,
        price=880.0,  # LTP is 800.0, deviation is 10% (collar is 3%)
    )
    result = PreTradeRiskValidator.validate_order(
        order=order,
        current_ltp=800.0,
        portfolio_equity=500000.0,
        available_margin=200000.0,
        current_daily_pnl=0.0,
        open_positions_count=1,
        current_instrument_exposure=0.0,
        current_sector_exposure=0.0,
        price_collar_pct=3.0,
    )
    assert result.approved is False
    assert "FAT_FINGER_PRICE_COLLAR_VIOLATION" in result.checks_failed
    assert "deviates 10.0% from LTP" in result.rejection_reason


def test_validator_rejected_on_max_open_positions():
    """Verify orders are rejected if max open positions limit has been reached."""
    order = ProposedOrder(
        symbol="WIPRO",
        transaction_type="BUY",
        order_type="LIMIT",
        quantity=50,
        price=500.0,
    )
    result = PreTradeRiskValidator.validate_order(
        order=order,
        current_ltp=500.0,
        portfolio_equity=500000.0,
        available_margin=200000.0,
        current_daily_pnl=0.0,
        open_positions_count=5,
        current_instrument_exposure=0.0,
        current_sector_exposure=0.0,
        max_open_positions=5,
    )
    assert result.approved is False
    assert "MAX_OPEN_POSITIONS_REACHED" in result.checks_failed
    assert "Portfolio already holds 5 open positions" in result.rejection_reason


def test_validator_rejected_on_insufficient_margin():
    """Verify orders requiring more margin than available are rejected."""
    order = ProposedOrder(
        symbol="BAJFINANCE",
        transaction_type="BUY",
        order_type="LIMIT",
        quantity=50,
        price=7000.0,  # Turnover = 350,000
        required_margin=350000.0,
    )
    result = PreTradeRiskValidator.validate_order(
        order=order,
        current_ltp=7000.0,
        portfolio_equity=500000.0,
        available_margin=100000.0,  # Only 100k available
        current_daily_pnl=0.0,
        open_positions_count=1,
        current_instrument_exposure=0.0,
        current_sector_exposure=0.0,
    )
    assert result.approved is False
    assert "INSUFFICIENT_MARGIN" in result.checks_failed
    assert "exceeds available buying power" in result.rejection_reason


def test_kill_switch_state_machine_and_listeners():
    """Verify KillSwitchManager transitions, listener triggers, and reset actions."""
    manager = KillSwitchManager()
    events_received = []

    def listener(ev: KillSwitchEvent):
        events_received.append(ev)

    manager.register_listener(listener)

    assert manager.state == KillSwitchState.ARMED_NORMAL
    assert manager.is_active is False

    # Manual activation
    ev_act = manager.activate_manual_kill_switch(reason="Test Panic Button", user_id="TRADER_1")
    assert manager.state == KillSwitchState.MANUAL_KILL_SWITCH_ACTIVE
    assert manager.is_active is True
    assert ev_act.event_type == "ACTIVATED"

    # Reset
    ev_reset = manager.reset(user_id="ADMIN", rationale="All clear")
    assert manager.state == KillSwitchState.ARMED_NORMAL
    assert manager.is_active is False
    assert ev_reset.event_type == "RESET"

    # Trip Circuit Breaker
    ev_trip = manager.trip_circuit_breaker(reason="Max Drawdown Hit", metric_value=20000.0, threshold=15000.0)
    assert manager.state == KillSwitchState.CIRCUIT_BREAKER_TRIGGERED
    assert manager.is_active is True
    assert ev_trip.event_type == "TRIPPED"

    assert len(events_received) == 3


def test_portfolio_risk_manager_exposures_and_auto_trip():
    """Verify PortfolioRiskManager MTM calculation, sector exposures, and auto circuit-breaker trip."""
    prm = PortfolioRiskManager()
    prm.set_risk_limits(
        portfolio_equity=1000000.0,
        max_daily_loss=20000.0,
        max_single_stock_pct=25.0,
        max_sector_pct=40.0,
    )

    # Add a winning position in Banking
    prm.update_position(
        symbol="HDFCBANK",
        quantity=100,
        entry_price=1600.0,
        current_price=1650.0,  # +5,000 profit
        sector="BANKING",
    )

    status = prm.get_portfolio_risk_status()
    assert status["open_positions_count"] == 1
    assert status["unrealized_mtm_pnl"] == 5000.0
    assert status["total_daily_pnl"] == 5000.0
    assert "BANKING" in status["sector_exposures_pct"]

    # Record a realized loss that breaches max daily loss: -30,000
    prm.record_realized_trade(-30000.0)

    # Total PnL = -30,000 + 5,000 = -25,000 (breaches -20,000 limit)
    # The circuit breaker should automatically trip
    from app.risk.kill_switch import kill_switch_manager
    assert kill_switch_manager.state == KillSwitchState.CIRCUIT_BREAKER_TRIGGERED

    # Reset kill switch for clean teardown
    kill_switch_manager.reset(user_id="SYSTEM_TEST")


def test_risk_service_integration():
    """Verify RiskService coordinates validation, settings, and updates."""
    service = RiskService()

    # Reset kill switch if tripped from prior test
    service.kill_switch.reset(user_id="SYSTEM_TEST")

    settings = service.get_risk_settings()
    assert "max_daily_loss" in settings
    assert "is_kill_switch_active" in settings
    assert settings["is_kill_switch_active"] is False

    # Validate an order through the service
    order = ProposedOrder(
        symbol="INFY",
        transaction_type="BUY",
        order_type="LIMIT",
        quantity=20,
        price=1500.0,
        stop_loss=1470.0,
        target=1550.0,
        sector="IT",
        required_margin=10000.0,
    )
    result = service.validate_proposed_order(order=order, current_ltp=1500.0)
    assert result.approved is True
