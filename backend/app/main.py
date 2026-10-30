"""FastAPI Backend Server for Nifty 50 Financial Reports, All Indices, GIFT NIFTY, INDIA VIX, and Live Stock Ticks."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import json
import logging
import time
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from app.models import CompanySummary, CompanyDetail, IndexItem, GiftNiftyDetail, IndiaVixDetail, NewsItem, NewsResponse
from app.companies_data import (
    NIFTY_50_REGISTRY,
    get_all_companies_summary,
    get_company_full_detail
)
from app.nse_client import NseClient
from app.tick_engine import tick_engine, is_indian_market_open, get_gift_nifty_session_info
from app.tradingview_client import tv_streamer
from app.news_engine import news_engine
from app.institutional_holdings_engine import institutional_engine
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
    lifespan=lifespan
)

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

nse_client = NseClient()

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "Nifty 50 Financial Reports & All Indices Intelligence API",
        "total_companies": len(NIFTY_50_REGISTRY),
        "source": "National Stock Exchange of India (NSE) & NSE IX",
        "endpoints": [
            "/api/companies",
            "/api/companies/{symbol}",
            "/api/indices",
            "/api/indices/live",
            "/api/indices/gift-nifty",
            "/api/indices/india-vix",
            "/api/stocks/live-ticks",
            "/api/ticks/stream",
            "/ws/live-ticks",
            "/api/sectors",
            "/api/market-overview"
        ]
    }

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
        # First send initial snapshot with market status
        snapshot = {
            "type": "SNAPSHOT",
            "stocks": tick_engine.get_all_stocks_ticks(),
            "gift_nifty": tick_engine.get_gift_nifty(),
            "is_market_open": is_indian_market_open(),
            "gift_nifty_session": get_gift_nifty_session_info(),
            "market_status": "OPEN" if is_indian_market_open() else "CLOSED",
            "timestamp": time.strftime("%H:%M:%S")
        }
        yield f"data: {json.dumps(snapshot)}\n\n"

        while True:
            # 1. Domestic equity stocks when market is open (09:15 - 15:30 IST)
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

@app.get("/api/stocks/live-ticks")
def get_all_live_stock_ticks():
    """Retrieve current snapshot of live tick prices, LTP, Day High/Low, volume, and GIFT Nifty."""
    market_open = is_indian_market_open()
    gift_info = get_gift_nifty_session_info()
    return {
        "status": "success",
        "stocks": tick_engine.get_all_stocks_ticks(),
        "total_stocks": len(tick_engine.stocks),
        "gift_nifty": tick_engine.get_gift_nifty(),
        "is_market_open": market_open,
        "gift_nifty_session": gift_info,
        "market_status": "OPEN (09:15 - 15:30 IST)" if market_open else "CLOSED (09:15 - 15:30 IST)",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S IST")
    }

# =========================================================================
# ALL INDICES, GIFT NIFTY, & INDIA VIX ENDPOINTS
# =========================================================================

@app.get("/api/indices")
def get_all_indices(
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

    return {
        "status": "success",
        "items": ticker_items,
        "count": len(ticker_items),
        "timestamp": feed.get("timestamp")
    }

@app.get("/api/indices/gift-nifty")
def get_gift_nifty_detail():
    """Direct standalone endpoint for GIFT NIFTY live data sourced from TradingView across Session 1 and Session 2."""
    return tick_engine.get_gift_nifty()

@app.get("/api/indices/india-vix")
def get_india_vix_detail():
    """Direct standalone endpoint for INDIA VIX live data."""
    feed = nse_client.fetch_all_indices(force_refresh=False)
    return feed.get("india_vix", {})

@app.get("/api/indices/{index_name}")
def get_single_index(index_name: str):
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
def get_fii_dii_report():
    """Retrieve official FII/DII institutional cash market trading data from NSE and computed market impact."""
    try:
        report = nse_client.fetch_fii_dii_data()
        return report
    except Exception as e:
        logger.error("Failed to generate FII/DII report: %s", e)
        raise HTTPException(status_code=500, detail="Failed to fetch FII/DII institutional trading data")

@app.get("/api/institutional-holdings")
def get_company_institutional_investments(
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
def get_market_and_company_news(
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
# COMPANIES & CONSTITUENTS ENDPOINTS
# =========================================================================

@app.get("/api/companies", response_model=List[CompanySummary])
def list_companies(
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
def get_company(symbol: str):
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
            merged_filings.insert(0, {
                "title": f"Official NSE Annual Report {ar.get('fromYr', '')}-{ar.get('toYr', '')}",
                "filing_type": "Annual Report",
                "financial_year_or_period": f"{ar.get('fromYr', '')}-{ar.get('toYr', '')}",
                "broadcast_date": ar.get("broadcast_dttm") or "Recent",
                "file_url": file_name,
                "file_size": ar.get("attFileSize") or "PDF",
                "submission_type": "Direct NSE Live Sync"
            })

    for ann in live_ann[:5]:
        file_url = ann.get("attchmntFile")
        if file_url:
            merged_filings.append({
                "title": ann.get("desc") or "Financial Update Filing",
                "filing_type": "Corporate Filing",
                "financial_year_or_period": ann.get("an_dt", "").split(" ")[0] if ann.get("an_dt") else "Recent",
                "broadcast_date": ann.get("an_dt") or "Recent",
                "file_url": file_url,
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
def list_sectors():
    """List all sectors represented in Nifty 50 with company counts."""
    sectors_map: Dict[str, int] = {}
    for comp in NIFTY_50_REGISTRY:
        sec = comp["sector"]
        sectors_map[sec] = sectors_map.get(sec, 0) + 1
    return [{"sector": k, "count": v} for k, v in sorted(sectors_map.items(), key=lambda x: -x[1])]

@app.get("/api/market-overview")
def market_overview():
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
