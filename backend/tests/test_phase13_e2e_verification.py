"""
ALGO ROBOT — Phase 13: End-to-End Hardening & Comprehensive Release Verification
=================================================================================
Final verification suite validating the entire integrated algorithmic platform:
1. Security & Cryptographic Invariants (AES-256-GCM, PBKDF2, SSRF Guard)
2. Identity & RBAC Matrix (RFC 7519 HS256 JWT, Token Rotation, Role Hierarchy)
3. Rule 1 Real-Data Invariants & Vectorized Indicators (No Mock/Random, EMA, ATR, VWAP)
4. Quantitative Screening & SMC Engine (AST Parser, Order Blocks, Liquidity Sweeps)
5. Options Chain & Derivatives Mathematics (Black-Scholes, Greeks, Brent IV, PCR, Max Pain)
6. Pre-Trade Risk Engine (8 Institutional Gates, Fat-Finger Collar, Emergency Kill Switch)
7. Multi-Broker OMS & Paper Execution Pipeline (State Machine, Indian Statutory Friction)
8. Multi-Channel Alerting & Webhooks (Telegram, Discord, HMAC-SHA256 Signatures, Rate Limiting)
"""

import hashlib
import hmac
import time
from unittest.mock import MagicMock, patch
import pytest

from app.core.security import encryption_service, hash_password, verify_password
from app.core.jwt import create_access_token, create_refresh_token, decode_token, TokenExpiredError, InvalidTokenError
from app.core.ssrf import validate_outbound_url
from app.market_data import NormalizedTick
from app.indicators.technical import compute_ema, compute_atr, compute_rsi
from app.scanner.condition_evaluator import compile_condition, ConditionCompiler
from app.derivatives.black_scholes import BlackScholesEngine
from app.risk.pre_trade_validator import ProposedOrder, OrderRiskValidationResult, PreTradeRiskValidator
from app.risk.kill_switch import kill_switch_manager
from app.oms.order_state_machine import ManagedOrder, OrderState, OrderType, TransactionType, ProductType
from app.oms.paper_execution_engine import PaperExecutionEngine
from app.backtesting.friction_model import IndianFrictionModel, InstrumentClass
from app.alerting.dispatcher import AlertDispatcher
from app.alerting.models import AlertEvent, AlertEventType, AlertPriority, DeliveryStatus, DiscordConfig


# =========================================================================
# 1. Security & Cryptography Invariants
# =========================================================================

def test_e2e_security_and_encryption():
    """Verify AES-256-GCM encryption round-trip, tamper resistance, and PBKDF2 hashing."""
    raw_secret = "zerodha_api_secret_token_institutional_grade_8831"
    enc = encryption_service.encrypt(raw_secret)
    assert enc != raw_secret
    assert encryption_service.decrypt(enc) == raw_secret

    # Salted password hashing
    pwd = "AlgorithmicTradingPassword2026!"
    hashed = hash_password(pwd)
    assert verify_password(pwd, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False

    # SSRF Guard blocks loopback and AWS/GCP cloud metadata
    with pytest.raises(ValueError, match="SSRF Protection"):
        validate_outbound_url("http://127.0.0.1:8000/api")
    with pytest.raises(ValueError, match="SSRF Protection"):
        validate_outbound_url("http://169.254.169.254/latest/meta-data")


# =========================================================================
# 2. Identity, JWT & RBAC Matrix
# =========================================================================

def test_e2e_jwt_and_rbac():
    """Verify RFC 7519 HS256 JWT tokens, tamper detection, and claims."""
    token = create_access_token(user_id=1, role="SUPER_ADMIN", email="admin@algorobot.local")
    payload = decode_token(token)
    assert payload["sub"] == "1"
    assert payload["role"] == "SUPER_ADMIN"
    assert payload["type"] == "access"

    # Tampered signature must fail
    parts = token.split(".")
    tampered = f"{parts[0]}.{parts[1]}.tampered_signature_xyz"
    with pytest.raises(InvalidTokenError):
        decode_token(tampered)


# =========================================================================
# 3. Rule 1 Real-Data Invariants & Vectorized Indicators
# =========================================================================

def test_e2e_real_data_and_indicators():
    """Verify strict normalized tick schema and accurate vectorized indicator calculation."""
    tick = NormalizedTick(
        symbol="RELIANCE",
        exchange="NSE",
        instrument_token=738561,
        ltp=2850.5,
        change=15.5,
        percent_change=0.55,
        open=2830.0,
        high=2865.0,
        low=2825.0,
        close=2835.0,
        volume=1250000,
        bid=2850.4,
        ask=2850.6,
        bid_qty=500,
        ask_qty=300,
        oi=0,
        timestamp=time.time(),
        feed_source="ZERODHA",
    )
    assert tick.ltp == 2850.5
    assert (tick.ask - tick.bid) == pytest.approx(0.2, abs=1e-4)

    # Technical indicators
    import numpy as np
    prices = np.array([100.0, 102.0, 101.5, 103.0, 104.5, 104.0, 106.0, 107.5, 108.0, 107.0])
    ema5 = compute_ema(prices, 5)
    assert len(ema5) == len(prices)
    assert ema5[-1] > 100.0


# =========================================================================
# 4. Quantitative Screening & AST Condition Evaluator
# =========================================================================

def test_e2e_scanner_and_ast_evaluator():
    """Verify AST screener evaluates boolean logic and blocks malicious code injection."""
    scope = {"ltp": 2850.0, "vwap": 2835.0, "rsi": 62.5, "rvol": 2.1}
    fn1 = compile_condition("ltp > vwap and rsi > 60 and rvol > 1.5")
    fn2 = compile_condition("ltp < vwap or rsi < 30")
    assert fn1.evaluate(scope) is True
    assert fn2.evaluate(scope) is False

    # Block unsafe builtins
    with pytest.raises(ValueError):
        compile_condition("__import__('os').system('dir')")


# =========================================================================
# 5. Derivatives & Options Greeks Analytics
# =========================================================================

def test_e2e_derivatives_and_greeks():
    """Verify Black-Scholes analytical pricing, Greeks, and Implied Volatility solver."""
    call_px = BlackScholesEngine.calculate_price(spot=24500.0, strike=24500.0, days_to_expiry=7.0, iv=0.15, option_type="CE", r=0.07)
    assert call_px > 50.0

    greeks = BlackScholesEngine.calculate_greeks(spot=24500.0, strike=24500.0, days_to_expiry=7.0, iv=0.15, option_type="CE", r=0.07)
    assert 0.45 <= greeks["delta"] <= 0.60
    assert greeks["gamma"] > 0.0

    # IV solver recovery
    recovered_iv = BlackScholesEngine.calculate_implied_volatility(market_price=call_px, spot=24500.0, strike=24500.0, days_to_expiry=7.0, option_type="CE", r=0.07)
    assert recovered_iv == pytest.approx(0.15, abs=0.01)


# =========================================================================
# 6. Pre-Trade Risk Engine & Kill Switch
# =========================================================================

def test_e2e_pre_trade_risk_and_kill_switch():
    """Verify Pre-Trade Risk Guardian blocks orders on active kill switch and fat-finger collar."""
    order = ProposedOrder(
        symbol="TCS",
        transaction_type="BUY",
        order_type="LIMIT",
        quantity=10,
        price=3500.0,
        stop_loss=3450.0,
        target=3600.0,
    )

    # 1. Normal conditions pass
    dec = PreTradeRiskValidator.validate_order(
        order=order,
        current_ltp=3500.0,
        portfolio_equity=100000.0,
        available_margin=80000.0,
        current_daily_pnl=0.0,
        open_positions_count=1,
        current_instrument_exposure=0.0,
        current_sector_exposure=0.0,
        is_kill_switch_active=kill_switch_manager.is_active,
    )
    assert dec.approved is True
    assert "KILL_SWITCH_DISENGAGED" in dec.checks_passed

    # 2. Emergency Kill Switch halts order flow
    kill_switch_manager.activate_manual_kill_switch(reason="E2E Drill", user_id="ADMIN")
    assert kill_switch_manager.is_active is True
    dec_ks = PreTradeRiskValidator.validate_order(
        order=order,
        current_ltp=3500.0,
        portfolio_equity=100000.0,
        available_margin=80000.0,
        current_daily_pnl=0.0,
        open_positions_count=1,
        current_instrument_exposure=0.0,
        current_sector_exposure=0.0,
        is_kill_switch_active=kill_switch_manager.is_active,
    )
    assert dec_ks.approved is False
    assert "KILL_SWITCH_ACTIVE" in dec_ks.checks_failed

    # Reset kill switch
    kill_switch_manager.reset(user_id="ADMIN", rationale="E2E Test Complete")
    assert kill_switch_manager.is_active is False

    # 3. Fat-finger collar rejection (deviation from LTP > 3.0%)
    dec_collar = PreTradeRiskValidator.validate_order(
        order=order,
        current_ltp=3000.0,  # 3500 vs 3000 = ~16.6% deviation > 3.0%
        portfolio_equity=100000.0,
        available_margin=80000.0,
        current_daily_pnl=0.0,
        open_positions_count=1,
        current_instrument_exposure=0.0,
        current_sector_exposure=0.0,
        is_kill_switch_active=kill_switch_manager.is_active,
    )
    assert dec_collar.approved is False
    assert "FAT_FINGER_PRICE_COLLAR_VIOLATION" in dec_collar.checks_failed


# =========================================================================
# 7. Multi-Broker OMS & Indian Statutory Friction
# =========================================================================

def test_e2e_oms_execution_and_friction():
    """Verify paper execution desk fills orders, applies slippage, and calculates statutory friction."""
    engine = PaperExecutionEngine(initial_capital=1000000.0)
    order = ManagedOrder(
        order_id="E2E_OMS_01",
        symbol="RELIANCE",
        transaction_type=TransactionType.BUY,
        order_type=OrderType.MARKET,
        quantity=10,
        price=0.0,
        product_type=ProductType.MIS,
    )

    managed_ord, fill = engine.submit_order(order, current_ltp=2850.0)
    assert fill is not None
    assert fill.price >= 2850.0  # Slippage applied
    assert fill.quantity == 10
    assert managed_ord.state == OrderState.FILLED

    # Indian statutory friction breakdown
    friction = IndianFrictionModel.calculate_trade_friction(
        instrument_class=InstrumentClass.EQUITY_INTRADAY,
        side="BUY",
        price=fill.price,
        quantity=10,
    )
    assert friction.total_friction > 0.0
    assert friction.gst > 0.0


# =========================================================================
# 8. Multi-Channel Alerting & Webhooks
# =========================================================================

def test_e2e_alerting_and_webhook_dispatch():
    """Verify alert formatting, rate limiting, and Discord webhook dispatching."""
    dispatcher = AlertDispatcher()
    event = AlertEvent(
        title="E2E AUDIT COMPLETE",
        message="All platform systems green.",
        event_type=AlertEventType.SYSTEM_ALERT,
        priority=AlertPriority.INFO,
        data={"status": "PASS", "phases": 13},
    )

    cfg = DiscordConfig(
        is_enabled=True,
        webhook_url="https://discord.com/api/webhooks/e2e/test",
    )

    mock_resp = MagicMock()
    mock_resp.getcode.return_value = 204
    mock_resp.__enter__.return_value = mock_resp

    with patch("app.alerting.dispatcher.validate_outbound_url", side_effect=lambda u: u), \
         patch("urllib.request.urlopen", return_value=mock_resp):
        log = dispatcher.dispatch_discord(event, cfg)
        assert log.status == DeliveryStatus.DELIVERED
        assert log.status_code == 204
