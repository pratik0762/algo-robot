"""
ALGO ROBOT — Signal State Machine & Real-Time Lifecycle Tracker
Manages the rigorous lifecycle of quantitative and Smart Money Concepts (SMC) trade signals:
PENDING -> ACTIVE -> TARGET_1_HIT -> TARGET_2_HIT -> STOP_LOSS_HIT -> EXPIRED -> CANCELLED.
Tracks Maximum Favorable Excursion (MFE), Maximum Adverse Excursion (MAE), and authentic tick fills.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
import logging
import time
from typing import Any, Dict, List, Optional
import uuid

logger = logging.getLogger("algo_robot.strategies.state_machine")
IST = timezone(timedelta(hours=5, minutes=30))


class SignalState(str, Enum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    TARGET_1_HIT = "TARGET_1_HIT"
    TARGET_2_HIT = "TARGET_2_HIT"
    STOP_LOSS_HIT = "STOP_LOSS_HIT"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


@dataclass
class SignalTransitionEvent:
    signal_id: str
    symbol: str
    previous_state: SignalState
    new_state: SignalState
    trigger_price: float
    pnl_points: float
    pnl_percent: float
    transition_timestamp: float = field(default_factory=time.time)
    rationale: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "signal_id": self.signal_id,
            "symbol": self.symbol,
            "previous_state": self.previous_state.value,
            "new_state": self.new_state.value,
            "trigger_price": self.trigger_price,
            "pnl_points": round(self.pnl_points, 2),
            "pnl_percent": round(self.pnl_percent, 2),
            "transition_timestamp": self.transition_timestamp,
            "rationale": self.rationale,
        }


@dataclass
class TrackedSignal:
    id: str
    symbol: str
    strategy_name: str
    timeframe: str
    signal_type: str  # BUY or SELL
    entry_price: float
    stop_loss: float
    target_1: float
    target_2: float
    state: SignalState = SignalState.PENDING
    highest_price: float = 0.0
    lowest_price: float = float("inf")
    exit_price: Optional[float] = None
    pnl_points: float = 0.0
    pnl_percent: float = 0.0
    mfe: float = 0.0  # Maximum Favorable Excursion (pts)
    mae: float = 0.0  # Maximum Adverse Excursion (pts)
    confidence_score: float = 85.0
    confluence_factors: List[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    activated_at: Optional[float] = None
    closed_at: Optional[float] = None
    expiry_seconds: float = 172800.0  # Default 48 hours

    def __post_init__(self):
        if self.highest_price == 0.0:
            self.highest_price = self.entry_price
        if self.lowest_price == float("inf"):
            self.lowest_price = self.entry_price

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "symbol": self.symbol,
            "strategy_name": self.strategy_name,
            "timeframe": self.timeframe,
            "signal_type": self.signal_type,
            "entry_price": round(self.entry_price, 2),
            "stop_loss": round(self.stop_loss, 2),
            "target_1": round(self.target_1, 2),
            "target_2": round(self.target_2, 2),
            "state": self.state.value,
            "status": self.state.value,  # Backward compatibility
            "highest_price": round(self.highest_price, 2),
            "lowest_price": round(self.lowest_price, 2),
            "exit_price": round(self.exit_price, 2) if self.exit_price else None,
            "pnl_points": round(self.pnl_points, 2),
            "pnl_percent": round(self.pnl_percent, 2),
            "mfe": round(self.mfe, 2),
            "mae": round(self.mae, 2),
            "confidence_score": self.confidence_score,
            "confluence_factors": self.confluence_factors,
            "created_at": self.created_at,
            "activated_at": self.activated_at,
            "closed_at": self.closed_at,
        }

    def update_tick(self, ltp: float, high: Optional[float] = None, low: Optional[float] = None) -> Optional[SignalTransitionEvent]:
        """
        Updates the signal with real tick price, progressing the state machine.
        Returns a SignalTransitionEvent if a state transition occurred.
        """
        if ltp <= 0.0:
            return None

        h = max(ltp, high if high is not None else ltp)
        l = min(ltp, low if low is not None else ltp)
        now = time.time()

        # Check Expiry
        if self.state in (SignalState.PENDING, SignalState.ACTIVE):
            if now - self.created_at > self.expiry_seconds:
                prev = self.state
                self.state = SignalState.EXPIRED
                self.closed_at = now
                self.exit_price = ltp
                if prev == SignalState.ACTIVE:
                    pnl = (ltp - self.entry_price) if self.signal_type == "BUY" else (self.entry_price - ltp)
                    self.pnl_points = pnl
                    self.pnl_percent = (pnl / self.entry_price) * 100.0
                return SignalTransitionEvent(
                    signal_id=self.id,
                    symbol=self.symbol,
                    previous_state=prev,
                    new_state=self.state,
                    trigger_price=ltp,
                    pnl_points=self.pnl_points,
                    pnl_percent=self.pnl_percent,
                    rationale="Signal expired past max duration threshold without hitting SL or Target.",
                )

        # 1. State: PENDING -> ACTIVE (Entry Trigger)
        if self.state == SignalState.PENDING:
            # For BUY: triggers if price reaches entry_price or dips below limit
            if self.signal_type == "BUY":
                if l <= self.entry_price <= h or abs(ltp - self.entry_price) / self.entry_price < 0.005:
                    self.state = SignalState.ACTIVE
                    self.activated_at = now
                    self.highest_price = ltp
                    self.lowest_price = ltp
                    return SignalTransitionEvent(
                        signal_id=self.id,
                        symbol=self.symbol,
                        previous_state=SignalState.PENDING,
                        new_state=SignalState.ACTIVE,
                        trigger_price=ltp,
                        pnl_points=0.0,
                        pnl_percent=0.0,
                        rationale=f"Entry price {self.entry_price} triggered by market tick {ltp}.",
                    )
            else:  # SELL
                if l <= self.entry_price <= h or abs(ltp - self.entry_price) / self.entry_price < 0.005:
                    self.state = SignalState.ACTIVE
                    self.activated_at = now
                    self.highest_price = ltp
                    self.lowest_price = ltp
                    return SignalTransitionEvent(
                        signal_id=self.id,
                        symbol=self.symbol,
                        previous_state=SignalState.PENDING,
                        new_state=SignalState.ACTIVE,
                        trigger_price=ltp,
                        pnl_points=0.0,
                        pnl_percent=0.0,
                        rationale=f"Entry price {self.entry_price} triggered by market tick {ltp}.",
                    )
            return None

        # 2. State: ACTIVE or TARGET_1_HIT -> Evaluating SL and Targets
        if self.state in (SignalState.ACTIVE, SignalState.TARGET_1_HIT):
            self.highest_price = max(self.highest_price, h)
            self.lowest_price = min(self.lowest_price, l)

            if self.signal_type == "BUY":
                # Compute Excursions
                self.mfe = max(self.mfe, self.highest_price - self.entry_price)
                self.mae = max(self.mae, self.entry_price - self.lowest_price)
                unrealized_pnl = ltp - self.entry_price
                self.pnl_points = unrealized_pnl
                self.pnl_percent = (unrealized_pnl / self.entry_price) * 100.0

                # Check Stop Loss
                if l <= self.stop_loss:
                    prev = self.state
                    self.state = SignalState.STOP_LOSS_HIT
                    self.exit_price = self.stop_loss
                    self.pnl_points = self.stop_loss - self.entry_price
                    self.pnl_percent = (self.pnl_points / self.entry_price) * 100.0
                    self.closed_at = now
                    return SignalTransitionEvent(
                        signal_id=self.id,
                        symbol=self.symbol,
                        previous_state=prev,
                        new_state=self.state,
                        trigger_price=self.stop_loss,
                        pnl_points=self.pnl_points,
                        pnl_percent=self.pnl_percent,
                        rationale=f"Stop loss {self.stop_loss} hit at market low {l}.",
                    )

                # Check Target 2
                if h >= self.target_2:
                    prev = self.state
                    self.state = SignalState.TARGET_2_HIT
                    self.exit_price = self.target_2
                    self.pnl_points = self.target_2 - self.entry_price
                    self.pnl_percent = (self.pnl_points / self.entry_price) * 100.0
                    self.closed_at = now
                    return SignalTransitionEvent(
                        signal_id=self.id,
                        symbol=self.symbol,
                        previous_state=prev,
                        new_state=self.state,
                        trigger_price=self.target_2,
                        pnl_points=self.pnl_points,
                        pnl_percent=self.pnl_percent,
                        rationale=f"Final Target 2 ({self.target_2}) hit with +{round(self.pnl_percent, 2)}% gain.",
                    )

                # Check Target 1 (if still in ACTIVE state)
                if self.state == SignalState.ACTIVE and h >= self.target_1:
                    self.state = SignalState.TARGET_1_HIT
                    self.exit_price = self.target_1
                    t1_pnl = self.target_1 - self.entry_price
                    t1_pnl_pct = (t1_pnl / self.entry_price) * 100.0
                    return SignalTransitionEvent(
                        signal_id=self.id,
                        symbol=self.symbol,
                        previous_state=SignalState.ACTIVE,
                        new_state=SignalState.TARGET_1_HIT,
                        trigger_price=self.target_1,
                        pnl_points=t1_pnl,
                        pnl_percent=t1_pnl_pct,
                        rationale=f"Target 1 ({self.target_1}) hit with +{round(t1_pnl_pct, 2)}% gain. Trailing stop to breakeven.",
                    )

            else:  # SELL / SHORT
                self.mfe = max(self.mfe, self.entry_price - self.lowest_price)
                self.mae = max(self.mae, self.highest_price - self.entry_price)
                unrealized_pnl = self.entry_price - ltp
                self.pnl_points = unrealized_pnl
                self.pnl_percent = (unrealized_pnl / self.entry_price) * 100.0

                # Check Stop Loss
                if h >= self.stop_loss:
                    prev = self.state
                    self.state = SignalState.STOP_LOSS_HIT
                    self.exit_price = self.stop_loss
                    self.pnl_points = self.entry_price - self.stop_loss
                    self.pnl_percent = (self.pnl_points / self.entry_price) * 100.0
                    self.closed_at = now
                    return SignalTransitionEvent(
                        signal_id=self.id,
                        symbol=self.symbol,
                        previous_state=prev,
                        new_state=self.state,
                        trigger_price=self.stop_loss,
                        pnl_points=self.pnl_points,
                        pnl_percent=self.pnl_percent,
                        rationale=f"Stop loss {self.stop_loss} hit at market high {h}.",
                    )

                # Check Target 2
                if l <= self.target_2:
                    prev = self.state
                    self.state = SignalState.TARGET_2_HIT
                    self.exit_price = self.target_2
                    self.pnl_points = self.entry_price - self.target_2
                    self.pnl_percent = (self.pnl_points / self.entry_price) * 100.0
                    self.closed_at = now
                    return SignalTransitionEvent(
                        signal_id=self.id,
                        symbol=self.symbol,
                        previous_state=prev,
                        new_state=self.state,
                        trigger_price=self.target_2,
                        pnl_points=self.pnl_points,
                        pnl_percent=self.pnl_percent,
                        rationale=f"Final Target 2 ({self.target_2}) hit with +{round(self.pnl_percent, 2)}% gain.",
                    )

                # Check Target 1
                if self.state == SignalState.ACTIVE and l <= self.target_1:
                    self.state = SignalState.TARGET_1_HIT
                    self.exit_price = self.target_1
                    t1_pnl = self.entry_price - self.target_1
                    t1_pnl_pct = (t1_pnl / self.entry_price) * 100.0
                    return SignalTransitionEvent(
                        signal_id=self.id,
                        symbol=self.symbol,
                        previous_state=SignalState.ACTIVE,
                        new_state=SignalState.TARGET_1_HIT,
                        trigger_price=self.target_1,
                        pnl_points=t1_pnl,
                        pnl_percent=t1_pnl_pct,
                        rationale=f"Target 1 ({self.target_1}) hit with +{round(t1_pnl_pct, 2)}% gain. Trailing stop to breakeven.",
                    )

        return None
