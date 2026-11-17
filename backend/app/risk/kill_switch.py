"""
ALGO ROBOT — Emergency Kill-Switch & Circuit Breaker Manager
Provides instant panic-button cutoff and automated circuit-breaker protection
to immediately abort trading, halt order routing, and protect capital.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
import logging
import threading
import time
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger("algo_robot.risk.kill_switch")
IST = timezone(timedelta(hours=5, minutes=30))


class KillSwitchState(str, Enum):
    ARMED_NORMAL = "ARMED_NORMAL"
    CIRCUIT_BREAKER_TRIGGERED = "CIRCUIT_BREAKER_TRIGGERED"
    MANUAL_KILL_SWITCH_ACTIVE = "MANUAL_KILL_SWITCH_ACTIVE"


@dataclass
class KillSwitchEvent:
    event_type: str  # ACTIVATED, DEACTIVATED, TRIPPED, RESET
    state: KillSwitchState
    reason: str
    triggered_by: str
    timestamp: float = field(default_factory=time.time)
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_type": self.event_type,
            "state": self.state.value,
            "reason": self.reason,
            "triggered_by": self.triggered_by,
            "timestamp": self.timestamp,
            "details": self.details,
        }


class KillSwitchManager:
    """Manages emergency cutoff states and automated circuit-breaker logic."""

    def __init__(self):
        self._lock = threading.RLock()
        self._state: KillSwitchState = KillSwitchState.ARMED_NORMAL
        self._last_event: Optional[KillSwitchEvent] = None
        self._event_history: List[KillSwitchEvent] = []
        self._listeners: List[Callable[[KillSwitchEvent], None]] = []

    @property
    def state(self) -> KillSwitchState:
        with self._lock:
            return self._state

    @property
    def is_active(self) -> bool:
        with self._lock:
            return self._state != KillSwitchState.ARMED_NORMAL

    def register_listener(self, listener: Callable[[KillSwitchEvent], None]) -> None:
        with self._lock:
            self._listeners.append(listener)

    def activate_manual_kill_switch(self, reason: str = "Manual User Panic Trigger", user_id: str = "ADMIN") -> KillSwitchEvent:
        """Manually engages emergency cutoff."""
        with self._lock:
            self._state = KillSwitchState.MANUAL_KILL_SWITCH_ACTIVE
            ev = KillSwitchEvent(
                event_type="ACTIVATED",
                state=self._state,
                reason=reason,
                triggered_by=user_id,
            )
            self._last_event = ev
            self._event_history.append(ev)
            logger.warning("🚨 EMERGENCY KILL SWITCH ACTIVATED by %s: %s", user_id, reason)

        self._notify_listeners(ev)
        return ev

    def trip_circuit_breaker(self, reason: str, metric_value: float, threshold: float) -> KillSwitchEvent:
        """Automatically trips the circuit breaker due to risk breach."""
        with self._lock:
            self._state = KillSwitchState.CIRCUIT_BREAKER_TRIGGERED
            ev = KillSwitchEvent(
                event_type="TRIPPED",
                state=self._state,
                reason=reason,
                triggered_by="SYSTEM_CIRCUIT_BREAKER",
                details={"metric_value": metric_value, "threshold": threshold},
            )
            self._last_event = ev
            self._event_history.append(ev)
            logger.critical("🛑 CIRCUIT BREAKER TRIPPED! Breach: %s (Value: %s, Threshold: %s)", reason, metric_value, threshold)

        self._notify_listeners(ev)
        return ev

    def reset(self, user_id: str = "ADMIN", rationale: str = "Manual Admin Reset") -> KillSwitchEvent:
        """Resets the circuit breaker and re-arms normal trading."""
        with self._lock:
            prev_state = self._state
            self._state = KillSwitchState.ARMED_NORMAL
            ev = KillSwitchEvent(
                event_type="RESET",
                state=self._state,
                reason=rationale,
                triggered_by=user_id,
                details={"previous_state": prev_state.value},
            )
            self._last_event = ev
            self._event_history.append(ev)
            logger.info("✅ KILL SWITCH / CIRCUIT BREAKER RESET by %s: %s", user_id, rationale)

        self._notify_listeners(ev)
        return ev

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "state": self._state.value,
                "is_active": self._state != KillSwitchState.ARMED_NORMAL,
                "last_event": self._last_event.to_dict() if self._last_event else None,
                "event_count": len(self._event_history),
                "timestamp": time.time(),
            }

    def _notify_listeners(self, event: KillSwitchEvent) -> None:
        for listener in self._listeners:
            try:
                listener(event)
            except Exception as e:
                logger.error("Error executing kill switch listener: %s", e)


# Singleton instance
kill_switch_manager = KillSwitchManager()
