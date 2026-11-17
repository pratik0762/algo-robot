"""
ALGO ROBOT — Multi-Timeframe Historical Data Engine
Manages historical candle storage, gap detection, and multi-timeframe aggregation
across: 1s, 1m, 3m, 5m, 10m, 15m, 30m, 1h, 2h, 4h, 1d, 1w, 1M.
Enforces session-boundary isolation in Asia/Kolkata timezone.
"""

from __future__ import annotations
import logging
from datetime import datetime, date, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc

from app.db.models import MarketCandle, Instrument, DataAuthenticityStatus
from app.db.session import SessionLocal
from app.market_data.exchange_calendar import exchange_calendar, IST
from app.market_data.data_quality_service import data_quality_engine

logger = logging.getLogger("algo_robot.market_data.historical")

# Standard supported timeframe definitions in minutes (or special identifiers)
TIMEFRAME_MINUTES: Dict[str, int] = {
    "1m": 1,
    "3m": 3,
    "5m": 5,
    "10m": 10,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "2h": 120,
    "4h": 240,
    "1d": 375, # 375 minutes per standard NSE trading session (09:15 to 15:30)
}


class HistoricalDataService:
    """Historical candle management, multi-timeframe aggregation, and gap recovery."""

    def __init__(self):
        pass

    def get_candles(
        self,
        instrument_id: int,
        timeframe: str = "1d",
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 500,
        db: Optional[Session] = None,
    ) -> List[Dict[str, Any]]:
        """Queries stored candles for the instrument and timeframe."""
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            tf = timeframe.lower()
            query = db.query(MarketCandle).filter(
                MarketCandle.instrument_id == instrument_id,
                MarketCandle.timeframe == tf,
            )
            if start_time:
                query = query.filter(MarketCandle.timestamp >= start_time)
            if end_time:
                query = query.filter(MarketCandle.timestamp <= end_time)

            candles = query.order_by(asc(MarketCandle.timestamp)).limit(limit).all()

            # If requested higher timeframe has no stored candles, derive dynamically from 1m/5m
            if not candles and tf in ("5m", "15m", "1h", "1d"):
                candles_derived = self._derive_higher_timeframe_candles(
                    db=db,
                    instrument_id=instrument_id,
                    target_timeframe=tf,
                    limit=limit,
                )
                if candles_derived:
                    return candles_derived

            return [
                {
                    "timestamp": c.timestamp.isoformat(),
                    "open": c.open,
                    "high": c.high,
                    "low": c.low,
                    "close": c.close,
                    "volume": c.volume,
                    "turnover": c.turnover,
                    "vwap": c.vwap,
                    "timeframe": c.timeframe,
                    "data_status": c.data_status.value if hasattr(c.data_status, "value") else str(c.data_status),
                }
                for c in candles
            ]
        finally:
            if close_db:
                db.close()

    def save_candles(
        self,
        instrument_id: int,
        candles_data: List[Dict[str, Any]],
        timeframe: str = "1d",
        source: str = "HISTORICAL_BACKFILL",
        db: Optional[Session] = None,
    ) -> int:
        """Validates and persists a batch of OHLCV candles with duplicate avoidance."""
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        saved_count = 0
        try:
            tf = timeframe.lower()
            for cd in candles_data:
                ts = cd["timestamp"]
                if isinstance(ts, str):
                    ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))

                # Validate candle mathematical invariants
                is_valid, errors = data_quality_engine.validate_candle(
                    open_px=cd["open"],
                    high_px=cd["high"],
                    low_px=cd["low"],
                    close_px=cd["close"],
                    volume=cd.get("volume", 0.0),
                    timestamp=ts,
                )
                if not is_valid:
                    logger.debug("Skipping invalid candle: %s", errors)
                    continue

                # Check if candle already exists
                existing = db.query(MarketCandle).filter(
                    MarketCandle.instrument_id == instrument_id,
                    MarketCandle.timeframe == tf,
                    MarketCandle.timestamp == ts,
                ).first()

                if existing:
                    # Update existing record
                    existing.open = cd["open"]
                    existing.high = cd["high"]
                    existing.low = cd["low"]
                    existing.close = cd["close"]
                    existing.volume = cd.get("volume", existing.volume)
                    existing.turnover = cd.get("turnover", existing.turnover)
                    existing.vwap = cd.get("vwap", existing.vwap)
                    saved_count += 1
                else:
                    new_candle = MarketCandle(
                        instrument_id=instrument_id,
                        timeframe=tf,
                        timestamp=ts,
                        open=cd["open"],
                        high=cd["high"],
                        low=cd["low"],
                        close=cd["close"],
                        volume=cd.get("volume", 0.0),
                        turnover=cd.get("turnover", 0.0),
                        trade_count=cd.get("trade_count", 0),
                        vwap=cd.get("vwap", (cd["high"] + cd["low"] + cd["close"]) / 3.0),
                        source=source,
                        data_status=DataAuthenticityStatus.HISTORICAL,
                    )
                    db.add(new_candle)
                    saved_count += 1

            db.commit()
        except Exception as e:
            db.rollback()
            logger.error("Error saving historical candles: %s", e)
            raise e
        finally:
            if close_db:
                db.close()

        return saved_count

    def _derive_higher_timeframe_candles(
        self,
        db: Session,
        instrument_id: int,
        target_timeframe: str,
        limit: int = 500,
    ) -> List[Dict[str, Any]]:
        """
        Derives higher timeframe bars (e.g. 5m, 15m, 1h) from base 1m or 5m candles.
        Respects Asia/Kolkata session boundaries without cross-day bleeding.
        """
        target_mins = TIMEFRAME_MINUTES.get(target_timeframe)
        if not target_mins or target_mins <= 1:
            return []

        # Find finest available lower timeframe
        base_tf = "1m"
        base_count = db.query(MarketCandle).filter(
            MarketCandle.instrument_id == instrument_id,
            MarketCandle.timeframe == base_tf,
        ).count()

        if base_count == 0:
            base_tf = "5m"
            if target_mins < 5:
                return []

        base_candles = db.query(MarketCandle).filter(
            MarketCandle.instrument_id == instrument_id,
            MarketCandle.timeframe == base_tf,
        ).order_by(asc(MarketCandle.timestamp)).all()

        if not base_candles:
            return []

        # Bucket by snapped boundary
        buckets: Dict[datetime, List[MarketCandle]] = {}
        for c in base_candles:
            snapped = exchange_calendar.snap_to_candle_boundary(c.timestamp, target_mins)
            if snapped not in buckets:
                buckets[snapped] = []
            buckets[snapped].append(c)

        derived = []
        for bucket_time in sorted(buckets.keys()):
            items = buckets[bucket_time]
            o = items[0].open
            h = max(item.high for item in items)
            l = min(item.low for item in items)
            c = items[-1].close
            v = sum(item.volume for item in items)
            to = sum(item.turnover for item in items)
            vwap = (to / v) if v > 0 else (h + l + c) / 3.0

            derived.append({
                "timestamp": bucket_time.isoformat(),
                "open": o,
                "high": h,
                "low": l,
                "close": c,
                "volume": v,
                "turnover": to,
                "vwap": round(vwap, 2),
                "timeframe": target_timeframe,
                "data_status": DataAuthenticityStatus.HISTORICAL.value,
            })

        return derived[-limit:]


historical_data_service = HistoricalDataService()
