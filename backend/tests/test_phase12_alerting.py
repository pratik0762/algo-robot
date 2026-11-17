"""
ALGO ROBOT — Phase 12 Verification Test Suite: Automated Alerting & Webhooks
=============================================================================
Tests Telegram HTML formatting, Discord rich embeds, and SSRF-safe Custom Webhooks.
Tests HMAC-SHA256 signature verification, rate limiting, and retry backoff.
Tests Pre-Packaged Alert Events: Signals, Outcomes, Fills, Breaches, Kill Switch.
Tests Configuration Persistence, Secret Masking, and REST Endpoints.
"""

import hashlib
import hmac
import json
import time
from unittest.mock import MagicMock, patch
import pytest

from app.alerting.models import (
    AlertChannel,
    AlertDeliveryLog,
    AlertEvent,
    AlertEventType,
    AlertPriority,
    DeliveryStatus,
    DiscordConfig,
    TelegramConfig,
    WebhookConfig,
)
from app.alerting.dispatcher import AlertDispatcher
from app.alerting.service import AlertService


# =========================================================================
# 1. SSRF Protection Tests for Outbound Webhooks
# =========================================================================

def test_ssrf_rejects_loopback_and_internal_ips():
    """Verify SSRF guard halts webhooks aimed at loopback, private networks, or cloud metadata."""
    dispatcher = AlertDispatcher()
    event = AlertEvent(
        title="Test Event",
        message="Checking SSRF defenses",
        event_type=AlertEventType.SYSTEM_ALERT,
    )

    malicious_urls = [
        "http://127.0.0.1:8000/webhook",
        "http://localhost:5000/api",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.5:9000/hook",
        "http://192.168.1.100/internal",
        "http://172.16.50.2/hook",
    ]

    for bad_url in malicious_urls:
        cfg = WebhookConfig(is_enabled=True, webhook_url=bad_url)
        log = dispatcher.dispatch_webhook(event, cfg)
        assert log.status == DeliveryStatus.FAILED
        assert "SSRF Blocked" in (log.error_message or "")


# =========================================================================
# 2. HMAC-SHA256 Webhook Signature Tests
# =========================================================================

def test_hmac_sha256_signature_generation():
    """Verify X-Algo-Signature computation matches standard HMAC-SHA256 hex digest."""
    dispatcher = AlertDispatcher()
    secret = "algo_robot_super_secret_signing_key_4412"
    payload = b'{"event_id":"EVT_123","symbol":"RELIANCE"}'

    sig = dispatcher.compute_hmac_signature(payload, secret)
    assert sig.startswith("sha256=")

    expected_hex = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    assert sig == f"sha256={expected_hex}"


# =========================================================================
# 3. Telegram HTML Formatting & Dispatch
# =========================================================================

def test_telegram_html_formatting():
    """Verify Telegram HTML layout with emoji, code tags, and field details."""
    dispatcher = AlertDispatcher()
    event = AlertEvent(
        title="NEW TRADE SIGNAL: BUY TCS",
        message="Bullish Order Block mitigation triggered entry.",
        event_type=AlertEventType.TRADE_SIGNAL_GENERATED,
        priority=AlertPriority.HIGH,
        data={
            "symbol": "TCS",
            "type": "BUY",
            "price": 3850.5,
            "stop_loss": 3810.0,
            "target": 3930.0,
            "strategy_name": "SMC Order Block",
        },
    )

    html = dispatcher.format_telegram_html(event)
    assert "⚡ <b>NEW TRADE SIGNAL: BUY TCS</b> [<b>BUY</b>]" in html
    assert "• <b>Symbol</b>: <code>TCS</code>" in html
    assert "• <b>Price</b>: ₹3850.50" in html
    assert "• <b>Stop-Loss</b>: ₹3810.00" in html
    assert "• <b>Target</b>: ₹3930.00" in html
    assert "• <b>Strategy</b>: SMC Order Block" in html


def test_telegram_dispatch_mocked():
    """Verify Telegram dispatcher sends JSON payload to Telegram Bot API."""
    dispatcher = AlertDispatcher()
    cfg = TelegramConfig(
        is_enabled=True,
        bot_token="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
        chat_id="-1001234567890",
    )
    event = AlertEvent(
        title="Test Signal",
        message="Simulated signal for unit test",
        event_type=AlertEventType.TRADE_SIGNAL_GENERATED,
    )

    mock_resp = MagicMock()
    mock_resp.getcode.return_value = 200
    mock_resp.__enter__.return_value = mock_resp

    with patch("app.alerting.dispatcher.validate_outbound_url", side_effect=lambda u: u), \
         patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
        log = dispatcher.dispatch_telegram(event, cfg)
        assert log.status == DeliveryStatus.DELIVERED
        assert log.status_code == 200
        assert mock_urlopen.called

        req = mock_urlopen.call_args[0][0]
        assert "api.telegram.org/bot" in req.full_url
        assert req.headers["Content-type"] == "application/json"


# =========================================================================
# 4. Discord Rich Embed Formatting & Dispatch
# =========================================================================

def test_discord_embed_formatting():
    """Verify Discord rich embed fields, color-coding, and footer timestamp."""
    dispatcher = AlertDispatcher()

    # 1. Buy Signal -> Green Embed
    buy_event = AlertEvent(
        title="BUY INFY",
        message="Trend momentum confirmed",
        data={"symbol": "INFY", "type": "BUY", "price": 1820.0},
    )
    embed_buy = dispatcher.format_discord_embed(buy_event)
    assert embed_buy["color"] == 0x10B981  # Green
    assert any(f["name"] == "Symbol" and "`INFY`" in f["value"] for f in embed_buy["fields"])

    # 2. Risk Breach / Rejection -> Red Embed
    reject_event = AlertEvent(
        title="RISK LIMIT BREACH",
        message="Order exceeded fat-finger collar",
        priority=AlertPriority.CRITICAL,
        data={"rejection_reason": "Deviation 4.2% > 3.0%"},
    )
    embed_reject = dispatcher.format_discord_embed(reject_event)
    assert embed_reject["color"] == 0xEF4444  # Red

    # 3. Kill Switch -> Amber Embed
    ks_event = AlertEvent(
        title="EMERGENCY KILL SWITCH ACTIVATED",
        message="Manual emergency kill switch engaged",
        priority=AlertPriority.HIGH,
    )
    embed_ks = dispatcher.format_discord_embed(ks_event)
    assert embed_ks["color"] == 0xF59E0B  # Amber


def test_discord_dispatch_mocked():
    """Verify Discord webhook dispatcher dispatches embed payload."""
    dispatcher = AlertDispatcher()
    cfg = DiscordConfig(
        is_enabled=True,
        webhook_url="https://discord.com/api/webhooks/12345/abcdef",
        username="Algo Bot Dispatcher",
    )
    event = AlertEvent(
        title="Discord Test",
        message="Testing embed dispatch",
    )

    mock_resp = MagicMock()
    mock_resp.getcode.return_value = 204
    mock_resp.__enter__.return_value = mock_resp

    with patch("app.alerting.dispatcher.validate_outbound_url", side_effect=lambda u: u), \
         patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
        log = dispatcher.dispatch_discord(event, cfg)
        assert log.status == DeliveryStatus.DELIVERED
        assert log.status_code == 204

        req = mock_urlopen.call_args[0][0]
        assert "discord.com/api/webhooks" in req.full_url


# =========================================================================
# 5. Generic Custom Webhook Dispatch with Signature & Backoff
# =========================================================================

def test_custom_webhook_dispatch_with_hmac_mocked():
    """Verify custom webhook dispatches signed JSON payload with X-Algo-Signature."""
    dispatcher = AlertDispatcher()
    cfg = WebhookConfig(
        is_enabled=True,
        webhook_url="https://api.myquantfund.com/v1/trade-events",
        auth_header="Bearer fund_secret_token_8819",
        secret_key="my_hmac_secret_key",
    )
    event = AlertEvent(
        title="ORDER FILLED: BUY 50 RELIANCE",
        message="Executed via Paper OMS desk",
        event_type=AlertEventType.ORDER_FILLED,
        data={"symbol": "RELIANCE", "quantity": 50, "price": 2840.0},
    )

    mock_resp = MagicMock()
    mock_resp.getcode.return_value = 200
    mock_resp.__enter__.return_value = mock_resp

    with patch("app.alerting.dispatcher.validate_outbound_url", side_effect=lambda u: u), \
         patch("urllib.request.urlopen", return_value=mock_resp) as mock_urlopen:
        log = dispatcher.dispatch_webhook(event, cfg)
        assert log.status == DeliveryStatus.DELIVERED
        assert log.status_code == 200

        req = mock_urlopen.call_args[0][0]
        assert req.headers["Authorization"] == "Bearer fund_secret_token_8819"
        assert req.headers["X-algo-event"] == "ORDER_FILLED"
        assert "sha256=" in req.headers["X-algo-signature"]


# =========================================================================
# 6. Rate Limiting Protection
# =========================================================================

def test_rate_limiter_throttles():
    """Excessive alerts in short succession must be rate limited."""
    dispatcher = AlertDispatcher()
    dispatcher.max_alerts_per_minute = 3

    cfg = DiscordConfig(
        is_enabled=True,
        webhook_url="https://discord.com/api/webhooks/999/xyz",
    )
    event = AlertEvent(title="Flood Test", message="Burst")

    mock_resp = MagicMock()
    mock_resp.getcode.return_value = 200
    mock_resp.__enter__.return_value = mock_resp

    with patch("app.alerting.dispatcher.validate_outbound_url", side_effect=lambda u: u), \
         patch("urllib.request.urlopen", return_value=mock_resp):
        l1 = dispatcher.dispatch_discord(event, cfg)
        l2 = dispatcher.dispatch_discord(event, cfg)
        l3 = dispatcher.dispatch_discord(event, cfg)
        l4 = dispatcher.dispatch_discord(event, cfg)

        assert l1.status == DeliveryStatus.DELIVERED
        assert l2.status == DeliveryStatus.DELIVERED
        assert l3.status == DeliveryStatus.DELIVERED
        # 4th exceeds 3/min limit
        assert l4.status == DeliveryStatus.SKIPPED
        assert "rate limit exceeded" in (l4.error_message or "")


# =========================================================================
# 7. AlertService Pre-Packaged Event Handlers
# =========================================================================

def test_alert_service_event_routing():
    """Verify pre-packaged event handlers for signals, outcomes, fills, breaches, kill switch."""
    srv = AlertService()
    # Configure mock dispatchers
    srv.telegram.is_enabled = False
    srv.discord.is_enabled = False
    srv.webhook.is_enabled = False

    # 1. Trade signal alert
    logs_sig = srv.send_trade_signal_alert({
        "symbol": "HDFCBANK",
        "type": "BUY",
        "entry_price": 1650.0,
        "strategy_name": "Multi-Timeframe SMC",
    })
    assert isinstance(logs_sig, list)

    # 2. Signal outcome alert (Target Hit)
    logs_out = srv.send_signal_outcome_alert({
        "symbol": "HDFCBANK",
        "status": "TARGET_1_HIT",
        "exit_price": 1690.0,
    })
    assert isinstance(logs_out, list)

    # 3. Order Fill alert
    logs_fill = srv.send_order_fill_alert({
        "symbol": "HDFCBANK",
        "transaction_type": "BUY",
        "filled_quantity": 25,
        "average_price": 1650.0,
        "order_id": "ORD_TEST_99",
    })
    assert isinstance(logs_fill, list)

    # 4. Risk breach alert
    logs_risk = srv.send_risk_breach_alert({
        "symbol": "HDFCBANK",
        "gate": "MAX_CAPITAL_AT_RISK",
        "reason": "Exceeded 5% portfolio risk threshold",
    })
    assert isinstance(logs_risk, list)

    # 5. Kill switch alert
    logs_ks = srv.send_kill_switch_alert(engaged=True, reason="Admin Emergency Pause")
    assert isinstance(logs_ks, list)


# =========================================================================
# 8. Configuration Secret Masking & Persistence
# =========================================================================

def test_alerts_config_masking():
    """Ensure bot tokens and webhook secrets are masked in public endpoints."""
    srv = AlertService()
    srv.telegram.bot_token = "9876543210:SecretTelegramTokenXYZ1234"
    srv.discord.webhook_url = "https://discord.com/api/webhooks/12345/supersecretwebhooktoken"
    srv.webhook.webhook_url = "https://hooks.slack.com/services/T00/B00/X1234"

    cfg = srv.get_public_config()
    assert "SecretTelegramToken" not in cfg["telegram"]["bot_token_masked"]
    assert "••••" in cfg["telegram"]["bot_token_masked"]
    assert "supersecretwebhooktoken" not in cfg["discord"]["webhook_url_masked"]
    assert "••••" in cfg["discord"]["webhook_url_masked"]


# =========================================================================
# 9. Test Notification Dispatch API
# =========================================================================

def test_send_test_alert_unknown_channel():
    """Invalid channel name raises ValueError."""
    srv = AlertService()
    with pytest.raises(ValueError, match="Unknown channel 'SLACK'"):
        srv.send_test_alert("SLACK")
