"""
ALGO ROBOT — Central Pre-Trade Risk Service
Orchestrates pre-trade order validation, database settings synchronization,
and real-time WebSocket alert broadcasting for risk management.
"""

from __future__ import annotations
import asyncio
import logging
import time
from typing import Any, Dict, List, Optional, Set
from fastapi import WebSocket, WebSocketDisconnect

from app.risk.pre_trade_validator import PreTradeRiskValidator, ProposedOrder, OrderRiskValidationResult
from app.risk.kill_switch import KillSwitchManager, kill_switch_manager, KillSwitchEvent
from app.risk.portfolio_risk_manager import PortfolioRiskManager, portfolio_risk_manager
from app.db.session import SessionLocal
from app.db.models import RiskSetting

logger = logging.getLogger("algo_robot.risk.service")


class RiskService:
    """Central orchestrator for pre-trade risk controls and circuit breakers."""

    def __init__(self):
        self.validator = PreTradeRiskValidator()
        self.kill_switch = kill_switch_manager
        self.portfolio_risk = portfolio_risk_manager
        self._connected_websockets: Set[WebSocket] = set()

        # Listen to kill-switch events and broadcast immediately
        self.kill_switch.register_listener(self._on_kill_switch_event)

    def validate_proposed_order(self, order: ProposedOrder, current_ltp: float) -> OrderRiskValidationResult:
        """Runs the complete suite of pre-trade risk validations on a proposed order."""
        status = self.portfolio_risk.get_portfolio_risk_status()
        sym = order.symbol.upper()

        current_inst_exp = status["stock_exposures_pct"].get(sym, 0.0)
        current_sec_exp = status["sector_exposures_pct"].get(order.sector or "DIVERSIFIED", 0.0)

        result = self.validator.validate_order(
            order=order,
            current_ltp=current_ltp,
            portfolio_equity=status["portfolio_equity"],
            available_margin=status["available_margin"],
            current_daily_pnl=status["total_daily_pnl"],
            open_positions_count=status["open_positions_count"],
            current_instrument_exposure=current_inst_exp,
            current_sector_exposure=current_sec_exp,
            max_daily_loss=status["max_daily_loss"],
            is_kill_switch_active=status["is_kill_switch_active"],
            circuit_breaker_triggered=(self.kill_switch.state.value == "CIRCUIT_BREAKER_TRIGGERED"),
        )

        return result

    def get_risk_settings(self) -> Dict[str, Any]:
        """Returns active risk parameters from memory and DB."""
        status = self.portfolio_risk.get_portfolio_risk_status()
        return {
            "max_daily_loss": status["max_daily_loss"],
            "max_capital_per_trade": 50000.0,
            "max_open_positions": 5,
            "max_order_quantity_limit": 1800,
            "max_single_stock_pct": self.portfolio_risk.max_single_stock_pct,
            "max_sector_pct": self.portfolio_risk.max_sector_pct,
            "is_kill_switch_active": status["is_kill_switch_active"],
            "kill_switch_state": status["kill_switch_state"],
            "portfolio_equity": status["portfolio_equity"],
            "available_margin": status["available_margin"],
            "current_daily_pnl": status["total_daily_pnl"],
            "daily_loss_consumed_pct": status["daily_loss_consumed_pct"],
        }

    def update_risk_settings(
        self,
        max_daily_loss: Optional[float] = None,
        max_single_stock_pct: Optional[float] = None,
        max_sector_pct: Optional[float] = None,
        portfolio_equity: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Updates in-memory risk settings and persists to SQLAlchemy DB."""
        self.portfolio_risk.set_risk_limits(
            portfolio_equity=portfolio_equity,
            max_daily_loss=max_daily_loss,
            max_single_stock_pct=max_single_stock_pct,
            max_sector_pct=max_sector_pct,
        )

        # Sync to DB
        def _db_task():
            db = SessionLocal()
            try:
                rec = db.query(RiskSetting).first()
                if not rec:
                    rec = RiskSetting(user_id=1)
                    db.add(rec)
                if max_daily_loss is not None:
                    rec.max_daily_loss = float(max_daily_loss)
                db.commit()
            except Exception as e:
                db.rollback()
                logger.debug("Failed saving RiskSetting to DB: %s", e)
            finally:
                db.close()

        import threading
        threading.Thread(target=_db_task, daemon=True, name="risk_db_writer").start()

        return self.get_risk_settings()

    async def register_websocket(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connected_websockets.add(websocket)

    def unregister_websocket(self, websocket: WebSocket) -> None:
        self._connected_websockets.discard(websocket)

    def _on_kill_switch_event(self, event: KillSwitchEvent) -> None:
        """Handles kill-switch event and schedules WebSocket broadcast."""
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self._broadcast_risk_event(event.to_dict()))
        except RuntimeError:
            pass
        except Exception as e:
            logger.debug("Could not schedule risk broadcast: %s", e)

    async def _broadcast_risk_event(self, data: Dict[str, Any]) -> None:
        import orjson
        msg = orjson.dumps({
            "type": "RISK_ALERT",
            "data": data,
            "timestamp": time.time(),
        }).decode("utf-8")

        dead = []
        for ws in self._connected_websockets:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connected_websockets.discard(ws)


# Singleton risk service
risk_service = RiskService()

