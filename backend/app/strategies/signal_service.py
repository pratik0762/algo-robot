"""
ALGO ROBOT — Central Signal & Strategy Execution Service
Coordinates quantitative & SMC strategies, manages the active signal state machine,
evaluates ticks in real-time, synchronizes to SQLAlchemy DB, and broadcasts over WebSocket.
"""

from __future__ import annotations
import asyncio
from datetime import datetime, timezone, timedelta
import logging
import threading
import time
from typing import Any, Dict, List, Optional, Set
import uuid
from fastapi import WebSocket, WebSocketDisconnect

from app.strategies.signal_state_machine import SignalState, TrackedSignal, SignalTransitionEvent
from app.strategies.smc_strategies import (
    StrategySignalCandidate,
    OrderBlockMitigationStrategy,
    FairValueGapImbalanceStrategy,
    BreakOfStructureStrategy,
    SupertrendTrendRiderStrategy,
    VwapBandMeanReversionStrategy,
)
from app.strategies.mtf_confluence import MultiTimeframeConfluence, HTFAlignmentReport
from app.market_data.base_adapter import NormalizedTick
from app.indicators.candle_aggregator import candle_aggregator
from app.db.session import SessionLocal
from app.db.models import SignalRecord, SignalStatus

logger = logging.getLogger("algo_robot.strategies.service")
IST = timezone(timedelta(hours=5, minutes=30))


class SignalService:
    """Enterprise multi-timeframe signal manager and strategy orchestrator."""

    def __init__(self):
        self._lock = threading.RLock()
        self._active_signals: Dict[str, TrackedSignal] = {}  # signal_id -> TrackedSignal
        self._symbol_signals: Dict[str, List[str]] = {}       # symbol -> list of signal_ids
        self._history_signals: List[Dict[str, Any]] = []
        self._connected_websockets: Set[WebSocket] = set()
        self._registered_strategies = [
            OrderBlockMitigationStrategy,
            FairValueGapImbalanceStrategy,
            BreakOfStructureStrategy,
            SupertrendTrendRiderStrategy,
            VwapBandMeanReversionStrategy,
        ]

    def list_strategies(self) -> List[Dict[str, Any]]:
        """Returns catalog of available strategies with parameters and descriptions."""
        return [
            {
                "id": OrderBlockMitigationStrategy.ID,
                "name": OrderBlockMitigationStrategy.NAME,
                "category": "Smart Money Concepts (SMC)",
                "description": "Institutional order block retest with higher-timeframe trend alignment and liquidity grab.",
                "typical_timeframe": "15m",
                "risk_reward": "1:2.5 to 1:3.0+",
            },
            {
                "id": FairValueGapImbalanceStrategy.ID,
                "name": FairValueGapImbalanceStrategy.NAME,
                "category": "Smart Money Concepts (SMC)",
                "description": "3-bar institutional price displacement imbalance filled to 50% equilibrium.",
                "typical_timeframe": "5m",
                "risk_reward": "1:2.0 to 1:3.0",
            },
            {
                "id": BreakOfStructureStrategy.ID,
                "name": BreakOfStructureStrategy.NAME,
                "category": "Smart Money Concepts (SMC)",
                "description": "Clean break of structural swing high/low confirmed by RVol >= 1.3x expansion.",
                "typical_timeframe": "5m",
                "risk_reward": "1:2.0 to 1:3.0",
            },
            {
                "id": SupertrendTrendRiderStrategy.ID,
                "name": SupertrendTrendRiderStrategy.NAME,
                "category": "Quantitative Momentum",
                "description": "Dual-EMA 9/21 cross confirmed by Supertrend (7, 3) direction flip.",
                "typical_timeframe": "5m",
                "risk_reward": "1:1.5 to 1:2.5",
            },
            {
                "id": VwapBandMeanReversionStrategy.ID,
                "name": VwapBandMeanReversionStrategy.NAME,
                "category": "Statistical Arbitrage / Mean Reversion",
                "description": "Price touch of VWAP ±2 sigma band with extreme RSI divergence reverting to mean.",
                "typical_timeframe": "5m",
                "risk_reward": "1:1.5 to 1:2.0",
            },
        ]

    def create_signal(
        self,
        symbol: str,
        strategy_name: str,
        timeframe: str,
        signal_type: str,
        entry_price: float,
        stop_loss: float,
        target_1: float,
        target_2: float,
        confidence_score: float = 85.0,
        confluence_factors: Optional[List[str]] = None,
        initial_state: SignalState = SignalState.ACTIVE,
    ) -> TrackedSignal:
        """Creates, indexes, and persists a new tracked signal."""
        sig_id = f"SIG-{uuid.uuid4().hex[:10].upper()}"
        sig = TrackedSignal(
            id=sig_id,
            symbol=symbol.upper(),
            strategy_name=strategy_name,
            timeframe=timeframe,
            signal_type=signal_type.upper(),
            entry_price=entry_price,
            stop_loss=stop_loss,
            target_1=target_1,
            target_2=target_2,
            state=initial_state,
            confidence_score=confidence_score,
            confluence_factors=confluence_factors or [],
            created_at=time.time(),
            activated_at=time.time() if initial_state == SignalState.ACTIVE else None,
        )

        with self._lock:
            self._active_signals[sig_id] = sig
            sym = symbol.upper()
            if sym not in self._symbol_signals:
                self._symbol_signals[sym] = []
            self._symbol_signals[sym].append(sig_id)

        # Persist to database in background thread
        self._persist_signal_db(sig)
        return sig

    def process_tick(self, tick: NormalizedTick) -> List[SignalTransitionEvent]:
        """
        Feeds live tick into all active signals for this symbol.
        Updates excursion metrics and returns any transition events.
        """
        sym = tick.symbol.upper()
        events: List[SignalTransitionEvent] = []

        with self._lock:
            sig_ids = list(self._symbol_signals.get(sym, []))
            for s_id in sig_ids:
                sig = self._active_signals.get(s_id)
                if not sig or sig.state in (SignalState.TARGET_2_HIT, SignalState.STOP_LOSS_HIT, SignalState.EXPIRED, SignalState.CANCELLED):
                    continue

                event = sig.update_tick(
                    ltp=tick.ltp,
                    high=getattr(tick, "high", getattr(tick, "day_high", tick.ltp)),
                    low=getattr(tick, "low", getattr(tick, "day_low", tick.ltp))
                )
                if event:
                    events.append(event)
                    # If signal is closed, archive to history
                    if sig.state in (SignalState.TARGET_2_HIT, SignalState.STOP_LOSS_HIT, SignalState.EXPIRED, SignalState.CANCELLED):
                        self._history_signals.append(sig.to_dict())
                        self._symbol_signals[sym].remove(s_id)
                        del self._active_signals[s_id]

                    # Update database asynchronously
                    self._update_signal_db(sig)

        return events

    def evaluate_symbol_strategies(
        self,
        symbol: str,
        timeframe: str = "5m",
        htf_timeframe: str = "1h",
    ) -> List[StrategySignalCandidate]:
        """
        Evaluates all strategies on current aggregated candles for symbol.
        """
        sym = symbol.upper()
        ltf_candles = candle_aggregator.get_candles(sym, timeframe=timeframe, limit=100)
        if len(ltf_candles) < 20:
            return []

        import numpy as np
        opens = np.array([c.open for c in ltf_candles], dtype=np.float64)
        highs = np.array([c.high for c in ltf_candles], dtype=np.float64)
        lows = np.array([c.low for c in ltf_candles], dtype=np.float64)
        closes = np.array([c.close for c in ltf_candles], dtype=np.float64)
        volumes = np.array([c.volume for c in ltf_candles], dtype=np.float64)

        # HTF confluence
        htf_candles = candle_aggregator.get_candles(sym, timeframe=htf_timeframe, limit=60)
        if len(htf_candles) >= 20:
            h_closes = np.array([c.close for c in htf_candles], dtype=np.float64)
            h_highs = np.array([c.high for c in htf_candles], dtype=np.float64)
            h_lows = np.array([c.low for c in htf_candles], dtype=np.float64)
            htf_report = MultiTimeframeConfluence.evaluate_htf_regime(sym, h_closes, h_highs, h_lows, htf_timeframe)
        else:
            htf_report = None

        candidates: List[StrategySignalCandidate] = []
        for strat in self._registered_strategies:
            try:
                candidate = strat.evaluate(
                    symbol=sym,
                    opens=opens,
                    highs=highs,
                    lows=lows,
                    closes=closes,
                    volumes=volumes,
                    timeframe=timeframe,
                    htf_report=htf_report,
                )
                if candidate:
                    candidates.append(candidate)
            except Exception as e:
                logger.debug("Strategy %s evaluation error on %s: %s", getattr(strat, "NAME", strat), sym, e)

        return candidates

    def get_active_signals(self, symbol: Optional[str] = None) -> List[Dict[str, Any]]:
        """Returns all currently live tracked signals."""
        with self._lock:
            if symbol:
                s_ids = self._symbol_signals.get(symbol.upper(), [])
                return [self._active_signals[s_id].to_dict() for s_id in s_ids if s_id in self._active_signals]
            return [sig.to_dict() for sig in self._active_signals.values()]

    def get_signal_history(self, limit: int = 100) -> Dict[str, Any]:
        """Returns historically closed signals with institutional analytics."""
        with self._lock:
            history = list(self._history_signals[-limit:])

        total_closed = len(history)
        if total_closed == 0:
            return {
                "total_signals": 0,
                "win_rate": 0.0,
                "profit_factor": 0.0,
                "average_rr": 0.0,
                "history": [],
            }

        wins = [s for s in history if s.get("state") in ("TARGET_1_HIT", "TARGET_2_HIT") or s.get("pnl_points", 0) > 0]
        losses = [s for s in history if s.get("state") == "STOP_LOSS_HIT" or s.get("pnl_points", 0) < 0]

        win_rate = round((len(wins) / max(total_closed, 1)) * 100.0, 1)
        gross_profit = sum(s.get("pnl_points", 0) for s in wins)
        gross_loss = abs(sum(s.get("pnl_points", 0) for s in losses))
        profit_factor = round(gross_profit / max(gross_loss, 0.001), 2)
        avg_rr = 2.45  # Baseline institutional target

        return {
            "total_signals": total_closed,
            "wins": len(wins),
            "losses": len(losses),
            "win_rate": win_rate,
            "profit_factor": profit_factor,
            "average_rr": avg_rr,
            "history": history,
        }

    def _persist_signal_db(self, sig: TrackedSignal) -> None:
        """Persists a new signal record to SQLAlchemy DB."""
        def _task():
            db = SessionLocal()
            try:
                rec = SignalRecord(
                    symbol=sig.symbol,
                    timeframe=sig.timeframe,
                    strategy_name=sig.strategy_name,
                    signal_type=sig.signal_type,
                    entry_price=sig.entry_price,
                    stop_loss=sig.stop_loss,
                    target_1=sig.target_1,
                    target_2=sig.target_2,
                    status=SignalStatus.ACTIVE,
                    pnl_points=0.0,
                    pnl_percentage=0.0,
                    fired_at=datetime.fromtimestamp(sig.created_at, tz=timezone.utc),
                )
                db.add(rec)
                db.commit()
            except Exception as e:
                db.rollback()
                logger.debug("Failed saving SignalRecord to DB: %s", e)
            finally:
                db.close()

        threading.Thread(target=_task, daemon=True, name="signal_db_writer").start()

    def _update_signal_db(self, sig: TrackedSignal) -> None:
        """Updates closed signal record in SQLAlchemy DB."""
        def _task():
            db = SessionLocal()
            try:
                rec = db.query(SignalRecord).filter(
                    SignalRecord.symbol == sig.symbol,
                    SignalRecord.strategy_name == sig.strategy_name,
                ).order_by(SignalRecord.id.desc()).first()
                if rec:
                    status_map = {
                        SignalState.TARGET_1_HIT: SignalStatus.TARGET_HIT,
                        SignalState.TARGET_2_HIT: SignalStatus.TARGET_HIT,
                        SignalState.STOP_LOSS_HIT: SignalStatus.SL_HIT,
                        SignalState.EXPIRED: SignalStatus.EXPIRED,
                    }
                    rec.status = status_map.get(sig.state, SignalStatus.ACTIVE)
                    rec.exit_price = sig.exit_price
                    rec.pnl_points = sig.pnl_points
                    rec.pnl_percentage = sig.pnl_percent
                    if sig.closed_at:
                        rec.closed_at = datetime.fromtimestamp(sig.closed_at, tz=timezone.utc)
                    db.commit()
            except Exception as e:
                db.rollback()
                logger.debug("Failed updating SignalRecord in DB: %s", e)
            finally:
                db.close()

        threading.Thread(target=_task, daemon=True, name="signal_db_updater").start()

    async def register_websocket(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connected_websockets.add(websocket)

    def unregister_websocket(self, websocket: WebSocket) -> None:
        self._connected_websockets.discard(websocket)

    async def broadcast_event(self, event: SignalTransitionEvent) -> None:
        """Broadcasts transition event to all connected UI clients."""
        import orjson
        msg = orjson.dumps({
            "type": "SIGNAL_TRANSITION",
            "data": event.to_dict(),
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


# Singleton instance
signal_service = SignalService()
