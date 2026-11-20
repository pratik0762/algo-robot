"""
ALGO ROBOT — Historical Market Data Engine
Official Exchange Bhavcopy Ingestion, Contract-Specific F&O Repository,
Corporate Actions Adjustments, and Multi-Timeframe Candle Service.
"""

from app.market_data.historical.nse_bhavcopy_adapter import NSEBhavcopyAdapter
from app.market_data.historical.nse_fo_bhavcopy_adapter import NSEFOBhavcopyAdapter
from app.market_data.historical.nse_index_adapter import NSEIndexAdapter
from app.market_data.historical.bse_bhavcopy_adapter import BSEBhavcopyAdapter
from app.market_data.historical.corporate_actions_adapter import CorporateActionsAdjustmentEngine
from app.market_data.historical.paytm_historical_adapter import (
    PaytmHistoricalDataAdapter,
    paytm_historical_adapter,
)

__all__ = [
    "NSEBhavcopyAdapter",
    "NSEFOBhavcopyAdapter",
    "NSEIndexAdapter",
    "BSEBhavcopyAdapter",
    "CorporateActionsAdjustmentEngine",
    "PaytmHistoricalDataAdapter",
    "paytm_historical_adapter",
]
