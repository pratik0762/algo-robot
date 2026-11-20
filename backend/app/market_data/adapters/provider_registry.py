"""
ALGO ROBOT — Central Data Provider Registry & Router
Manages discovery, capabilities, priority failover, and telemetry for all
official exchange adapters and licensed broker market data feeds.
"""

from __future__ import annotations
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.market_data.base_provider import BaseMarketDataProvider, ProviderCapabilities

logger = logging.getLogger("algo_robot.market_data.providers")


class ProviderRegistryManager:
    """Orchestrates provider failover, capability routing, and SLA monitoring."""

    def __init__(self):
        self._lock = threading.RLock()
        self.providers: Dict[str, BaseMarketDataProvider] = {}
        self.priority_order: List[str] = ["PAYTM_MONEY", "ZERODHA", "ANGEL_ONE", "UPSTOX", "DHAN", "NSE", "BSE"]

    def register_provider(self, provider: BaseMarketDataProvider) -> None:
        with self._lock:
            code = provider.provider_code.upper()
            self.providers[code] = provider
            logger.info("Registered market data provider: %s (%s)", code, provider.display_name)

    def get_provider(self, provider_code: str) -> Optional[BaseMarketDataProvider]:
        with self._lock:
            return self.providers.get(provider_code.upper())

    def get_primary_active_provider(self) -> Optional[BaseMarketDataProvider]:
        """Returns the highest-priority connected provider."""
        with self._lock:
            for code in self.priority_order:
                prov = self.providers.get(code)
                if prov and prov.is_connected:
                    return prov
            # Fallback to any registered provider
            for prov in self.providers.values():
                return prov
            return None

    def get_all_providers_status(self) -> List[Dict[str, Any]]:
        with self._lock:
            statuses = []
            for code, prov in self.providers.items():
                statuses.append(prov.get_provider_status())
            return statuses


provider_registry_manager = ProviderRegistryManager()
