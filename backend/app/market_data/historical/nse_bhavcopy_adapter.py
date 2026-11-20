"""
ALGO ROBOT — Official NSE Equity & SME Bhavcopy Adapter
Parses official National Stock Exchange daily price-volume archives across
Mainboard and SME boards (both legacy Bhavcopy and modern UDiFF formats).
Enforces Rule 1 (Real Data Only): Preserves genuine exchange prices and volumes.
"""

from __future__ import annotations
import csv
import io
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("algo_robot.historical.nse_bhavcopy")
IST = timezone(timedelta(hours=5, minutes=30))

MAINBOARD_SERIES = {"EQ", "BE", "BZ"}
SME_SERIES = {"SM", "ST"}


class NSEBhavcopyAdapter:
    """Parses and normalizes official NSE Capital Market (Equity & SME) Bhavcopies."""

    @staticmethod
    def parse_csv(csv_text: str) -> List[Dict[str, Any]]:
        """Parses CSV text from an NSE Equity Bhavcopy file into normalized candle records."""
        records: List[Dict[str, Any]] = []
        if not csv_text or not csv_text.strip():
            return records

        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        if not reader.fieldnames:
            return records

        # Clean header names (strip spaces and quotes)
        cleaned_headers = {h: h.strip().replace('"', '') for h in reader.fieldnames}

        for row in reader:
            normalized_row = {cleaned_headers.get(k, k): v.strip() if isinstance(v, str) else v for k, v in row.items()}
            record = NSEBhavcopyAdapter._parse_row(normalized_row)
            if record:
                records.append(record)

        logger.info("Successfully parsed %d NSE equity/SME records from bhavcopy", len(records))
        return records

    @staticmethod
    def _parse_row(row: Dict[str, str]) -> Optional[Dict[str, Any]]:
        """Normalizes a single row regardless of format (UDiFF vs Legacy)."""
        try:
            # Detect Format: Modern UDiFF vs Legacy Bhavcopy
            if "TckrSymb" in row or "FinInstrmId" in row:
                return NSEBhavcopyAdapter._parse_udiff_row(row)
            elif "SYMBOL" in row:
                return NSEBhavcopyAdapter._parse_legacy_row(row)
            elif "Symbol" in row:
                # Capitalized variant
                renamed = {k.upper(): v for k, v in row.items()}
                return NSEBhavcopyAdapter._parse_legacy_row(renamed)
            return None
        except Exception as e:
            logger.debug("Failed to parse row %s: %s", row, e)
            return None

    @staticmethod
    def _parse_legacy_row(row: Dict[str, str]) -> Optional[Dict[str, Any]]:
        symbol = row.get("SYMBOL", "").strip().upper()
        series = row.get("SERIES", "").strip().upper()

        if not symbol or not series:
            return None

        # Determine board
        board_type = "SME" if series in SME_SERIES else ("MAINBOARD" if series in MAINBOARD_SERIES else "OTHER")

        # Parse date
        date_str = row.get("TIMESTAMP") or row.get("DATE1") or row.get("DATE") or ""
        ts = NSEBhavcopyAdapter._parse_date_string(date_str)
        if not ts:
            return None

        # Parse OHLC
        o = float(row.get("OPEN") or row.get("OPEN_PRICE") or 0.0)
        h = float(row.get("HIGH") or row.get("HIGH_PRICE") or 0.0)
        l = float(row.get("LOW") or row.get("LOW_PRICE") or 0.0)
        c = float(row.get("CLOSE") or row.get("CLOSE_PRICE") or 0.0)

        # Invariant check: Positive prices
        if o <= 0.0 or h <= 0.0 or l <= 0.0 or c <= 0.0:
            return None

        # Volume & Turnover
        vol = float(row.get("TOTTRDQTY") or row.get("TTL_TRD_QNTY") or 0.0)
        tot_val = float(row.get("TOTTRDVAL") or 0.0)
        if tot_val == 0.0 and "TURNOVER_LACS" in row:
            tot_val = float(row["TURNOVER_LACS"]) * 100000.0

        trades = int(float(row.get("TOTALTRADES") or row.get("NO_OF_TRADES") or 0))
        isin = row.get("ISIN", "").strip() or None

        vwap = (tot_val / vol) if vol > 0 and tot_val > 0 else c

        return {
            "exchange": "NSE",
            "symbol": symbol,
            "series": series,
            "board_type": board_type,
            "isin": isin,
            "timeframe": "1d",
            "timestamp": ts,  # datetime in UTC
            "open": round(o, 2),
            "high": round(h, 2),
            "low": round(l, 2),
            "close": round(c, 2),
            "volume": vol,
            "turnover": round(tot_val, 2),
            "vwap": round(vwap, 2),
            "trades": trades,
            "source": "OFFICIAL_NSE_BHAVCOPY",
            "is_adjusted": False,
        }

    @staticmethod
    def _parse_udiff_row(row: Dict[str, str]) -> Optional[Dict[str, Any]]:
        symbol = row.get("TckrSymb", "").strip().upper()
        series = row.get("SctySrs", "").strip().upper()

        if not symbol or not series:
            return None

        board_type = "SME" if series in SME_SERIES else ("MAINBOARD" if series in MAINBOARD_SERIES else "OTHER")

        date_str = row.get("TradDt") or row.get("BizDt") or ""
        ts = NSEBhavcopyAdapter._parse_date_string(date_str)
        if not ts:
            return None

        o = float(row.get("OpnPric", 0.0))
        h = float(row.get("HghPric", 0.0))
        l = float(row.get("LwPric", 0.0))
        c = float(row.get("ClsPric", 0.0))

        if o <= 0.0 or h <= 0.0 or l <= 0.0 or c <= 0.0:
            return None

        vol = float(row.get("TtlTradgVol", 0.0))
        tot_val = float(row.get("TtlTrfVal", 0.0))
        trades = int(float(row.get("TtlNbOfTxsExctd", 0)))
        isin = row.get("ISIN", "").strip() or None

        vwap = (tot_val / vol) if vol > 0 and tot_val > 0 else c

        return {
            "exchange": "NSE",
            "symbol": symbol,
            "series": series,
            "board_type": board_type,
            "isin": isin,
            "timeframe": "1d",
            "timestamp": ts,
            "open": round(o, 2),
            "high": round(h, 2),
            "low": round(l, 2),
            "close": round(c, 2),
            "volume": vol,
            "turnover": round(tot_val, 2),
            "vwap": round(vwap, 2),
            "trades": trades,
            "source": "OFFICIAL_NSE_UDIFF",
            "is_adjusted": False,
        }

    @staticmethod
    def _parse_date_string(dstr: str) -> Optional[datetime]:
        """Parses various exchange date formats to UTC datetime representing 15:30 IST session close."""
        if not dstr:
            return None
        dstr = dstr.strip()
        formats = [
            "%d-%b-%Y",  # 18-NOV-2026
            "%d-%m-%Y",  # 18-11-2026
            "%Y-%m-%d",  # 2026-11-18
            "%d%m%Y",    # 18112026
            "%Y%m%d",    # 20261118
        ]
        for fmt in formats:
            try:
                dt = datetime.strptime(dstr, fmt)
                # Session close at 15:30 IST
                dt_ist = dt.replace(hour=15, minute=30, second=0, tzinfo=IST)
                return dt_ist.astimezone(timezone.utc)
            except ValueError:
                continue
        return None
