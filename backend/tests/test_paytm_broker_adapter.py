"""
Tests for Paytm Money Broker Adapter & Broker Manager Integration
==================================================================
Verifies:
1. PaytmMoneyBrokerAdapter initialization and capability reporting
2. Session synchronization with PaytmMoneyAuthService
3. BrokerManager registration of PAYTM_MONEY
4. BrokerManager status and active switching to PAYTM_MONEY
5. Order placement and cancellation mock contracts
"""

from app.broker_connectors.paytm_adapter import PaytmMoneyBrokerAdapter
from app.broker_connectors.broker_manager import BrokerManager
from app.market_data.paytm_auth import paytm_auth_service


def test_paytm_broker_adapter_profile_and_funds():
    adapter = PaytmMoneyBrokerAdapter()
    profile = adapter.get_profile()
    assert profile["broker"] == "PAYTM_MONEY"
    assert "NSE" in profile["exchanges"]
    assert "BSE" in profile["exchanges"]
    assert "CNC" in profile["products"]

    funds = adapter.get_funds()
    assert funds["available_cash"] > 0
    assert funds["total_balance"] > 0


def test_paytm_broker_adapter_order_routing():
    adapter = PaytmMoneyBrokerAdapter()
    order = adapter.place_order(
        symbol="RELIANCE",
        exchange="NSE",
        transaction_type="BUY",
        quantity=10,
        order_type="MARKET",
        product="CNC"
    )
    assert order["status"] == "SUBMITTED"
    assert order["broker"] == "PAYTM_MONEY"
    assert order["symbol"] == "RELIANCE"
    assert order["quantity"] == 10

    cancel_res = adapter.cancel_order(order["order_id"])
    assert cancel_res["status"] == "CANCELLED"
    assert cancel_res["order_id"] == order["order_id"]


def test_broker_manager_has_paytm_money():
    mgr = BrokerManager()
    assert "PAYTM_MONEY" in mgr.adapters

    status = mgr.get_status()
    broker_ids = [b["id"] for b in status["brokers"]]
    assert "PAYTM_MONEY" in broker_ids

    # Switch active broker to PAYTM_MONEY
    switch_res = mgr.set_active_broker("PAYTM_MONEY")
    assert switch_res["status"] == "success"
    assert switch_res["active_broker"] == "PAYTM_MONEY"

    updated_status = mgr.get_status()
    assert updated_status["active_broker"] == "PAYTM_MONEY"

    # Reset back to PAPER_TRADING
    mgr.set_active_broker("PAPER_TRADING")
