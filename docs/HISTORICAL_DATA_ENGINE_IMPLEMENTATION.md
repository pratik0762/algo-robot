# HISTORICAL MARKET DATA INFRASTRUCTURE IMPLEMENTATION PLAN
**Project:** ALGO ROBOT | NSE + BSE | Mainboard + SME  
**Architecture Version:** 2.0.0  
**Status:** READY FOR EXECUTION  

---

## 1. System Architecture Diagram

```
+----------------------------------------------------------------------------------------------------+
|                                    OFFICIAL EXCHANGE ARCHIVES & FEEDS                              |
|   +-----------------------+    +-----------------------+    +-----------------+    +-------------+ |
|   | NSE Equity / SME      |    | NSE F&O Bhavcopy      |    | NSE Indices     |    | BSE Equity/ | |
|   | (UDiFF / cm bhavcopy) |    | (fo bhavcopy / UDiFF) |    | (ind_close_all) |    | Derivatives | |
|   +-----------+-----------+    +-----------+-----------+    +--------+--------+    +------+------+ |
+---------------|----------------------------|-------------------------|--------------------|--------+
                |                            |                         |                    |
+---------------v----------------------------v-------------------------v--------------------v--------+
|                                  INDEPENDENT SOURCE ADAPTERS LAYER                                 |
|   - nse_bhavcopy_adapter.py (Equity & SME UDiFF/Legacy parser)                                     |
|   - nse_fo_bhavcopy_adapter.py (Contract-wise Futures & Options parser)                            |
|   - nse_index_adapter.py (Index EOD price-volume & ratio parser)                                   |
|   - bse_bhavcopy_adapter.py (BSE Equity & Derivatives parser)                                      |
|   - corporate_actions_adapter.py (Split, Bonus, Dividend ratio calculator)                         |
+--------------------------------------------+-------------------------------------------------------+
                                             |
+--------------------------------------------v-------------------------------------------------------+
|                                CENTRAL HISTORICAL DATA MANAGER                                     |
|   (backend/app/market_data/historical/data_manager.py)                                             |
|                                                                                                    |
|   [ Archive Discovery ] -----> [ Safe ZIP Extraction ] -----> [ Format Normalization ]             |
|                                                                        |                           |
|   [ Data Quality Engine ] <--- [ Deduplication & Upsert ] <------------+                           |
|   - Statuses: VALID | WARNING | INVALID | DATA_UNAVAILABLE | SUBSCRIPTION_REQUIRED                 |
|                                                                                                    |
|   [ Multi-Timeframe Aggregator ]                                                                   |
|   - 1m -> 5m, 15m, 30m, 1H (Respects IST 09:15-15:30 session boundary, strictly no synthetic data)|
+--------------------------------------------+-------------------------------------------------------+
                                             |
+--------------------------------------------v-------------------------------------------------------+
|                             NORMALIZED ENTERPRISE DATABASE SCHEMA                                  |
|   - exchanges                      - instruments                      - instrument_symbol_history   |
|   - instrument_expiries            - corporate_actions                - historical_candles (1D-1m)  |
|   - historical_open_interest       - data_sources                     - data_import_jobs            |
|   - data_quality_issues            - data_coverage                                                 |
+--------------------------------------------+-------------------------------------------------------+
                                             |
                     +-----------------------+-----------------------+
                     |                                               |
+--------------------v-----------------------+   +-------------------v-------------------------------+
|       UNIFIED REST API & PROVENANCE        |   |           QUANTITATIVE CONSUMERS                  |
|   GET  /api/market/instruments             |   |   - backend/app/backtesting/engine.py (Phase 7)   |
|   GET  /api/market/instruments/search      |   |   - backend/app/backtesting_engine.py (Legacy)    |
|   GET  /api/market/historical/candles      |   |   - backend/app/backtesting/walk_forward.py       |
|   GET  /api/market/historical/contracts    |   |   - backend/app/market_data_service.py (Unified)  |
|   GET  /api/market/historical/coverage     |   |   - backend/app/strategies/ (SMC & Indicators)    |
|   GET  /api/market/historical/sources      |   +---------------------------------------------------+
|   POST /api/admin/data/backfill            |
|   POST /api/admin/data/sync                |   +---------------------------------------------------+
|   GET  /api/admin/data/jobs                |   |        FRONTEND ADMIN DATA CENTER CONSOLE         |
|   GET  /api/admin/data/quality             |   |   - /historical-data (Coverage, Jobs, Quality)    |
+--------------------------------------------+   +---------------------------------------------------+
```

---

## 2. Step-by-Step Implementation Roadmap

### Phase A: Database Schema Evolution (Step 5)
1. Add new normalized tables in `backend/app/db/models.py`:
   - `Exchange`: id, code, name, timezone, country, is_active.
   - `InstrumentExpiry`: id, instrument_id, underlying_symbol, expiry_date, strike_price, option_type, lot_size, contract_id.
   - `HistoricalCandle`: id, instrument_id, exchange, symbol, timeframe, timestamp (UTC), open, high, low, close, volume, turnover, vwap, trades, is_adjusted, data_status. Composite Unique Index on `(instrument_id, timeframe, timestamp)`.
   - `HistoricalOpenInterest`: id, instrument_id, symbol, expiry_date, strike_price, option_type, timestamp, open_interest, change_in_oi, settlement_price, volume.
   - `DataSource`: id, name, exchange, segment, provider_type, base_url, licensing_tier, is_active.
   - `DataImportJob`: id, source_id, job_type, date_range_start, date_range_end, records_imported, records_rejected, status, error_details, started_at, completed_at.
   - `DataQualityIssue`: id, instrument_id, symbol, issue_type, severity, description, detected_at, resolved_at.
   - `DataCoverage`: id, exchange, segment, instrument_id, symbol, timeframe, earliest_date, latest_date, total_candles, completeness_pct, last_verified_at.

### Phase B: Official Data Source Ingestion Adapters (Step 2, 4, 6)
1. Create `backend/app/market_data/historical/`:
   - `nse_bhavcopy_adapter.py`: Parses NSE Equity & SME Bhavcopies (both legacy `.csv.zip` and modern UDiFF format).
   - `nse_fo_bhavcopy_adapter.py`: Parses NSE F&O Bhavcopy with authentic contract-specific OHLC, settlement prices, OI, and change in OI.
   - `nse_index_adapter.py`: Parses NSE Index archives (`ind_close_all`).
   - `bse_bhavcopy_adapter.py`: Parses BSE Equity and Derivatives Bhavcopy files with ISIN and Scrip code mapping.
   - `corporate_actions_adapter.py`: Parses bonus/split/dividend records and calculates forward-adjustment and backward-adjustment factors.

### Phase C: Central Historical Data Manager (Step 3, 7, 8, 9)
1. Create `backend/app/market_data/historical/data_manager.py`:
   - `HistoricalDataManager`:
     - Secure ZIP extractor (path traversal protection, max file size guard).
     - Resumable backfills with batch inserts and idempotent upserts.
     - Multi-timeframe aggregator: genuine `1m -> 5m, 15m, 30m, 1H` preserving session boundaries (09:15-15:30 IST) and omitting missing bars without synthetic filling.
     - Corporate action adjustment series (raw prices preserved; separate query parameter `adjusted=true`).
     - Data quality invariant validation: `VALID`, `WARNING`, `INVALID`, `DATA_UNAVAILABLE`, `SUBSCRIPTION_REQUIRED`, `INCOMPLETE_DATA`.

### Phase D: Unified REST APIs (Step 10)
1. Implement `backend/app/market_data/historical/api_router.py`:
   - All 10 required endpoints matching exact user specification.
   - Wire router into `backend/app/main.py`.

### Phase E: Backtesting Integration (Step 11)
1. Update `MarketDataService.get_candles()` to query `HistoricalDataManager`.
2. Connect `backend/app/backtesting/engine.py` and `backend/app/backtesting_engine.py` to use validated historical data.
3. If bars are missing or incomplete, flag backtest `INCOMPLETE_DATA` with explicit explanatory metadata.

### Phase F: Frontend Historical Data Center (Step 12)
1. Create `frontend/src/app/historical-data/page.tsx` with:
   - Source statuses & licensing indicators.
   - Instrument counts by exchange & segment (Equity, Index, Futures, Options).
   - Date coverage cards (earliest, latest, completeness %).
   - Backfill & sync triggers with progress bars.
   - Failed job logs & data quality inspection table.
2. Add navigation link from navbar/sidebar and Data Center page.

### Phase G: Security, Hardening & Automated Tests (Step 13, 14)
1. Add tests in `backend/tests/test_historical_market_data.py`:
   - NSE Equity & SME bhavcopy parsing.
   - NSE F&O bhavcopy contract-level parsing.
   - NSE Index archive parsing.
   - BSE Equity & Derivatives parsing.
   - Corporate action adjustment calculations.
   - Zero lookahead bias & non-synthetic intraday gap invariants.
   - API endpoint status tests (`VALID`, `DATA_UNAVAILABLE`, `SUBSCRIPTION_REQUIRED`).
   - Backtesting engine integration verification.

---

## 3. Invariants & Rules Checklist
- [x] Full repository audit completed before modifying engine code.
- [x] Zero synthetic ticks or fabricated intraday candles.
- [x] Zero synthetic OI or Black-Scholes theoretical prices as historical trades.
- [x] Raw exchange prices preserved; corporate action adjustments kept separate.
- [x] Path traversal and zip slip protection enforced during archive decompression.
- [x] Timezone normalized to UTC in storage; IST used for exchange session enforcement.
- [x] Both legacy and modern backtesting engines seamlessly served without regressions.
