"""
Multi-Timeframe Strategy & Signal Engine
Phase 6 implementation:
- Signal State Machine (PENDING -> ACTIVE -> TARGET_1_HIT -> TARGET_2_HIT -> STOP_LOSS_HIT -> EXPIRED -> CANCELLED)
- Multi-Timeframe Confluence (HTF 1h/1d Regime & Trend Alignment)
- Institutional Smart Money Concepts (OB Mitigation, FVG Imbalance, BOS) & Quantitative Strategies
- Central SignalService with SQLAlchemy DB persistence & WebSocket broadcast
"""

from app.strategies.signal_state_machine import SignalState, TrackedSignal, SignalTransitionEvent
from app.strategies.mtf_confluence import MultiTimeframeConfluence, HTFAlignmentReport, MarketRegime
from app.strategies.smc_strategies import (
    StrategySignalCandidate,
    OrderBlockMitigationStrategy,
    FairValueGapImbalanceStrategy,
    BreakOfStructureStrategy,
    SupertrendTrendRiderStrategy,
    VwapBandMeanReversionStrategy,
)
from app.strategies.signal_service import SignalService, signal_service

__all__ = [
    "SignalState",
    "TrackedSignal",
    "SignalTransitionEvent",
    "MultiTimeframeConfluence",
    "HTFAlignmentReport",
    "MarketRegime",
    "StrategySignalCandidate",
    "OrderBlockMitigationStrategy",
    "FairValueGapImbalanceStrategy",
    "BreakOfStructureStrategy",
    "SupertrendTrendRiderStrategy",
    "VwapBandMeanReversionStrategy",
    "SignalService",
    "signal_service",
]
