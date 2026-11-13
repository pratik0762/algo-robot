"""
Base Broker Connector Interface
================================
Defines the standard abstract contract for all Indian stock/derivatives brokers:
- Zerodha Kite Connect v3
- Angel One SmartAPI
- Dhan HQ v2
- Upstox API v2
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone

class BaseBrokerClient(ABC):
    """Abstract Base Class for multi-broker integration."""

    def __init__(self, broker_name: str, config: Optional[Dict[str, Any]] = None):
        self.broker_name = broker_name
        self.config = config or {}
        self.is_connected = False
        self.session_token: Optional[str] = None
        self.client_id: Optional[str] = None
        self.last_auth_time: Optional[str] = None

    @abstractmethod
    def authenticate(self, credentials: Dict[str, Any]) -> Dict[str, Any]:
        """Authenticate with the broker API (OAuth, API key, TOTP)."""
        pass

    @abstractmethod
    def get_profile(self) -> Dict[str, Any]:
        """Fetch user profile and demat exchange permissions."""
        pass

    @abstractmethod
    def get_funds(self) -> Dict[str, Any]:
        """Retrieve available cash, margin, and collateral limits."""
        pass

    @abstractmethod
    def get_positions(self) -> List[Dict[str, Any]]:
        """Retrieve live open intraday and delivery positions."""
        pass

    @abstractmethod
    def get_orders(self) -> List[Dict[str, Any]]:
        """Retrieve order book and status history."""
        pass

    @abstractmethod
    def place_order(
        self,
        symbol: str,
        exchange: str,
        transaction_type: str,  # BUY or SELL
        quantity: int,
        order_type: str,        # MARKET, LIMIT, SL, SL-M
        product: str,           # MIS (Intraday), CNC (Delivery), NRML (F&O)
        price: Optional[float] = None,
        trigger_price: Optional[float] = None,
        tag: str = "ALGO_ROBOT"
    ) -> Dict[str, Any]:
        """Submit order to broker OMS / RMS."""
        pass

    @abstractmethod
    def cancel_order(self, order_id: str) -> Dict[str, Any]:
        """Cancel an open pending order."""
        pass

