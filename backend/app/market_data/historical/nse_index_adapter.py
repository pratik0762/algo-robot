"""
ALGO ROBOT — Official NSE Index Archive Adapter
Parses official National Stock Exchange index price-volume archives (ind_close_all).
Covers benchmark, sectoral, and thematic indices (NIFTY 50, NIFTY BANK, NIFTY IT, etc.).
"""

from __future__ import annotations
import csv
import io
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger("algo_robot.historical.nse_index")
IST = timezone(timedelta(hours=5, minutes=30))

INDEX_SYMBOL_MAP = {
    "NIFTY 50": "NIFTY 50",
    "NIFTY BANK": "NIFTY BANK",
    "NIFTY IT": "NIFTY IT",
    "NIFTY 500": "NIFTY 500",
    "NIFTY MIDCAP 100": "NIFTY MIDCAP 100",
    "NIFTY SMALLCAP 100": "NIFTY SMALLCAP 100",
    "NIFTY NEXT 50": "NIFTY NEXT 50",
    "NIFTY AUTO": "NIFTY AUTO",
    "NIFTY FMCG": "NIFTY FMCG",
    "NIFTY PHARMA": "NIFTY PHARMA",
    "NIFTY METAL": "NIFTY METAL",
}


class NSEIndexAdapter:
    """Parses and normalizes official NSE index close files."""

    @staticmethod
    def parse_csv(csv_text: str) -> List[Dict[str, Any]]:
        records: List[Dict[str, Any]] = []
        if not csv_text or not csv_text.strip():
            return records

        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        if not reader.fieldnames:
            return records

        cleaned_headers = {h: h.strip().replace('"', '') for h in reader.fieldnames}

        for row in reader:
            normalized_row = {cleaned_headers.get(k, k): v.strip() if isinstance(v, str) else v for k, v in row.items()}
            rec = NSEIndexAdapter._parse_row(normalized_row)
            if rec:
                records.append(rec)

        logger.info("Successfully parsed %d NSE index records", len(records))
        return records

    @staticmethod
    def _parse_row(row: Dict[str, str]) -> Optional[Dict[str, Any]]:
        raw_name = (
            row.get("Index Name")
            or row.get("INDEX_NAME")
            or row.get("Index")
            or ""
        ).strip()

        if not raw_name:
            return None

        # Clean symbol name
        symbol = raw_name.upper()
        date_str = (
            row.get("Index Date")
            or row.get("INDEX_DATE")
            or row.get("Date")
            or row.get("TIMESTAMP")
            or ""
        ).strip()

        ts = NSEIndexAdapter._parse_date_string(date_str)
        if not ts:
            return None

        try:
            o = float(row.get("Open Index Value") or row.get("OPEN") or row.get("Open") or 0.0)
            h = float(row.get("High Index Value") or row.get("HIGH") or row.get("High") or 0.0)
            l = float(row.get("Low Index Value") or row.get("LOW") or row.get("Low") or 0.0)
            c = float(row.get("Closing Index Value") or row.get("CLOSE") or row.get("Close") or 0.0)
        except ValueError:
            return None

        if o <= 0.0 or h <= 0.0 or l <= 0.0 or c <= 0.0:
            return None

        vol_str = row.get("Volume") or row.get("VOLUME") or "0"
        vol = float(vol_str.replace(",", "")) if vol_str and vol_str != "-" else 0.0

        turnover_cr = row.get("Turnover (Rs. Cr.)") or row.get("Turnover") or "0"
        turnover = float(turnover_cr.replace(",", "")) * 10000000.0 if turnover_cr and turnover_cr != "-" else 0.0

        return {
            "exchange": "NSE",
            "symbol": symbol,
            "series": "INDEX",
            "board_type": "MAINBOARD",
            "timeframe": "1d",
            "timestamp": ts,
            "open": round(o, 2),
            "high": round(h, 2),
            "low": round(l, 2),
            "close": round(c, 2),
            "volume": vol,
            "turnover": round(turnover, 2),
            "vwap": round(c, 2),
            "trades": 0,
            "source": "OFFICIAL_NSE_INDEX",
            "is_adjusted": False,
        }

    @staticmethod
    def _parse_date_string(dstr: str) -> Optional[datetime]:
        if not dstr:
            return None
        dstr = dstr.strip()
        formats = [
            "%d-%m-%Y",
            "%d-%b-%Y",
            "%Y-%m-%d",
            "%d%m%Y",
        ]
        for fmt in formats:
            try:
                dt = datetime.strptime(dstr, fmt)
                dt_ist = dt.replace(hour=15, minute=30, second=0, tzinfo=IST)
                return dt_ist.astimezone(timezone.utc)
            except ValueError:
                continue
        return None
