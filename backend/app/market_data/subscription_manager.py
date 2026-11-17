"""
ALGO ROBOT — 5-Tier Market Data Subscription Manager
Guarantees strict compliance with broker WebSocket token limits.
Allocates streaming bandwidth intelligently across:
1. EOD Tier (All 6,000+ equities)
2. On-Demand Tier (Active user view)
3. Watchlist Tier (Highest priority user watchlists, max 200)
4. Scanner Tier (Active algorithmic screener candidates, max 500)
5. Live Execution Tier (Open positions & working orders)
"""

from __future__ import annotations
import logging
import threading
import time
from typing import Any, Dict, List, Optional, Set
from sqlalchemy.orm import Session

from app.db.models import DataSubscriptionStatus, Instrument, SubscriptionTier
from app.db.session import SessionLocal

logger = logging.getLogger("algo_robot.market_data.subscription")


class SubscriptionManager:
    """Manages active live streaming tokens without exceeding provider capacities."""

    def __init__(self, max_live_quota: int = 1000):
        self._lock = threading.RLock()
        self.max_live_quota = max_live_quota
        self.active_live_tokens: Set[str] = set()

        # In-memory tier buckets: token -> tier
        self._token_tiers: Dict[str, SubscriptionTier] = {}
        self._token_subscribers: Dict[str, int] = {} # token -> active client count
        self._last_accessed: Dict[str, float] = {}

    def request_subscription(self, instrument_token: str, tier: SubscriptionTier = SubscriptionTier.ON_DEMAND) -> bool:
        """
        Requests streaming for an instrument token under the given tier.
        Returns True if granted within quota limits; False if quota is full.
        """
        with self._lock:
            token = str(instrument_token)
            self._last_accessed[token] = time.time()
            self._token_subscribers[token] = self._token_subscribers.get(token, 0) + 1

            # If already streaming, elevate tier if requested higher
            if token in self.active_live_tokens:
                curr = self._token_tiers.get(token, SubscriptionTier.ON_DEMAND)
                if self._tier_priority(tier) > self._tier_priority(curr):
                    self._token_tiers[token] = tier
                return True

            # If within capacity, admit immediately
            if len(self.active_live_tokens) < self.max_live_quota:
                self.active_live_tokens.add(token)
                self._token_tiers[token] = tier
                return True

            # If quota is saturated, evict least recently accessed ON_DEMAND token
            evicted = self._try_evict_low_priority_token()
            if evicted:
                self.active_live_tokens.add(token)
                self._token_tiers[token] = tier
                logger.info("Evicted low-priority token %s to admit %s (%s)", evicted, token, tier.value)
                return True

            logger.warning("Subscription limit (%d) reached. Rejected live token: %s", self.max_live_quota, token)
            return False

    def release_subscription(self, instrument_token: str) -> None:
        """Releases client interest; removes from active stream if no subscribers remain."""
        with self._lock:
            token = str(instrument_token)
            if token in self._token_subscribers:
                self._token_subscribers[token] = max(0, self._token_subscribers[token] - 1)
                # If zero subscribers and not a permanent WATCHLIST/LIVE tier, mark for eviction
                if self._token_subscribers[token] == 0:
                    tier = self._token_tiers.get(token, SubscriptionTier.ON_DEMAND)
                    if tier in (SubscriptionTier.ON_DEMAND, SubscriptionTier.EOD):
                        self.active_live_tokens.discard(token)
                        self._token_tiers.pop(token, None)

    def is_subscribed_live(self, instrument_token: str) -> bool:
        with self._lock:
            return str(instrument_token) in self.active_live_tokens

    def get_subscription_summary(self) -> Dict[str, Any]:
        with self._lock:
            tier_counts = {tier.value: 0 for tier in SubscriptionTier}
            for t in self._token_tiers.values():
                tier_counts[t.value] = tier_counts.get(t.value, 0) + 1

            return {
                "active_live_count": len(self.active_live_tokens),
                "max_live_quota": self.max_live_quota,
                "available_quota": max(0, self.max_live_quota - len(self.active_live_tokens)),
                "tier_breakdown": tier_counts,
            }

    def _tier_priority(self, tier: SubscriptionTier) -> int:
        priorities = {
            SubscriptionTier.LIVE: 5,
            SubscriptionTier.WATCHLIST: 4,
            SubscriptionTier.SCANNER: 3,
            SubscriptionTier.ON_DEMAND: 2,
            SubscriptionTier.EOD: 1,
        }
        return priorities.get(tier, 1)

    def _try_evict_low_priority_token(self) -> Optional[str]:
        # Candidates for eviction: ON_DEMAND tokens with 0 active subscribers
        candidates = [
            t for t in self.active_live_tokens
            if self._token_tiers.get(t) == SubscriptionTier.ON_DEMAND and self._token_subscribers.get(t, 0) == 0
        ]
        if not candidates:
            # Fallback: lowest priority overall
            candidates = [
                t for t in self.active_live_tokens
                if self._token_tiers.get(t) in (SubscriptionTier.ON_DEMAND, SubscriptionTier.SCANNER)
            ]

        if candidates:
            # Pick oldest accessed
            oldest = min(candidates, key=lambda t: self._last_accessed.get(t, 0.0))
            self.active_live_tokens.discard(oldest)
            self._token_tiers.pop(oldest, None)
            return oldest
        return None


subscription_manager = SubscriptionManager(max_live_quota=1000)
