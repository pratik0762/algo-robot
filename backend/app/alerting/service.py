"""
ALGO ROBOT — Central Alerting & Webhook Orchestrator Service
============================================================
Coordinates notification events, loads and persists channel configurations,
and integrates with OMS, Risk Guardian, and Trade Signals engines.
"""

from __future__ import annotations
import asyncio
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import time
from typing import Any, Dict, List, Optional

from app.alerting.models import (
    AlertChannel,
    AlertDeliveryLog,
    AlertEvent,
    AlertEventType,
    AlertPriority,
    AlertRulesConfig,
    DeliveryStatus,
    DiscordConfig,
    TelegramConfig,
    WebhookConfig,
)
from app.alerting.dispatcher import AlertDispatcher

logger = logging.getLogger("algo_robot.alerting.service")

CONFIG_PATH = Path("backend/app/data/alerts_config.json")


class AlertService:
    """Central Alerting & Webhook Manager."""

    def __init__(self, config_file: Optional[Path] = None):
        self.config_path = config_file or CONFIG_PATH
        self.dispatcher = AlertDispatcher()

        # Channel configurations
        self.telegram = TelegramConfig()
        self.discord = DiscordConfig()
        self.webhook = WebhookConfig()
        self.rules = AlertRulesConfig()

        self._load_config()

    def _load_config(self) -> None:
        """Loads configuration from JSON file or sets defaults."""
        if not self.config_path.exists():
            return

        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                raw = json.load(f)

            # Telegram
            tg = raw.get("telegram", {})
            self.telegram.is_enabled = tg.get("is_enabled", False)
            self.telegram.bot_token = tg.get("bot_token", "")
            self.telegram.chat_id = tg.get("chat_id", "")
            self.telegram.parse_mode = tg.get("parse_mode", "HTML")

            # Discord
            dc = raw.get("discord", {})
            self.discord.is_enabled = dc.get("is_enabled", False)
            self.discord.webhook_url = dc.get("webhook_url", "")
            self.discord.username = dc.get("username", "Algo Robot Dispatcher")
            self.discord.avatar_url = dc.get("avatar_url", "")

            # Webhook
            wh = raw.get("webhook", {})
            self.webhook.is_enabled = wh.get("is_enabled", False)
            self.webhook.webhook_url = wh.get("webhook_url", "")
            self.webhook.auth_header = wh.get("auth_header", "")
            self.webhook.secret_key = wh.get("secret_key", "")
            self.webhook.timeout_sec = float(wh.get("timeout_sec", 5.0))
            self.webhook.retry_count = int(wh.get("retry_count", 3))

            # Rules
            rl = raw.get("rules", {})
            self.rules.broadcast_signals = rl.get("broadcast_new_signals", rl.get("broadcast_signals", True))
            self.rules.broadcast_outcomes = rl.get("broadcast_target_hits", rl.get("broadcast_outcomes", True))
            self.rules.broadcast_order_fills = rl.get("broadcast_order_fills", True)
            self.rules.broadcast_risk_breaches = rl.get("broadcast_risk_breaches", True)
            self.rules.broadcast_kill_switch = rl.get("broadcast_kill_switch", True)

            logger.info("Alerting configuration successfully loaded from %s", self.config_path)
        except Exception as e:
            logger.error("Failed to load alerts_config.json: %s", e)

    def save_config(self) -> None:
        """Persists current configuration to JSON file."""
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "telegram": {
                "is_enabled": self.telegram.is_enabled,
                "bot_token": self.telegram.bot_token,
                "chat_id": self.telegram.chat_id,
                "parse_mode": self.telegram.parse_mode,
            },
            "discord": {
                "is_enabled": self.discord.is_enabled,
                "webhook_url": self.discord.webhook_url,
                "username": self.discord.username,
                "avatar_url": self.discord.avatar_url,
            },
            "webhook": {
                "is_enabled": self.webhook.is_enabled,
                "webhook_url": self.webhook.webhook_url,
                "auth_header": self.webhook.auth_header,
                "secret_key": self.webhook.secret_key,
                "timeout_sec": self.webhook.timeout_sec,
                "retry_count": self.webhook.retry_count,
            },
            "rules": {
                "broadcast_signals": self.rules.broadcast_signals,
                "broadcast_outcomes": self.rules.broadcast_outcomes,
                "broadcast_order_fills": self.rules.broadcast_order_fills,
                "broadcast_risk_breaches": self.rules.broadcast_risk_breaches,
                "broadcast_kill_switch": self.rules.broadcast_kill_switch,
            },
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def get_public_config(self) -> Dict[str, Any]:
        """Returns configuration with sensitive tokens masked for UI display."""
        def mask(s: str) -> str:
            if not s or len(s) < 8:
                return "••••••••" if s else ""
            return f"{s[:4]}••••{s[-4:]}"

        return {
            "telegram": {
                "is_enabled": self.telegram.is_enabled,
                "bot_token_masked": mask(self.telegram.bot_token),
                "chat_id": self.telegram.chat_id,
                "parse_mode": self.telegram.parse_mode,
            },
            "discord": {
                "is_enabled": self.discord.is_enabled,
                "webhook_url_masked": mask(self.discord.webhook_url),
                "username": self.discord.username,
            },
            "webhook": {
                "is_enabled": self.webhook.is_enabled,
                "webhook_url_masked": mask(self.webhook.webhook_url),
                "has_auth_header": bool(self.webhook.auth_header),
                "has_secret_key": bool(self.webhook.secret_key),
                "timeout_sec": self.webhook.timeout_sec,
                "retry_count": self.webhook.retry_count,
            },
            "rules": {
                "broadcast_signals": self.rules.broadcast_signals,
                "broadcast_outcomes": self.rules.broadcast_outcomes,
                "broadcast_order_fills": self.rules.broadcast_order_fills,
                "broadcast_risk_breaches": self.rules.broadcast_risk_breaches,
                "broadcast_kill_switch": self.rules.broadcast_kill_switch,
            },
        }

    def update_config(self, payload: Dict[str, Any]) -> None:
        """Updates channel settings and persists to disk."""
        if "telegram" in payload:
            tg = payload["telegram"]
            if "is_enabled" in tg: self.telegram.is_enabled = bool(tg["is_enabled"])
            if "bot_token" in tg and tg["bot_token"] and "••••" not in tg["bot_token"]:
                self.telegram.bot_token = tg["bot_token"].strip()
            if "chat_id" in tg: self.telegram.chat_id = tg["chat_id"].strip()
            if "parse_mode" in tg: self.telegram.parse_mode = tg["parse_mode"]

        if "discord" in payload:
            dc = payload["discord"]
            if "is_enabled" in dc: self.discord.is_enabled = bool(dc["is_enabled"])
            if "webhook_url" in dc and dc["webhook_url"] and "••••" not in dc["webhook_url"]:
                self.discord.webhook_url = dc["webhook_url"].strip()
            if "username" in dc: self.discord.username = dc["username"].strip()
            if "avatar_url" in dc: self.discord.avatar_url = dc["avatar_url"].strip()

        if "webhook" in payload:
            wh = payload["webhook"]
            if "is_enabled" in wh: self.webhook.is_enabled = bool(wh["is_enabled"])
            if "webhook_url" in wh and wh["webhook_url"] and "••••" not in wh["webhook_url"]:
                self.webhook.webhook_url = wh["webhook_url"].strip()
            if "auth_header" in wh and "••••" not in wh["auth_header"]:
                self.webhook.auth_header = wh["auth_header"].strip()
            if "secret_key" in wh and "••••" not in wh["secret_key"]:
                self.webhook.secret_key = wh["secret_key"].strip()
            if "timeout_sec" in wh: self.webhook.timeout_sec = float(wh["timeout_sec"])
            if "retry_count" in wh: self.webhook.retry_count = int(wh["retry_count"])

        if "rules" in payload:
            rl = payload["rules"]
            if "broadcast_signals" in rl: self.rules.broadcast_signals = bool(rl["broadcast_signals"])
            if "broadcast_outcomes" in rl: self.rules.broadcast_outcomes = bool(rl["broadcast_outcomes"])
            if "broadcast_order_fills" in rl: self.rules.broadcast_order_fills = bool(rl["broadcast_order_fills"])
            if "broadcast_risk_breaches" in rl: self.rules.broadcast_risk_breaches = bool(rl["broadcast_risk_breaches"])
            if "broadcast_kill_switch" in rl: self.rules.broadcast_kill_switch = bool(rl["broadcast_kill_switch"])

        self.save_config()

    # =========================================================================
    # Broadcast & Channel Orchestration
    # =========================================================================

    def broadcast(self, event: AlertEvent) -> List[AlertDeliveryLog]:
        """Dispatches an alert event to all enabled channels."""
        results: List[AlertDeliveryLog] = []

        # 1. Telegram
        if self.telegram.is_enabled:
            res_tg = self.dispatcher.dispatch_telegram(event, self.telegram)
            results.append(res_tg)

        # 2. Discord
        if self.discord.is_enabled:
            res_dc = self.dispatcher.dispatch_discord(event, self.discord)
            results.append(res_dc)

        # 3. Custom Webhook (SSRF-safe)
        if self.webhook.is_enabled:
            res_wh = self.dispatcher.dispatch_webhook(event, self.webhook)
            results.append(res_wh)

        return results

    # =========================================================================
    # Pre-Packaged Event Handlers
    # =========================================================================

    def send_trade_signal_alert(self, signal: Dict[str, Any]) -> List[AlertDeliveryLog]:
        """Dispatches a new quantitative strategy trade signal alert."""
        if not self.rules.broadcast_signals:
            return []

        sym = signal.get("symbol", "UNKNOWN")
        side = signal.get("type", "BUY")
        strat = signal.get("strategy_name", "Quantitative Strategy")
        price = signal.get("entry_price") or signal.get("current_price", 0.0)

        event = AlertEvent(
            event_type=AlertEventType.TRADE_SIGNAL_GENERATED,
            priority=AlertPriority.HIGH,
            title=f"NEW TRADE SIGNAL: {side} {sym}",
            message=f"Strategy '{strat}' generated a {side} signal at ₹{float(price):.2f}.",
            data=signal,
        )
        return self.broadcast(event)

    def send_signal_outcome_alert(self, signal: Dict[str, Any]) -> List[AlertDeliveryLog]:
        """Dispatches Target Hit or Stop-Loss Hit outcome alert."""
        if not self.rules.broadcast_outcomes:
            return []

        sym = signal.get("symbol", "UNKNOWN")
        status = signal.get("status", "COMPLETED")
        exit_price = signal.get("exit_price") or signal.get("current_price", 0.0)

        is_profit = "TARGET" in status.upper()
        prio = AlertPriority.MEDIUM if is_profit else AlertPriority.HIGH
        title = f"SIGNAL OUTCOME: {status.replace('_', ' ')} for {sym}"
        message = f"Position completed: {status} reached at ₹{float(exit_price):.2f}."

        event = AlertEvent(
            event_type=AlertEventType.SIGNAL_OUTCOME,
            priority=prio,
            title=title,
            message=message,
            data=signal,
        )
        return self.broadcast(event)

    def send_order_fill_alert(self, order_dict: Dict[str, Any]) -> List[AlertDeliveryLog]:
        """Dispatches OMS execution fill alert."""
        if not self.rules.broadcast_order_fills:
            return []

        sym = order_dict.get("symbol", "UNKNOWN")
        side = order_dict.get("transaction_type", "BUY")
        qty = order_dict.get("filled_quantity", 0)
        avg_price = order_dict.get("average_price", 0.0)
        order_id = order_dict.get("order_id", "")

        event = AlertEvent(
            event_type=AlertEventType.ORDER_FILLED,
            priority=AlertPriority.MEDIUM,
            title=f"ORDER EXECUTED: {side} {qty} {sym}",
            message=f"Order {order_id} filled at average price ₹{float(avg_price):.2f}.",
            data=order_dict,
        )
        return self.broadcast(event)

    def send_risk_breach_alert(self, breach_info: Dict[str, Any]) -> List[AlertDeliveryLog]:
        """Dispatches pre-trade risk guardian breach alert."""
        if not self.rules.broadcast_risk_breaches:
            return []

        gate = breach_info.get("gate", "RISK_GATE")
        sym = breach_info.get("symbol", "PORTFOLIO")
        reason = breach_info.get("reason", "Risk rule violation")

        event = AlertEvent(
            event_type=AlertEventType.RISK_LIMIT_BREACH,
            priority=AlertPriority.HIGH,
            title=f"RISK LIMIT BREACH: {gate} on {sym}",
            message=f"Order rejected by Pre-Trade Risk Engine: {reason}",
            data=breach_info,
        )
        return self.broadcast(event)

    def send_kill_switch_alert(self, engaged: bool, reason: str) -> List[AlertDeliveryLog]:
        """Dispatches emergency kill switch alert."""
        if not self.rules.broadcast_kill_switch:
            return []

        state_str = "ENGAGED (HALT TRADING)" if engaged else "DISENGAGED (TRADING RESUMED)"
        event = AlertEvent(
            event_type=AlertEventType.KILL_SWITCH_TRIPPED,
            priority=AlertPriority.CRITICAL if engaged else AlertPriority.HIGH,
            title=f"EMERGENCY KILL SWITCH: {state_str}",
            message=f"Kill switch state changed: {reason}",
            data={"is_kill_switch_active": engaged, "reason": reason},
        )
        return self.broadcast(event)

    def send_test_alert(self, channel_str: str) -> AlertDeliveryLog:
        """Sends a verification test alert to a specific channel."""
        ch = channel_str.upper().strip()
        event = AlertEvent(
            event_type=AlertEventType.SYSTEM_ALERT,
            priority=AlertPriority.INFO,
            title="ALGO ROBOT TEST NOTIFICATION",
            message="This is a test notification verifying connectivity from the Algo Robot institutional alerting infrastructure.",
            data={"channel": ch, "test": True, "ping_time": time.time()},
        )

        if ch == AlertChannel.TELEGRAM.value:
            return self.dispatcher.dispatch_telegram(event, self.telegram)
        elif ch == AlertChannel.DISCORD.value:
            return self.dispatcher.dispatch_discord(event, self.discord)
        elif ch == AlertChannel.WEBHOOK.value:
            return self.dispatcher.dispatch_webhook(event, self.webhook)
        else:
            raise ValueError(f"Unknown channel '{channel_str}'. Permitted: TELEGRAM, DISCORD, WEBHOOK.")

    def get_delivery_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieves audit logs of dispatched notifications."""
        return [l.to_dict() for l in self.dispatcher.delivery_logs[:limit]]


# Singleton alert service instance
alert_service = AlertService()
