"""
ALGO ROBOT — Central Options Chain & Derivatives Intelligence Service
Synthesizes live spot ticks, multi-strike Black-Scholes Greeks, IV skew,
and Open Interest buildup into a streaming real-time options chain.
"""

from __future__ import annotations
import asyncio
import logging
import time
from typing import Any, Dict, List, Optional, Set
from fastapi import WebSocket, WebSocketDisconnect

from app.tick_engine import tick_engine
from app.derivatives.black_scholes import BlackScholesEngine
from app.derivatives.oi_analyzer import OpenInterestAnalyzer
from app.option_chain_engine import (
    FO_LOOKUP,
    generate_fo_expiries,
    build_option_chain,
)

logger = logging.getLogger("algo_robot.derivatives.service")


class OptionsChainService:
    """Real-time streaming Options Chain and Greeks distribution service."""

    def __init__(self):
        self._connected_websockets: Dict[str, Set[WebSocket]] = {}

    def get_live_chain_analytics(
        self,
        symbol: str = "NIFTY",
        expiry_date: Optional[str] = None,
        strike_count: int = 30,
    ) -> Dict[str, Any]:
        """
        Builds enriched real-time options chain for the specified symbol and expiry.
        Injects live Black-Scholes Greeks, IV skew, and Open Interest buildup analytics.
        """
        sym = symbol.upper()
        # Fallback to existing option chain engine builder
        raw_chain = build_option_chain(sym, expiry_date, strike_count)
        if not raw_chain or ("strikes" not in raw_chain and "chain" not in raw_chain):
            return raw_chain

        spot = float(raw_chain.get("spot_price", 24000.0))
        days_to_expiry = float(raw_chain.get("days_to_expiry", 7.0))
        strikes_data = raw_chain.get("strikes") or raw_chain.get("chain") or []

        strike_prices: List[float] = []
        call_ois: List[int] = []
        put_ois: List[int] = []
        total_call_vol = 0
        total_put_vol = 0

        # Enrich each strike row with institutional Black-Scholes Greeks and OI buildup
        for row in strikes_data:
            strike = float(row.get("strike", 0.0))
            strike_prices.append(strike)

            ce = row.get("ce") or row.get("call") or {}
            pe = row.get("pe") or row.get("put") or {}

            ce_ltp = float(ce.get("ltp", 0.0))
            pe_ltp = float(pe.get("ltp", 0.0))

            ce_oi = int(ce.get("oi", 0))
            pe_oi = int(pe.get("oi", 0))
            call_ois.append(ce_oi)
            put_ois.append(pe_oi)

            ce_chg = float(ce.get("change", 0.0))
            pe_chg = float(pe.get("change", 0.0))
            ce_oi_chg = float(ce.get("oi_change", ce.get("change_oi", 0)))
            pe_oi_chg = float(pe.get("oi_change", pe.get("change_oi", 0)))

            total_call_vol += int(ce.get("volume", 0))
            total_put_vol += int(pe.get("volume", 0))

            # Solve Implied Volatility
            ce_iv = BlackScholesEngine.calculate_implied_volatility(ce_ltp, spot, strike, days_to_expiry, "CE")
            pe_iv = BlackScholesEngine.calculate_implied_volatility(pe_ltp, spot, strike, days_to_expiry, "PE")

            # Calculate Greeks
            ce_greeks = BlackScholesEngine.calculate_greeks(spot, strike, days_to_expiry, ce_iv, "CE")
            pe_greeks = BlackScholesEngine.calculate_greeks(spot, strike, days_to_expiry, pe_iv, "PE")

            # Classify OI Buildup
            ce_buildup = OpenInterestAnalyzer.classify_strike_buildup(ce_chg, ce_oi_chg)
            pe_buildup = OpenInterestAnalyzer.classify_strike_buildup(pe_chg, pe_oi_chg)

            ce["iv"] = round(ce_iv * 100.0, 2)
            ce["delta"] = ce_greeks["delta"]
            ce["gamma"] = ce_greeks["gamma"]
            ce["theta"] = ce_greeks["theta"]
            ce["vega"] = ce_greeks["vega"]
            ce["rho"] = ce_greeks["rho"]
            ce["buildup"] = ce_buildup

            pe["iv"] = round(pe_iv * 100.0, 2)
            pe["delta"] = pe_greeks["delta"]
            pe["gamma"] = pe_greeks["gamma"]
            pe["theta"] = pe_greeks["theta"]
            pe["vega"] = pe_greeks["vega"]
            pe["rho"] = pe_greeks["rho"]
            pe["buildup"] = pe_buildup

            row["ce"] = ce
            row["pe"] = pe
            row["call"] = ce
            row["put"] = pe

        # Aggregate Max Pain and PCR
        max_pain = OpenInterestAnalyzer.calculate_max_pain(strike_prices, call_ois, put_ois)
        pcr_data = OpenInterestAnalyzer.calculate_pcr(
            total_call_oi=sum(call_ois),
            total_put_oi=sum(put_ois),
            total_call_vol=total_call_vol,
            total_put_vol=total_put_vol,
        )

        # Expected Move calculation
        atm_strike = min(strike_prices, key=lambda s: abs(s - spot)) if strike_prices else spot
        atm_row = next((r for r in strikes_data if r.get("strike") == atm_strike), None)
        atm_iv = float(atm_row.get("ce", {}).get("iv", 16.0)) / 100.0 if atm_row else 0.16
        atm_straddle = float(atm_row.get("ce", {}).get("ltp", 0.0) + atm_row.get("pe", {}).get("ltp", 0.0)) if atm_row else 0.0

        expected_move = OpenInterestAnalyzer.calculate_expected_move(spot, atm_iv, days_to_expiry, atm_straddle)

        raw_chain["strikes"] = strikes_data
        raw_chain["chain"] = strikes_data
        raw_chain["max_pain"] = max_pain
        raw_chain["pcr"] = pcr_data["pcr_oi"]
        raw_chain["pcr_data"] = pcr_data
        raw_chain["expected_move"] = expected_move
        raw_chain["analytics_timestamp"] = time.time()

        return raw_chain

    async def register_websocket(self, symbol: str, websocket: WebSocket) -> None:
        sym = symbol.upper()
        await websocket.accept()
        if sym not in self._connected_websockets:
            self._connected_websockets[sym] = set()
        self._connected_websockets[sym].add(websocket)

    def unregister_websocket(self, symbol: str, websocket: WebSocket) -> None:
        sym = symbol.upper()
        if sym in self._connected_websockets:
            self._connected_websockets[sym].discard(websocket)

    async def broadcast_chain_update(self, symbol: str, chain_payload: Dict[str, Any]) -> None:
        """Broadcasts real-time options chain payload to symbol subscribers."""
        sym = symbol.upper()
        sockets = self._connected_websockets.get(sym)
        if not sockets:
            return

        import orjson
        msg = orjson.dumps({
            "type": "OPTIONS_CHAIN_UPDATE",
            "symbol": sym,
            "data": chain_payload,
            "timestamp": time.time(),
        }).decode("utf-8")

        dead = []
        for ws in sockets:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)

        for ws in dead:
            sockets.discard(ws)


# Singleton options chain service
options_chain_service = OptionsChainService()
