"""
ALGO ROBOT — Official BSE Securities Master Source Adapter
Ingests official Bombay Stock Exchange (BSE) security masters:
1. BSE Mainboard Equities (Groups: A, B, T, X, Z)
2. BSE SME Platform (Group: M)
Parses 6-digit Scrip Codes, Scrip IDs, ISINs, Industry tags, and Face Value.
"""

from __future__ import annotations
import csv
import io
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
import urllib.request

from app.db.models import ExchangeCode, BoardType, SecurityType, InstrumentStatus

logger = logging.getLogger("algo_robot.market_data.adapters.bse")

# Official BSE Security Master URL
BSE_SECURITY_LIST_URL = "https://www.bseindia.com/corporates/List_Scrips.aspx"


class BSESecurityMasterAdapter:
    """Ingests official Bombay Stock Exchange securities master list."""

    @staticmethod
    def parse_bse_csv(csv_text: str) -> List[Dict[str, Any]]:
        """
        Parses official BSE List of Scrips CSV format.
        Headers typically include:
        Security Code, Security Id, Security Name, Status, Group, Face Value, ISIN No, Industry, Instrument
        """
        records: List[Dict[str, Any]] = []
        reader = csv.DictReader(io.StringIO(csv_text))

        for row in reader:
            scrip_code = row.get("Security Code", "").strip()
            scrip_id = row.get("Security Id", "").strip().upper()
            scrip_name = row.get("Security Name", "").strip()
            status_str = row.get("Status", "Active").strip().upper()
            group = row.get("Group", "B").strip().upper()
            face_value_str = row.get("Face Value", "10").strip()
            isin = row.get("ISIN No", "").strip().upper()
            industry = row.get("Industry", "").strip()
            instrument_type_str = row.get("Instrument", "Equity").strip().upper()

            if not scrip_code or not isin:
                continue

            try:
                face_value = float(face_value_str)
            except ValueError:
                face_value = 10.0

            # Determine Board Type: Group 'M' indicates BSE SME
            is_sme = (group == "M")
            board_type = BoardType.SME if is_sme else BoardType.MAINBOARD

            # Determine Status
            if status_str == "ACTIVE":
                inst_status = InstrumentStatus.ACTIVE
            elif "SUSPEND" in status_str:
                inst_status = InstrumentStatus.SUSPENDED
            elif "DELIST" in status_str:
                inst_status = InstrumentStatus.DELISTED
            else:
                inst_status = InstrumentStatus.ACTIVE

            records.append({
                "exchange": ExchangeCode.BSE,
                "exchange_symbol": scrip_code,               # Primary exchange identifier on BSE: 6-digit code
                "trading_symbol": scrip_id or scrip_code,   # Ticker string: e.g. RELIANCE, TCS
                "legal_name": scrip_name,
                "isin": isin,
                "series": group,
                "segment": "SME" if is_sme else "EQUITY",
                "board_type": board_type,
                "security_type": SecurityType.EQUITY,
                "instrument_status": inst_status,
                "face_value": face_value,
                "lot_size": 1,
                "industry": industry,
                "currency": "INR",
                "source": "BSE_OFFICIAL_SECURITY_MASTER",
            })

        logger.info("Parsed %d BSE records.", len(records))
        return records
