# HISTORICAL MARKET DATA INFRASTRUCTURE AUDIT REPORT
**Project:** ALGO ROBOT | NSE + BSE | Mainboard + SME  
**Date:** November 19, 2026  
**Auditor:** Quantitative Systems Architecture & Data Engineering Team  
**Status:** AUDIT COMPLETED — IMPLEMENTATION BLUEPRINT APPROVED

---

## 1. Executive Summary

This audit assesses the historical market data capabilities, database schemas, data providers, backtesting pipelines, and API contracts of the **Algo Robot** platform. The goal is to evolve the platform from an equity-centric, partially cached dataset into an institutional-grade, multi-asset **NSE + BSE Historical Market Data Platform** covering Mainboard, SME, Indices, and Contract-Specific Derivatives (Futures & Options).

### Key Audit Findings
1. **Existing Historical Data Limitations**: The current historical data engine (`backend/app/market_data_service.py` and `backend/app/market_data/historical_data_service.py`) relies heavily on local JSON flat-files (`backend/app/data/ohlcv_cache/`) and basic `MarketCandle` SQLite/PostgreSQL rows. It lacks support for official exchange Bhavcopy archives, UDiFF formats, and contract-specific F&O historical time series.
2. **Missing F&O Historical Granularity**: F&O data currently uses static lot sizes (`NSE_FO_LOT_SIZES` in `app/instrument_adapters.py`) and theoretical Black-Scholes approximations in live modules. There is no historical table or adapter storing historical settlement prices, contract-level Open Interest (OI), or day-by-day change in OI for expired or active contracts.
3. **Dual Backtesting Implementations**: Two backtesting engines coexist:
   - `backend/app/backtesting/engine.py` (Modern Phase 7 event-driven SMC & quantitative engine).
   - `backend/app/backtesting_engine.py` (Legacy multi-asset bar-by-bar walkforward engine).
   Both engines fetch candles via `MarketDataService.get_candles()`. Unifying data access behind an authoritative `HistoricalDataManager` will immediately eliminate divergence without breaking existing API routes.
4. **Data Authenticity & Rule 1 Compliance**: Past implementations strictly prohibited synthetic ticks in live trading. We must apply the same institutional rigor to historical data: **never synthesize intraday bars from daily EOD bhavcopies, never fabricate expired options premiums, and never invent synthetic OI**. When data is missing, the system must return `DATA_UNAVAILABLE` or `SUBSCRIPTION_REQUIRED`.
5. **Database Schema Deficits**: While `backend/app/db/models.py` has enterprise models for `Company`, `Instrument`, `MarketCandle`, and `CorporateAction`, it lacks dedicated tables for `exchanges`, `instrument_expiries`, `historical_open_interest`, `data_sources`, `data_import_jobs`, `data_quality_issues`, and `data_coverage`.

---

## 2. Exhaustive Repository Inspection

### 2.1 Backend Modules & Data Flow

| Module | Current Role | Deficiencies / Upgrades Required |
|---|---|---|
| `backend/app/market_data_service.py` | Manages live quotes and cached OHLCV candles (Yahoo Finance fallback + disk cache). | Lacks direct integration with official NSE/BSE Bhavcopies. Must query normalized DB/Historical Data Manager first. |
| `backend/app/market_data/historical_data_service.py` | Query and persist `MarketCandle` records in DB; basic 1m->5m aggregation. | Lacks support for indices, F&O contracts, corporate actions adjustments, and data provenance. |
| `backend/app/market_data/adapters/` | Has `nse_adapter.py` & `bse_adapter.py` for security master CSVs. | Needs dedicated Bhavcopy parsers: `nse_bhavcopy_adapter.py`, `nse_fo_bhavcopy_adapter.py`, `nse_index_adapter.py`, `bse_bhavcopy_adapter.py`, `corporate_actions_adapter.py`. |
| `backend/app/db/models.py` | SQLAlchemy models for auth, brokers, orders, companies, instruments. | Add required historical entities: `Exchange`, `InstrumentExpiry`, `HistoricalCandle`, `HistoricalOpenInterest`, `DataSource`, `DataImportJob`, `DataQualityIssue`, `DataCoverage`. |
| `backend/app/backtesting/engine.py` | Phase 7 event-driven SMC & Quant backtester with zero lookahead bias. | Route historical candle retrieval through `HistoricalDataManager`; enforce `INCOMPLETE_DATA` flags if bars are missing. |
| `backend/app/backtesting_engine.py` | Legacy multi-asset walk-forward backtester with Indian statutory friction. | Ensure historical data requests match exact same interface and invariants as modern engine. |
| `backend/app/backtesting/walk_forward.py` | In-Sample / Out-of-Sample window optimizer. | Requires clean historical data slices with explicit quality validation per window. |
| `backend/app/backtest_storage.py` | JSON ledger persisting backtest runs. | Needs no breaking changes; preserve storage format while adding data provenance metadata. |
| `backend/app/instrument_adapters.py` | Lot sizes, futures/options contract synthesis. | Must map genuine historical contract identities from exchange masters rather than static estimations. |
| `backend/app/main.py` | FastAPI app entry point with existing `/api/backtest/*` and `/api/market/*` routes. | Mount new historical market data router (`/api/market/historical/*` and `/api/admin/data/*`). |

### 2.2 Frontend Consumers & API Contracts

| Route / Component | Endpoint Consumed | Impact of Changes |
|---|---|---|
| `frontend/src/app/companies/page.tsx` | `/api/companies/universe`, `/api/companies/search` | Preserve intact; UI bug was addressed and styles confirmed. |
| `frontend/src/app/data-center/page.tsx` | `/api/data-coverage/summary`, `/api/providers/status` | Keep existing views; add link to new `/historical-data` admin console. |
| `frontend/src/app/strategy/page.tsx` & `BacktestModal.tsx` | `/api/backtest/run`, `/api/backtest/history`, `/api/backtest/config` | Preserve exact request/response schema; enrich with data authenticity & coverage tags. |
| **New Admin Console** (`/historical-data`) | `/api/market/historical/coverage`, `/api/admin/data/jobs`, `/api/admin/data/quality`, `/api/admin/data/backfill` | Complete admin console for historical archive management, synchronization, and data health inspection. |

---

## 3. Official Exchange Data Source Specifications

### 3.1 National Stock Exchange of India (NSE)
1. **Equity Daily Bhavcopy (UDiFF & Legacy)**:
   - File format: `sec_bhavdata_full_<ddmmyyyy>.csv` or `cm<dd><mmm><yyyy>bhav.csv.zip`.
   - Fields: `SYMBOL`, `SERIES` (EQ, BE, SM, ST), `DATE1`, `PREV_CLOSE`, `OPEN_PRICE`, `HIGH_PRICE`, `LOW_PRICE`, `LAST_PRICE`, `CLOSE_PRICE`, `AVG_PRICE`, `TTL_TRD_QNTY`, `TURNOVER_LACS`, `NO_OF_TRADES`, `DELIV_QTY`, `DELIV_PER`.
   - Covers: Mainboard + SME (Series `SM` / `ST`).
2. **Derivatives (F&O) Contract-Wise Bhavcopy**:
   - File format: `fo<dd><mmm><yyyy>bhav.csv.zip` or `fo_bhav_<ddmmyyyy>.csv`.
   - Fields: `INSTRUMENT` (FUTSTK, FUTIDX, OPTSTK, OPTIDX), `SYMBOL`, `EXPIRY_DT`, `STRIKE_PR`, `OPTION_TYP` (XX, CE, PE), `OPEN`, `HIGH`, `LOW`, `CLOSE`, `SETTLE_PR`, `CONTRACTS`, `VAL_INLAKH`, `OPEN_INT`, `CHG_IN_OI`.
   - Authentic Historical Rules: Actual traded OHLC, genuine settlement price, authentic OI and change in OI. Never fabricate theoretical options prices.
3. **NSE Index Archives**:
   - File format: `ind_close_all_<ddmmyyyy>.csv`.
   - Fields: `Index Name`, `Index Date`, `Open Index Value`, `High Index Value`, `Low Index Value`, `Closing Index Value`, `Points Change`, `Change(%)`, `Volume`, `Turnover (Rs. Cr.)`, `P/E`, `P/B`, `Div Yield`.

### 3.2 Bombay Stock Exchange (BSE)
1. **BSE Equity Bhavcopy**:
   - File format: `bhavcopy<dd><mm><yy>.zip` or `EQ_ISINCODE_<dd><mm><yy>.zip`.
   - Fields: `SC_CODE` (Scrip Code), `SC_NAME`, `SC_GROUP` (A, B, T, M for SME), `SC_TYPE`, `OPEN`, `HIGH`, `LOW`, `CLOSE`, `LAST`, `PREVCLOSE`, `NO_TRADES`, `NO_OF_SHRS`, `NET_TURNOV`, `ISIN_CODE`.
2. **BSE Derivatives Bhavcopy**:
   - Contract-level bhavcopy for Sensex/Bankex futures and options where traded.

### 3.3 Intraday (1m, 5m, 15m) Availability Invariants
- Official public Bhavcopies are **strictly End-of-Day (1D)**.
- Official historical Intraday archives (1m) require authorized data vending subscriptions (NSE Data & Analytics / BSE Information Products) or broker API historical endpoints (Zerodha Kite Historical, Angel One Historical, Upstox Historical).
- **Rule of Truth**: If an intraday date range is not present in the local database or accessible via an authorized provider, the API must return `DATA_UNAVAILABLE` or `SUBSCRIPTION_REQUIRED`. Synthesizing intraday bars from daily OHLC is strictly prohibited.

---

## 4. Invariant Matrix & Data Quality Rules

| Metric | Rule / Constraint | Violation Action |
|---|---|---|
| Price Positivity | `Open, High, Low, Close, Settle > 0` | Flag `INVALID_PRICE`, reject candle. |
| OHLC Relationship | `High >= max(Open, Close)` and `Low <= min(Open, Close)` | Flag `INVALID_OHLC_RANGE`, reject candle. |
| Volume / Turnover | `Volume >= 0`, `Turnover >= 0` | Flag `NEGATIVE_VOLUME`, reject candle. |
| Open Interest | `OI >= 0` | Flag `NEGATIVE_OI`, reject record. |
| Session Boundary | Bar timestamps strictly between `09:15:00` and `15:30:00` IST on trading days. | Discard off-market ticks, flag `OUT_OF_SESSION`. |
| Timezone | All raw timestamps normalized to UTC; display/session logic in `Asia/Kolkata`. | Prevent timezone offset drift. |
| Deduplication | Composite unique constraint on `(instrument_id, timeframe, timestamp)`. | Idempotent upsert; update if newer source revision. |
| Corporate Actions | Split/Bonus/Dividend adjustments never overwrite raw exchange prices. | Provide adjusted series via separate calculation layer. |

---

## 5. Architectural Upgrade Strategy

1. **Step 1**: Finalize Audit & Implementation Blueprint (this document + `HISTORICAL_DATA_ENGINE_IMPLEMENTATION.md`).
2. **Step 2**: Add normalized database models in `backend/app/db/models.py` (`exchanges`, `instrument_expiries`, `historical_candles`, `historical_open_interest`, `data_sources`, `data_import_jobs`, `data_quality_issues`, `data_coverage`).
3. **Step 3**: Implement official data parsers in `backend/app/market_data/historical/`:
   - `nse_bhavcopy_adapter.py` (Equity + SME UDiFF/Legacy)
   - `nse_fo_bhavcopy_adapter.py` (F&O contract-wise Bhavcopy)
   - `nse_index_adapter.py` (NSE Index archives)
   - `bse_bhavcopy_adapter.py` (BSE Equity & Derivatives)
   - `corporate_actions_adapter.py` (Split/bonus adjustment engine)
4. **Step 4**: Implement `HistoricalDataManager` (`backend/app/market_data/historical/data_manager.py`):
   - Resumable backfills with ZIP traversal protection & rate limiting.
   - Multi-timeframe aggregator (`1m -> 5m, 15m, 30m, 1H`).
   - Provenance tracking and coverage calculator.
5. **Step 5**: Create unified REST API router (`backend/app/market_data/historical/api_router.py`) and wire into `backend/app/main.py`.
6. **Step 6**: Wire `MarketDataService` and both backtesting engines to consume `HistoricalDataManager` without breaking existing workflows.
7. **Step 7**: Build frontend `/historical-data` Admin Data Center console.
8. **Step 8**: Comprehensive automated test suite in `backend/tests/test_historical_market_data.py`.
