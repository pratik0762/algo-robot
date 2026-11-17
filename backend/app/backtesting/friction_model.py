"""
ALGO ROBOT — Indian Market Statutory Regulatory Friction & Slippage Model
Calculates exact NSE / BSE statutory charges, SEBI turnover fees, STT, Stamp Duty, GST,
and liquidity-adjusted slippage for backtesting and execution realism.
"""

from __future__ import annotations
from dataclasses import dataclass
from enum import Enum
from typing import Dict, Any


class InstrumentClass(str, Enum):
    EQUITY_INTRADAY = "EQUITY_INTRADAY"
    EQUITY_DELIVERY = "EQUITY_DELIVERY"
    FUTURES = "FUTURES"
    OPTIONS = "OPTIONS"


@dataclass
class TradeFrictionBreakdown:
    turnover: float
    brokerage: float
    stt: float
    exchange_turnover_fee: float
    gst: float
    sebi_fee: float
    stamp_duty: float
    slippage_cost: float
    total_friction: float

    def to_dict(self) -> Dict[str, float]:
        return {
            "turnover": round(self.turnover, 2),
            "brokerage": round(self.brokerage, 2),
            "stt": round(self.stt, 2),
            "exchange_turnover_fee": round(self.exchange_turnover_fee, 2),
            "exchange_fee": round(self.exchange_turnover_fee, 2),
            "gst": round(self.gst, 2),
            "sebi_fee": round(self.sebi_fee, 2),
            "stamp_duty": round(self.stamp_duty, 2),
            "slippage_cost": round(self.slippage_cost, 2),
            "total_friction": round(self.total_friction, 2),
            "total_charges": round(self.total_friction - self.slippage_cost, 2),
        }


class IndianFrictionModel:
    """Computes exact official statutory regulatory friction on Indian exchange trades."""

    @staticmethod
    def calculate_trade_friction(
        instrument_class: InstrumentClass,
        side: str,  # 'BUY' or 'SELL'
        price: float,
        quantity: int,
        brokerage_per_order: float = 20.0,
        slippage_pct: float = 0.0003,  # 0.03% default slippage
    ) -> TradeFrictionBreakdown:
        turnover = price * quantity
        side_upper = side.upper()

        # 1. Slippage impact in INR
        slippage_cost = round(turnover * slippage_pct, 4)

        # 2. Brokerage (flat 20 or 0.03% for intraday equity / futures; flat 20 for options)
        if instrument_class == InstrumentClass.EQUITY_DELIVERY:
            brokerage = 0.0  # Zero brokerage for cash delivery on discount brokers
        elif instrument_class == InstrumentClass.OPTIONS:
            brokerage = brokerage_per_order  # Flat ₹20 per executed order
        else:
            brokerage = min(brokerage_per_order, turnover * 0.0003)

        # 3. Securities Transaction Tax (STT) & Exchange Turnover Fees
        if instrument_class == InstrumentClass.EQUITY_INTRADAY:
            stt = (turnover * 0.00025) if side_upper == "SELL" else 0.0  # 0.025% on sell
            exchange_fee = turnover * 0.0000297                          # NSE: 0.00297%
            stamp_duty = (turnover * 0.00003) if side_upper == "BUY" else 0.0  # 0.003% on buy

        elif instrument_class == InstrumentClass.EQUITY_DELIVERY:
            stt = turnover * 0.001                                      # 0.1% on buy and sell
            exchange_fee = turnover * 0.0000297
            stamp_duty = (turnover * 0.00015) if side_upper == "BUY" else 0.0  # 0.015% on buy

        elif instrument_class == InstrumentClass.FUTURES:
            stt = (turnover * 0.0002) if side_upper == "SELL" else 0.0   # 0.02% on sell
            exchange_fee = turnover * 0.0000173                          # NSE: 0.00173%
            stamp_duty = (turnover * 0.00002) if side_upper == "BUY" else 0.0  # 0.002% on buy

        else:  # OPTIONS (turnover is premium value)
            stt = (turnover * 0.000625) if side_upper == "SELL" else 0.0  # 0.0625% on sell premium
            exchange_fee = turnover * 0.0003503                          # NSE: 0.03503% on premium
            stamp_duty = (turnover * 0.00003) if side_upper == "BUY" else 0.0  # 0.003% on buy

        # 4. SEBI Turnover Fee (₹10 per crore = 0.0001% of turnover)
        sebi_fee = round(turnover * 0.000001, 4)

        # 5. Goods and Services Tax (GST: 18% on Brokerage + Exchange Fee + SEBI Fee)
        gst = round((brokerage + exchange_fee + sebi_fee) * 0.18, 4)

        total_friction = round(brokerage + stt + exchange_fee + gst + sebi_fee + stamp_duty + slippage_cost, 4)

        return TradeFrictionBreakdown(
            turnover=turnover,
            brokerage=brokerage,
            stt=stt,
            exchange_turnover_fee=exchange_fee,
            gst=gst,
            sebi_fee=sebi_fee,
            stamp_duty=stamp_duty,
            slippage_cost=slippage_cost,
            total_friction=total_friction,
        )

    @classmethod
    def calculate_round_trip_friction(
        cls,
        instrument_class: InstrumentClass,
        entry_price: float,
        exit_price: float,
        quantity: int,
        brokerage_per_order: float = 20.0,
        slippage_pct: float = 0.0003,
    ) -> Dict[str, float]:
        """Calculates combined round-trip friction for entry and exit orders."""
        entry_b = cls.calculate_trade_friction(
            instrument_class=instrument_class,
            side="BUY",
            price=entry_price,
            quantity=quantity,
            brokerage_per_order=brokerage_per_order,
            slippage_pct=slippage_pct,
        )
        exit_b = cls.calculate_trade_friction(
            instrument_class=instrument_class,
            side="SELL",
            price=exit_price,
            quantity=quantity,
            brokerage_per_order=brokerage_per_order,
            slippage_pct=slippage_pct,
        )

        return {
            "entry_turnover": round(entry_b.turnover, 2),
            "exit_turnover": round(exit_b.turnover, 2),
            "total_turnover": round(entry_b.turnover + exit_b.turnover, 2),
            "total_brokerage": round(entry_b.brokerage + exit_b.brokerage, 2),
            "total_stt": round(entry_b.stt + exit_b.stt, 2),
            "total_exchange_fee": round(entry_b.exchange_turnover_fee + exit_b.exchange_turnover_fee, 2),
            "total_gst": round(entry_b.gst + exit_b.gst, 2),
            "total_sebi_fee": round(entry_b.sebi_fee + exit_b.sebi_fee, 2),
            "total_stamp_duty": round(entry_b.stamp_duty + exit_b.stamp_duty, 2),
            "total_slippage": round(entry_b.slippage_cost + exit_b.slippage_cost, 2),
            "total_friction": round(entry_b.total_friction + exit_b.total_friction, 2),
        }
