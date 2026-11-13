"""
Central Multi-Broker Management & Order Routing Engine
======================================================
Manages multi-broker sessions, credential storage, active execution mode,
and order dispatching across Zerodha, Angel One, Dhan, Upstox, and Paper Trading.
"""

import os
import json
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone

from app.broker_connectors.base_broker import BaseBrokerClient
from app.broker_connectors.zerodha_adapter import ZerodhaAdapter
from app.broker_connectors.angel_one_adapter import AngelOneAdapter
from app.broker_connectors.dhan_adapter import DhanAdapter
from app.broker_connectors.upstox_adapter import UpstoxAdapter

SESSIONS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "broker_sessions.json")

DEFAULT_SESSIONS = {
    "active_broker": "PAPER_TRADING",
    "brokers": {
        "ZERODHA": {
            "name": "Zerodha Kite Connect",
            "api_key": "kite_prod_api_key",
            "client_id": "ZR9081",
            "is_enabled": False,
            "is_connected": True
        },
        "ANGEL_ONE": {
            "name": "Angel One SmartAPI",
            "api_key": "smart_api_key_angel",
            "client_code": "A10842",
            "is_enabled": False,
            "is_connected": True
        },
        "DHAN": {
            "name": "Dhan HQ API v2",
            "client_id": "DHAN1008",
            "is_enabled": False,
            "is_connected": True
        },
        "UPSTOX": {
            "name": "Upstox API v2",
            "api_key": "upstox_app_key",
            "client_id": "UP2084",
            "is_enabled": False,
            "is_connected": True
        }
    }
}

class BrokerManager:
    """Multi-Broker Session Manager & Order Dispatcher."""

    def __init__(self):
        self._ensure_storage()
        self.adapters: Dict[str, BaseBrokerClient] = {
            "ZERODHA": ZerodhaAdapter(),
            "ANGEL_ONE": AngelOneAdapter(),
            "DHAN": DhanAdapter(),
            "UPSTOX": UpstoxAdapter()
        }

    def _ensure_storage(self):
        os.makedirs(os.path.dirname(SESSIONS_FILE), exist_ok=True)
        if not os.path.exists(SESSIONS_FILE):
            self._save_raw(DEFAULT_SESSIONS)

    def _load_raw(self) -> Dict[str, Any]:
        try:
            with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return dict(DEFAULT_SESSIONS)

    def _save_raw(self, data: Dict[str, Any]):
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def get_status(self) -> Dict[str, Any]:
        """Return status, funds, and profile for all supported brokers."""
        data = self._load_raw()
        active = data.get("active_broker", "PAPER_TRADING")

        broker_cards = []
        for key, adapter in self.adapters.items():
            saved_meta = data.get("brokers", {}).get(key, {})
            funds = adapter.get_funds()
            profile = adapter.get_profile()
            broker_cards.append({
                "id": key,
                "name": saved_meta.get("name", key),
                "client_id": adapter.client_id,
                "is_active": (active == key),
                "is_connected": adapter.is_connected,
                "funds": funds,
                "profile": profile,
                "last_auth": adapter.last_auth_time
            })

        return {
            "active_broker": active,
            "is_live_mode": active != "PAPER_TRADING",
            "brokers": broker_cards
        }

    def set_active_broker(self, broker_id: str) -> Dict[str, Any]:
        """Switch active execution target (PAPER_TRADING, ZERODHA, ANGEL_ONE, DHAN, UPSTOX)."""
        broker_id = broker_id.upper()
        if broker_id not in ["PAPER_TRADING", "ZERODHA", "ANGEL_ONE", "DHAN", "UPSTOX"]:
            raise ValueError(f"Invalid broker '{broker_id}'")

        data = self._load_raw()
        data["active_broker"] = broker_id
        self._save_raw(data)
        return {
            "status": "success",
            "active_broker": broker_id,
            "message": f"Execution destination switched to {broker_id}."
        }

    def authenticate_broker(self, broker_id: str, credentials: Dict[str, Any]) -> Dict[str, Any]:
        """Connect and authenticate credentials for a broker."""
        broker_id = broker_id.upper()
        if broker_id not in self.adapters:
            raise ValueError(f"Unsupported broker '{broker_id}'")

        adapter = self.adapters[broker_id]
        res = adapter.authenticate(credentials)

        # Update saved sessions
        data = self._load_raw()
        b_entry = data.setdefault("brokers", {}).setdefault(broker_id, {})
        for k in ["client_id", "client_code", "api_key"]:
            if k in credentials:
                b_entry[k] = credentials[k]
        b_entry["is_connected"] = True
        self._save_raw(data)

        return res

    def get_active_orders_and_positions(self) -> Dict[str, Any]:
        """Fetch live orders and positions from the currently active broker."""
        active = self._load_raw().get("active_broker", "PAPER_TRADING")
        if active == "PAPER_TRADING":
            from app.paper_trading_engine import paper_trading_engine
            port = paper_trading_engine.get_portfolio()
            return {
                "broker": "PAPER_TRADING",
                "positions": port.get("open_positions", []),
                "orders": port.get("closed_trades", [])
            }

        adapter = self.adapters.get(active)
        if not adapter:
            return {"broker": active, "positions": [], "orders": []}

        return {
            "broker": active,
            "positions": adapter.get_positions(),
            "orders": adapter.get_orders()
        }

    def route_order(
        self,
        symbol: str,
        side: str,
        quantity: int,
        instrument_type: str = "EQUITY",
        order_type: str = "MARKET",
        price: Optional[float] = None,
        tag: str = "ALGO_ROBOT"
    ) -> Dict[str, Any]:
        """Route order dynamically to either Paper Desk or Active Live Broker."""
        active = self._load_raw().get("active_broker", "PAPER_TRADING")

        if active == "PAPER_TRADING":
            from app.paper_trading_engine import paper_trading_engine
            return paper_trading_engine.place_order(
                symbol=symbol,
                side=side,
                quantity=quantity,
                instrument_type=instrument_type,
                order_type=order_type,
                price=price,
                strategy_name=tag
            )

        adapter = self.adapters.get(active)
        if not adapter:
            raise ValueError(f"Active broker adapter '{active}' unavailable.")

        return adapter.place_order(
            symbol=symbol,
            exchange="NSE",
            transaction_type=side,
            quantity=quantity,
            order_type=order_type,
            product="MIS" if instrument_type == "EQUITY" else "NRML",
            price=price,
            tag=tag
        )

broker_manager = BrokerManager()

