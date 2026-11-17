"""
ALGO ROBOT — Alerting & Webhook Models & Event Contracts
========================================================
Defines event structures, priority levels, channel configurations,
and notification delivery audit log records.
"""

from __future__ import annotations
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
import enum
import time
from typing import Any, Dict, List, Optional
import uuid


class AlertEventType(str, enum.Enum):
    TRADE_SIGNAL_GENERATED = "TRADE_SIGNAL_GENERATED"
    SIGNAL_OUTCOME = "SIGNAL_OUTCOME"
    ORDER_PLACED = "ORDER_PLACED"
    ORDER_FILLED = "ORDER_FILLED"
    ORDER_REJECTED = "ORDER_REJECTED"
    RISK_LIMIT_BREACH = "RISK_LIMIT_BREACH"
    KILL_SWITCH_TRIPPED = "KILL_SWITCH_TRIPPED"
    SYSTEM_ALERT = "SYSTEM_ALERT"


class AlertPriority(str, enum.Enum):
    INFO = "INFO"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AlertChannel(str, enum.Enum):
    TELEGRAM = "TELEGRAM"
    DISCORD = "DISCORD"
    WEBHOOK = "WEBHOOK"


class DeliveryStatus(str, enum.Enum):
    QUEUED = "QUEUED"
    DELIVERED = "DELIVERED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


@dataclass
class AlertEvent:
    """Core domain notification event representation."""
    title: str
    message: str
    event_type: AlertEventType = AlertEventType.TRADE_SIGNAL_GENERATED
    priority: AlertPriority = AlertPriority.MEDIUM
    data: Dict[str, Any] = field(default_factory=dict)
    event_id: str = field(default_factory=lambda: f"EVT_{uuid.uuid4().hex[:12].upper()}")
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type.value if hasattr(self.event_type, "value") else str(self.event_type),
            "priority": self.priority.value if hasattr(self.priority, "value") else str(self.priority),
            "title": self.title,
            "message": self.message,
            "data": self.data,
            "timestamp": self.timestamp,
            "iso_time": datetime.fromtimestamp(self.timestamp, tz=timezone.utc).isoformat(),
        }


@dataclass
class AlertDeliveryLog:
    """Audit record for every outbound dispatch attempt."""
    event_id: str
    channel: AlertChannel
    status: DeliveryStatus
    status_code: Optional[int] = None
    error_message: Optional[str] = None
    latency_ms: float = 0.0
    payload_summary: Optional[str] = None
    log_id: str = field(default_factory=lambda: f"LOG_{uuid.uuid4().hex[:12].upper()}")
    dispatched_at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "log_id": self.log_id,
            "event_id": self.event_id,
            "channel": self.channel.value if hasattr(self.channel, "value") else str(self.channel),
            "status": self.status.value if hasattr(self.status, "value") else str(self.status),
            "status_code": self.status_code,
            "error_message": self.error_message,
            "latency_ms": round(self.latency_ms, 2),
            "payload_summary": self.payload_summary,
            "dispatched_at": self.dispatched_at,
            "iso_time": datetime.fromtimestamp(self.dispatched_at, tz=timezone.utc).isoformat(),
        }


@dataclass
class TelegramConfig:
    is_enabled: bool = False
    bot_token: str = ""
    chat_id: str = ""
    parse_mode: str = "HTML"


@dataclass
class DiscordConfig:
    is_enabled: bool = False
    webhook_url: str = ""
    username: str = "Algo Robot Dispatcher"
    avatar_url: str = ""


@dataclass
class WebhookConfig:
    is_enabled: bool = False
    webhook_url: str = ""
    auth_header: str = ""
    secret_key: str = ""  # For HMAC-SHA256 signature verification in X-Algo-Signature
    timeout_sec: float = 5.0
    retry_count: int = 3


@dataclass
class AlertRulesConfig:
    broadcast_signals: bool = True
    broadcast_outcomes: bool = True
    broadcast_order_fills: bool = True
    broadcast_risk_breaches: bool = True
    broadcast_kill_switch: bool = True
    min_priority: AlertPriority = AlertPriority.INFO
