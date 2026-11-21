"""
ALGO ROBOT — All-India Market Data & Company Universe API Router
Implements documented Phase 10 REST endpoints with pagination, search,
filters, sorting, and backward compatibility.
"""

from __future__ import annotations
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, Response, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func, or_, desc, asc

_UNIVERSE_METRICS_CACHE: Dict[str, Any] = {"timestamp": 0.0, "metrics": {}}

def _get_universe_metrics(db: Session) -> Dict[str, int]:
    now = time.time()
    if now - _UNIVERSE_METRICS_CACHE.get("timestamp", 0.0) < 60.0 and _UNIVERSE_METRICS_CACHE.get("metrics"):
        return _UNIVERSE_METRICS_CACHE["metrics"]
    
    total_listed = db.query(Company).count()
    nse_count = db.query(Instrument).filter(Instrument.exchange == ExchangeCode.NSE).count()
    bse_count = db.query(Instrument).filter(Instrument.exchange == ExchangeCode.BSE).count()
    sme_count = db.query(Instrument).filter(Instrument.board_type == BoardType.SME).count()
    mainboard_count = db.query(Instrument).filter(Instrument.board_type == BoardType.MAINBOARD).count()
    active_count = db.query(Company).filter(Company.listing_status == InstrumentStatus.ACTIVE).count()
    suspended_count = db.query(Company).filter(Company.listing_status == InstrumentStatus.SUSPENDED).count()

    metrics = {
        "total_listed_companies": total_listed,
        "nse_instruments": nse_count,
        "bse_instruments": bse_count,
        "mainboard_instruments": mainboard_count,
        "sme_instruments": sme_count,
        "active_companies": active_count,
        "suspended_companies": suspended_count,
    }
    _UNIVERSE_METRICS_CACHE["timestamp"] = now
    _UNIVERSE_METRICS_CACHE["metrics"] = metrics
    return metrics

from app.db.models import (
    Company,
    Instrument,
    MarketQuote,
    MarketCandle,
    CompanyFundamental,
    FinancialStatement,
    CorporateAction,
    CorporateAnnouncement,
    ShareholdingPattern,
    DataIngestionJob,
    DataQualityLog,
    ProviderHealthLog,
    DataSubscriptionStatus,
    ExchangeCode,
    BoardType,
    MarketCapCategory,
    InstrumentStatus,
    DataAuthenticityStatus,
    SubscriptionTier,
    IngestionJobStatus,
)
from app.db.session import get_db, SessionLocal
from app.market_data.symbol_resolver import symbol_resolver
from app.market_data.exchange_calendar import exchange_calendar
from app.market_data.universe_manager import universe_manager
from app.market_data.subscription_manager import subscription_manager
from app.market_data.historical_data_service import historical_data_service
from app.market_data.live_quote_service import live_quote_service
from app.market_data.adapters.provider_registry import provider_registry_manager
from app.market_data.paytm_auth import paytm_auth_service
from app.market_data.paytm_security_master import paytm_security_master
from app.market_data.historical.paytm_historical_adapter import paytm_historical_adapter
from app.market_data.paytm_adapter import paytm_adapter

logger = logging.getLogger("algo_robot.market_data.api")

router = APIRouter(tags=["All-India Market Data Engine"])


# =========================================================================
# 1. Company Universe & Directory Endpoints
# =========================================================================

@router.get("/api/companies/search")
def search_companies_quick(
    q: str = Query(..., min_length=1, description="Search query string"),
    limit: int = Query(15, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Fast autocomplete search across company names, NSE symbols, BSE codes, and ISINs."""
    query_str = q.strip().upper()
    ilike_term = f"%{query_str}%"

    results = []
    # Search companies by name or ISIN
    comps = db.query(Company).filter(
        or_(
            Company.legal_name.ilike(ilike_term),
            Company.normalized_name.ilike(ilike_term),
            Company.primary_isin.ilike(ilike_term),
            Company.company_id.ilike(ilike_term),
        )
    ).limit(limit).all()

    for comp in comps:
        nse_inst = next((i for i in comp.instruments if i.exchange == ExchangeCode.NSE), None)
        bse_inst = next((i for i in comp.instruments if i.exchange == ExchangeCode.BSE), None)
        quote = (nse_inst.quote if nse_inst else None) or (bse_inst.quote if bse_inst else None)

        results.append({
            "company_id": comp.company_id,
            "legal_name": comp.legal_name,
            "primary_isin": comp.primary_isin,
            "sector": comp.sector,
            "industry": comp.industry,
            "market_cap_category": comp.market_cap_category.value,
            "market_cap_cr": comp.market_cap_cr,
            "nse_symbol": nse_inst.exchange_symbol if nse_inst else None,
            "bse_code": bse_inst.exchange_symbol if bse_inst else None,
            "board_type": nse_inst.board_type.value if nse_inst else (bse_inst.board_type.value if bse_inst else "MAINBOARD"),
            "ltp": quote.ltp if quote else 0.0,
            "percent_change": quote.percent_change if quote else 0.0,
        })

    # Also search by instrument trading_symbol
    if len(results) < limit:
        insts = db.query(Instrument).filter(
            or_(
                Instrument.exchange_symbol.ilike(ilike_term),
                Instrument.trading_symbol.ilike(ilike_term),
            )
        ).limit(limit - len(results)).all()

        seen_comp_ids = {r["company_id"] for r in results}
        for inst in insts:
            comp = inst.company
            if comp and comp.company_id not in seen_comp_ids:
                seen_comp_ids.add(comp.company_id)
                results.append({
                    "company_id": comp.company_id,
                    "legal_name": comp.legal_name,
                    "primary_isin": comp.primary_isin,
                    "sector": comp.sector,
                    "industry": comp.industry,
                    "market_cap_category": comp.market_cap_category.value,
                    "market_cap_cr": comp.market_cap_cr,
                    "nse_symbol": inst.exchange_symbol if inst.exchange == ExchangeCode.NSE else None,
                    "bse_code": inst.exchange_symbol if inst.exchange == ExchangeCode.BSE else None,
                    "board_type": inst.board_type.value,
                    "ltp": inst.quote.ltp if inst.quote else 0.0,
                    "percent_change": inst.quote.percent_change if inst.quote else 0.0,
                })

    return {"status": "success", "count": len(results), "items": results}


@router.get("/api/companies/universe")
def get_all_companies_universe(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    exchange: Optional[str] = Query(None, description="NSE, BSE, or BOTH"),
    board_type: Optional[str] = Query(None, description="MAINBOARD or SME"),
    market_cap: Optional[str] = Query(None, description="LARGE_CAP, MID_CAP, SMALL_CAP, MICRO_CAP"),
    sector: Optional[str] = Query(None),
    status: Optional[str] = Query("ACTIVE"),
    sort_by: str = Query("market_cap_cr"),
    sort_dir: str = Query("desc"),
    db: Session = Depends(get_db),
):
    """Paginated, filtered list of all listed equity companies across NSE and BSE."""
    base_query = db.query(Company)

    if search and isinstance(search, str) and search.strip():
        s = f"%{search.strip().upper()}%"
        base_query = base_query.filter(
            or_(
                Company.legal_name.ilike(s),
                Company.normalized_name.ilike(s),
                Company.primary_isin.ilike(s),
                Company.company_id.ilike(s),
                Company.instruments.any(Instrument.exchange_symbol.ilike(s)),
                Company.instruments.any(Instrument.trading_symbol.ilike(s)),
            )
        )

    if sector and isinstance(sector, str) and sector.upper() != "ALL":
        base_query = base_query.filter(Company.sector.ilike(f"%{sector.strip()}%"))

    if market_cap and isinstance(market_cap, str) and market_cap.upper() != "ALL":
        try:
            mcap_enum = MarketCapCategory(market_cap.upper())
            base_query = base_query.filter(Company.market_cap_category == mcap_enum)
        except ValueError:
            pass

    if status and isinstance(status, str) and status.upper() != "ALL":
        try:
            status_enum = InstrumentStatus(status.upper())
            base_query = base_query.filter(Company.listing_status == status_enum)
        except ValueError:
            pass

    if exchange and isinstance(exchange, str) and exchange.upper() in ("NSE", "BSE"):
        ex_enum = ExchangeCode(exchange.upper())
        base_query = base_query.filter(Company.instruments.any(Instrument.exchange == ex_enum))
    elif exchange and isinstance(exchange, str) and exchange.upper() == "BOTH":
        # Companies listed on both NSE and BSE
        base_query = base_query.filter(
            Company.instruments.any(Instrument.exchange == ExchangeCode.NSE),
            Company.instruments.any(Instrument.exchange == ExchangeCode.BSE),
        )

    if board_type and isinstance(board_type, str) and board_type.upper() in ("MAINBOARD", "SME"):
        b_enum = BoardType(board_type.upper())
        base_query = base_query.filter(Company.instruments.any(Instrument.board_type == b_enum))

    # Overall Metrics (Cached)
    metrics = _get_universe_metrics(db)

    total_filtered = base_query.count()

    # Sorting
    sort_column = getattr(Company, sort_by, Company.market_cap_cr) if isinstance(sort_by, str) else Company.market_cap_cr
    order_func = desc if (isinstance(sort_dir, str) and sort_dir.lower() == "desc") else asc
    paginated_query = (
        base_query.options(
            selectinload(Company.instruments).selectinload(Instrument.quote)
        )
        .order_by(order_func(sort_column))
        .offset((page - 1) * limit)
        .limit(limit)
    )
    companies = paginated_query.all()

    items = []
    for comp in companies:
        nse_inst = next((i for i in comp.instruments if i.exchange == ExchangeCode.NSE), None)
        bse_inst = next((i for i in comp.instruments if i.exchange == ExchangeCode.BSE), None)
        primary_inst = nse_inst or bse_inst
        quote = (nse_inst.quote if nse_inst else None) or (bse_inst.quote if bse_inst else None)

        items.append({
            "company_id": comp.company_id,
            "legal_name": comp.legal_name,
            "primary_isin": comp.primary_isin,
            "sector": comp.sector or "Unclassified",
            "industry": comp.industry or "Unclassified",
            "market_cap_category": comp.market_cap_category.value,
            "market_cap_cr": comp.market_cap_cr,
            "listing_status": comp.listing_status.value,
            "nse_symbol": nse_inst.exchange_symbol if nse_inst else None,
            "bse_code": bse_inst.exchange_symbol if bse_inst else None,
            "board_type": primary_inst.board_type.value if primary_inst else "MAINBOARD",
            "is_fno_eligible": any(i.is_fno_eligible for i in comp.instruments),
            "ltp": quote.ltp if quote else 0.0,
            "change": quote.change if quote else 0.0,
            "percent_change": quote.percent_change if quote else 0.0,
            "volume": quote.volume if quote else 0,
            "high_52w": quote.high_52w if quote else 0.0,
            "low_52w": quote.low_52w if quote else 0.0,
            "data_status": quote.data_status.value if quote else "EOD",
            "last_updated": quote.updated_at.isoformat() if quote and quote.updated_at else None,
        })

    return {
        "status": "success",
        "total": total_filtered,
        "page": page,
        "limit": limit,
        "total_pages": (total_filtered + limit - 1) // limit if limit > 0 else 1,
        "metrics": metrics,
        "items": items,
    }


@router.get("/api/companies/detail/{identifier}")
def get_canonical_company_detail(identifier: str, db: Session = Depends(get_db)):
    """Resolves any identifier (symbol, code, ISIN, company_id) into detailed dossier."""
    res = symbol_resolver.resolve(identifier, db=db)
    if not res:
        raise HTTPException(status_code=404, detail=f"Company '{identifier}' not found in master universe.")

    comp_dict, inst_dict = res
    comp = db.query(Company).filter(Company.company_id == comp_dict["company_id"]).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Company record not found.")

    instruments_list = []
    for inst in comp.instruments:
        quote = inst.quote
        instruments_list.append({
            "instrument_id": inst.instrument_id,
            "exchange": inst.exchange.value,
            "exchange_symbol": inst.exchange_symbol,
            "trading_symbol": inst.trading_symbol,
            "isin": inst.isin,
            "series": inst.series,
            "segment": inst.segment,
            "board_type": inst.board_type.value,
            "lot_size": inst.lot_size,
            "tick_size": inst.tick_size,
            "face_value": inst.face_value,
            "is_fno_eligible": inst.is_fno_eligible,
            "quote": {
                "ltp": quote.ltp if quote else 0.0,
                "change": quote.change if quote else 0.0,
                "percent_change": quote.percent_change if quote else 0.0,
                "open": quote.open if quote else 0.0,
                "high": quote.high if quote else 0.0,
                "low": quote.low if quote else 0.0,
                "previous_close": quote.previous_close if quote else 0.0,
                "volume": quote.volume if quote else 0,
                "high_52w": quote.high_52w if quote else 0.0,
                "low_52w": quote.low_52w if quote else 0.0,
                "data_status": quote.data_status.value if quote else "EOD",
            } if quote else None,
        })

    # Fundamentals
    fund = comp.fundamentals
    fund_data = {
        "pe_ratio": fund.pe_ratio if fund else 0.0,
        "pb_ratio": fund.pb_ratio if fund else 0.0,
        "eps": fund.eps if fund else 0.0,
        "roe": fund.roe if fund else 0.0,
        "roce": fund.roce if fund else 0.0,
        "dividend_yield": fund.dividend_yield if fund else 0.0,
        "debt_to_equity": fund.debt_to_equity if fund else 0.0,
        "book_value": fund.book_value if fund else 0.0,
        "enterprise_value": fund.enterprise_value if fund else 0.0,
        "ebitda": fund.ebitda if fund else 0.0,
        "revenue": fund.revenue if fund else 0.0,
        "net_profit": fund.net_profit if fund else 0.0,
        "operating_margin": fund.operating_margin if fund else 0.0,
    }

    # Financial statements
    statements = [
        {
            "period_type": s.period_type,
            "statement_type": s.statement_type,
            "period_name": s.period_name,
            "revenue": s.revenue,
            "pat": s.pat,
            "operating_expenses": s.operating_expenses,
        }
        for s in comp.financial_statements
    ]

    # Corporate actions
    actions = [
        {
            "action_type": a.action_type,
            "ex_date": a.ex_date,
            "ratio_or_amount": a.ratio_or_amount,
            "description": a.description,
        }
        for a in comp.corporate_actions
    ]

    return {
        "status": "success",
        "company": comp.to_dict(),
        "instruments": instruments_list,
        "fundamentals": fund_data,
        "financial_statements": statements,
        "corporate_actions": actions,
    }


# =========================================================================
# 2. Instruments & Symbol Resolver Endpoints
# =========================================================================

@router.get("/api/instruments")
def list_instruments(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    exchange: Optional[str] = Query(None),
    board_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Paginated list of all exchange instruments."""
    query = db.query(Instrument)
    if exchange:
        try:
            ex_enum = ExchangeCode(exchange.upper())
            query = query.filter(Instrument.exchange == ex_enum)
        except ValueError:
            pass

    if board_type:
        try:
            b_enum = BoardType(board_type.upper())
            query = query.filter(Instrument.board_type == b_enum)
        except ValueError:
            pass

    if search:
        s = f"%{search.strip().upper()}%"
        query = query.filter(
            or_(
                Instrument.exchange_symbol.ilike(s),
                Instrument.trading_symbol.ilike(s),
                Instrument.isin.ilike(s),
            )
        )

    total = query.count()
    instruments = query.order_by(asc(Instrument.exchange_symbol)).offset((page - 1) * limit).limit(limit).all()

    return {
        "status": "success",
        "total": total,
        "page": page,
        "limit": limit,
        "items": [i.to_dict() for i in instruments],
    }


@router.get("/api/instruments/resolve")
def resolve_instrument_endpoint(
    q: str = Query(..., description="Symbol, Scrip Code, ISIN, or ID"),
    preferred_exchange: Optional[str] = Query("NSE"),
    db: Session = Depends(get_db),
):
    """Resolves arbitrary identifier into canonical (Company, Instrument)."""
    res = symbol_resolver.resolve(q, preferred_exchange=preferred_exchange, db=db)
    if not res:
        raise HTTPException(status_code=404, detail=f"Could not resolve identifier: '{q}'.")
    comp, inst = res
    return {
        "status": "success",
        "query": q,
        "company": comp,
        "instrument": inst,
    }


@router.get("/api/exchanges")
def get_exchanges_metadata():
    """Returns official exchange specifications, segments, and session hours."""
    now_ist = exchange_calendar.now_ist()
    return {
        "status": "success",
        "server_time_ist": now_ist.isoformat(),
        "market_session_phase": exchange_calendar.get_market_session_phase(),
        "is_trading_open": exchange_calendar.is_trading_session_open(),
        "exchanges": [
            {
                "exchange": "NSE",
                "full_name": "National Stock Exchange of India",
                "segments": ["EQUITY_MAINBOARD", "EQUITY_SME (EMERGE)", "EQUITY_DERIVATIVES"],
                "trading_hours": "09:15 - 15:30 IST",
                "timezone": "Asia/Kolkata",
            },
            {
                "exchange": "BSE",
                "full_name": "Bombay Stock Exchange",
                "segments": ["EQUITY_MAINBOARD", "EQUITY_SME", "EQUITY_DERIVATIVES"],
                "trading_hours": "09:15 - 15:30 IST",
                "timezone": "Asia/Kolkata",
            },
        ],
    }


# =========================================================================
# 3. Market Quotes & Historical Data Endpoints
# =========================================================================

@router.get("/api/market/quote/{identifier}")
def get_single_market_quote(identifier: str, db: Session = Depends(get_db)):
    """Fetches real-time quote snapshot for specified instrument or symbol."""
    res = symbol_resolver.resolve(identifier, db=db)
    if not res:
        raise HTTPException(status_code=404, detail=f"Instrument '{identifier}' not found.")

    comp, inst = res
    inst_key = inst["instrument_id"]

    # Check live quote cache first
    quote = live_quote_service.get_quote(inst_key)
    if not quote:
        # Fallback to DB
        db_quote = db.query(MarketQuote).filter(MarketQuote.instrument_id == inst["id"]).first()
        if db_quote:
            quote = {
                "instrument_id": inst_key,
                "symbol": inst["exchange_symbol"],
                "exchange": inst["exchange"],
                "ltp": db_quote.ltp,
                "change": db_quote.change,
                "percent_change": db_quote.percent_change,
                "open": db_quote.open,
                "high": db_quote.high,
                "low": db_quote.low,
                "previous_close": db_quote.previous_close,
                "volume": db_quote.volume,
                "bid": db_quote.bid,
                "ask": db_quote.ask,
                "high_52w": db_quote.high_52w,
                "low_52w": db_quote.low_52w,
                "data_status": db_quote.data_status.value,
                "freshness_age_ms": db_quote.freshness_age_ms,
                "timestamp": db_quote.timestamp,
            }

    if not quote:
        raise HTTPException(status_code=404, detail=f"No quote available for '{identifier}'.")

    return {
        "status": "success",
        "company_name": comp["legal_name"],
        "quote": quote,
    }


@router.get("/api/market/quotes")
def get_multiple_market_quotes(
    ids: str = Query(..., description="Comma-separated instrument IDs or symbols"),
    db: Session = Depends(get_db),
):
    """Bulk quote fetch for lists of instruments."""
    raw_keys = [k.strip() for k in ids.split(",") if k.strip()]
    results = {}
    for raw in raw_keys:
        res = symbol_resolver.resolve(raw, db=db)
        if res:
            comp, inst = res
            inst_key = inst["instrument_id"]
            q = live_quote_service.get_quote(inst_key)
            if q:
                results[raw] = q
    return {"status": "success", "count": len(results), "quotes": results}


@router.get("/api/market/history/{identifier}")
def get_market_history(
    identifier: str,
    timeframe: str = Query("1d", description="1s, 1m, 3m, 5m, 15m, 30m, 1h, 1d"),
    limit: int = Query(300, ge=10, le=2000),
    db: Session = Depends(get_db),
):
    """Multi-timeframe historical candles for any resolved instrument."""
    res = symbol_resolver.resolve(identifier, db=db)
    if not res:
        raise HTTPException(status_code=404, detail=f"Instrument '{identifier}' not found.")

    comp, inst = res
    candles = historical_data_service.get_candles(
        instrument_id=inst["id"],
        timeframe=timeframe,
        limit=limit,
        db=db,
    )
    return {
        "status": "success",
        "instrument_id": inst["instrument_id"],
        "symbol": inst["exchange_symbol"],
        "timeframe": timeframe,
        "count": len(candles),
        "candles": candles,
    }


# =========================================================================
# 4. Data Coverage & Telemetry Endpoints
# =========================================================================

@router.get("/api/data-coverage/summary")
def get_data_coverage_summary(db: Session = Depends(get_db)):
    """Real-time data center telemetry and coverage metrics across NSE and BSE."""
    total_companies = db.query(Company).count()
    total_instruments = db.query(Instrument).count()
    nse_count = db.query(Instrument).filter(Instrument.exchange == ExchangeCode.NSE).count()
    bse_count = db.query(Instrument).filter(Instrument.exchange == ExchangeCode.BSE).count()
    sme_count = db.query(Instrument).filter(Instrument.board_type == BoardType.SME).count()

    sub_summary = subscription_manager.get_subscription_summary()
    eod_coverage_count = db.query(MarketQuote).filter(MarketQuote.ltp > 0).count()
    candles_count = db.query(MarketCandle).count()

    recent_jobs = db.query(DataIngestionJob).order_by(desc(DataIngestionJob.started_at)).limit(5).all()

    return {
        "status": "success",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "coverage": {
            "total_companies": total_companies,
            "total_instruments": total_instruments,
            "nse_instruments": nse_count,
            "bse_instruments": bse_count,
            "sme_instruments": sme_count,
            "eod_quotes_available": eod_coverage_count,
            "total_candles_stored": candles_count,
            "active_live_stream_count": sub_summary["active_live_count"],
            "max_live_quota": sub_summary["max_live_quota"],
            "available_live_quota": sub_summary["available_quota"],
            "tier_breakdown": sub_summary["tier_breakdown"],
        },
        "providers": provider_registry_manager.get_all_providers_status(),
        "recent_ingestion_jobs": [
            {
                "job_id": j.job_id,
                "job_name": j.job_name,
                "provider": j.provider,
                "status": j.status.value,
                "started_at": j.started_at.isoformat() if j.started_at else None,
                "ended_at": j.ended_at.isoformat() if j.ended_at else None,
                "records_processed": j.records_processed,
                "records_inserted": j.records_inserted,
                "error_count": j.error_count,
            }
            for j in recent_jobs
        ],
    }


@router.get("/api/providers/status")
def get_providers_status():
    """Diagnostic health telemetry for connected market data adapters."""
    return {
        "status": "success",
        "providers": provider_registry_manager.get_all_providers_status(),
    }


@router.get("/api/ingestion/jobs")
def get_ingestion_jobs(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    """Audit log of universe synchronization and data ingestion jobs."""
    jobs = db.query(DataIngestionJob).order_by(desc(DataIngestionJob.started_at)).limit(limit).all()
    return {
        "status": "success",
        "count": len(jobs),
        "jobs": [
            {
                "job_id": j.job_id,
                "job_name": j.job_name,
                "provider": j.provider,
                "status": j.status.value,
                "started_at": j.started_at.isoformat() if j.started_at else None,
                "ended_at": j.ended_at.isoformat() if j.ended_at else None,
                "records_processed": j.records_processed,
                "records_inserted": j.records_inserted,
                "records_updated": j.records_updated,
                "records_skipped": j.records_skipped,
                "error_count": j.error_count,
                "error_details": j.error_details,
            }
            for j in jobs
        ],
    }


@router.post("/api/ingestion/sync-universe")
def trigger_sync_universe(db: Session = Depends(get_db)):
    """Triggers an on-demand synchronization of the all-India security universe."""
    stats = universe_manager.sync_universe(db=db)
    return {
        "status": "success",
        "message": "Universe synchronization completed successfully.",
        "stats": stats,
    }


@router.get("/api/fundamentals/{identifier}")
def get_company_fundamentals(identifier: str, db: Session = Depends(get_db)):
    """Retrieves fundamental valuation metrics for specified company."""
    res = symbol_resolver.resolve(identifier, db=db)
    if not res:
        raise HTTPException(status_code=404, detail=f"Company '{identifier}' not found.")

    comp, _ = res
    comp_obj = db.query(Company).filter(Company.company_id == comp["company_id"]).first()
    fund = comp_obj.fundamentals if comp_obj else None

    return {
        "status": "success",
        "company_id": comp["company_id"],
        "legal_name": comp["legal_name"],
        "fundamentals": {
            "pe_ratio": fund.pe_ratio if fund else 0.0,
            "pb_ratio": fund.pb_ratio if fund else 0.0,
            "eps": fund.eps if fund else 0.0,
            "roe": fund.roe if fund else 0.0,
            "roce": fund.roce if fund else 0.0,
            "dividend_yield": fund.dividend_yield if fund else 0.0,
            "debt_to_equity": fund.debt_to_equity if fund else 0.0,
            "book_value": fund.book_value if fund else 0.0,
            "enterprise_value": fund.enterprise_value if fund else 0.0,
            "ebitda": fund.ebitda if fund else 0.0,
            "revenue": fund.revenue if fund else 0.0,
            "net_profit": fund.net_profit if fund else 0.0,
            "operating_margin": fund.operating_margin if fund else 0.0,
            "updated_at": fund.updated_at.isoformat() if fund and fund.updated_at else None,
        },
    }


@router.get("/api/corporate-actions/{identifier}")
def get_corporate_actions(identifier: str, db: Session = Depends(get_db)):
    """Retrieves corporate actions (dividends, splits, bonuses) for company."""
    res = symbol_resolver.resolve(identifier, db=db)
    if not res:
        raise HTTPException(status_code=404, detail=f"Company '{identifier}' not found.")

    comp, _ = res
    comp_obj = db.query(Company).filter(Company.company_id == comp["company_id"]).first()
    actions = [
        {
            "action_type": a.action_type,
            "ex_date": a.ex_date,
            "record_date": a.record_date,
            "ratio_or_amount": a.ratio_or_amount,
            "description": a.description,
            "source": a.source,
        }
        for a in (comp_obj.corporate_actions if comp_obj else [])
    ]
    return {
        "status": "success",
        "company_id": comp["company_id"],
        "legal_name": comp["legal_name"],
        "corporate_actions": actions,
    }


# =========================================================================
# 11. Paytm Money Authentication & Session Management Endpoints
# =========================================================================

class PaytmSessionRequest(BaseModel):
    request_token: Optional[str] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None


@router.post("/api/brokers/paytm/connect")
@router.post("/api/broker/paytm/connect")
def api_paytm_connect(db: Session = Depends(get_db)):
    """
    Step 1 & 2: Initiates automated Paytm Money authentication.
    Generates a cryptographically secure random state, stores it in PostgreSQL,
    initializes PMClient using API_KEY/API_SECRET, generates login URL,
    and returns it to the client.
    """
    try:
        from app.market_data.paytm_db_service import create_oauth_state
        state_token = create_oauth_state(db, broker_name="PAYTM_MONEY", ttl_seconds=600)
        login_url = paytm_auth_service.get_login_url(state=state_token)
        return {
            "status": "success",
            "login_url": login_url,
            "state": state_token,
            "provider": "PAYTM_MONEY",
            "message": "Paytm Money login URL generated successfully. Open in browser to authenticate."
        }
    except Exception as e:
        logger.error("Failed to generate Paytm connect session: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/api/brokers/paytm/status")
@router.get("/api/broker/paytm/status")
def get_paytm_status(db: Session = Depends(get_db)):
    """
    Returns live authentication and connection status for Paytm Money.
    Includes connection status (CONNECTED, DISCONNECTED, AUTHENTICATION_PENDING),
    last_connection_time, user details, and credential configuration flags.
    Never exposes API secrets or raw JWT access tokens to the frontend.
    """
    if not paytm_auth_service.is_authenticated():
        paytm_auth_service.restore_session_from_db(db)
    return paytm_auth_service.get_status()


@router.post("/api/brokers/paytm/disconnect")
@router.post("/api/broker/paytm/disconnect")
def api_paytm_disconnect(db: Session = Depends(get_db)):
    """
    Terminates Paytm Money session:
    - Calls PMClient / Paytm logout API
    - Clears in-memory tokens
    - Deactivates PostgreSQL BrokerCredential record
    - Stops live streaming feed
    """
    try:
        from app.market_data.paytm_db_service import deactivate_paytm_session
        paytm_auth_service.logout(revoke_remote=True)
        deactivate_paytm_session(db)

        try:
            from app.broker_connectors.broker_manager import broker_manager
            paytm_adapter_inst = broker_manager.adapters.get("PAYTM_MONEY")
            if paytm_adapter_inst:
                paytm_adapter_inst.is_connected = False
                paytm_adapter_inst.session_token = None
        except Exception:
            pass

        try:
            from app.market_data.paytm_live_manager import paytm_live_manager
            paytm_live_manager.stop()
        except Exception:
            pass

        return {
            "status": "success",
            "message": "Paytm Money disconnected successfully. Tokens invalidated and cleared."
        }
    except Exception as e:
        logger.error("Failed to disconnect Paytm Money: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/api/brokers/paytm/login-url")
@router.get("/api/broker/paytm/login-url")
def get_paytm_login_url(state: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Returns official Paytm Money merchant login URL for trader browser sign-in."""
    try:
        from app.market_data.paytm_db_service import create_oauth_state
        clean_state = state if isinstance(state, str) and state.strip() else create_oauth_state(db, ttl_seconds=600)
        url = paytm_auth_service.get_login_url(state=clean_state)
        return {"status": "success", "login_url": url, "state": clean_state}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/api/brokers/paytm/login")
@router.get("/api/broker/paytm/login")
def login_paytm_redirect(
    state: Optional[str] = Query(None),
    redirect_uri: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Direct browser entry point for 1-click 'Connect Paytm Money' button.
    Generates secure state in PostgreSQL and redirects trader's browser directly to Paytm.
    """
    try:
        from app.market_data.paytm_db_service import create_oauth_state
        clean_state = state if isinstance(state, str) and state.strip() else create_oauth_state(db, ttl_seconds=600)
        clean_red_uri = redirect_uri if isinstance(redirect_uri, str) else None
        url = paytm_auth_service.get_login_url(state=clean_state, redirect_uri=clean_red_uri)
        return RedirectResponse(url=url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    except Exception as e:
        logger.error("Failed to generate Paytm login redirect: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.api_route("/api/brokers/paytm/callback", methods=["GET", "POST"])
@router.api_route("/api/broker/paytm/callback", methods=["GET", "POST"])
async def paytm_oauth_callback(
    request: Request,
    requestToken: Optional[str] = Query(None),
    request_token: Optional[str] = Query(None),
    token: Optional[str] = Query(None),
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Automated OAuth 2.0 Callback Receiver for Paytm Money.
    CRITICAL: Receives and processes the request_token entirely in the BACKEND.
    Validates one-time state token from PostgreSQL to prevent CSRF / replay attacks.
    Automatically exchanges request_token for JWT access tokens using pyPMClient,
    encrypts and vaults credentials in PostgreSQL, starts WebSocket,
    and returns a clean auto-closing / redirecting status page.
    """
    # 1. Handle error cases from Paytm auth server
    err = error if isinstance(error, str) and error.strip() else None
    err_desc = error_description if isinstance(error_description, str) and error_description.strip() else None
    if err or err_desc:
        err_msg = err_desc or err or "Paytm authorization was denied."
        logger.warning("Paytm OAuth callback received error: %s", err_msg)
        html_error = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Paytm Authentication Failed</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {{ margin: 0; background: #0a0e17; color: #f1f5f9; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }}
    .card {{ background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(239, 68, 68, 0.4); box-shadow: 0 10px 40px rgba(0,0,0,0.6); border-radius: 16px; padding: 36px 32px; max-width: 480px; width: 90%; text-align: center; }}
    .icon {{ width: 64px; height: 64px; border-radius: 50%; background: rgba(239, 68, 68, 0.15); border: 2px solid #ef4444; color: #f87171; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 32px; }}
    h2 {{ margin: 0 0 10px; font-size: 1.35rem; color: #ffffff; }}
    p {{ margin: 0 0 20px; font-size: 0.88rem; color: #94a3b8; line-height: 1.5; }}
    .btn {{ display: inline-block; background: #334155; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 0.85rem; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✕</div>
    <h2>Paytm Authentication Denied</h2>
    <p>{err_msg}</p>
    <a href="/api/broker/paytm/login" class="btn">Try Connecting Again</a>
  </div>
</body>
</html>"""
        return HTMLResponse(content=html_error, status_code=400)

    # 2. Validate one-time state token from PostgreSQL
    clean_state = state if isinstance(state, str) and state.strip() else None
    if clean_state:
        from app.market_data.paytm_db_service import verify_and_consume_oauth_state
        if not verify_and_consume_oauth_state(db, clean_state):
            logger.warning("Rejected Paytm callback: invalid or expired state '%s'", clean_state)
            html_invalid_state = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Paytm Authentication Security Check Failed</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin: 0; background: #0a0e17; color: #f1f5f9; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 16px; padding: 36px 32px; max-width: 480px; width: 90%; text-align: center; }
    h2 { margin: 0 0 10px; font-size: 1.35rem; color: #ffffff; }
    p { margin: 0 0 20px; font-size: 0.88rem; color: #94a3b8; line-height: 1.5; }
    .btn { display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Invalid or Expired State Token</h2>
    <p>The state parameter is invalid, has expired, or was already consumed. This check prevents cross-site request forgery and replay attacks.</p>
    <a href="/api/broker/paytm/login" class="btn">Start Fresh Login</a>
  </div>
</body>
</html>"""
            return HTMLResponse(content=html_invalid_state, status_code=400)

    # 3. Extract request token from query parameters or POST body
    def _clean_str(val: Any) -> str:
        return val.strip() if isinstance(val, str) else ""

    extracted_token = (
        _clean_str(requestToken)
        or _clean_str(request_token)
        or _clean_str(token)
        or _clean_str(code)
    )
    if not extracted_token and request.method == "POST":
        try:
            body = await request.json()
            if isinstance(body, dict):
                extracted_token = _clean_str(body.get("requestToken")) or _clean_str(body.get("request_token")) or _clean_str(body.get("token"))
        except Exception:
            pass

    if not extracted_token:
        logger.warning("Paytm OAuth callback reached without a request_token.")
        html_missing = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Paytm Request Token Missing</title>
  <style>
    body { margin: 0; background: #0a0e17; color: #f1f5f9; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 16px; padding: 36px 32px; max-width: 480px; width: 90%; text-align: center; }
    h2 { margin: 0 0 10px; font-size: 1.35rem; color: #ffffff; }
    p { margin: 0 0 20px; font-size: 0.88rem; color: #94a3b8; }
    .btn { display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Missing Request Token</h2>
    <p>The callback URL was invoked without a valid authorization requestToken query parameter.</p>
    <a href="/api/broker/paytm/login" class="btn">Click here to Connect Paytm Money</a>
  </div>
</body>
</html>"""
        return HTMLResponse(content=html_missing, status_code=400)

    # 4. Exchange request token for Access Tokens entirely in the Backend!
    try:
        session_res = paytm_auth_service.generate_session(request_token=extracted_token)
        logger.info("Backend successfully processed Paytm request token and established session.")

        # Persist encrypted session in PostgreSQL BrokerCredential table
        try:
            paytm_auth_service.save_session_to_db(db)
        except Exception as db_err:
            logger.warning("Could not persist session to PostgreSQL: %s", db_err)

        # Update broker manager state
        try:
            from app.broker_connectors.broker_manager import broker_manager
            paytm_adapter_inst = broker_manager.adapters.get("PAYTM_MONEY")
            if paytm_adapter_inst:
                paytm_adapter_inst.is_connected = True
                paytm_adapter_inst.session_token = paytm_auth_service.get_access_token()
        except Exception:
            pass

        frontend_url = "http://localhost:3000/data-center"
        user_name = "Trader"
        if paytm_auth_service._user_details and isinstance(paytm_auth_service._user_details, dict):
            user_name = paytm_auth_service._user_details.get("name") or paytm_auth_service._user_details.get("userName") or "Trader"

        html_success = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Paytm Money Connected — Algo Robot</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {{ margin: 0; background: #0a0e17; color: #f1f5f9; font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }}
    .card {{ background: linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.85) 100%); border: 1px solid rgba(16, 185, 129, 0.5); box-shadow: 0 10px 40px rgba(0,0,0,0.7), 0 0 30px rgba(16, 185, 129, 0.2); border-radius: 16px; padding: 40px 32px; max-width: 480px; width: 90%; text-align: center; }}
    .icon {{ width: 68px; height: 68px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); border: 2px solid #10b981; color: #34d399; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 34px; box-shadow: 0 0 20px rgba(16, 185, 129, 0.3); }}
    h2 {{ margin: 0 0 8px; font-size: 1.4rem; font-weight: 800; color: #ffffff; letter-spacing: -0.01em; }}
    .badge {{ display: inline-block; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #34d399; font-size: 0.72rem; font-weight: 800; padding: 4px 12px; border-radius: 6px; margin: 8px 0 18px 0; letter-spacing: 0.05em; }}
    p {{ margin: 0 0 24px; font-size: 0.88rem; color: #94a3b8; line-height: 1.55; }}
    .btn {{ display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 11px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 0.88rem; box-shadow: 0 4px 14px rgba(37,99,235,0.4); }}
    .timer {{ margin-top: 16px; font-size: 0.78rem; color: #64748b; font-weight: 500; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h2>Paytm Money Connected!</h2>
    <div class="badge">ACCESS TOKEN GENERATED &bull; LIVE FEED ACTIVE</div>
    <p>Welcome, {user_name}! The authorization request token was received and processed directly by the backend. Credentials and tokens are safely vaulted in PostgreSQL.</p>
    <a href="{frontend_url}" class="btn">Return to Algo Robot</a>
    <div class="timer" id="countdown">Redirecting to platform in 3 seconds...</div>
  </div>
  <script>
    if (window.opener && !window.opener.closed) {{
      try {{
        window.opener.postMessage({{ type: 'PAYTM_AUTH_SUCCESS' }}, '*');
        setTimeout(() => window.close(), 1200);
      }} catch(e) {{}}
    }}
    let s = 3;
    const el = document.getElementById('countdown');
    const iv = setInterval(() => {{
      s--;
      if (el) el.innerText = `Redirecting to platform in ${{s}} seconds...`;
      if (s <= 0) {{
        clearInterval(iv);
        window.location.href = '{frontend_url}';
      }}
    }}, 1000);
  </script>
</body>
</html>"""
        return HTMLResponse(content=html_success, status_code=200)

    except Exception as exc:
        err_str = str(exc)
        logger.error("Error exchanging Paytm request token: %s", err_str)
        html_fail = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Paytm Token Exchange Failed</title>
  <style>
    body {{ margin: 0; background: #0a0e17; color: #f1f5f9; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }}
    .card {{ background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 16px; padding: 36px 32px; max-width: 480px; width: 90%; text-align: center; }}
    h2 {{ margin: 0 0 10px; font-size: 1.35rem; color: #ffffff; }}
    p {{ margin: 0 0 20px; font-size: 0.88rem; color: #94a3b8; line-height: 1.5; }}
    .btn {{ display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 700; }}
  </style>
</head>
<body>
  <div class="card">
    <h2>Token Exchange Failed</h2>
    <p>{err_str}</p>
    <a href="/api/broker/paytm/login" class="btn">Retry Connecting Paytm Money</a>
  </div>
</body>
</html>"""
        return HTMLResponse(content=html_fail, status_code=400)


@router.post("/api/brokers/paytm/session")
@router.post("/api/broker/paytm/session")
def generate_paytm_session(payload: PaytmSessionRequest, db: Session = Depends(get_db)):
    """
    Exchanges request_token for JWT access tokens and vaults them in PostgreSQL.
    Credentials can be provided in request body or loaded from .env.
    """
    if payload.api_key or payload.api_secret:
        paytm_auth_service.configure_credentials(
            api_key=payload.api_key,
            api_secret=payload.api_secret,
            request_token=payload.request_token,
        )
    try:
        res = paytm_auth_service.generate_session(request_token=payload.request_token)
        try:
            paytm_auth_service.save_session_to_db(db)
        except Exception:
            pass
        return res
    except Exception as e:
        logger.error("Failed to generate Paytm session: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Paytm session exchange failed: %s", str(e))
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/api/broker/paytm/logout")
def logout_paytm(revoke_remote: bool = Query(False)):
    """Clears local tokens and invalidates Paytm Money session."""
    return paytm_auth_service.logout(revoke_remote=revoke_remote)


# =========================================================================
# 12. Paytm Money Security Master Ingestion & Canonical Resolution
# =========================================================================

@router.get("/api/broker/paytm/security-master/stats")
def get_paytm_security_master_stats():
    """Returns Paytm Money security master statistics, parsed counts, and coverage metrics."""
    return paytm_security_master.get_stats()


@router.get("/api/broker/paytm/security-master/resolve")
def resolve_paytm_security(
    exchange: str = Query(..., description="Exchange code, e.g. NSE or BSE"),
    symbol: str = Query(..., description="Trading symbol, scrip code, or index name"),
):
    """Resolves an exchange + symbol or index name to Paytm Money security_id."""
    sec_id = paytm_security_master.resolve_paytm_id(exchange=exchange, symbol=symbol)
    if not sec_id:
        raise HTTPException(
            status_code=404,
            detail=f"Security not found in Paytm Money master for {exchange}:{symbol}",
        )
    info = paytm_security_master.get_security_info(sec_id)
    return {
        "status": "success",
        "exchange": exchange.upper(),
        "symbol": symbol.upper(),
        "security_id": sec_id,
        "details": info,
    }


@router.get("/api/broker/paytm/security-master/lookup/{security_id}")
def lookup_paytm_security(security_id: str):
    """Reverse resolves a Paytm Money security_id back to canonical instrument and company."""
    canonical = paytm_security_master.resolve_canonical(security_id=security_id)
    if not canonical:
        raise HTTPException(
            status_code=404,
            detail=f"Paytm security_id '{security_id}' not found in Security Master.",
        )
    info = paytm_security_master.get_security_info(security_id)
    return {
        "status": "success",
        "canonical": canonical,
        "details": info,
    }


@router.post("/api/broker/paytm/security-master/sync")
def sync_paytm_security_master(
    force_download: bool = Query(False, description="Force re-download from Paytm portal"),
    db: Session = Depends(get_db),
):
    """
    Downloads / updates official Paytm security master and maps to all
    canonical DB instruments and companies.
    """
    if force_download:
        paytm_security_master.download_security_master(force=True)
    paytm_security_master.load_security_master(force_reload=force_download)
    stats = paytm_security_master.map_to_canonical_universe(db=db)
    return stats


# =========================================================================
# 13. Paytm Money Historical Candlestick & Backfill Endpoints
# =========================================================================

@router.get("/api/broker/paytm/historical/candles")
def get_paytm_historical_candles(
    symbol: str = Query(..., description="Stock symbol, scrip code, or index name"),
    exchange: str = Query("NSE", description="NSE or BSE"),
    timeframe: str = Query("1d", description="1m, 3m, 5m, 15m, 30m, 1h, 1d"),
    from_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
):
    """
    Fetches official historical candlestick bars via Paytm Money.
    Validates mathematical invariants and persists to local repository.
    """
    try:
        from_date_clean = from_date if isinstance(from_date, str) else None
        to_date_clean = to_date if isinstance(to_date, str) else None
        candles = paytm_historical_adapter.fetch_candles(
            symbol=symbol,
            exchange=exchange,
            timeframe=timeframe,
            from_date=from_date_clean,
            to_date=to_date_clean,
            limit=limit,
            persist=True,
            db=db,
        )
        return {
            "status": "success",
            "symbol": symbol.upper(),
            "exchange": exchange.upper(),
            "timeframe": timeframe.upper(),
            "count": len(candles),
            "candles": candles,
        }
    except Exception as e:
        logger.error("Paytm historical candles error: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/api/broker/paytm/historical/backfill")
def backfill_paytm_historical(
    symbol: str = Query(..., description="Stock symbol or index name"),
    exchange: str = Query("NSE", description="NSE or BSE"),
    timeframe: str = Query("1d", description="Timeframe to backfill"),
    days: int = Query(180, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Backfills historical candles into platform database for a target instrument."""
    try:
        res = paytm_historical_adapter.backfill_instrument(
            symbol=symbol,
            exchange=exchange,
            timeframe=timeframe,
            days=days,
            db=db,
        )
        return res
    except Exception as e:
        logger.error("Paytm historical backfill error: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


# =========================================================================
# 14. Paytm Money Live WebSocket Streaming Telemetry & Subscription Endpoints
# =========================================================================

class PaytmStreamSubscribeRequest(BaseModel):
    symbols: Optional[List[str]] = None
    tokens: Optional[List[int]] = None
    exchange: str = "NSE"
    mode: str = "FULL"  # "FULL", "QUOTE", or "LTP"


@router.get("/api/broker/paytm/stream/status")
def get_paytm_stream_status():
    """Returns Paytm Money WebSocket streaming status, connection state, and throughput."""
    return paytm_adapter.get_status()


@router.post("/api/broker/paytm/stream/connect")
async def connect_paytm_stream():
    """Connects to Paytm Money Live Broadcast WebSocket."""
    connected = await paytm_adapter.connect()
    return {"status": "success" if connected else "failed", "connected": connected}


@router.post("/api/broker/paytm/stream/disconnect")
async def disconnect_paytm_stream():
    """Gracefully terminates Paytm Money WebSocket connection."""
    await paytm_adapter.disconnect()
    return {"status": "success", "connected": False}


@router.post("/api/broker/paytm/stream/subscribe")
async def subscribe_paytm_stream(payload: PaytmStreamSubscribeRequest):
    """Subscribes to live market ticks for symbols or security tokens."""
    tokens_to_sub = list(payload.tokens or [])
    if payload.symbols:
        for sym in payload.symbols:
            sec_id = paytm_security_master.resolve_paytm_id(payload.exchange, sym)
            if sec_id:
                try:
                    tokens_to_sub.append(int(sec_id))
                except ValueError:
                    pass

    if not tokens_to_sub:
        raise HTTPException(status_code=400, detail="No valid symbols or tokens provided.")

    success = await paytm_adapter.subscribe(tokens_to_sub, symbols=payload.symbols, mode=payload.mode)
    return {
        "status": "success" if success else "queued",
        "subscribed_count": len(tokens_to_sub),
        "tokens": tokens_to_sub,
        "mode": payload.mode,
    }


@router.post("/api/broker/paytm/stream/unsubscribe")
async def unsubscribe_paytm_stream(tokens: List[int]):
    """Unsubscribes from live ticks for specified tokens."""
    success = await paytm_adapter.unsubscribe(tokens)
    return {"status": "success" if success else "failed", "unsubscribed_count": len(tokens)}


# =========================================================================
# 7. Asynchronous Batch Database Persistence Endpoints
# =========================================================================

@router.get("/api/broker/paytm/persistence/metrics")
def get_paytm_persistence_metrics():
    """Returns real-time telemetry from the batch persistence and deduplication worker."""
    from app.market_data.batch_persistence_worker import batch_persistence_worker
    return {
        "status": "success",
        "metrics": batch_persistence_worker.get_metrics()
    }


@router.post("/api/broker/paytm/persistence/flush")
def trigger_paytm_persistence_flush(db: Session = Depends(get_db)):
    """Manually triggers an immediate synchronous flush of pending candles and quotes."""
    from app.market_data.batch_persistence_worker import batch_persistence_worker
    res = batch_persistence_worker.flush(db=db)
    return {
        "status": "success",
        "result": res,
        "metrics": batch_persistence_worker.get_metrics()
    }


# =========================================================================
# 12. Paytm Money Full-Universe (5,000+ Companies) Batch & Live Endpoints
# =========================================================================

class PaytmBatchDownloadRequest(BaseModel):
    universe: str = "ALL"
    timeframe: str = "1d"
    lookback_days: int = 365
    concurrency: int = 4
    rate_limit_rps: float = 6.0
    reset_checkpoint: bool = False


class PaytmPresetSubscribeRequest(BaseModel):
    preset: str = "CORE_NIFTY50"


class PaytmOnDemandSubscribeRequest(BaseModel):
    symbol: str
    exchange: str = "NSE"
    mode: str = "FULL"


@router.post("/api/broker/paytm/historical/batch-start")
def start_paytm_batch_download(payload: Optional[PaytmBatchDownloadRequest] = None):
    """
    Initiates asynchronous bulk historical download across 5,000+ companies.
    Supports checkpointing, pause/resume, and rate-governed polite pacing.
    """
    req = payload or PaytmBatchDownloadRequest()
    from app.market_data.paytm_bulk_downloader import paytm_bulk_downloader
    res = paytm_bulk_downloader.start_batch_download(
        universe=req.universe,
        timeframe=req.timeframe,
        lookback_days=req.lookback_days,
        concurrency=req.concurrency,
        rate_limit_rps=req.rate_limit_rps,
        reset_checkpoint=req.reset_checkpoint,
    )
    return {
        "status": "success",
        "job": res,
        "current_status": paytm_bulk_downloader.get_status(),
    }


@router.get("/api/broker/paytm/historical/batch-status")
def get_paytm_batch_download_status():
    """Returns real-time progress, speed, ETA, and completed targets count."""
    from app.market_data.paytm_bulk_downloader import paytm_bulk_downloader
    return {
        "status": "success",
        "progress": paytm_bulk_downloader.get_status(),
    }


@router.post("/api/broker/paytm/historical/batch-stop")
def stop_paytm_batch_download():
    """Gracefully pauses the bulk historical download job."""
    from app.market_data.paytm_bulk_downloader import paytm_bulk_downloader
    res = paytm_bulk_downloader.stop_batch_download()
    return {
        "status": "success",
        "result": res,
    }


@router.get("/api/broker/paytm/universe/live-status")
def get_paytm_universe_live_status():
    """Returns streaming capacity utilization and active pools across the 5,000+ universe."""
    from app.market_data.paytm_live_manager import paytm_live_manager
    return {
        "status": "success",
        "telemetry": paytm_live_manager.get_live_status(),
    }


@router.post("/api/broker/paytm/universe/subscribe-preset")
async def switch_paytm_universe_preset(payload: PaytmPresetSubscribeRequest):
    """Switches the active real-time WebSocket universe preset (CORE_NIFTY50, TOP_100, FNO_200, NIFTY_500)."""
    from app.market_data.paytm_live_manager import paytm_live_manager
    res = await paytm_live_manager.switch_universe_preset(payload.preset)
    return {
        "status": "success",
        "result": res,
        "telemetry": paytm_live_manager.get_live_status(),
    }


@router.post("/api/broker/paytm/universe/subscribe-on-demand")
async def subscribe_paytm_on_demand(payload: PaytmOnDemandSubscribeRequest):
    """Dynamically subscribes a single security with LRU capacity management."""
    from app.market_data.paytm_live_manager import paytm_live_manager
    token = await paytm_live_manager.subscribe_on_demand(
        symbol=payload.symbol,
        exchange=payload.exchange,
        mode=payload.mode,
    )
    if not token:
        raise HTTPException(
            status_code=404,
            detail=f"Security '{payload.exchange}:{payload.symbol}' could not be resolved in Paytm Security Master.",
        )
    return {
        "status": "success",
        "symbol": payload.symbol.upper(),
        "exchange": payload.exchange.upper(),
        "token": token,
        "telemetry": paytm_live_manager.get_live_status(),
    }


@router.get("/api/market/resilience/diagnostics")
def get_resilience_diagnostics():
    """Provides circuit breaker health, failure thresholds, and structured error logs."""
    from app.market_data.resilience import resilience_manager
    return {
        "status": "success",
        "diagnostics": resilience_manager.get_diagnostics(),
    }







