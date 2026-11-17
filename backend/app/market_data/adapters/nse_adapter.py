"""
ALGO ROBOT — Official NSE Securities Master Source Adapter
Ingests official NSE Mainboard and SME (EMERGE) security masters:
1. Mainboard Equities (Series: EQ, BE, BZ)
2. SME Equities (Series: SM, ST)
Parses symbols, corporate names, ISINs, face value, lot size, and listing dates.
"""

from __future__ import annotations
import csv
import io
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import urllib.request

from app.db.models import ExchangeCode, BoardType, SecurityType, InstrumentStatus

logger = logging.getLogger("algo_robot.market_data.adapters.nse")

# Official NSE security master CSV endpoints
NSE_MAINBOARD_URL = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
NSE_SME_URL = "https://nsearchives.nseindia.com/content/equities/SME_EQUITY_L.csv"


class NSESecurityMasterAdapter:
    """Ingests official National Stock Exchange security listings."""

    @staticmethod
    def parse_nse_csv(csv_text: str, board_type: BoardType = BoardType.MAINBOARD) -> List[Dict[str, Any]]:
        """Parses standard NSE EQUITY_L.csv format."""
        records: List[Dict[str, Any]] = []
        reader = csv.DictReader(io.StringIO(csv_text))

        for row in reader:
            # Standard NSE CSV headers:
            # SYMBOL, NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE
            symbol = row.get("SYMBOL", "").strip().upper()
            legal_name = row.get("NAME OF COMPANY", "").strip()
            series = row.get("SERIES", "EQ").strip().upper()
            isin = row.get("ISIN NUMBER", "").strip().upper()
            listing_date_str = row.get("DATE OF LISTING", "").strip()
            face_value_str = row.get("FACE VALUE", "10").strip()
            market_lot_str = row.get("MARKET LOT", "1").strip()

            if not symbol or not isin:
                continue

            # Parse listing date
            listing_date = None
            if listing_date_str:
                for fmt in ("%d-%b-%Y", "%d-%m-%Y", "%Y-%m-%d"):
                    try:
                        listing_date = datetime.strptime(listing_date_str, fmt)
                        break
                    except ValueError:
                        pass

            try:
                face_value = float(face_value_str)
            except ValueError:
                face_value = 10.0

            try:
                lot_size = int(market_lot_str)
            except ValueError:
                lot_size = 1

            # Tag board type (Series SM or ST are SME)
            is_sme = (series in ("SM", "ST")) or (board_type == BoardType.SME)
            effective_board = BoardType.SME if is_sme else BoardType.MAINBOARD

            records.append({
                "exchange": ExchangeCode.NSE,
                "exchange_symbol": symbol,
                "trading_symbol": f"{symbol}-{series}" if series != "EQ" else symbol,
                "legal_name": legal_name,
                "isin": isin,
                "series": series,
                "segment": "SME" if is_sme else "EQUITY",
                "board_type": effective_board,
                "security_type": SecurityType.EQUITY,
                "instrument_status": InstrumentStatus.ACTIVE,
                "listing_date": listing_date,
                "face_value": face_value,
                "lot_size": lot_size,
                "currency": "INR",
                "source": "NSE_OFFICIAL_SECURITY_MASTER",
            })

        logger.info("Parsed %d NSE records for board %s.", len(records), board_type.value)
        return records

    @classmethod
    def fetch_live_master(cls, board_type: BoardType = BoardType.MAINBOARD) -> List[Dict[str, Any]]:
        """Downloads current official CSV from NSE archives."""
        url = NSE_SME_URL if board_type == BoardType.SME else NSE_MAINBOARD_URL
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                text = resp.read().decode("utf-8", errors="ignore")
                return cls.parse_nse_csv(text, board_type=board_type)
        except Exception as e:
            logger.warning("Could not download live NSE master from %s: %s", url, e)
            return []
