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
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, desc, asc

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

    if search:
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

    if sector and sector.upper() != "ALL":
        base_query = base_query.filter(Company.sector.ilike(f"%{sector.strip()}%"))

    if market_cap and market_cap.upper() != "ALL":
        try:
            mcap_enum = MarketCapCategory(market_cap.upper())
            base_query = base_query.filter(Company.market_cap_category == mcap_enum)
        except ValueError:
            pass

    if status and status.upper() != "ALL":
        try:
            status_enum = InstrumentStatus(status.upper())
            base_query = base_query.filter(Company.listing_status == status_enum)
        except ValueError:
            pass

    if exchange and exchange.upper() in ("NSE", "BSE"):
        ex_enum = ExchangeCode(exchange.upper())
        base_query = base_query.filter(Company.instruments.any(Instrument.exchange == ex_enum))
    elif exchange and exchange.upper() == "BOTH":
        # Companies listed on both NSE and BSE
        base_query = base_query.filter(
            Company.instruments.any(Instrument.exchange == ExchangeCode.NSE),
            Company.instruments.any(Instrument.exchange == ExchangeCode.BSE),
        )

    if board_type and board_type.upper() in ("MAINBOARD", "SME"):
        b_enum = BoardType(board_type.upper())
        base_query = base_query.filter(Company.instruments.any(Instrument.board_type == b_enum))

    # Overall Metrics
    total_listed = db.query(Company).count()
    nse_count = db.query(Instrument).filter(Instrument.exchange == ExchangeCode.NSE).count()
    bse_count = db.query(Instrument).filter(Instrument.exchange == ExchangeCode.BSE).count()
    sme_count = db.query(Instrument).filter(Instrument.board_type == BoardType.SME).count()
    mainboard_count = db.query(Instrument).filter(Instrument.board_type == BoardType.MAINBOARD).count()
    active_count = db.query(Company).filter(Company.listing_status == InstrumentStatus.ACTIVE).count()
    suspended_count = db.query(Company).filter(Company.listing_status == InstrumentStatus.SUSPENDED).count()

    total_filtered = base_query.count()

    # Sorting
    sort_column = getattr(Company, sort_by, Company.market_cap_cr)
    order_func = desc if sort_dir.lower() == "desc" else asc
    paginated_query = base_query.order_by(order_func(sort_column)).offset((page - 1) * limit).limit(limit)
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
        "metrics": {
            "total_listed_companies": total_listed,
            "nse_instruments": nse_count,
            "bse_instruments": bse_count,
            "mainboard_instruments": mainboard_count,
            "sme_instruments": sme_count,
            "active_companies": active_count,
            "suspended_companies": suspended_count,
        },
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
