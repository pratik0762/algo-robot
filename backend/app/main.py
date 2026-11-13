"""FastAPI Backend Server for Nifty 50 Financial Reports, All Indices, GIFT NIFTY, INDIA VIX, and Live Stock Ticks."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import json
import logging
import time
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse, ORJSONResponse

from app.models import (
    CompanySummary,
    CompanyDetail,
    IndexItem,
    GiftNiftyDetail,
    IndiaVixDetail,
    NewsItem,
    NewsResponse,
    DealItem,
    DealsResponse,
    Week52Response
)
from app.companies_data import (
    NIFTY_50_REGISTRY,
    get_all_companies_summary,
    get_company_full_detail
)
from app.nse_client import NseClient
from app.market_status import get_indian_market_status
from app.tick_engine import tick_engine, is_indian_market_open, get_gift_nifty_session_info
from app.tradingview_client import tv_streamer
from app.news_engine import news_engine
from app.institutional_holdings_engine import institutional_engine
from app.deals_engine import deals_engine
from app.week52_engine import week52_engine
from app.signals_heatmap_engine import signals_heatmap_engine
from app.trade_signals_engine import get_trade_signals, generate_live_signal_event, AVAILABLE_STRATEGIES
from app.dashboard_html import get_backend_dashboard_html
try:
    from app.tickertape_client import tickertape_client
except ImportError:
    from backend.app.tickertape_client import tickertape_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api")

async def tick_background_loop():
    """Background loop keeping stock prices and GIFT Nifty synchronized with live market feeds and broadcasting ticks."""
    logger.info("Starting live stock & GIFT NIFTY tick broadcast loop with real market feed sync...")
    last_stock_sync = time.time()
    last_gift_sync = time.time()
    last_gift_tick_time = time.time()
    last_news_sync = time.time()
    last_indices_sync = time.time()
    last_signal_gen = time.time()

    while True:
        try:
            now = time.time()
            gift_session = get_gift_nifty_session_info()

            # Refresh live news intelligence every 120s
            if now - last_news_sync >= 120.0:
                await news_engine.refresh_live_news()
                last_news_sync = now

            # Refresh all 140+ indices in background every 45s
            if now - last_indices_sync >= 45.0:
                await asyncio.to_thread(nse_client.fetch_all_indices)
                last_indices_sync = now

            # Scan and evaluate genuine quantitative trade signals every 30s
            if now - last_signal_gen >= 30.0:
                new_sig = generate_live_signal_event()
                if new_sig:
                    await tick_engine.broadcast_trade_signal(new_sig)
                # Phase 5 & 6: Process signal lifecycle outcomes and broadcast updates over WebSocket
                from app.signal_tracker import signal_tracker
                from app.trade_signals_engine import initialize_trade_signals
                all_sigs = initialize_trade_signals()
                updated_sigs = signal_tracker.process_all_signals_lifecycle(all_sigs, tick_engine.stocks)
                for sig in updated_sigs:
                    if sig.get("status") in ("TARGET_1_HIT", "TARGET_2_HIT", "STOP_LOSS_HIT") and not sig.get("outcome_broadcasted"):
                        sig["outcome_broadcasted"] = True
                        await tick_engine.broadcast_signal_lifecycle_update(sig)
                last_signal_gen = now

            # 1. Domestic equity cash stocks (09:15 - 15:30 IST)
            if is_indian_market_open():
                if now - last_stock_sync >= 8.0:
                    await tick_engine.refresh_live_quotes()
                    last_stock_sync = now

                ticks = tick_engine.update_ticks()
                if ticks:
                    await tick_engine.broadcast_tick_update(ticks)
            else:
                # Outside active market hours: sync official closing/settlement prices every 180s
                if now - last_stock_sync >= 180.0:
                    await tick_engine.sync_initial_live_quotes()
                    last_stock_sync = now

            # 2. GIFT Nifty Multi-Session Trading: Session 1 (06:30 - 15:40) & Session 2 (16:35 - 02:45 IST)
            if gift_session["is_open"]:
                if now - last_gift_sync >= 6.0:
                    await tick_engine.refresh_live_gift_nifty()
                    last_gift_sync = now

                # If TradingView tick has not arrived within the last 2 seconds, emit micro-tick pacing
                if (now - tv_streamer._last_tick_time >= 2.0) and (now - last_gift_tick_time >= 1.5):
                    gift_tick = tick_engine.update_gift_nifty_tick()
                    if gift_tick:
                        await tick_engine.broadcast_gift_nifty_update(gift_tick)
                    last_gift_tick_time = now

        except Exception as e:
            logger.error("Tick broadcast error: %s", e)
        await asyncio.sleep(0.6)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Setup TradingView real-time WebSocket tick stream for GIFT Nifty (NSEIX:NIFTY1!)
    async def on_tradingview_tick(tv_data: Dict[str, Any]):
        session = get_gift_nifty_session_info()
        if session["is_open"]:
            tick_engine.gift_nifty.update(tv_data)
            await tick_engine.broadcast_gift_nifty_update(tick_engine.get_gift_nifty())

    tv_streamer.on_tick_callback = on_tradingview_tick
    tv_streamer.start()

    # Pre-warm FII/DII, Indices, News, and Live Quotes cache asynchronously without delaying server startup
    asyncio.create_task(asyncio.to_thread(nse_client.fetch_fii_dii_data))
    asyncio.create_task(asyncio.to_thread(nse_client.fetch_all_indices))
    asyncio.create_task(news_engine.refresh_live_news())
    asyncio.create_task(tick_engine.sync_initial_live_quotes())

    # Startup: spawn tick background loop
    tick_task = asyncio.create_task(tick_background_loop())
    yield
    # Shutdown: cancel task & stop TradingView streamer
    tv_streamer.stop()
    tick_task.cancel()

app = FastAPI(
    title="Nifty 50 & Indian Indices Financial Platform (NSE India)",
    description="Official financial statements, all 139+ NSE/BSE indices, GIFT NIFTY, INDIA VIX, and Live Stock Ticks.",
    version="1.2.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan
)

# High-Performance Compression: Compresses large JSON payloads by 80%+ (cuts network bandwidth and latency)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Enable CORS for Next.js frontend running on localhost:3000 / 127.0.0.1:3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Latency and observability middleware: tracks execution duration on every response
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start_time) * 1000.0
    response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"
    response.headers["X-Platform"] = "AlgoRobot-HighPerformance"
    return response

nse_client = NseClient()

@app.get("/")
def root(request: Request):
    """Root endpoint: serves interactive Backend Dashboard in browser, JSON for API clients."""
    accept = request.headers.get("accept", "")
    format_param = request.query_params.get("format", "")
    if "text/html" in accept and format_param != "json":
        return HTMLResponse(get_backend_dashboard_html())
    return {
        "status": "online",
        "service": "Nifty 50 Financial Reports & All Indices Intelligence API",
        "total_companies": len(NIFTY_50_REGISTRY),
        "source": "National Stock Exchange of India (NSE) & NSE IX",
        "endpoints": [
            "/dashboard",
            "/docs",
            "/redoc",
            "/api/companies",
            "/api/companies/{symbol}",
            "/api/indices",
            "/api/indices/live",
            "/api/indices/gift-nifty",
            "/api/indices/india-vix",
            "/api/stocks/live-ticks",
            "/api/ticks/stream",
            "/ws/live-ticks",
            "/api/fii-dii",
            "/api/institutional-holdings",
            "/api/deals",
            "/api/deals/bulk",
            "/api/deals/block",
            "/api/deals/strategies",
            "/api/news",
            "/api/sectors",
            "/api/market-overview"
        ]
    }

@app.get("/dashboard", response_class=HTMLResponse)
def get_dashboard():
    """Direct route to the interactive FastAPI Backend Control Center UI."""
    return HTMLResponse(get_backend_dashboard_html())

# =========================================================================
# REAL-TIME LIVE STOCK TICKS (WEBSOCKET, SSE, & REST)
# =========================================================================

@app.websocket("/ws/live-ticks")
async def websocket_live_ticks(websocket: WebSocket):
    """High-speed WebSocket connection streaming tick updates for all stocks on every tick."""
    await tick_engine.register_websocket(websocket)
    try:
        while True:
            # Keep socket alive by receiving any ping/heartbeat from client
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        tick_engine.unregister_websocket(websocket)

@app.get("/api/ticks/stream")
async def sse_ticks_stream():
    """Server-Sent Events (SSE) stream delivering real-time stock and GIFT Nifty ticks to browsers."""
    async def event_generator():
        market_info = get_indian_market_status()
        # First send initial snapshot with market status and specific closure reason
        snapshot = {
            "type": "SNAPSHOT",
            "stocks": tick_engine.get_all_stocks_ticks(),
            "gift_nifty": tick_engine.get_gift_nifty(),
            "is_market_open": market_info["is_open"],
            "gift_nifty_session": get_gift_nifty_session_info(),
            "market_status": market_info["status"],
            "market_status_detail": market_info,
            "timestamp": time.strftime("%H:%M:%S")
        }
        yield f"data: {json.dumps(snapshot)}\n\n"

        while True:
            # 1. Domestic equity stocks ONLY when market is actively open (09:15 - 15:30 IST)
            if is_indian_market_open():
                ticks = tick_engine.update_ticks()
                if ticks:
                    msg = json.dumps({
                        "type": "TICK",
                        "ticks": ticks,
                        "timestamp": time.strftime("%H:%M:%S")
                    })
                    yield f"data: {msg}\n\n"

            # 2. GIFT Nifty during active sessions (Session 1: 06:30-15:40 | Session 2: 16:35-02:45 IST)
            gift_session = get_gift_nifty_session_info()
            if gift_session["is_open"]:
                gtick = tick_engine.update_gift_nifty_tick()
                if gtick:
                    gmsg = json.dumps({
                        "type": "GIFT_NIFTY_TICK",
                        "gift_nifty": gtick,
                        "timestamp": time.strftime("%H:%M:%S")
                    })
                    yield f"data: {gmsg}\n\n"

            await asyncio.sleep(0.7)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@app.get("/api/market-status")
async def get_market_status_endpoint():
    """Return comprehensive Indian Stock Market (NSE & BSE) status, session, and specific closure reasons."""
    return get_indian_market_status()

@app.get("/api/stocks/live-ticks")
async def get_all_live_stock_ticks():
    """Retrieve current snapshot of live tick prices, LTP, Day High/Low, volume, and GIFT Nifty."""
    market_info = get_indian_market_status()
    gift_info = get_gift_nifty_session_info()
    return {
        "status": "success",
        "stocks": tick_engine.get_all_stocks_ticks(),
        "total_stocks": len(tick_engine.stocks),
        "gift_nifty": tick_engine.get_gift_nifty(),
        "is_market_open": market_info["is_open"],
        "market_status": market_info["status"],
        "market_status_detail": market_info,
        "gift_nifty_session": gift_info,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S IST")
    }

# =========================================================================
# ALL INDICES, GIFT NIFTY, & INDIA VIX ENDPOINTS
# =========================================================================

@app.get("/api/indices")
async def get_all_indices(
    category: Optional[str] = Query(None, description="Filter by category: broad, sectoral, thematic, strategy, derivatives, fixed_income"),
    search: Optional[str] = Query(None, description="Search index by name or symbol"),
    sort_by: Optional[str] = Query("default", description="Sort by: change_desc, change_asc, name_asc, price_desc"),
    force_refresh: bool = Query(False, description="Bypass cache and query NSE live")
):
    """Retrieve full data for ALL official indices with no index left out, plus GIFT NIFTY and INDIA VIX."""
    feed = nse_client.fetch_all_indices(force_refresh=force_refresh)
    indices_list = list(feed.get("indices", []))

    # Clean category mapping helper
    def map_category(cat_raw: str) -> str:
        c = cat_raw.upper()
        if "DERIVATIVE" in c:
            return "Derivatives (F&O)"
        elif "BROAD" in c:
            return "Broad Market"
        elif "SECTOR" in c:
            return "Sectoral"
        elif "THEMATIC" in c:
            return "Thematic"
        elif "STRATEGY" in c:
            return "Strategy"
        elif "FIXED" in c or "G-SEC" in c or "BOND" in c:
            return "Fixed Income"
        return "Broad Market"

    # Normalize category display
    for idx in indices_list:
        idx["category_group"] = map_category(idx.get("category", ""))

    # Filter by category if requested
    if category and category.lower() != "all":
        cat_lower = category.lower().replace("-", " ").replace("_", " ")
        indices_list = [
            i for i in indices_list
            if cat_lower in i.get("category", "").lower() or cat_lower in i.get("category_group", "").lower()
        ]

    # Filter by search term
    if search:
        s = search.lower().strip()
        indices_list = [
            i for i in indices_list
            if s in i.get("index", "").lower() or s in i.get("index_symbol", "").lower()
        ]

    # Sort
    if sort_by == "change_desc":
        indices_list.sort(key=lambda x: -float(x.get("percent_change", 0.0)))
    elif sort_by == "change_asc":
        indices_list.sort(key=lambda x: float(x.get("percent_change", 0.0)))
    elif sort_by == "name_asc":
        indices_list.sort(key=lambda x: x.get("index", ""))
    elif sort_by == "price_desc":
        indices_list.sort(key=lambda x: -float(x.get("last_price", 0.0)))

    # Compute overall market breadth across all indices
    advances_count = sum(1 for i in indices_list if float(i.get("variation", 0.0)) > 0)
    declines_count = sum(1 for i in indices_list if float(i.get("variation", 0.0)) < 0)
    unchanged_count = sum(1 for i in indices_list if float(i.get("variation", 0.0)) == 0)

    categories = [
        "All",
        "Derivatives (F&O)",
        "Broad Market",
        "Sectoral",
        "Thematic",
        "Strategy",
        "Fixed Income"
    ]

    return {
        "status": "success",
        "total_indices": len(indices_list),
        "total_unfiltered": feed.get("total_count", len(indices_list)),
        "categories": categories,
        "market_breadth": {
            "advances": advances_count,
            "declines": declines_count,
            "unchanged": unchanged_count,
            "ratio": round(advances_count / max(declines_count, 1), 2)
        },
        "gift_nifty": tick_engine.get_gift_nifty(),
        "india_vix": feed.get("india_vix"),
        "indices": indices_list,
        "timestamp": feed.get("timestamp")
    }

@app.get("/api/indices/live")
def get_live_ticker_indices():
    """Ultra-fast summary of key benchmark indices including GIFT NIFTY and INDIA VIX for live tickers."""
    feed = nse_client.fetch_all_indices(force_refresh=False)
    all_idx = feed.get("indices", [])

    key_symbols = [
        "NIFTY 50", "SENSEX", "NIFTY BANK", "NIFTY IT", "NIFTY AUTO",
        "NIFTY FINANCIAL SERVICES", "NIFTY FMCG", "NIFTY METAL",
        "NIFTY PHARMA", "NIFTY MIDCAP 100", "NIFTY SMALLCAP 100", "NIFTY NEXT 50"
    ]

    ticker_items = []

    # 1. GIFT NIFTY first (live from tick_engine with Session 1 & 2 tracking)
    gn = tick_engine.get_gift_nifty()
    if gn:
        ticker_items.append({
            "name": "GIFT NIFTY",
            "symbol": "GIFTNIFTY",
            "last_price": gn.get("last_price"),
            "change": gn.get("change"),
            "percent_change": gn.get("percent_change"),
            "badge": gn.get("badge", "GIFT CITY"),
            "is_open": gn.get("is_trading_active", False),
            "session": gn.get("trading_session", "SESSION_2"),
            "special": "gift"
        })

    # 2. INDIA VIX second
    vix = feed.get("india_vix", {})
    if vix:
        ticker_items.append({
            "name": "INDIA VIX",
            "symbol": "INDIAVIX",
            "last_price": vix.get("last_price"),
            "change": vix.get("change"),
            "percent_change": vix.get("percent_change"),
            "badge": "VOLATILITY GAUGE",
            "special": "vix",
            "volatility_status": vix.get("volatility_status")
        })

    # 3. Key Indian benchmarks
    for sym in key_symbols:
        matched = next((i for i in all_idx if i.get("index") == sym or i.get("index_symbol") == sym), None)
        if matched:
            ticker_items.append({
                "name": matched["index"],
                "symbol": matched["index_symbol"],
                "last_price": matched["last_price"],
                "change": matched["variation"],
                "percent_change": matched["percent_change"],
                "badge": matched.get("category", "BENCHMARK"),
                "special": None
            })

    market_info = get_indian_market_status()
    return {
        "status": "success",
        "items": ticker_items,
        "count": len(ticker_items),
        "is_market_open": market_info["is_open"],
        "market_status_detail": market_info,
        "timestamp": feed.get("timestamp")
    }

@app.get("/api/indices/gift-nifty")
async def get_gift_nifty_detail():
    """Direct standalone endpoint for GIFT NIFTY live data sourced from TradingView across Session 1 and Session 2."""
    return tick_engine.get_gift_nifty()

@app.get("/api/indices/india-vix")
async def get_india_vix_detail():
    """Direct standalone endpoint for INDIA VIX live data."""
    feed = nse_client.fetch_all_indices(force_refresh=False)
    return feed.get("india_vix", {})

@app.get("/api/indices/{index_name}")
async def get_single_index(index_name: str):
    """Retrieve full detail on any single index among all 139+ indices."""
    target = index_name.upper().strip()
    if target in ("GIFT NIFTY", "GIFTNIFTY"):
        return nse_client.fetch_all_indices().get("gift_nifty")
    if target in ("INDIA VIX", "INDIAVIX", "VIX"):
        return nse_client.fetch_all_indices().get("india_vix")

    feed = nse_client.fetch_all_indices()
    for idx in feed.get("indices", []):
        if idx["index"].upper() == target or idx["index_symbol"].upper() == target:
            return idx

    raise HTTPException(status_code=404, detail=f"Index '{index_name}' not found in official indices database")

# =========================================================================
# FII / DII INSTITUTIONAL FLOWS & MARKET IMPACT ENDPOINTS
# =========================================================================

@app.get("/api/fii-dii")
async def get_fii_dii_report():
    """Retrieve official FII/DII institutional cash market trading data from NSE and computed market impact."""
    try:
        report = nse_client.fetch_fii_dii_data()
        return report
    except Exception as e:
        logger.error("Failed to generate FII/DII report: %s", e)
        raise HTTPException(status_code=500, detail="Failed to fetch FII/DII institutional trading data")

@app.get("/api/institutional-holdings")
async def get_company_institutional_investments(
    search: Optional[str] = Query(None, description="Search by symbol or company name"),
    sector: Optional[str] = Query(None, description="Filter by sector"),
    sort_by: Optional[str] = Query("fii_amount_desc", description="Sort by: fii_amount_desc, dii_amount_desc, total_institutional_desc, fii_pct_desc, dii_pct_desc, market_cap_desc"),
    limit: int = Query(50, description="Max companies to return")
):
    """Retrieve company-wise institutional investment amounts (₹ Cr) and holdings (%) for FIIs and DIIs sourced from NSE."""
    try:
        return institutional_engine.get_all_institutional_investments(
            search=search,
            sector=sector,
            sort_by=sort_by or "fii_amount_desc",
            limit=limit
        )
    except Exception as e:
        logger.error("Failed to fetch institutional investments: %s", e)
        raise HTTPException(status_code=500, detail="Failed to fetch institutional holdings")

# =========================================================================
# REAL-TIME MARKET & COMPANY NEWS INTELLIGENCE ENDPOINTS
# =========================================================================

@app.get("/api/news")
async def get_market_and_company_news(
    symbol: Optional[str] = Query(None, description="Filter by company symbol (e.g. RELIANCE, TCS, HDFCBANK)"),
    sentiment: Optional[str] = Query(None, description="Filter by sentiment: bullish, bearish, volatile, neutral"),
    impact: Optional[str] = Query(None, description="Filter by impact level: high, medium, low"),
    limit: int = Query(50, description="Max news items to return")
):
    """Retrieve live real-time company news, market impact scoring, and source reference links."""
    try:
        return news_engine.get_news(
            symbol=symbol,
            sentiment=sentiment,
            impact=impact,
            limit=limit
        )
    except Exception as e:
        logger.error("Error retrieving news: %s", e)
        raise HTTPException(status_code=500, detail="Failed to retrieve live news intelligence")

# =========================================================================
# BULK DEALS & BLOCK DEALS INSTITUTIONAL TRADING ENGINE ENDPOINTS
# =========================================================================

@app.get("/api/deals", response_model=DealsResponse)
async def get_bulk_and_block_deals(
    deal_type: Optional[str] = Query("all", description="Filter deal type: all, bulk, block, short_selling"),
    action: Optional[str] = Query("all", description="Filter trade action: all, BUY, SELL"),
    category: Optional[str] = Query("all", description="Filter client category: all, FII, DII, MUTUAL_FUND, PROMOTER, HNI, PROP_DESK"),
    time_range: Optional[str] = Query(None, description="Time filter: 1D, 1W, 1M, 3M, 6M, 1Y, custom, all"),
    start_date: Optional[str] = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    search: Optional[str] = Query(None, description="Search by symbol, company name, client name or sector"),
    sort_by: str = Query("date_desc", description="Sort order: date_desc, date_asc, value_desc, value_asc, qty_desc, equity_desc, diff_desc"),
    limit: int = Query(100, description="Max deals to return")
):
    """Retrieve official SEBI Bulk Deals, Block Deals, and Short Selling Disclosures organized by date."""
    try:
        return deals_engine.get_all_deals(
            deal_type=deal_type,
            action=action,
            category=category,
            time_range=time_range,
            start_date=start_date,
            end_date=end_date,
            search=search,
            sort_by=sort_by,
            limit=limit
        )
    except Exception as e:
        logger.error("Error retrieving market deals: %s", e)
        raise HTTPException(status_code=500, detail="Failed to retrieve deals data")

@app.get("/api/deals/bulk")
async def get_bulk_deals_only(
    time_range: Optional[str] = Query(None),
    limit: int = Query(100, description="Max bulk deals")
):
    """Convenience endpoint dedicated exclusively to SEBI Bulk Deals (>= 0.5% equity)."""
    return deals_engine.get_all_deals(deal_type="BULK", time_range=time_range, limit=limit)

@app.get("/api/deals/block")
async def get_block_deals_only(
    time_range: Optional[str] = Query(None),
    limit: int = Query(100, description="Max block deals")
):
    """Convenience endpoint dedicated exclusively to SEBI Block Deals (>= ₹10 Cr window)."""
    return deals_engine.get_all_deals(deal_type="BLOCK", time_range=time_range, limit=limit)

@app.get("/api/deals/short-selling")
async def get_short_selling_deals_only(
    time_range: Optional[str] = Query(None),
    limit: int = Query(100, description="Max short selling deals")
):
    """Convenience endpoint dedicated exclusively to SEBI Institutional Short Selling Disclosures."""
    return deals_engine.get_all_deals(deal_type="SHORT_SELLING", time_range=time_range, limit=limit)

@app.get("/api/deals/strategies")
async def get_deals_trading_strategies(response: Response):
    """Retrieve comprehensive institutional trading strategies for utilizing bulk and block deals."""
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    return {
        "status": "success",
        "title": "Trader's Playbook: How to Profitably Trade Bulk & Block Deals",
        "strategies": deals_engine.get_trading_strategies()
    }

# =========================================================================
# 52-WEEK HIGH & LOW BREAKOUT RADAR ENDPOINTS
# =========================================================================

@app.get("/api/52-week", response_model=Week52Response)
@app.get("/api/week-52", response_model=Week52Response)
async def get_52_week_data(
    filter_type: Optional[str] = Query("ALL", description="Filter by: ALL, NEAR_HIGH, NEAR_LOW, BREAKOUT, MID_RANGE"),
    sector: Optional[str] = Query(None, description="Filter by sector name"),
    search: Optional[str] = Query(None, description="Search by symbol or company name"),
    sort_by: Optional[str] = Query("dist_high_asc", description="Sort by: dist_high_asc, gain_low_desc, gain_low_asc, high52_desc, low52_asc, range_pos_desc, mcap_desc, symbol_asc"),
    limit: int = Query(100, ge=1, le=100)
):
    """Retrieve real-time 52-week high, low, breakout radar, and price spectrum data across all Nifty 50 stocks."""
    return week52_engine.get_52_week_data(
        filter_type=filter_type or "ALL",
        sector=sector,
        search=search,
        sort_by=sort_by or "dist_high_asc",
        limit=limit
    )

# =========================================================================
# COMPANIES & CONSTITUENTS ENDPOINTS
# =========================================================================

@app.get("/api/companies", response_model=List[CompanySummary])
async def list_companies(
    index: Optional[str] = Query("all", description="Filter by index: nifty50, sensex, bank, it, auto, energy, fmcg, pharma, metal, financial"),
    sector: Optional[str] = Query(None, description="Filter by sector name"),
    search: Optional[str] = Query(None, description="Search by symbol or company name")
):
    """Retrieve companies filtered by index and sector with high-level financial metrics."""
    companies = get_all_companies_summary(index_type=index or "all")

    # Attach live tick prices from tick engine
    for c in companies:
        live_info = tick_engine.stocks.get(c["symbol"])
        if live_info:
            c["current_price"] = live_info["ltp"]
            c["price_change"] = live_info["change"]
            c["percent_change"] = live_info["percent_change"]
            if live_info.get("high_52w"):
                c["high_52w"] = live_info["high_52w"]
            if live_info.get("low_52w"):
                c["low_52w"] = live_info["low_52w"]

    if sector and sector.lower() != "all":
        companies = [c for c in companies if sector.lower() in c["sector"].lower()]

    if search:
        s = search.lower().strip()
        companies = [
            c for c in companies
            if s in c["symbol"].lower() or s in c["company_name"].lower() or s in c["industry"].lower()
        ]

    return companies

@app.get("/api/companies/{symbol}", response_model=CompanyDetail)
async def get_company(symbol: str):
    """Retrieve in-depth financial reports for an individual Nifty 50 company."""
    detail = get_company_full_detail(symbol)
    if not detail:
        raise HTTPException(status_code=404, detail=f"Company symbol '{symbol}' not found in Nifty 50 index")
    
    live_info = tick_engine.stocks.get(symbol.upper())
    if live_info:
        detail["current_price"] = live_info["ltp"]
        detail["price_change"] = live_info["change"]
        detail["percent_change"] = live_info["percent_change"]
        detail["day_high"] = live_info["high"]
        detail["day_low"] = live_info["low"]
        if live_info.get("high_52w"):
            detail["high_52w"] = live_info["high_52w"]
        if live_info.get("low_52w"):
            detail["low_52w"] = live_info["low_52w"]
        detail["volume"] = live_info["volume"]

    mcap = float(detail.get("market_cap_cr") or 50000.0)
    detail["institutional_holdings"] = institutional_engine.get_company_institutional_holding(symbol.upper(), mcap)
        
    return detail

@app.post("/api/companies/{symbol}/sync-tickertape")
@app.post("/api/companies/{symbol}/sync-nse")
def sync_nse_live(symbol: str):
    """Fetch live filings and announcements directly from NSE India and refresh Tickertape fundamentals."""
    symbol_upper = symbol.upper()
    detail = get_company_full_detail(symbol_upper)
    if not detail:
        raise HTTPException(status_code=404, detail=f"Company '{symbol}' not found")

    # Refresh Tickertape fundamentals
    try:
        fresh_tt = tickertape_client.fetch_single_company(symbol_upper)
        if fresh_tt:
            tickertape_client._cache[symbol_upper] = fresh_tt
            tickertape_client._save_cache()
    except Exception as e:
        logger.warning("Could not refresh Tickertape fundamentals for %s: %s", symbol_upper, e)

    live_ar = nse_client.fetch_annual_reports(symbol_upper)
    live_ann = nse_client.fetch_financial_announcements(symbol_upper)

    merged_filings = list(detail["nse_filings"])

    for ar in live_ar:
        file_name = ar.get("fileName")
        if file_name:
            safe_ar_url = (
                file_name
                if (file_name.startswith("http") and not any(x in file_name for x in ("nsearchives", ".xml", "SHP_")))
                else f"https://www.nseindia.com/get-quotes/equity?symbol={symbol_upper}"
            )
            merged_filings.insert(0, {
                "title": f"Official NSE Annual Report {ar.get('fromYr', '')}-{ar.get('toYr', '')}",
                "filing_type": "Annual Report",
                "financial_year_or_period": f"{ar.get('fromYr', '')}-{ar.get('toYr', '')}",
                "broadcast_date": ar.get("broadcast_dttm") or "Recent",
                "file_url": safe_ar_url,
                "file_size": ar.get("attFileSize") or "PDF",
                "submission_type": "Direct NSE Live Sync"
            })

    for ann in live_ann[:5]:
        file_url = ann.get("attchmntFile")
        if file_url:
            safe_ann_url = (
                file_url
                if (file_url.startswith("http") and not any(x in file_url for x in ("nsearchives", ".xml", "SHP_")))
                else f"https://www.nseindia.com/get-quotes/equity?symbol={symbol_upper}"
            )
            merged_filings.append({
                "title": ann.get("desc") or "Financial Update Filing",
                "filing_type": "Corporate Filing",
                "financial_year_or_period": ann.get("an_dt", "").split(" ")[0] if ann.get("an_dt") else "Recent",
                "broadcast_date": ann.get("an_dt") or "Recent",
                "file_url": safe_ann_url,
                "file_size": f"{ann.get('attFileSize')} KB" if ann.get("attFileSize") else "PDF",
                "submission_type": "SEBI Filing (NSE)"
            })

    return {
        "status": "success",
        "symbol": symbol_upper,
        "total_filings_available": len(merged_filings),
        "filings": merged_filings
    }

@app.get("/api/sectors")
async def list_sectors(response: Response):
    """List all sectors represented in Nifty 50 with company counts."""
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    sectors_map: Dict[str, int] = {}
    for comp in NIFTY_50_REGISTRY:
        sec = comp["sector"]
        sectors_map[sec] = sectors_map.get(sec, 0) + 1
    return [{"sector": k, "count": v} for k, v in sorted(sectors_map.items(), key=lambda x: -x[1])]

@app.get("/api/market-overview")
async def market_overview():
    """Aggregate statistics across all 50 Nifty constituents."""
    companies = get_all_companies_summary()
    total_market_cap = sum(c["market_cap_cr"] for c in companies)
    avg_pe = sum(c["pe_ratio"] for c in companies) / len(companies)
    avg_pb = sum(c["pb_ratio"] for c in companies) / len(companies)
    total_quarterly_rev = sum(c["revenue_latest_cr"] for c in companies)
    total_quarterly_profit = sum(c["net_profit_latest_cr"] for c in companies)

    top_revenue = sorted(companies, key=lambda c: -c["revenue_latest_cr"])[:5]
    top_profit = sorted(companies, key=lambda c: -c["net_profit_latest_cr"])[:5]

    return {
        "index_name": "NIFTY 50",
        "benchmark_exchange": "National Stock Exchange of India (NSE)",
        "total_constituents": len(companies),
        "total_market_cap_cr": round(total_market_cap, 2),
        "total_quarterly_revenue_cr": round(total_quarterly_rev, 2),
        "total_quarterly_profit_cr": round(total_quarterly_profit, 2),
        "average_pe_ratio": round(avg_pe, 2),
        "average_pb_ratio": round(avg_pb, 2),
        "top_by_revenue": top_revenue,
        "top_by_profit": top_profit
    }

@app.get("/api/heatmap")
async def get_nse_heatmap():
    """Official NSE Nifty 50 Heat Map data grouped by sectors with live color grading."""
    return signals_heatmap_engine.get_nse_heatmap()

@app.get("/api/chart-data/{symbol}")
async def get_chart_data(symbol: str, timeframe: str = "1D", candle_count: int = 40):
    """OHLCV candlestick series with EMA 9/21, Supertrend, RSI, and Algorithmic Buy/Sell Signals."""
    return signals_heatmap_engine.get_chart_with_signals(symbol=symbol, timeframe=timeframe, candle_count=candle_count)

@app.get("/api/signals")
async def get_all_signals():
    """Retrieve active technical Buy/Sell algorithmic signals across all Nifty 50 stocks."""
    companies = get_all_companies_summary()
    signals_list = []
    for c in companies:
        chart_res = signals_heatmap_engine.get_chart_with_signals(c["symbol"], timeframe="1D", candle_count=30)
        signals_list.append({
            "symbol": c["symbol"],
            "company_name": c["company_name"],
            "sector": c["sector"],
            "current_price": chart_res["current_price"],
            "latest_signal": chart_res["latest_signal"]
        })
    return {
        "status": "success",
        "official_source": "National Stock Exchange of India (NSE) Quantitative Signal Engine",
        "signals": signals_list
    }

@app.get("/api/trade-signals")
async def api_get_trade_signals(
    strategy: Optional[str] = None,
    market_cap: Optional[str] = None,
    type: Optional[str] = None,
    timeframe: Optional[str] = None,
    instrument: Optional[str] = None,
    search: Optional[str] = None
):
    """Multi-Strategy Quantitative Trade Signals across Equities, Index & Stock Futures, and Options."""
    return get_trade_signals(
        strategy_id=strategy,
        market_cap=market_cap,
        signal_type=type,
        timeframe=timeframe,
        instrument_type=instrument,
        search=search
    )

@app.get("/api/trade-signals/ledger")
async def api_get_trade_signals_ledger(
    view: str = "ACTIVE",
    date_range: str = "today",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    strategy: Optional[str] = None,
    instrument: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None
):
    """Immutable Trade Signal Ledger & Historical Audit Trail.
    Hides closed signals by default (view=ACTIVE) to keep the live desk clean,
    and provides full historical audit retrieval on view=ALL or view=ARCHIVED.
    """
    from app.trade_ledger import trade_ledger
    from app.trade_signals_engine import initialize_trade_signals
    all_signals = initialize_trade_signals()
    trade_ledger.sync_signals(all_signals)

    return trade_ledger.query_ledger(
        view=view,
        date_range=date_range,
        start_date=start_date,
        end_date=end_date,
        strategy_id=strategy,
        instrument_type=instrument,
        status=status,
        search=search
    )

@app.get("/api/fo/specifications")
async def api_get_fo_specifications():
    """Master contract specifications, lot sizes, expiry dates, and strategy compatibility matrix."""
    from app.instrument_adapters import (
        NSE_FO_LOT_SIZES,
        STRATEGY_COMPATIBILITY_MATRIX,
        get_current_expiry_dates
    )
    monthly_exp, weekly_exp, dte = get_current_expiry_dates()
    return {
        "status": "success",
        "lot_sizes": NSE_FO_LOT_SIZES,
        "strategy_compatibility": STRATEGY_COMPATIBILITY_MATRIX,
        "expiry_info": {
            "current_monthly_expiry": monthly_exp,
            "next_weekly_expiry": weekly_exp,
            "days_to_monthly_expiry": dte
        }
    }

@app.get("/api/fo/greeks")
async def api_calculate_fo_greeks(
    spot: float,
    strike: float,
    dte_days: float = 14.0,
    iv: float = 0.22,
    option_type: str = "CE"
):
    """Calculate Black-Scholes theoretical premium and Greeks: Delta, Gamma, Theta, Vega, IV."""
    from app.instrument_adapters import calculate_black_scholes_greeks
    t_years = max(0.001, dte_days / 365.0)
    greeks = calculate_black_scholes_greeks(
        spot=spot,
        strike=strike,
        time_to_expiry_years=t_years,
        volatility=iv,
        option_type=option_type
    )
    return {
        "status": "success",
        "inputs": {
            "spot": spot,
            "strike": strike,
            "dte_days": dte_days,
            "iv": iv,
            "option_type": option_type.upper()
        },
        "greeks": greeks
    }

@app.get("/api/fo/basis")
async def api_calculate_futures_basis(
    symbol: str,
    spot_price: float,
    dte_days: Optional[float] = None
):
    """Calculate Futures basis, fair value, lot size, and annualized cost of carry."""
    from app.instrument_adapters import adapt_futures_contract
    fut_data = adapt_futures_contract(symbol=symbol, spot_price=spot_price, days_to_expiry=dte_days)
    return {
        "status": "success",
        "futures_data": fut_data
    }

@app.get("/api/trade-signals/strategies")
async def api_get_trade_strategies(response: Response):
    """Available algorithmic strategies and configuration models (including user-created custom strategies)."""
    from app.strategy_registry import get_all_registered_strategies
    strategies = get_all_registered_strategies()
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return {
        "status": "success",
        "strategies": strategies
    }

@app.get("/api/trade-signals/strategies/{strategy_id}")
async def api_get_trade_strategy_detail(strategy_id: str, response: Response):
    """Detailed mathematical logic, indicator parameters, and execution rules for a specific strategy."""
    from app.strategy_registry import get_strategy_logic
    logic = get_strategy_logic(strategy_id)
    if not logic:
        raise HTTPException(status_code=404, detail=f"Strategy '{strategy_id}' not found")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return {
        "status": "success",
        "strategy": logic
    }

# =====================================================================
# Phase 3: Custom Strategy Builder & Management REST API
# =====================================================================

@app.post("/api/strategies/custom", status_code=201)
async def api_create_custom_strategy(payload: Dict[str, Any]):
    """Create a new custom quantitative strategy with versioning and validation."""
    from app.custom_strategies_manager import create_custom_strategy
    try:
        new_strat = create_custom_strategy(payload)
        return {
            "status": "success",
            "message": f"Strategy '{new_strat['name']}' created successfully (v{new_strat['version']}).",
            "strategy": new_strat
        }
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create strategy: {e}")

@app.get("/api/strategies/custom")
async def api_list_custom_strategies(include_archived: bool = False):
    """List all custom strategies."""
    from app.custom_strategies_manager import list_custom_strategies
    strategies = list_custom_strategies(include_archived=include_archived)
    return {
        "status": "success",
        "count": len(strategies),
        "strategies": strategies
    }

@app.get("/api/strategies/custom/{strategy_id}")
async def api_get_custom_strategy(strategy_id: str):
    """Get single custom strategy details."""
    from app.custom_strategies_manager import get_custom_strategy
    strat = get_custom_strategy(strategy_id)
    if not strat:
        raise HTTPException(status_code=404, detail=f"Custom strategy '{strategy_id}' not found")
    return {
        "status": "success",
        "strategy": strat
    }

@app.put("/api/strategies/custom/{strategy_id}")
async def api_update_custom_strategy(strategy_id: str, payload: Dict[str, Any]):
    """Update custom strategy with automatic minor version increment."""
    from app.custom_strategies_manager import update_custom_strategy
    try:
        updated = update_custom_strategy(strategy_id, payload)
        return {
            "status": "success",
            "message": f"Strategy '{updated['name']}' updated to v{updated['version']}.",
            "strategy": updated
        }
    except KeyError as ke:
        raise HTTPException(status_code=404, detail=str(ke))
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update strategy: {e}")

@app.post("/api/strategies/custom/{strategy_id}/duplicate")
async def api_duplicate_custom_strategy(strategy_id: str):
    """Clone an existing strategy into a new draft custom strategy."""
    from app.custom_strategies_manager import duplicate_custom_strategy
    try:
        cloned = duplicate_custom_strategy(strategy_id)
        return {
            "status": "success",
            "message": f"Strategy '{cloned['name']}' duplicated as draft.",
            "strategy": cloned
        }
    except KeyError as ke:
        raise HTTPException(status_code=404, detail=str(ke))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to duplicate strategy: {e}")

@app.patch("/api/strategies/custom/{strategy_id}/status")
async def api_patch_strategy_status(strategy_id: str, payload: Dict[str, Any]):
    """Toggle strategy activation, disable, or archive."""
    from app.custom_strategies_manager import patch_strategy_status
    try:
        is_enabled = payload.get("is_enabled")
        is_archived = payload.get("is_archived")
        patched = patch_strategy_status(strategy_id, is_enabled=is_enabled, is_archived=is_archived)
        return {
            "status": "success",
            "message": f"Strategy '{patched['name']}' status updated.",
            "strategy": patched
        }
    except KeyError as ke:
        raise HTTPException(status_code=404, detail=str(ke))
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update status: {e}")

@app.delete("/api/strategies/custom/{strategy_id}")
async def api_delete_custom_strategy(strategy_id: str):
    """Permanently delete a custom strategy."""
    from app.custom_strategies_manager import delete_custom_strategy
    success = delete_custom_strategy(strategy_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Custom strategy '{strategy_id}' not found")
    return {
        "status": "success",
        "message": f"Strategy '{strategy_id}' successfully deleted."
    }

@app.post("/api/strategies/validate")
async def api_validate_strategy(payload: Dict[str, Any]):
    """Validate strategy configuration rules before saving."""
    from app.custom_strategies_manager import validate_strategy_for_activation
    is_valid, errors = validate_strategy_for_activation(payload)
    return {
        "is_valid": is_valid,
        "errors": errors
    }

@app.get("/api/strategies/stats")
async def api_get_strategies_stats():
    """Aggregate statistics for the dedicated Strategy Management and Backtesting page."""
    from app.strategy_registry import get_all_registered_strategies
    from app.custom_strategies_manager import list_custom_strategies
    from app.backtest_storage import backtest_storage

    all_strats = [s for s in get_all_registered_strategies() if s.get("id") != "all"]
    custom_strats = list_custom_strategies(include_archived=False)
    saved_runs = backtest_storage.list_runs()

    active_count = sum(1 for s in all_strats if s.get("status", {}).get("is_enabled", True))
    
    return {
        "status": "success",
        "total_strategies": len(all_strats),
        "active_strategies": active_count,
        "custom_strategies": len(custom_strats),
        "builtin_strategies": len(all_strats) - len(custom_strats),
        "backtested_runs": len(saved_runs),
        "supported_asset_classes": [
            "Cash Equities (NSE)",
            "Index Futures",
            "Stock Futures",
            "Index Options (CE/PE)",
            "Stock Options"
        ]
    }

@app.get("/api/trade-signals/analytics")
async def api_get_trade_signals_analytics():
    """Quantitative lifecycle performance analytics: win rate, active count, target hits, stop loss hits."""
    from app.signal_tracker import signal_tracker
    from app.trade_signals_engine import initialize_trade_signals
    all_signals = initialize_trade_signals()
    return {
        "status": "success",
        "analytics": signal_tracker.get_performance_analytics(all_signals)
    }

@app.post("/api/trade-signals/trigger")
async def api_trigger_new_signal():
    """Evaluates genuine quantitative strategies on latest market data and broadcasts if triggered."""
    new_sig = generate_live_signal_event()
    if new_sig:
        await tick_engine.broadcast_trade_signal(new_sig)
        try:
            from app.notification_engine import notification_engine
            notification_engine.broadcast_signal(new_sig)
        except Exception:
            pass
    return {
        "status": "success",
        "signal": new_sig
    }

# =====================================================================
# Phase 6 & 7: Quantitative Backtesting Engine Endpoints
# =====================================================================

@app.post("/api/backtest/run")
async def api_run_backtest(payload: Dict[str, Any]):
    """Run realistic backtest simulation with zero lookahead bias and authentic transaction costs."""
    from app.backtesting_engine import backtesting_engine
    from app.backtest_storage import backtest_storage
    strategy_id = payload.get("strategy_id", "ema_cross")
    symbols = payload.get("symbols", ["RELIANCE", "TCS", "HDFCBANK", "INFY"])
    timeframe = payload.get("timeframe", "15m")
    instrument_type = payload.get("instrument_type", "EQUITY")
    initial_capital = float(payload.get("initial_capital", 500000.0))
    risk_per_trade_pct = float(payload.get("risk_per_trade_pct", 1.5))
    slippage_pct = float(payload.get("slippage_pct", 0.0005))
    start_date = payload.get("start_date")
    end_date = payload.get("end_date")

    try:
        result = backtesting_engine.run_backtest(
            strategy_id=strategy_id,
            symbols=symbols,
            timeframe=timeframe,
            instrument_type=instrument_type,
            initial_capital=initial_capital,
            risk_per_trade_pct=risk_per_trade_pct,
            slippage_pct=slippage_pct,
            start_date=start_date,
            end_date=end_date
        )
        # Phase 9: Persist backtest run into storage
        run_id = backtest_storage.save_run(result)
        result["backtest_id"] = run_id
        return result
    except Exception as e:
        logger.error("Backtest execution failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/backtest/history")
async def api_list_backtest_history(limit: int = 50):
    """Retrieve list of saved past backtest executions."""
    from app.backtest_storage import backtest_storage
    runs = backtest_storage.list_runs(limit=limit)
    return {
        "status": "success",
        "count": len(runs),
        "history": runs
    }

@app.get("/api/backtest/history/{backtest_id}")
async def api_get_backtest_run_details(backtest_id: str):
    """Retrieve full results, metrics, equity curve and trade log for a specific saved backtest run."""
    from app.backtest_storage import backtest_storage
    run_data = backtest_storage.get_run(backtest_id)
    if not run_data:
        raise HTTPException(status_code=404, detail=f"Backtest run '{backtest_id}' not found.")
    return {
        "status": "success",
        "backtest": run_data
    }

@app.delete("/api/backtest/history/{backtest_id}")
async def api_delete_backtest_run(backtest_id: str):
    """Delete a saved historical backtest run."""
    from app.backtest_storage import backtest_storage
    deleted = backtest_storage.delete_run(backtest_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Backtest run '{backtest_id}' not found.")
    return {
        "status": "success",
        "message": f"Backtest '{backtest_id}' successfully deleted."
    }

@app.get("/api/backtest/config")
async def api_get_backtest_config():
    """Returns available strategies, instruments, timeframes, and universe for backtesting."""
    from app.trade_signals_engine import AVAILABLE_STRATEGIES, COMPANIES_UNIVERSE
    from app.custom_strategies_manager import list_custom_strategies
    from app.instrument_adapters import NSE_FO_LOT_SIZES, STRATEGY_COMPATIBILITY_MATRIX

    custom_strats = list_custom_strategies(include_archived=False)
    all_strategies = [s for s in AVAILABLE_STRATEGIES if s["id"] != "all"] + [
        {"id": cs["id"], "name": cs["name"], "badge": cs.get("badge", "CUSTOM"), "is_custom": True}
        for cs in custom_strats
    ]

    symbols_list = [
        {"symbol": c["symbol"], "name": c["name"], "cap": c["cap"], "lot_size": NSE_FO_LOT_SIZES.get(c["symbol"], 1)}
        for c in COMPANIES_UNIVERSE
    ]

    return {
        "status": "success",
        "strategies": all_strategies,
        "symbols": symbols_list,
        "timeframes": ["5m", "15m", "1H", "1D"],
        "instruments": [
            {"id": "EQUITY", "label": "Cash Equities (NSE)"},
            {"id": "FUTURES", "label": "Index & Stock Futures"},
            {"id": "OPTIONS", "label": "Index & Stock Options (CE/PE)"}
        ],
        "compatibility_matrix": STRATEGY_COMPATIBILITY_MATRIX
    }


# =====================================================================
# Phase 5: Advanced Strategy Capabilities (Multi-Leg, Optimizer, Paper Trading)
# =====================================================================

@app.post("/api/strategies/multi-leg/calculate")
async def api_calculate_multi_leg_spread(payload: Dict[str, Any]):
    """Calculate multi-leg options spread strikes, net premium, Greeks, and payoff profile."""
    from app.multi_leg_options_engine import multi_leg_engine
    strategy_key = payload.get("strategy_key", "BULL_CALL_SPREAD")
    symbol = payload.get("symbol", "NIFTY")
    spot_price = float(payload.get("spot_price", 24500.0))
    days_to_expiry = float(payload.get("days_to_expiry", 7.0))
    iv = float(payload.get("iv", 0.15))
    lots = int(payload.get("lots", 1))

    try:
        spread = multi_leg_engine.build_spread(
            strategy_key=strategy_key,
            symbol=symbol,
            spot_price=spot_price,
            days_to_expiry=days_to_expiry,
            iv=iv,
            lots=lots
        )
        return {"status": "success", "spread": spread}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/strategies/multi-leg/backtest")
async def api_backtest_multi_leg_spread(payload: Dict[str, Any]):
    """Backtest multi-leg spread across historical candle data."""
    from app.multi_leg_options_engine import multi_leg_engine
    from app.backtesting_engine import backtesting_engine
    strategy_key = payload.get("strategy_key", "BULL_CALL_SPREAD")
    symbol = payload.get("symbol", "NIFTY")
    timeframe = payload.get("timeframe", "15m")
    lots = int(payload.get("lots", 1))

    candles = backtesting_engine.load_historical_candles(symbol, timeframe)
    if not candles:
        # Fallback to RELIANCE or default if index candles not yet cached
        candles = backtesting_engine.load_historical_candles("RELIANCE", timeframe)

    res = multi_leg_engine.backtest_multi_leg_spread(
        strategy_key=strategy_key,
        symbol=symbol,
        ohlcv_candles=candles,
        lots=lots
    )
    return res


@app.get("/api/strategies/optimize/config")
async def api_get_optimizer_config(strategy_id: str = "ema_cross"):
    """Get tunable parameter grid defaults for strategy."""
    from app.strategy_optimizer import strategy_optimizer
    return {
        "status": "success",
        "strategy_id": strategy_id,
        "grid": strategy_optimizer.get_tunable_parameters(strategy_id)
    }


@app.post("/api/strategies/optimize")
async def api_run_strategy_optimizer(payload: Dict[str, Any]):
    """Run parameter sweep and sensitivity heatmap optimization."""
    from app.strategy_optimizer import strategy_optimizer
    strategy_id = payload.get("strategy_id", "ema_cross")
    symbol = payload.get("symbol", "RELIANCE")
    timeframe = payload.get("timeframe", "5m")
    param_grid = payload.get("param_grid")
    objective = payload.get("objective", "sharpe_ratio")

    try:
        opt_res = strategy_optimizer.run_optimization(
            strategy_id=strategy_id,
            symbol=symbol,
            timeframe=timeframe,
            param_grid=param_grid,
            objective=objective
        )
        return opt_res
    except Exception as e:
        logger.error(f"Optimization error: {e}")
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")


@app.get("/api/paper-trading/portfolio")
async def api_get_paper_portfolio():
    """Retrieve virtual trading desk portfolio state and live unrealized MTM."""
    from app.paper_trading_engine import paper_trading_engine
    return paper_trading_engine.get_portfolio()


@app.post("/api/paper-trading/order")
async def api_place_paper_order(payload: Dict[str, Any]):
    """Execute virtual paper trading order."""
    from app.paper_trading_engine import paper_trading_engine
    try:
        order_res = paper_trading_engine.place_order(
            symbol=payload["symbol"],
            side=payload["side"],
            quantity=int(payload.get("quantity", 1)),
            instrument_type=payload.get("instrument_type", "EQUITY"),
            order_type=payload.get("order_type", "MARKET"),
            price=payload.get("price"),
            stop_loss=payload.get("stop_loss"),
            target=payload.get("target"),
            strategy_name=payload.get("strategy_name", "Manual Paper Trade")
        )
        return order_res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/paper-trading/close/{position_id}")
async def api_close_paper_position(position_id: str):
    """Close virtual paper position at current market price."""
    from app.paper_trading_engine import paper_trading_engine
    try:
        close_res = paper_trading_engine.close_position(position_id)
        return close_res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/paper-trading/reset")
async def api_reset_paper_trading(payload: Optional[Dict[str, Any]] = None):
    """Reset virtual trading desk balance."""
    from app.paper_trading_engine import paper_trading_engine
    cap = float(payload.get("initial_capital", 1000000.0)) if payload else 1000000.0
    return paper_trading_engine.reset_portfolio(initial_capital=cap)


# =====================================================================
# Phase 6: Live Broker Integration (Zerodha, Angel One, Dhan, Upstox)
# =====================================================================

@app.get("/api/brokers/status")
async def api_get_brokers_status():
    """Retrieve status, profiles, funds, and active mode for all connected brokers."""
    from app.broker_connectors.broker_manager import broker_manager
    return broker_manager.get_status()


@app.post("/api/brokers/active")
async def api_set_active_broker(payload: Dict[str, Any]):
    """Switch active broker execution target (PAPER_TRADING, ZERODHA, ANGEL_ONE, DHAN, UPSTOX)."""
    from app.broker_connectors.broker_manager import broker_manager
    broker_id = payload.get("broker_id", "PAPER_TRADING")
    try:
        return broker_manager.set_active_broker(broker_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/brokers/authenticate/{broker_id}")
async def api_authenticate_broker(broker_id: str, credentials: Dict[str, Any]):
    """Connect and authenticate credentials for a broker."""
    from app.broker_connectors.broker_manager import broker_manager
    try:
        return broker_manager.authenticate_broker(broker_id, credentials)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/brokers/positions-and-orders")
async def api_get_active_broker_positions_and_orders():
    """Retrieve live open positions and order book from the active broker."""
    from app.broker_connectors.broker_manager import broker_manager
    return broker_manager.get_active_orders_and_positions()


@app.post("/api/brokers/order")
async def api_route_broker_order(payload: Dict[str, Any]):
    """Submit an order to the active broker or paper trading engine."""
    from app.broker_connectors.broker_manager import broker_manager
    try:
        return broker_manager.route_order(
            symbol=payload["symbol"],
            side=payload["side"],
            quantity=int(payload.get("quantity", 1)),
            instrument_type=payload.get("instrument_type", "EQUITY"),
            order_type=payload.get("order_type", "MARKET"),
            price=payload.get("price"),
            tag=payload.get("tag", "ALGO_ROBOT")
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# =====================================================================
# Phase 7: Real-Time Alerts & Notification Engine
# =====================================================================

@app.get("/api/notifications/config")
async def api_get_notifications_config():
    """Get active alert channels and notification rules."""
    from app.notification_engine import notification_engine
    return notification_engine.get_config()


@app.post("/api/notifications/config")
async def api_update_notifications_config(payload: Dict[str, Any]):
    """Update notification channel credentials and alert rules."""
    from app.notification_engine import notification_engine
    return notification_engine.update_config(payload)


@app.get("/api/notifications/logs")
async def api_get_notifications_logs(limit: int = 50):
    """Retrieve recent alert delivery ledger."""
    from app.notification_engine import notification_engine
    return {"logs": notification_engine.get_log(limit=limit)}


@app.post("/api/notifications/test-telegram")
async def api_test_telegram_alert(payload: Optional[Dict[str, Any]] = None):
    """Dispatch a test alert to verify Telegram bot connectivity."""
    from app.notification_engine import notification_engine
    msg = payload.get("message", "🧪 *ALGO ROBOT TELEGRAM ALERT PROBE*\n\n✅ Bot connection verified. Real-time signal broadcasting is active.") if payload else "🧪 *ALGO ROBOT TELEGRAM ALERT PROBE*\n\n✅ Bot connection verified."
    bot_token = payload.get("bot_token") if payload else None
    chat_id = payload.get("chat_id") if payload else None
    return notification_engine.send_telegram(msg, bot_token=bot_token, chat_id=chat_id)


@app.post("/api/notifications/test-webhook")
async def api_test_webhook_alert(payload: Optional[Dict[str, Any]] = None):
    """Dispatch a test payload to verify external webhook endpoint."""
    from app.notification_engine import notification_engine
    test_body = payload.get("payload", {"event": "TEST_WEBHOOK_PING", "message": "Algo Robot Webhook Connection Verified", "timestamp": datetime.now(timezone.utc).isoformat()}) if payload else {"event": "TEST_WEBHOOK_PING"}
    url = payload.get("webhook_url") if payload else None
    return notification_engine.send_webhook(test_body, webhook_url=url)


@app.post("/api/notifications/broadcast-signal")
async def api_broadcast_signal_notification(signal: Dict[str, Any]):
    """Broadcast an algorithmic signal to Telegram and Webhooks."""
    from app.notification_engine import notification_engine
    return notification_engine.broadcast_signal(signal)





