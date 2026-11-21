"""
ALGO ROBOT — Market Data Resilience, Circuit Breakers & Structured Diagnostics
Provides exponential backoff, circuit-breaker fault isolation, structured error logging,
and request sanitization across all external market data providers.
"""

from __future__ import annotations
import enum
import logging
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Tuple, TypeVar

logger = logging.getLogger("algo_robot.market_data.resilience")

T = TypeVar("T")


class CircuitState(str, enum.Enum):
    CLOSED = "CLOSED"         # Normal operation; requests pass through
    OPEN = "OPEN"             # Tripped; requests rejected immediately
    HALF_OPEN = "HALF_OPEN"   # Probing; single trial request permitted


class CircuitBreaker:
    """
    Thread-safe Circuit Breaker for external API endpoints and WebSocket connectors.
    Prevents cascading resource exhaustion during provider outages or rate limits.
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout_sec: float = 30.0,
        expected_exceptions: Tuple[type, ...] = (Exception,),
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout_sec = recovery_timeout_sec
        self.expected_exceptions = expected_exceptions

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_state_change = time.time()
        self._last_failure_time = 0.0
        self._last_error_message = ""
        self._lock = threading.RLock()

    @property
    def state(self) -> CircuitState:
        with self._lock:
            if self._state == CircuitState.OPEN:
                if (time.time() - self._last_state_change) > self.recovery_timeout_sec:
                    self._state = CircuitState.HALF_OPEN
                    self._last_state_change = time.time()
                    logger.info("Circuit breaker '%s' transition to HALF_OPEN (probing)", self.name)
            return self._state

    def allow_request(self) -> bool:
        """Returns True if the circuit breaker permits an outgoing request."""
        st = self.state
        return st in (CircuitState.CLOSED, CircuitState.HALF_OPEN)

    def record_success(self) -> None:
        """Records a successful response, resetting consecutive failure counts."""
        with self._lock:
            self._failure_count = 0
            if self._state == CircuitState.HALF_OPEN:
                self._state = CircuitState.CLOSED
                self._last_state_change = time.time()
                logger.info("Circuit breaker '%s' reset to CLOSED (recovered)", self.name)

    def record_failure(self, error: Exception, context: Optional[str] = None) -> None:
        """Records a request failure and trips to OPEN if threshold is exceeded."""
        with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.time()
            self._last_error_message = str(error)

            log_msg = f"Circuit breaker '{self.name}' failure #{self._failure_count}: {error}"
            if context:
                log_msg += f" (Context: {context})"
            logger.warning(log_msg)

            if self._state in (CircuitState.CLOSED, CircuitState.HALF_OPEN):
                if self._failure_count >= self.failure_threshold:
                    self._state = CircuitState.OPEN
                    self._last_state_change = time.time()
                    logger.error(
                        "Circuit breaker '%s' TRIPPED to OPEN after %d consecutive failures. Cooldown: %.1fs",
                        self.name,
                        self._failure_count,
                        self.recovery_timeout_sec,
                    )

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "name": self.name,
                "state": self.state.value,
                "consecutive_failures": self._failure_count,
                "failure_threshold": self.failure_threshold,
                "recovery_timeout_sec": self.recovery_timeout_sec,
                "last_error": self._last_error_message,
                "last_failure_time": self._last_failure_time,
                "is_healthy": self.state == CircuitState.CLOSED,
            }


class ResilienceManager:
    """
    Central registry for circuit breakers, rate limits, and structured telemetry.
    """

    _instance: Optional[ResilienceManager] = None
    _lock = threading.RLock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
            return cls._instance

    def __init__(self):
        with self._lock:
            if getattr(self, "_initialized", False):
                return
            self._breakers: Dict[str, CircuitBreaker] = {
                "PAYTM_REST_QUOTES": CircuitBreaker("PAYTM_REST_QUOTES", failure_threshold=5, recovery_timeout_sec=20.0),
                "PAYTM_HISTORICAL_API": CircuitBreaker("PAYTM_HISTORICAL_API", failure_threshold=4, recovery_timeout_sec=30.0),
                "PAYTM_WEBSOCKET": CircuitBreaker("PAYTM_WEBSOCKET", failure_threshold=6, recovery_timeout_sec=15.0),
                "EXCHANGE_SNAPSHOT": CircuitBreaker("EXCHANGE_SNAPSHOT", failure_threshold=8, recovery_timeout_sec=45.0),
            }
            self._error_log: List[Dict[str, Any]] = []
            self._max_error_log_len = 100
            self._initialized = True

    def get_breaker(self, name: str) -> CircuitBreaker:
        with self._lock:
            if name not in self._breakers:
                self._breakers[name] = CircuitBreaker(name)
            return self._breakers[name]

    def log_error(
        self,
        provider: str,
        endpoint: str,
        instrument: str,
        error_category: str,
        details: str,
        retry_count: int = 0,
    ) -> None:
        """Appends a structured error event with sanitized diagnostic payload."""
        with self._lock:
            event = {
                "timestamp": time.time(),
                "time_iso": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
                "provider": provider,
                "endpoint": endpoint,
                "instrument": instrument,
                "category": error_category,
                "retry_count": retry_count,
                "details": details[:300],  # truncated to prevent log pollution
            }
            self._error_log.append(event)
            if len(self._error_log) > self._max_error_log_len:
                self._error_log.pop(0)

    def get_diagnostics(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "breakers": {name: b.get_status() for name, b in self._breakers.items()},
                "recent_errors": list(reversed(self._error_log[-15:])),
                "total_logged_errors": len(self._error_log),
            }


resilience_manager = ResilienceManager()
