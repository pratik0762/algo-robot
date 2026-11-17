"""
ALGO ROBOT — Multi-Channel Alert & Webhook Dispatcher
=====================================================
Dispatches verified trading signals, order execution fills, and risk limit
breaches to Telegram, Discord, and SSRF-safe custom HTTP webhooks.
Includes HMAC-SHA256 payload signing, retry logic, and delivery auditing.
"""

from __future__ import annotations
import asyncio
from datetime import datetime, timezone
import hashlib
import hmac
import json
import logging
import time
from typing import Any, Dict, List, Optional
import urllib.error
import urllib.request

from app.core.ssrf import validate_outbound_url
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

logger = logging.getLogger("algo_robot.alerting.dispatcher")


class AlertDispatcher:
    """Multi-channel outbound notification dispatcher."""

    def __init__(self):
        self.delivery_logs: List[AlertDeliveryLog] = []
        self._max_logs = 500
        # Rate limit tracking: channel -> list of dispatch timestamps
        self._rate_limits: Dict[str, List[float]] = {
            AlertChannel.TELEGRAM.value: [],
            AlertChannel.DISCORD.value: [],
            AlertChannel.WEBHOOK.value: [],
        }
        self.max_alerts_per_minute = 30

    def _check_rate_limit(self, channel: AlertChannel) -> bool:
        """Returns True if within rate limit; False if rate limit breached."""
        now = time.time()
        window = now - 60.0
        c_key = channel.value
        timestamps = [t for t in self._rate_limits.get(c_key, []) if t > window]
        self._rate_limits[c_key] = timestamps
        if len(timestamps) >= self.max_alerts_per_minute:
            logger.warning("Rate limit reached for channel %s (%d alerts/min)", c_key, len(timestamps))
            return False
        self._rate_limits[c_key].append(now)
        return True

    def record_log(self, log: AlertDeliveryLog) -> None:
        """Appends audit log and enforces retention limit."""
        self.delivery_logs.insert(0, log)
        if len(self.delivery_logs) > self._max_logs:
            self.delivery_logs.pop()

    # =========================================================================
    # 1. Telegram Dispatcher
    # =========================================================================

    def format_telegram_html(self, event: AlertEvent) -> str:
        """Formats alert into Telegram HTML markup."""
        priority_emoji = "ℹ️"
        if event.priority == AlertPriority.CRITICAL:
            priority_emoji = "🚨"
        elif event.priority == AlertPriority.HIGH:
            priority_emoji = "⚡"
        elif event.priority == AlertPriority.MEDIUM:
            priority_emoji = "📊"

        side = event.data.get("transaction_type") or event.data.get("type") or ""
        side_badge = f" [<b>{side.upper()}</b>]" if side else ""

        html = [
            f"{priority_emoji} <b>{event.title}</b>{side_badge}",
            f"━━━━━━━━━━━━━━━━━━",
            event.message,
        ]

        # Add data fields
        d = event.data
        if "symbol" in d:
            html.append(f"• <b>Symbol</b>: <code>{d['symbol']}</code>")
        if "price" in d or "current_price" in d:
            p = d.get("price") or d.get("current_price")
            html.append(f"• <b>Price</b>: ₹{float(p):.2f}")
        if "stop_loss" in d and d["stop_loss"]:
            html.append(f"• <b>Stop-Loss</b>: ₹{float(d['stop_loss']):.2f}")
        if "target" in d and d["target"]:
            html.append(f"• <b>Target</b>: ₹{float(d['target']):.2f}")
        if "target_1" in d and d["target_1"]:
            html.append(f"• <b>Target 1</b>: ₹{float(d['target_1']):.2f}")
        if "strategy_name" in d:
            html.append(f"• <b>Strategy</b>: {d['strategy_name']}")
        if "order_id" in d:
            html.append(f"• <b>Order ID</b>: <code>{d['order_id']}</code>")

        iso_time = datetime.fromtimestamp(event.timestamp, tz=timezone.utc).strftime("%H:%M:%S UTC")
        html.append(f"━━━━━━━━━━━━━━━━━━")
        html.append(f"<i>ALGO ROBOT Institutional Feeds • {iso_time}</i>")
        return "\n".join(html)

    def dispatch_telegram(
        self,
        event: AlertEvent,
        config: TelegramConfig,
    ) -> AlertDeliveryLog:
        """Dispatches notification to Telegram chat or channel."""
        t0 = time.time()
        if not config.is_enabled or not config.bot_token or not config.chat_id:
            log = AlertDeliveryLog(
                event_id=event.event_id,
                channel=AlertChannel.TELEGRAM,
                status=DeliveryStatus.SKIPPED,
                error_message="Telegram alerting is disabled or unconfigured.",
                latency_ms=(time.time() - t0) * 1000,
            )
            self.record_log(log)
            return log

        if not self._check_rate_limit(AlertChannel.TELEGRAM):
            log = AlertDeliveryLog(
                event_id=event.event_id,
                channel=AlertChannel.TELEGRAM,
                status=DeliveryStatus.SKIPPED,
                error_message="Telegram outbound rate limit exceeded.",
                latency_ms=(time.time() - t0) * 1000,
            )
            self.record_log(log)
            return log

        text = self.format_telegram_html(event)
        telegram_url = f"https://api.telegram.org/bot{config.bot_token}/sendMessage"

        # Validate URL via SSRF guard
        try:
            validate_outbound_url(telegram_url)
        except ValueError as ssrf_err:
            log = AlertDeliveryLog(
                event_id=event.event_id,
                channel=AlertChannel.TELEGRAM,
                status=DeliveryStatus.FAILED,
                error_message=f"SSRF Check Failed: {ssrf_err}",
                latency_ms=(time.time() - t0) * 1000,
            )
            self.record_log(log)
            return log

        payload = {
            "chat_id": config.chat_id,
            "text": text,
            "parse_mode": config.parse_mode,
            "disable_web_page_preview": True,
        }
        req_data = json.dumps(payload).encode("utf-8")

        req = urllib.request.Request(
            telegram_url,
            data=req_data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "AlgoRobot-AlertDispatcher/2.0",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                status_code = resp.getcode()
                latency = (time.time() - t0) * 1000
                log = AlertDeliveryLog(
                    event_id=event.event_id,
                    channel=AlertChannel.TELEGRAM,
                    status=DeliveryStatus.DELIVERED,
                    status_code=status_code,
                    latency_ms=latency,
                    payload_summary=f"Sent to chat {config.chat_id}",
                )
                self.record_log(log)
                logger.info("Telegram alert %s delivered in %.1fms", event.event_id, latency)
                return log
        except Exception as e:
            latency = (time.time() - t0) * 1000
            status_code = getattr(e, "code", None)
            err_msg = str(e)
            log = AlertDeliveryLog(
                event_id=event.event_id,
                channel=AlertChannel.TELEGRAM,
                status=DeliveryStatus.FAILED,
                status_code=status_code,
                error_message=err_msg,
                latency_ms=latency,
            )
            self.record_log(log)
            logger.warning("Telegram alert %s failed: %s", event.event_id, err_msg)
            return log

    # =========================================================================
    # 2. Discord Dispatcher
    # =========================================================================

    def format_discord_embed(self, event: AlertEvent) -> Dict[str, Any]:
        """Formats alert into a Discord webhook embed."""
        color = 0x3B82F6  # Blue default
        side = str(event.data.get("transaction_type") or event.data.get("type") or "").upper()
        title_up = event.title.upper()

        if event.priority == AlertPriority.CRITICAL or "REJECT" in title_up or "BREACH" in title_up:
            color = 0xEF4444  # Red
        elif "BUY" in side or "BUY" in title_up or "TARGET" in title_up:
            color = 0x10B981  # Green
        elif "SELL" in side or "SELL" in title_up or "SL" in title_up:
            color = 0xF43F5E  # Rose
        elif event.priority == AlertPriority.HIGH or "KILL SWITCH" in title_up:
            color = 0xF59E0B  # Amber

        fields = []
        d = event.data
        if "symbol" in d:
            fields.append({"name": "Symbol", "value": f"`{d['symbol']}`", "inline": True})
        if "transaction_type" in d or "type" in d:
            side = d.get("transaction_type") or d.get("type")
            fields.append({"name": "Side", "value": f"**{side}**", "inline": True})
        if "price" in d or "current_price" in d:
            p = d.get("price") or d.get("current_price")
            fields.append({"name": "Price", "value": f"₹{float(p):.2f}", "inline": True})
        if "stop_loss" in d and d["stop_loss"]:
            fields.append({"name": "Stop-Loss", "value": f"₹{float(d['stop_loss']):.2f}", "inline": True})
        if "target" in d and d["target"]:
            fields.append({"name": "Target", "value": f"₹{float(d['target']):.2f}", "inline": True})
        if "target_1" in d and d["target_1"]:
            fields.append({"name": "Target 1", "value": f"₹{float(d['target_1']):.2f}", "inline": True})
        if "strategy_name" in d:
            fields.append({"name": "Strategy", "value": str(d["strategy_name"]), "inline": False})
        if "order_id" in d:
            fields.append({"name": "Order ID", "value": f"`{d['order_id']}`", "inline": True})
        if "rejection_reason" in d:
            fields.append({"name": "Risk Reason", "value": f"⚠️ {d['rejection_reason']}", "inline": False})

        embed = {
            "title": event.title,
            "description": event.message,
            "color": color,
            "fields": fields,
            "footer": {
                "text": f"ALGO ROBOT Institutional Alerts • Event: {event.event_id}",
            },
            "timestamp": datetime.fromtimestamp(event.timestamp, tz=timezone.utc).isoformat(),
        }
        return embed

    def dispatch_discord(
        self,
        event: AlertEvent,
        config: DiscordConfig,
    ) -> AlertDeliveryLog:
        """Dispatches notification embed to Discord Webhook."""
        t0 = time.time()
        if not config.is_enabled or not config.webhook_url:
            log = AlertDeliveryLog(
                event_id=event.event_id,
                channel=AlertChannel.DISCORD,
                status=DeliveryStatus.SKIPPED,
                error_message="Discord alerting is disabled or webhook URL missing.",
                latency_ms=(time.time() - t0) * 1000,
            )
            self.record_log(log)
            return log

        if not self._check_rate_limit(AlertChannel.DISCORD):
            log = AlertDeliveryLog(
                event_id=event.event_id,
                channel=AlertChannel.DISCORD,
                status=DeliveryStatus.SKIPPED,
                error_message="Discord outbound rate limit exceeded.",
                latency_ms=(time.time() - t0) * 1000,
            )
            self.record_log(log)
            return log

        # SSRF Protection
        try:
            validate_outbound_url(config.webhook_url)
        except ValueError as ssrf_err:
            log = AlertDeliveryLog(
                event_id=event.event_id,
                channel=AlertChannel.DISCORD,
                status=DeliveryStatus.FAILED,
                error_message=f"SSRF Check Failed: {ssrf_err}",
                latency_ms=(time.time() - t0) * 1000,
            )
            self.record_log(log)
            return log

        embed = self.format_discord_embed(event)
        body = {
            "username": config.username,
            "embeds": [embed],
        }
        if config.avatar_url:
            body["avatar_url"] = config.avatar_url

        req_data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            config.webhook_url,
            data=req_data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "AlgoRobot-AlertDispatcher/2.0",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                status_code = resp.getcode()
                latency = (time.time() - t0) * 1000
                log = AlertDeliveryLog(
                    event_id=event.event_id,
                    channel=AlertChannel.DISCORD,
                    status=DeliveryStatus.DELIVERED,
                    status_code=status_code,
                    latency_ms=latency,
                    payload_summary=f"Sent embed: {event.title}",
                )
                self.record_log(log)
                logger.info("Discord alert %s delivered in %.1fms", event.event_id, latency)
                return log
        except Exception as e:
            latency = (time.time() - t0) * 1000
            status_code = getattr(e, "code", None)
            err_msg = str(e)
            log = AlertDeliveryLog(
                event_id=event.event_id,
                channel=AlertChannel.DISCORD,
                status=DeliveryStatus.FAILED,
                status_code=status_code,
                error_message=err_msg,
                latency_ms=latency,
            )
            self.record_log(log)
            logger.warning("Discord alert %s failed: %s", event.event_id, err_msg)
            return log

    # =========================================================================
    # 3. Generic Custom Webhook Dispatcher (SSRF-Safe + HMAC Signature)
    # =========================================================================

    def compute_hmac_signature(self, payload_bytes: bytes, secret: str) -> str:
        """Computes HMAC-SHA256 signature for outbound webhook verification."""
        if not secret:
            return ""
        sig = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
        return f"sha256={sig}"

    def dispatch_webhook(
        self,
        event: AlertEvent,
        config: WebhookConfig,
    ) -> AlertDeliveryLog:
        """Dispatches JSON payload with HMAC signature and SSRF validation."""
        t0 = time.time()
        if not config.is_enabled or not config.webhook_url:
            log = AlertDeliveryLog(
                event_id=event.event_id,
                channel=AlertChannel.WEBHOOK,
                status=DeliveryStatus.SKIPPED,
                error_message="Custom Webhook is disabled or URL missing.",
                latency_ms=(time.time() - t0) * 1000,
            )
            self.record_log(log)
            return log

        # SSRF Protection: strictly enforce zero access to private/loopback/cloud metadata
        try:
            validate_outbound_url(config.webhook_url)
        except ValueError as ssrf_err:
            log = AlertDeliveryLog(
                event_id=event.event_id,
                channel=AlertChannel.WEBHOOK,
                status=DeliveryStatus.FAILED,
                error_message=f"SSRF Blocked: {ssrf_err}",
                latency_ms=(time.time() - t0) * 1000,
            )
            self.record_log(log)
            logger.warning("SSRF blocked attempt to webhook URL: %s", config.webhook_url)
            return log

        if not self._check_rate_limit(AlertChannel.WEBHOOK):
            log = AlertDeliveryLog(
                event_id=event.event_id,
                channel=AlertChannel.WEBHOOK,
                status=DeliveryStatus.SKIPPED,
                error_message="Custom Webhook rate limit exceeded.",
                latency_ms=(time.time() - t0) * 1000,
            )
            self.record_log(log)
            return log

        payload = event.to_dict()
        req_data = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "AlgoRobot-WebhookDispatcher/2.0",
            "X-Algo-Event": event.event_type.value if hasattr(event.event_type, "value") else str(event.event_type),
            "X-Algo-Delivery": event.event_id,
            "X-Algo-Timestamp": str(int(event.timestamp)),
        }
        if config.auth_header:
            headers["Authorization"] = config.auth_header
        if config.secret_key:
            headers["X-Algo-Signature"] = self.compute_hmac_signature(req_data, config.secret_key)

        req = urllib.request.Request(
            config.webhook_url,
            data=req_data,
            headers=headers,
            method="POST",
        )

        # Retry with exponential backoff
        attempts = max(1, config.retry_count)
        last_error = ""
        status_code = None

        for attempt in range(attempts):
            try:
                with urllib.request.urlopen(req, timeout=config.timeout_sec) as resp:
                    status_code = resp.getcode()
                    latency = (time.time() - t0) * 1000
                    log = AlertDeliveryLog(
                        event_id=event.event_id,
                        channel=AlertChannel.WEBHOOK,
                        status=DeliveryStatus.DELIVERED,
                        status_code=status_code,
                        latency_ms=latency,
                        payload_summary=f"Delivered in {attempt + 1} attempt(s) to {config.webhook_url}",
                    )
                    self.record_log(log)
                    logger.info("Custom webhook %s delivered in %.1fms (attempt %d)", event.event_id, latency, attempt + 1)
                    return log
            except Exception as e:
                status_code = getattr(e, "code", None)
                last_error = str(e)
                if attempt < attempts - 1:
                    time.sleep(0.5 * (2 ** attempt))

        latency = (time.time() - t0) * 1000
        log = AlertDeliveryLog(
            event_id=event.event_id,
            channel=AlertChannel.WEBHOOK,
            status=DeliveryStatus.FAILED,
            status_code=status_code,
            error_message=f"Failed after {attempts} attempt(s): {last_error}",
            latency_ms=latency,
        )
        self.record_log(log)
        logger.warning("Custom webhook %s delivery failed: %s", event.event_id, last_error)
        return log
