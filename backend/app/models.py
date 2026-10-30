"""Pydantic data models for Nifty 50 companies and financial reports."""

from __future__ import annotations
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class CompanySummary(BaseModel):
    symbol: str
    company_name: str
    sector: str
    industry: str
    isin: str
    market_cap_cr: float
    pe_ratio: float
    pb_ratio: float
    dividend_yield_pct: float
    latest_quarter: str
    revenue_latest_cr: float
    net_profit_latest_cr: float
    yoy_revenue_growth_pct: float
    yoy_profit_growth_pct: float
    operating_margin_pct: float
    current_price: Optional[float] = None
    price_change: Optional[float] = None
    percent_change: Optional[float] = None

class FinancialQuarter(BaseModel):
    quarter_name: str  # e.g. "Q1 FY26", "Q4 FY25"
    period_ended: str  # e.g. "30-Jun-2025"
    revenue_operations_cr: float
    other_income_cr: float
    total_income_cr: float
    operating_expenses_cr: float
    ebitda_cr: float
    operating_margin_pct: float
    finance_costs_cr: float
    depreciation_cr: float
    profit_before_tax_cr: float
    tax_expense_cr: float
    net_profit_cr: float
    net_profit_margin_pct: float
    eps_inr: float
    audited: str  # "Audited" or "Un-Audited"

class BalanceSheetItem(BaseModel):
    financial_year: str  # e.g. "FY 2026", "FY 2025"
    current_assets_cr: Optional[float] = 0.0
    non_current_assets_cr: Optional[float] = 0.0
    total_assets_cr: float
    current_liabilities_cr: Optional[float] = 0.0
    non_current_liabilities_cr: Optional[float] = 0.0
    total_liabilities_cr: Optional[float] = 0.0
    total_equity_cr: float
    total_liab_and_equity_cr: Optional[float] = 0.0
    common_shares_outstanding_cr: Optional[float] = 0.0
    total_debt_cr: Optional[float] = 0.0
    cash_and_equivalents_cr: Optional[float] = 0.0
    net_worth_cr: float
    debt_to_equity: Optional[float] = 0.0
    book_value_per_share: Optional[float] = 0.0
    roce_pct: Optional[float] = 0.0
    roe_pct: Optional[float] = 0.0

class NseFiling(BaseModel):
    title: str
    filing_type: str  # "Annual Report", "Financial Results", "Investor Presentation"
    financial_year_or_period: str
    broadcast_date: str
    file_url: str
    file_size: Optional[str] = None
    submission_type: Optional[str] = "New"

class CompanyDetail(BaseModel):
    symbol: str
    company_name: str
    about: str
    sector: str
    industry: str
    isin: str
    listing_date: str
    market_cap_cr: float
    face_value_inr: float
    pe_ratio: float
    pb_ratio: float
    dividend_yield_pct: float
    latest_quarter: Optional[str] = None
    revenue_latest_cr: Optional[float] = None
    net_profit_latest_cr: Optional[float] = None
    operating_margin_pct: Optional[float] = None
    yoy_revenue_growth_pct: Optional[float] = None
    yoy_profit_growth_pct: Optional[float] = None
    current_price: Optional[float] = None
    price_change: Optional[float] = None
    percent_change: Optional[float] = None
    day_high: Optional[float] = None
    day_low: Optional[float] = None
    volume: Optional[int] = None
    quarterly_results: List[FinancialQuarter]
    annual_financials: List[FinancialQuarter]
    balance_sheet: List[BalanceSheetItem]
    nse_filings: List[NseFiling]

class IndexItem(BaseModel):
    index: str
    index_symbol: str
    category: str
    last_price: float
    variation: float
    percent_change: float
    open: float
    high: float
    low: float
    previous_close: float
    year_high: float
    year_low: float
    pe: Optional[str] = "-"
    pb: Optional[str] = "-"
    dy: Optional[str] = "-"
    advances: Optional[str] = "0"
    declines: Optional[str] = "0"
    unchanged: Optional[str] = "0"
    per_change_30d: Optional[float] = 0.0
    per_change_365d: Optional[float] = 0.0
    chart_today: Optional[str] = None

class GiftNiftyDetail(BaseModel):
    name: str = "GIFT NIFTY"
    symbol: str = "GIFTNIFTY"
    exchange: str = "NSE IX (GIFT City, Gandhinagar)"
    contract: str
    last_price: float
    change: float
    percent_change: float
    open: float
    high: float
    low: float
    previous_close: float
    underlying_spot: float
    basis_premium: float
    volume_contracts: int
    open_interest: int
    trading_hours: str = "Session 1: 06:30 - 15:40 IST | Session 2: 16:35 - 02:45 IST"
    currency: str = "USD"
    status: str = "Active"

class IndiaVixDetail(BaseModel):
    name: str = "INDIA VIX"
    symbol: str = "INDIAVIX"
    exchange: str = "NSE India"
    last_price: float
    change: float
    percent_change: float
    open: float
    high: float
    low: float
    previous_close: float
    year_high: float
    year_low: float
    volatility_status: str
    per_change_30d: float
    per_change_365d: float
    interpretation: str

class NewsItem(BaseModel):
    id: str
    headline: str
    summary: str
    company_symbol: str = "BROAD_MARKET"
    company_name: str
    sector: str
    published_time: str
    published_at: str
    source: str
    url: str
    impact_rating: str  # "HIGH IMPACT", "MEDIUM IMPACT", "LOW IMPACT"
    impact_score: float  # 1.0 to 10.0
    sentiment: str  # "BULLISH", "BEARISH", "VOLATILE", "NEUTRAL"
    impact_analysis: str  # Actionable details explaining valuation/earnings/price effect
    market_relevance: str  # "Company Specific", "Sectoral Shift", "Macro / Broad Market"
    is_top_market_moving: bool = False
    tags: List[str] = Field(default_factory=list)

class NewsResponse(BaseModel):
    status: str
    market_news_sentiment: str
    bullish_count: int
    bearish_count: int
    high_impact_count: int
    top_market_moving: List[NewsItem]
    all_news: List[NewsItem]
    total_count: int
    timestamp: str



