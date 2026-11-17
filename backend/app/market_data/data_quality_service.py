"""
ALGO ROBOT — Central Data Quality & Validation Engine
Validates market data integrity across tick ingestion, OHLCV candle aggregation,
and historical synchronization.
Enforces mathematical, session, and regulatory invariants.
"""

from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.db.models import DataQualityLog
from app.db.session import SessionLocal

logger = logging.getLogger("algo_robot.market_data.quality")


class DataQualityEngine:
    """Rigorous gatekeeper validating mathematical and physical market data invariants."""

    @staticmethod
    def validate_candle(
        open_px: float,
        high_px: float,
        low_px: float,
        close_px: float,
        volume: float,
        timestamp: Optional[datetime] = None,
    ) -> Tuple[bool, List[str]]:
        """
        Validates OHLC mathematical invariants:
        1. Low <= Open <= High
        2. Low <= Close <= High
        3. Low > 0, High > 0
        4. Volume >= 0
        """
        errors: List[str] = []

        if open_px <= 0 or high_px <= 0 or low_px <= 0 or close_px <= 0:
            errors.append("NON_POSITIVE_PRICE: Price components must be strictly positive.")

        if low_px > high_px:
            errors.append(f"INVERTED_RANGE: Low ({low_px}) exceeds High ({high_px}).")

        if not (low_px <= open_px <= high_px):
            errors.append(f"OPEN_OUT_OF_BOUNDS: Open ({open_px}) outside [Low={low_px}, High={high_px}].")

        if not (low_px <= close_px <= high_px):
            errors.append(f"CLOSE_OUT_OF_BOUNDS: Close ({close_px}) outside [Low={low_px}, High={high_px}].")

        if volume < 0:
            errors.append(f"NEGATIVE_VOLUME: Volume ({volume}) cannot be negative.")

        is_valid = len(errors) == 0
        return is_valid, errors

    @staticmethod
    def validate_quote(quote_data: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """Validates real-time quote snapshot invariants."""
        errors: List[str] = []
        ltp = quote_data.get("ltp", 0.0)
        open_px = quote_data.get("open", 0.0)
        high_px = quote_data.get("high", 0.0)
        low_px = quote_data.get("low", 0.0)

        if ltp <= 0:
            errors.append(f"INVALID_LTP: Last Traded Price ({ltp}) must be positive.")

        if high_px > 0 and low_px > 0:
            if low_px > high_px:
                errors.append("HIGH_LOW_INVERTED in quote.")
            if ltp > high_px * 1.05: # >5% above high implies stale high
                errors.append(f"LTP_ABOVE_HIGH: LTP ({ltp}) exceeds High ({high_px}).")
            if ltp < low_px * 0.95:
                errors.append(f"LTP_BELOW_LOW: LTP ({ltp}) below Low ({low_px}).")

        bid = quote_data.get("bid", 0.0)
        ask = quote_data.get("ask", 0.0)
        if bid > 0 and ask > 0 and bid > ask:
            errors.append(f"CROSSED_BOOK: Bid ({bid}) exceeds Ask ({ask}).")

        is_valid = len(errors) == 0
        return is_valid, errors

    @classmethod
    def log_anomaly(cls, instrument_id: int, anomaly_type: str, details: str) -> None:
        """Persists detected data anomaly to data_quality_logs."""
        try:
            with SessionLocal() as db:
                log_entry = DataQualityLog(
                    instrument_id=instrument_id,
                    anomaly_type=anomaly_type,
                    details=details,
                    occurred_at=datetime.now(timezone.utc),
                )
                db.add(log_entry)
                db.commit()
            logger.warning("Data anomaly logged for instrument %d [%s]: %s", instrument_id, anomaly_type, details)
        except Exception as e:
            logger.error("Failed to log data quality anomaly: %s", e)


data_quality_engine = DataQualityEngine()
