"""
ALGO ROBOT — Official NSE Futures & Options (F&O) Bhavcopy Adapter
Parses contract-specific price-volume-settlement-OI archives.
Enforces Rule 1 (Real Data Only):
- Strictly NO theoretical Black-Scholes prices as traded prices.
- Strictly NO synthetic OI.
- Returns genuine exchange settlement prices, traded OHLC, and authentic OI/change in OI.
"""

from __future__ import annotations
import csv
import io
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("algo_robot.historical.nse_fo_bhavcopy")
IST = timezone(timedelta(hours=5, minutes=30))


class NSEFOBhavcopyAdapter:
    """Parses and normalizes official NSE Derivatives contract-wise Bhavcopies."""

    @staticmethod
    def parse_csv(csv_text: str) -> List[Dict[str, Any]]:
        """Parses CSV text into contract records containing both OHLCV candles and OI/settlement details."""
        records: List[Dict[str, Any]] = []
        if not csv_text or not csv_text.strip():
            return records

        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        if not reader.fieldnames:
            return records

        cleaned_headers = {h: h.strip().replace('"', '') for h in reader.fieldnames}

        for row in reader:
            normalized_row = {cleaned_headers.get(k, k): v.strip() if isinstance(v, str) else v for k, v in row.items()}
            parsed = NSEFOBhavcopyAdapter._parse_row(normalized_row)
            if parsed:
                records.append(parsed)

        logger.info("Successfully parsed %d NSE F&O contract records from bhavcopy", len(records))
        return records

    @staticmethod
    def _parse_row(row: Dict[str, str]) -> Optional[Dict[str, Any]]:
        try:
            if "TckrSymb" in row or "XpryDt" in row:
                return NSEFOBhavcopyAdapter._parse_udiff_row(row)
            elif "INSTRUMENT" in row or "Instrument" in row:
                renamed = {k.upper(): v for k, v in row.items()}
                return NSEFOBhavcopyAdapter._parse_legacy_row(renamed)
            return None
        except Exception as e:
            logger.debug("Failed to parse F&O row: %s: %s", row, e)
            return None

    @staticmethod
    def _parse_legacy_row(row: Dict[str, str]) -> Optional[Dict[str, Any]]:
        instrument = row.get("INSTRUMENT", "").strip().upper()
        symbol = row.get("SYMBOL", "").strip().upper()
        expiry_str = row.get("EXPIRY_DT", "").strip()
        option_typ = row.get("OPTION_TYP", "XX").strip().upper()

        if not instrument or not symbol or not expiry_str:
            return None

        strike_pr = float(row.get("STRIKE_PR", 0.0) or 0.0)
        date_str = row.get("TIMESTAMP", "").strip()

        ts = NSEFOBhavcopyAdapter._parse_date_string(date_str)
        expiry_dt = NSEFOBhavcopyAdapter._parse_date_string(expiry_str)

        if not ts or not expiry_dt:
            return None

        # Format contract identifier: e.g. NIFTY26NOV24000CE or NIFTY26NOVFUT
        exp_code = expiry_dt.strftime("%y%b").upper()
        if instrument.startswith("OPT"):
            strike_str = str(int(strike_pr)) if strike_pr.is_integer() else f"{strike_pr:.2f}"
            contract_id = f"{symbol}{exp_code}{strike_str}{option_typ}"
        else:
            contract_id = f"{symbol}{exp_code}FUT"

        o = float(row.get("OPEN", 0.0) or 0.0)
        h = float(row.get("HIGH", 0.0) or 0.0)
        l = float(row.get("LOW", 0.0) or 0.0)
        c = float(row.get("CLOSE", 0.0) or 0.0)
        settle_pr = float(row.get("SETTLE_PR", 0.0) or 0.0)

        # Traded candles may have 0 volume/0 open if no trade occurred that day
        # But if traded, check validity
        contracts = int(float(row.get("CONTRACTS", 0.0) or 0))
        val_lakh = float(row.get("VAL_INLAKH", 0.0) or 0.0)
        turnover = val_lakh * 100000.0

        oi = float(row.get("OPEN_INT", 0.0) or 0.0)
        chg_oi = float(row.get("CHG_IN_OI", 0.0) or 0.0)

        # Invariant check: OI cannot be negative
        if oi < 0.0:
            return None

        return {
            "exchange": "NSE",
            "symbol": symbol,
            "instrument": instrument,
            "contract_identifier": contract_id,
            "expiry_date": expiry_dt,
            "strike_price": strike_pr if instrument.startswith("OPT") else None,
            "option_type": option_typ if instrument.startswith("OPT") else "XX",
            "timeframe": "1d",
            "timestamp": ts,
            "open": round(o, 2),
            "high": round(h, 2),
            "low": round(l, 2),
            "close": round(c, 2),
            "settlement_price": round(settle_pr, 2),
            "volume": float(contracts),
            "contracts": contracts,
            "turnover": round(turnover, 2),
            "open_interest": oi,
            "change_in_oi": chg_oi,
            "source": "OFFICIAL_NSE_FO_BHAVCOPY",
            "is_adjusted": False,
        }

    @staticmethod
    def _parse_udiff_row(row: Dict[str, str]) -> Optional[Dict[str, Any]]:
        symbol = row.get("TckrSymb", "").strip().upper()
        expiry_str = row.get("XpryDt", "").strip()
        option_typ = row.get("OptnTp", "XX").strip().upper()

        if not symbol or not expiry_str:
            return None

        strike_pr = float(row.get("StrkPric", 0.0) or 0.0)
        date_str = row.get("TradDt") or row.get("BizDt") or ""

        ts = NSEFOBhavcopyAdapter._parse_date_string(date_str)
        expiry_dt = NSEFOBhavcopyAdapter._parse_date_string(expiry_str)

        if not ts or not expiry_dt:
            return None

        exp_code = expiry_dt.strftime("%y%b").upper()
        if option_typ in ("CE", "PE"):
            strike_str = str(int(strike_pr)) if strike_pr.is_integer() else f"{strike_pr:.2f}"
            contract_id = f"{symbol}{exp_code}{strike_str}{option_typ}"
            instrument = "OPT"
        else:
            contract_id = f"{symbol}{exp_code}FUT"
            instrument = "FUT"

        o = float(row.get("OpnPric", 0.0) or 0.0)
        h = float(row.get("HghPric", 0.0) or 0.0)
        l = float(row.get("LwPric", 0.0) or 0.0)
        c = float(row.get("ClsPric", 0.0) or 0.0)
        settle_pr = float(row.get("SttlmPric", 0.0) or 0.0)

        contracts = int(float(row.get("TtlTradgVol", 0.0) or 0))
        turnover = float(row.get("TtlTrfVal", 0.0) or 0.0)

        oi = float(row.get("OpnIntrst", 0.0) or 0.0)
        chg_oi = float(row.get("ChngInOpnIntrst", 0.0) or 0.0)

        if oi < 0.0:
            return None

        return {
            "exchange": "NSE",
            "symbol": symbol,
            "instrument": instrument,
            "contract_identifier": contract_id,
            "expiry_date": expiry_dt,
            "strike_price": strike_pr if option_typ in ("CE", "PE") else None,
            "option_type": option_typ,
            "timeframe": "1d",
            "timestamp": ts,
            "open": round(o, 2),
            "high": round(h, 2),
            "low": round(l, 2),
            "close": round(c, 2),
            "settlement_price": round(settle_pr, 2),
            "volume": float(contracts),
            "contracts": contracts,
            "turnover": round(turnover, 2),
            "open_interest": oi,
            "change_in_oi": chg_oi,
            "source": "OFFICIAL_NSE_FO_UDIFF",
            "is_adjusted": False,
        }

    @staticmethod
    def _parse_date_string(dstr: str) -> Optional[datetime]:
        if not dstr:
            return None
        dstr = dstr.strip()
        formats = [
            "%d-%b-%Y",
            "%d-%m-%Y",
            "%Y-%m-%d",
            "%d%m%Y",
            "%Y%m%d",
        ]
        for fmt in formats:
            try:
                dt = datetime.strptime(dstr, fmt)
                dt_ist = dt.replace(hour=15, minute=30, second=0, tzinfo=IST)
                return dt_ist.astimezone(timezone.utc)
            except ValueError:
                continue
        return None
