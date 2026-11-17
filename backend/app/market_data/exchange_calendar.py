"""
ALGO ROBOT — Indian Market Exchange Calendar & Session Guardian
Enforces strict trading session boundaries, holidays, and bar alignments
strictly in Asia/Kolkata (IST = UTC+05:30).
"""

from __future__ import annotations
from datetime import datetime, date, time as dt_time, timedelta, timezone
from typing import Dict, List, Optional, Tuple
try:
    from zoneinfo import ZoneInfo
    IST = ZoneInfo("Asia/Kolkata")
except ImportError:
    IST = timezone(timedelta(hours=5, minutes=30))

# Standard NSE / BSE official trading session hours
MARKET_OPEN_TIME = dt_time(9, 15, 0)
MARKET_CLOSE_TIME = dt_time(15, 30, 0)
PRE_OPEN_START = dt_time(9, 0, 0)
PRE_OPEN_END = dt_time(9, 8, 0)

# Official NSE & BSE Holidays (Standard Annual Indian Trading Calendar)
OFFICIAL_EXCHANGE_HOLIDAYS_2026: Dict[str, str] = {
    "2026-01-26": "Republic Day",
    "2026-03-03": "Holi",
    "2026-03-20": "Id-Ul-Fitr (Ramzan Id)",
    "2026-04-03": "Good Friday",
    "2026-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
    "2026-05-01": "Maharashtra Day",
    "2026-05-27": "Bakri Id / Eid-ul-Adha",
    "2026-06-26": "Muharram",
    "2026-08-15": "Independence Day",
    "2026-09-04": "Milad-un-Nabi",
    "2026-10-02": "Mahatma Gandhi Jayanti",
    "2026-10-20": "Dussehra",
    "2026-11-08": "Diwali Laxmi Pujan (Muhurat Trading)",
    "2026-11-10": "Diwali Balipratipada",
    "2026-11-24": "Gurunanak Jayanti",
    "2026-12-25": "Christmas",
}


class ExchangeCalendar:
    """Manages trading sessions, holidays, and candle interval boundaries."""

    @staticmethod
    def now_ist() -> datetime:
        """Returns the current wall-clock time in Asia/Kolkata timezone."""
        return datetime.now(IST)

    @staticmethod
    def to_ist(dt: datetime) -> datetime:
        """Converts any naive or UTC datetime to timezone-aware Asia/Kolkata."""
        if dt.tzinfo is None:
            return dt.replace(tzinfo=IST)
        return dt.astimezone(IST)

    @classmethod
    def is_holiday(cls, check_date: date) -> Tuple[bool, Optional[str]]:
        """Checks if a given calendar date is an official exchange holiday."""
        # Check weekends (Saturday=5, Sunday=6)
        if check_date.weekday() >= 5:
            return True, "Weekend (Saturday/Sunday)"

        date_str = check_date.strftime("%Y-%m-%d")
        if date_str in OFFICIAL_EXCHANGE_HOLIDAYS_2026:
            return True, OFFICIAL_EXCHANGE_HOLIDAYS_2026[date_str]

        return False, None

    @classmethod
    def is_trading_session_open(cls, dt: Optional[datetime] = None) -> bool:
        """Checks if the Indian equity regular cash market session is actively open."""
        now = cls.to_ist(dt) if dt else cls.now_ist()
        is_hol, _ = cls.is_holiday(now.date())
        if is_hol:
            return False

        current_time = now.time()
        return MARKET_OPEN_TIME <= current_time <= MARKET_CLOSE_TIME

    @classmethod
    def get_market_session_phase(cls, dt: Optional[datetime] = None) -> str:
        """Returns the granular market phase: PRE_OPEN, REGULAR_OPEN, POST_CLOSE, or CLOSED."""
        now = cls.to_ist(dt) if dt else cls.now_ist()
        is_hol, reason = cls.is_holiday(now.date())
        if is_hol:
            return f"CLOSED ({reason})"

        current_time = now.time()
        if PRE_OPEN_START <= current_time < PRE_OPEN_END:
            return "PRE_OPEN"
        elif PRE_OPEN_END <= current_time < MARKET_OPEN_TIME:
            return "PRE_OPEN_BUFFER"
        elif MARKET_OPEN_TIME <= current_time <= MARKET_CLOSE_TIME:
            return "REGULAR_OPEN"
        elif dt_time(15, 30, 0) < current_time <= dt_time(16, 0, 0):
            return "POST_CLOSE"
        else:
            return "CLOSED"

    @classmethod
    def snap_to_candle_boundary(cls, dt: datetime, timeframe_minutes: int) -> datetime:
        """
        Snaps a datetime within the trading session to the start of the timeframe candle.
        Ensures candles never spill over the 09:15 open or 15:30 close.
        """
        dt_ist = cls.to_ist(dt)
        session_start = dt_ist.replace(hour=9, minute=15, second=0, microsecond=0)
        
        if dt_ist < session_start:
            return session_start

        # Calculate elapsed minutes from session open
        elapsed_minutes = int((dt_ist - session_start).total_seconds() // 60)
        bucket_index = (elapsed_minutes // timeframe_minutes) * timeframe_minutes
        
        candle_start = session_start + timedelta(minutes=bucket_index)
        return candle_start

    @classmethod
    def get_trading_days(cls, start_date: date, end_date: date) -> List[date]:
        """Returns a list of all active trading days between start_date and end_date inclusive."""
        current = start_date
        trading_days = []
        while current <= end_date:
            is_hol, _ = cls.is_holiday(current)
            if not is_hol:
                trading_days.append(current)
            current += timedelta(days=1)
        return trading_days


exchange_calendar = ExchangeCalendar()
