"""
ALGO ROBOT — Official BSE Equity & Derivatives Bhavcopy Adapter
Parses official Bombay Stock Exchange Bhavcopies (Mainboard & SME groups).
Maps Scrip Codes, Scrip Names, and ISINs to canonical instrument identities.
"""

from __future__ import annotations
import csv
import io
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger("algo_robot.historical.bse_bhavcopy")
IST = timezone(timedelta(hours=5, minutes=30))


class BSEBhavcopyAdapter:
    """Parses and normalizes official BSE Bhavcopy archives."""

    @staticmethod
    def parse_csv(csv_text: str, default_date: Optional[datetime] = None) -> List[Dict[str, Any]]:
        records: List[Dict[str, Any]] = []
        if not csv_text or not csv_text.strip():
            return records

        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        if not reader.fieldnames:
            return records

        cleaned_headers = {h: h.strip().replace('"', '') for h in reader.fieldnames}

        for row in reader:
            normalized_row = {cleaned_headers.get(k, k): v.strip() if isinstance(v, str) else v for k, v in row.items()}
            rec = BSEBhavcopyAdapter._parse_row(normalized_row, default_date=default_date)
            if rec:
                records.append(rec)

        logger.info("Successfully parsed %d BSE records from bhavcopy", len(records))
        return records

    @staticmethod
    def _parse_row(row: Dict[str, str], default_date: Optional[datetime] = None) -> Optional[Dict[str, Any]]:
        try:
            sc_code = row.get("SC_CODE") or row.get("Security Code") or row.get("SCRIP_CODE") or ""
            sc_name = row.get("SC_NAME") or row.get("Security Name") or row.get("SCRIP_NAME") or ""
            sc_group = (row.get("SC_GROUP") or row.get("Group") or "B").strip().upper()

            if not sc_code:
                return None

            board_type = "SME" if sc_group in ("M", "MT") else "MAINBOARD"
            isin = row.get("ISIN_CODE") or row.get("ISIN") or None

            # Date determination
            date_str = row.get("TRADING_DATE") or row.get("DATE") or row.get("TIMESTAMP") or ""
            ts = BSEBhavcopyAdapter._parse_date_string(date_str) if date_str else default_date
            if not ts:
                # If no date in row and no default date, set to today's close
                ts = datetime.now(timezone.utc).replace(hour=10, minute=0, second=0, microsecond=0)

            o = float(row.get("OPEN") or row.get("Open") or 0.0)
            h = float(row.get("HIGH") or row.get("High") or 0.0)
            l = float(row.get("LOW") or row.get("Low") or 0.0)
            c = float(row.get("CLOSE") or row.get("Close") or 0.0)

            if o <= 0.0 or h <= 0.0 or l <= 0.0 or c <= 0.0:
                return None

            vol = float(row.get("NO_OF_SHRS") or row.get("Volume") or 0.0)
            turnover = float(row.get("NET_TURNOV") or row.get("Turnover") or 0.0)
            trades = int(float(row.get("NO_TRADES") or row.get("Trades") or 0))

            symbol = sc_name.replace(" ", "").upper() or f"BSE_{sc_code}"

            vwap = (turnover / vol) if vol > 0 and turnover > 0 else c

            return {
                "exchange": "BSE",
                "symbol": symbol,
                "scrip_code": sc_code,
                "series": sc_group,
                "board_type": board_type,
                "isin": isin,
                "timeframe": "1d",
                "timestamp": ts,
                "open": round(o, 2),
                "high": round(h, 2),
                "low": round(l, 2),
                "close": round(c, 2),
                "volume": vol,
                "turnover": round(turnover, 2),
                "vwap": round(vwap, 2),
                "trades": trades,
                "source": "OFFICIAL_BSE_BHAVCOPY",
                "is_adjusted": False,
            }
        except Exception as e:
            logger.debug("BSE parse row error: %s: %s", row, e)
            return None

    @staticmethod
    def _parse_date_string(dstr: str) -> Optional[datetime]:
        if not dstr:
            return None
        dstr = dstr.strip()
        formats = [
            "%d/%m/%Y",
            "%d-%m-%Y",
            "%d-%b-%Y",
            "%Y-%m-%d",
            "%d%m%y",
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
