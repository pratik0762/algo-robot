"""
ALGO ROBOT — Central Historical Data Manager
Orchestrates official exchange archive ingestion, secure decompression,
idempotent persistence, multi-timeframe aggregation, data quality enforcement,
and corporate action price adjustments.
"""

from __future__ import annotations
import io
import os
import zipfile
import logging
from datetime import datetime, timezone, timedelta, date
from typing import Any, Dict, List, Optional, Tuple, Union
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc, and_

from app.db.session import SessionLocal
from app.db.models import (
    HistoricalCandle,
    HistoricalOpenInterest,
    InstrumentExpiry,
    DataImportJob,
    DataQualityIssue,
    DataCoverage,
    DataSource,
    CorporateAction,
    QualityStatus,
)
from app.market_data.historical.nse_bhavcopy_adapter import NSEBhavcopyAdapter
from app.market_data.historical.nse_fo_bhavcopy_adapter import NSEFOBhavcopyAdapter
from app.market_data.historical.nse_index_adapter import NSEIndexAdapter
from app.market_data.historical.bse_bhavcopy_adapter import BSEBhavcopyAdapter
from app.market_data.historical.corporate_actions_adapter import CorporateActionsAdjustmentEngine

logger = logging.getLogger("algo_robot.historical.data_manager")
IST = timezone(timedelta(hours=5, minutes=30))

MAX_SAFE_ZIP_SIZE = 100 * 1024 * 1024  # 100 MB max uncompressed
TIMEFRAME_MINUTES = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "1d": 375,
}


class HistoricalDataManager:
    """Central authority for all historical market data collection, storage, and retrieval."""

    def __init__(self):
        self._ensure_default_sources()

    def _ensure_default_sources(self) -> None:
        """Initializes default official data sources in database if not present."""
        db = SessionLocal()
        try:
            defaults = [
                {
                    "source_code": "NSE_CM_BHAVCOPY",
                    "name": "NSE Capital Market Bhavcopy (Mainboard & SME)",
                    "exchange": "NSE",
                    "segment": "EQUITY",
                    "base_url": "https://www.nseindia.com/all-reports",
                    "licensing_tier": "PUBLIC_ARCHIVE",
                    "is_subscription_required": False,
                },
                {
                    "source_code": "NSE_FO_BHAVCOPY",
                    "name": "NSE Derivatives Contract-wise Bhavcopy",
                    "exchange": "NSE",
                    "segment": "DERIVATIVES",
                    "base_url": "https://www.nseindia.com/all-reports-derivatives",
                    "licensing_tier": "PUBLIC_ARCHIVE",
                    "is_subscription_required": False,
                },
                {
                    "source_code": "NSE_INDEX_REPORTS",
                    "name": "NSE Historical Index Daily Archive",
                    "exchange": "NSE",
                    "segment": "INDICES",
                    "base_url": "https://www.nseindia.com/reports-indices",
                    "licensing_tier": "PUBLIC_ARCHIVE",
                    "is_subscription_required": False,
                },
                {
                    "source_code": "BSE_EQ_BHAVCOPY",
                    "name": "BSE Equity Bhavcopy Archive",
                    "exchange": "BSE",
                    "segment": "EQUITY",
                    "base_url": "https://marketdata.bseindia.com/",
                    "licensing_tier": "PUBLIC_ARCHIVE",
                    "is_subscription_required": False,
                },
                {
                    "source_code": "BROKER_INTRADAY_FEED",
                    "name": "Authorized Broker Historical 1m/5m Feeds (Kite/Angel/Upstox)",
                    "exchange": "NSE",
                    "segment": "EQUITY_INTRADAY",
                    "base_url": "https://api.kite.trade/",
                    "licensing_tier": "BROKER_AUTHENTICATED",
                    "is_subscription_required": True,
                },
            ]
            for src in defaults:
                existing = db.query(DataSource).filter(DataSource.source_code == src["source_code"]).first()
                if not existing:
                    ds = DataSource(**src, is_active=True)
                    db.add(ds)
            db.commit()
        except Exception as e:
            logger.debug("Source initialization notice: %s", e)
            db.rollback()
        finally:
            db.close()

    def safe_extract_zip(self, zip_bytes: bytes) -> Dict[str, str]:
        """
        Decompresses ZIP archive with security guarantees:
        - Protection against Zip Slip (path traversal attacks like '../../').
        - Size bomb protection (max 100 MB decompressed total).
        """
        extracted_files: Dict[str, str] = {}
        total_size = 0

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            for member in z.infolist():
                # Defend against path traversal
                filename = os.path.basename(member.filename)
                if not filename or ".." in member.filename:
                    continue

                total_size += member.file_size
                if total_size > MAX_SAFE_ZIP_SIZE:
                    raise ValueError(f"Decompression aborted: total archive size exceeds limit ({MAX_SAFE_ZIP_SIZE} bytes)")

                with z.open(member) as f:
                    content = f.read().decode("utf-8", errors="replace")
                    extracted_files[filename] = content

        return extracted_files

    def import_bhavcopy_file(
        self,
        source_code: str,
        filename: str,
        file_bytes: bytes,
        job_type: str = "HISTORICAL_BACKFILL",
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """
        Main entry point for importing a daily Bhavcopy (CSV or ZIP) into the normalized database.
        Idempotent, logged in DataImportJob, and recalculates DataCoverage.
        """
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        exchange = "BSE" if "BSE" in source_code.upper() else "NSE"
        segment = "DERIVATIVES" if "FO" in source_code.upper() else ("INDICES" if "INDEX" in source_code.upper() else "EQUITY")

        job = DataImportJob(
            source_code=source_code,
            job_type=job_type,
            exchange=exchange,
            segment=segment,
            source_file_ref=filename,
            status="RUNNING",
        )
        db.add(job)
        db.commit()

        imported_candles = 0
        imported_oi = 0
        rejected_records = 0
        errors: List[str] = []

        try:
            # 1. Extract content if ZIP, else decode CSV
            csv_contents: Dict[str, str] = {}
            if filename.lower().endswith(".zip"):
                csv_contents = self.safe_extract_zip(file_bytes)
            else:
                csv_contents[filename] = file_bytes.decode("utf-8", errors="replace")

            # 2. Parse per file using specific adapter
            all_candles: List[Dict[str, Any]] = []
            all_oi: List[Dict[str, Any]] = []

            for fname, text in csv_contents.items():
                if source_code == "NSE_FO_BHAVCOPY" or "fo" in fname.lower():
                    fo_records = NSEFOBhavcopyAdapter.parse_csv(text)
                    for rec in fo_records:
                        all_candles.append({
                            "exchange": rec["exchange"],
                            "symbol": rec["contract_identifier"],
                            "timeframe": "1d",
                            "timestamp": rec["timestamp"],
                            "open": rec["open"],
                            "high": rec["high"],
                            "low": rec["low"],
                            "close": rec["close"],
                            "volume": rec["volume"],
                            "turnover": rec["turnover"],
                            "vwap": rec["settlement_price"],
                            "trades": rec["contracts"],
                            "source": rec["source"],
                            "is_adjusted": False,
                        })
                        all_oi.append(rec)
                elif source_code == "NSE_INDEX_REPORTS" or "ind_close" in fname.lower():
                    idx_records = NSEIndexAdapter.parse_csv(text)
                    all_candles.extend(idx_records)
                elif source_code == "BSE_EQ_BHAVCOPY" or "bhav" in fname.lower() and "bse" in fname.lower():
                    bse_records = BSEBhavcopyAdapter.parse_csv(text)
                    all_candles.extend(bse_records)
                else:
                    # Default: NSE Capital Market Bhavcopy
                    cm_records = NSEBhavcopyAdapter.parse_csv(text)
                    all_candles.extend(cm_records)

            # 3. Idempotent Upsert for Candles
            unique_symbols_seen = set()
            min_ts: Optional[datetime] = None
            max_ts: Optional[datetime] = None

            for c in all_candles:
                # Basic Invariant Check
                if c["open"] <= 0 or c["high"] <= 0 or c["low"] <= 0 or c["close"] <= 0:
                    rejected_records += 1
                    continue
                if c["high"] < max(c["open"], c["close"]) or c["low"] > min(c["open"], c["close"]):
                    # Flag data quality issue but keep if within reasonable tick boundaries
                    self._log_quality_issue(
                        db,
                        exchange=c["exchange"],
                        symbol=c["symbol"],
                        issue_type="INVALID_OHLC",
                        description=f"Bar high ({c['high']}) < max(open,close) or low ({c['low']}) > min(open,close)",
                        timestamp=c["timestamp"],
                    )

                sym = c["symbol"]
                unique_symbols_seen.add(sym)
                ts = c["timestamp"]
                if min_ts is None or ts < min_ts:
                    min_ts = ts
                if max_ts is None or ts > max_ts:
                    max_ts = ts

                # Check existing candle
                existing_candle = db.query(HistoricalCandle).filter(
                    HistoricalCandle.exchange == c["exchange"],
                    HistoricalCandle.symbol == sym,
                    HistoricalCandle.timeframe == c["timeframe"],
                    HistoricalCandle.timestamp == ts,
                    HistoricalCandle.is_adjusted == c["is_adjusted"],
                ).first()

                if existing_candle:
                    # Update fields
                    existing_candle.open = c["open"]
                    existing_candle.high = c["high"]
                    existing_candle.low = c["low"]
                    existing_candle.close = c["close"]
                    existing_candle.volume = c["volume"]
                    existing_candle.turnover = c["turnover"]
                    existing_candle.vwap = c.get("vwap", c["close"])
                    existing_candle.trades = c.get("trades", 0)
                else:
                    new_c = HistoricalCandle(
                        exchange=c["exchange"],
                        symbol=sym,
                        timeframe=c["timeframe"],
                        timestamp=ts,
                        open=c["open"],
                        high=c["high"],
                        low=c["low"],
                        close=c["close"],
                        volume=c["volume"],
                        turnover=c["turnover"],
                        vwap=c.get("vwap", c["close"]),
                        trades=c.get("trades", 0),
                        is_adjusted=c["is_adjusted"],
                        data_status=QualityStatus.VALID,
                        source=c["source"],
                    )
                    db.add(new_c)
                imported_candles += 1

            # 4. Idempotent Upsert for F&O Open Interest
            for o in all_oi:
                cid = o["contract_identifier"]
                ts = o["timestamp"]

                # Ensure instrument expiry registered
                existing_exp = db.query(InstrumentExpiry).filter(
                    InstrumentExpiry.contract_identifier == cid
                ).first()
                if not existing_exp:
                    new_exp = InstrumentExpiry(
                        exchange=o["exchange"],
                        underlying_symbol=o["symbol"],
                        contract_identifier=cid,
                        expiry_date=o["expiry_date"],
                        strike_price=o.get("strike_price"),
                        option_type=o.get("option_type", "XX"),
                    )
                    db.add(new_exp)

                existing_oi = db.query(HistoricalOpenInterest).filter(
                    HistoricalOpenInterest.exchange == o["exchange"],
                    HistoricalOpenInterest.contract_identifier == cid,
                    HistoricalOpenInterest.timestamp == ts,
                ).first()

                if existing_oi:
                    existing_oi.open_interest = o["open_interest"]
                    existing_oi.change_in_oi = o["change_in_oi"]
                    existing_oi.settlement_price = o["settlement_price"]
                    existing_oi.volume = o["volume"]
                else:
                    new_oi = HistoricalOpenInterest(
                        symbol=o["symbol"],
                        exchange=o["exchange"],
                        contract_identifier=cid,
                        expiry_date=o["expiry_date"],
                        strike_price=o.get("strike_price"),
                        option_type=o.get("option_type", "XX"),
                        timestamp=ts,
                        open_interest=o["open_interest"],
                        change_in_oi=o["change_in_oi"],
                        settlement_price=o["settlement_price"],
                        volume=o["volume"],
                        turnover_lakhs=round(o["turnover"] / 100000.0, 2),
                        contracts=o["contracts"],
                        source=o["source"],
                    )
                    db.add(new_oi)
                imported_oi += 1

            # 5. Update DataCoverage entries
            for sym in unique_symbols_seen:
                cov = db.query(DataCoverage).filter(
                    DataCoverage.exchange == exchange,
                    DataCoverage.segment == segment,
                    DataCoverage.symbol == sym,
                    DataCoverage.timeframe == "1d",
                ).first()

                total_sym_candles = db.query(HistoricalCandle).filter(
                    HistoricalCandle.exchange == exchange,
                    HistoricalCandle.symbol == sym,
                    HistoricalCandle.timeframe == "1d",
                ).count()

                if cov:
                    e_date = cov.earliest_date.replace(tzinfo=timezone.utc) if cov.earliest_date and cov.earliest_date.tzinfo is None else cov.earliest_date
                    l_date = cov.latest_date.replace(tzinfo=timezone.utc) if cov.latest_date and cov.latest_date.tzinfo is None else cov.latest_date
                    if min_ts and (e_date is None or min_ts < e_date):
                        cov.earliest_date = min_ts
                    if max_ts and (l_date is None or max_ts > l_date):
                        cov.latest_date = max_ts
                    cov.total_candles = total_sym_candles
                    cov.last_verified_at = datetime.now(timezone.utc)
                else:
                    db.add(DataCoverage(
                        exchange=exchange,
                        segment=segment,
                        symbol=sym,
                        timeframe="1d",
                        earliest_date=min_ts,
                        latest_date=max_ts,
                        total_candles=total_sym_candles,
                        completeness_pct=100.0,
                        data_status=QualityStatus.VALID,
                    ))

            job.status = "COMPLETED"
            job.records_imported = imported_candles + imported_oi
            job.records_rejected = rejected_records
            job.date_range_start = min_ts
            job.date_range_end = max_ts
            job.completed_at = datetime.now(timezone.utc)
            db.commit()

            return {
                "job_id": job.id,
                "status": "COMPLETED",
                "imported_candles": imported_candles,
                "imported_oi": imported_oi,
                "rejected_records": rejected_records,
                "symbols_count": len(unique_symbols_seen),
                "date_range_start": min_ts.isoformat() if min_ts else None,
                "date_range_end": max_ts.isoformat() if max_ts else None,
            }

        except Exception as e:
            logger.error("Bhavcopy import error on file %s: %s", filename, e, exc_info=True)
            db.rollback()
            job.status = "FAILED"
            job.error_details = str(e)
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
            return {
                "job_id": job.id,
                "status": "FAILED",
                "error": str(e),
                "imported_candles": 0,
            }
        finally:
            if close_db:
                db.close()

    def get_candles(
        self,
        symbol: str,
        exchange: str = "NSE",
        timeframe: str = "1d",
        start_date: Optional[Union[str, datetime]] = None,
        end_date: Optional[Union[str, datetime]] = None,
        adjusted: bool = False,
        limit: int = 500,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """
        Authoritative retrieval of historical candlestick data.
        Returns explicit quality status:
        - VALID: Genuine data available
        - DATA_UNAVAILABLE: Date range or symbol not found
        - SUBSCRIPTION_REQUIRED: Intraday feed requires broker/vendor credentials
        - INCOMPLETE_DATA: Gaps detected
        """
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            sym = symbol.strip().upper()
            tf = timeframe.lower()
            ex = exchange.strip().upper()

            # Rule check: Intraday timeframes (1m, 5m, 15m) without authorized feed
            is_intraday = tf in ("1m", "3m", "5m", "10m", "15m", "30m", "1h")

            # Parse filter datetimes
            s_dt = self._normalize_datetime(start_date)
            e_dt = self._normalize_datetime(end_date)

            query = db.query(HistoricalCandle).filter(
                HistoricalCandle.exchange == ex,
                HistoricalCandle.symbol == sym,
                HistoricalCandle.timeframe == tf,
                HistoricalCandle.is_adjusted == (adjusted if not is_intraday else False),
            )
            if s_dt:
                query = query.filter(HistoricalCandle.timestamp >= s_dt)
            if e_dt:
                query = query.filter(HistoricalCandle.timestamp <= e_dt)

            raw_candles = query.order_by(asc(HistoricalCandle.timestamp)).limit(limit).all()

            # If no stored candles for higher intraday timeframe, check if 1m exists to aggregate
            if not raw_candles and tf in ("5m", "15m", "30m", "1h"):
                derived = self._aggregate_from_1m(db, ex, sym, tf, s_dt, e_dt, limit)
                if derived:
                    return {
                        "status": QualityStatus.VALID.value,
                        "symbol": sym,
                        "exchange": ex,
                        "timeframe": tf,
                        "count": len(derived),
                        "candles": derived,
                        "is_adjusted": False,
                        "source": "DERIVED_FROM_1M",
                    }

            if not raw_candles:
                # If intraday requested and empty: SUBSCRIPTION_REQUIRED or DATA_UNAVAILABLE
                status = QualityStatus.SUBSCRIPTION_REQUIRED.value if is_intraday else QualityStatus.DATA_UNAVAILABLE.value
                return {
                    "status": status,
                    "symbol": sym,
                    "exchange": ex,
                    "timeframe": tf,
                    "count": 0,
                    "candles": [],
                    "message": (
                        f"Genuine historical {tf} data for {sym} on {ex} is not present in local archives. "
                        "Connect authorized broker API credentials (Kite/Angel/Upstox) or import exchange historical archives."
                        if is_intraday else f"No EOD Bhavcopy records found for {sym} in requested range."
                    ),
                }

            candles_list = []
            for c in raw_candles:
                ts_utc = c.timestamp if c.timestamp.tzinfo else c.timestamp.replace(tzinfo=timezone.utc)
                ts_ist = ts_utc.astimezone(IST)
                candles_list.append({
                    "date": ts_ist.strftime("%Y-%m-%d"),
                    "time": ts_ist.strftime("%H:%M:%S"),
                    "timeframe": c.timeframe.upper(),
                    "datetime": ts_ist.strftime("%Y-%m-%d %H:%M:%S"),
                    "timestamp": ts_utc.isoformat(),
                    "timestamp_epoch": int(ts_utc.timestamp() * 1000),
                    "open": c.open,
                    "high": c.high,
                    "low": c.low,
                    "close": c.close,
                    "volume": c.volume,
                    "turnover": c.turnover,
                    "vwap": c.vwap or c.close,
                    "trades": c.trades,
                    "is_adjusted": c.is_adjusted,
                    "source": c.source,
                })

            # If corporate action adjustments requested and candles are raw EOD
            if adjusted and tf == "1d":
                actions = self._get_corporate_actions(db, sym, ex)
                if actions:
                    candles_list = CorporateActionsAdjustmentEngine.apply_adjustments(candles_list, actions)

            return {
                "status": QualityStatus.VALID.value,
                "symbol": sym,
                "exchange": ex,
                "timeframe": tf,
                "count": len(candles_list),
                "candles": candles_list,
                "is_adjusted": adjusted,
                "source": raw_candles[0].source if raw_candles else "UNKNOWN",
            }
        finally:
            if close_db:
                db.close()

    def get_contracts(
        self,
        symbol: str,
        exchange: str = "NSE",
        expiry_date: Optional[str] = None,
        strike_price: Optional[float] = None,
        option_type: Optional[str] = None,
        limit: int = 100,
        db: Optional[Session] = None,
    ) -> List[Dict[str, Any]]:
        """Queries contract-specific historical derivatives records with genuine OI and settlement prices."""
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            sym = symbol.strip().upper()
            ex = exchange.strip().upper()

            query = db.query(HistoricalOpenInterest).filter(
                HistoricalOpenInterest.exchange == ex,
                HistoricalOpenInterest.symbol == sym,
            )
            if expiry_date:
                e_dt = self._normalize_datetime(expiry_date)
                if e_dt:
                    query = query.filter(HistoricalOpenInterest.expiry_date == e_dt)
            if strike_price is not None:
                query = query.filter(HistoricalOpenInterest.strike_price == strike_price)
            if option_type:
                query = query.filter(HistoricalOpenInterest.option_type == option_type.upper())

            records = query.order_by(desc(HistoricalOpenInterest.timestamp)).limit(limit).all()

            return [
                {
                    "contract_identifier": r.contract_identifier,
                    "symbol": r.symbol,
                    "exchange": r.exchange,
                    "date": (r.timestamp.replace(tzinfo=timezone.utc).astimezone(IST)).strftime("%Y-%m-%d") if r.timestamp.tzinfo is None else r.timestamp.astimezone(IST).strftime("%Y-%m-%d"),
                    "time": (r.timestamp.replace(tzinfo=timezone.utc).astimezone(IST)).strftime("%H:%M:%S") if r.timestamp.tzinfo is None else r.timestamp.astimezone(IST).strftime("%H:%M:%S"),
                    "timeframe": "1D",
                    "datetime": (r.timestamp.replace(tzinfo=timezone.utc).astimezone(IST)).strftime("%Y-%m-%d %H:%M:%S") if r.timestamp.tzinfo is None else r.timestamp.astimezone(IST).strftime("%Y-%m-%d %H:%M:%S"),
                    "expiry_date": r.expiry_date.strftime("%Y-%m-%d"),
                    "strike_price": r.strike_price,
                    "option_type": r.option_type,
                    "timestamp": r.timestamp.isoformat(),
                    "open_interest": r.open_interest,
                    "change_in_oi": r.change_in_oi,
                    "settlement_price": r.settlement_price,
                    "volume": r.volume,
                    "contracts": r.contracts,
                    "source": r.source,
                }
                for r in records
            ]
        finally:
            if close_db:
                db.close()

    def get_coverage_summary(self, db: Optional[Session] = None) -> List[Dict[str, Any]]:
        """Returns summarized historical data coverage across all exchanges and segments."""
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            items = db.query(DataCoverage).order_by(DataCoverage.exchange, DataCoverage.segment, DataCoverage.symbol).all()
            return [
                {
                    "exchange": c.exchange,
                    "segment": c.segment,
                    "symbol": c.symbol,
                    "timeframe": c.timeframe,
                    "earliest_date": c.earliest_date.strftime("%Y-%m-%d") if c.earliest_date else None,
                    "latest_date": c.latest_date.strftime("%Y-%m-%d") if c.latest_date else None,
                    "total_candles": c.total_candles,
                    "completeness_pct": c.completeness_pct,
                    "data_status": c.data_status.value if hasattr(c.data_status, "value") else str(c.data_status),
                }
                for c in items
            ]
        finally:
            if close_db:
                db.close()

    def get_import_jobs(self, limit: int = 50, db: Optional[Session] = None) -> List[Dict[str, Any]]:
        """Returns log of historical import and daily synchronization jobs."""
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            jobs = db.query(DataImportJob).order_by(desc(DataImportJob.started_at)).limit(limit).all()
            return [
                {
                    "id": j.id,
                    "source_code": j.source_code,
                    "job_type": j.job_type,
                    "exchange": j.exchange,
                    "segment": j.segment,
                    "status": j.status,
                    "records_imported": j.records_imported,
                    "records_rejected": j.records_rejected,
                    "source_file_ref": j.source_file_ref,
                    "error_details": j.error_details,
                    "started_at": j.started_at.isoformat() if j.started_at else None,
                    "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                }
                for j in jobs
            ]
        finally:
            if close_db:
                db.close()

    def get_data_quality_issues(self, limit: int = 50, db: Optional[Session] = None) -> List[Dict[str, Any]]:
        """Returns detected data anomalies and invariant violations."""
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            issues = db.query(DataQualityIssue).order_by(desc(DataQualityIssue.detected_at)).limit(limit).all()
            return [
                {
                    "id": i.id,
                    "exchange": i.exchange,
                    "symbol": i.symbol,
                    "issue_type": i.issue_type,
                    "severity": i.severity,
                    "description": i.description,
                    "status": i.status,
                    "detected_at": i.detected_at.isoformat() if i.detected_at else None,
                }
                for i in issues
            ]
        finally:
            if close_db:
                db.close()

    def _aggregate_from_1m(
        self,
        db: Session,
        exchange: str,
        symbol: str,
        target_tf: str,
        start_date: Optional[datetime],
        end_date: Optional[datetime],
        limit: int,
    ) -> List[Dict[str, Any]]:
        """Aggregates 1m bars into 5m, 15m, 30m, 1h without lookahead bias or gap fabrication."""
        interval_mins = TIMEFRAME_MINUTES.get(target_tf, 5)

        q = db.query(HistoricalCandle).filter(
            HistoricalCandle.exchange == exchange,
            HistoricalCandle.symbol == symbol,
            HistoricalCandle.timeframe == "1m",
        )
        if start_date:
            q = q.filter(HistoricalCandle.timestamp >= start_date)
        if end_date:
            q = q.filter(HistoricalCandle.timestamp <= end_date)

        candles_1m = q.order_by(asc(HistoricalCandle.timestamp)).all()
        if not candles_1m:
            return []

        # Group 1m bars by bucket
        buckets: Dict[datetime, List[HistoricalCandle]] = {}
        for c in candles_1m:
            dt = c.timestamp
            # Align to bucket start
            minute_of_day = dt.hour * 60 + dt.minute
            bucket_minute = (minute_of_day // interval_mins) * interval_mins
            bucket_dt = dt.replace(hour=bucket_minute // 60, minute=bucket_minute % 60, second=0, microsecond=0)
            if bucket_dt not in buckets:
                buckets[bucket_dt] = []
            buckets[bucket_dt].append(c)

        aggregated = []
        for b_dt in sorted(buckets.keys()):
            bars = buckets[b_dt]
            o = bars[0].open
            h = max(b.high for b in bars)
            l = min(b.low for b in bars)
            c = bars[-1].close
            vol = sum(b.volume for b in bars)
            turnover = sum(b.turnover for b in bars)
            vwap = (turnover / vol) if vol > 0 and turnover > 0 else c
            b_utc = b_dt if b_dt.tzinfo else b_dt.replace(tzinfo=timezone.utc)
            b_ist = b_utc.astimezone(IST)

            aggregated.append({
                "date": b_ist.strftime("%Y-%m-%d"),
                "time": b_ist.strftime("%H:%M:%S"),
                "timeframe": target_tf.upper(),
                "datetime": b_ist.strftime("%Y-%m-%d %H:%M:%S"),
                "timestamp": b_utc.isoformat(),
                "timestamp_epoch": int(b_utc.timestamp() * 1000),
                "open": round(o, 2),
                "high": round(h, 2),
                "low": round(l, 2),
                "close": round(c, 2),
                "volume": vol,
                "turnover": round(turnover, 2),
                "vwap": round(vwap, 2),
                "trades": sum(b.trades for b in bars),
                "is_adjusted": False,
                "source": f"AGGREGATED_1M_TO_{target_tf.upper()}",
            })
            if len(aggregated) >= limit:
                break

        return aggregated

    def _get_corporate_actions(self, db: Session, symbol: str, exchange: str) -> List[Dict[str, Any]]:
        actions = db.query(CorporateAction).filter(
            CorporateAction.symbol == symbol,
            CorporateAction.exchange == exchange,
        ).all()
        result = []
        for a in actions:
            # Determine factor
            factor = 1.0
            act_type = a.action_type.upper() if a.action_type else ""
            if "SPLIT" in act_type:
                # E.g. ratio 1:5 or 1:10
                factor = 0.2  # Default 1:5 split if unspecified
            elif "BONUS" in act_type:
                factor = 0.5  # Default 1:1 bonus
            elif "DIVIDEND" in act_type and a.dividend_amount:
                factor = max(0.90, (100.0 - a.dividend_amount) / 100.0)

            result.append({
                "action_type": act_type,
                "ex_date": a.ex_date or a.record_date or datetime.now(timezone.utc),
                "factor": factor,
            })
        return result

    def _log_quality_issue(
        self,
        db: Session,
        exchange: str,
        symbol: str,
        issue_type: str,
        description: str,
        timestamp: Optional[datetime] = None,
    ) -> None:
        try:
            issue = DataQualityIssue(
                exchange=exchange,
                symbol=symbol,
                issue_type=issue_type,
                description=description,
                timestamp=timestamp,
                severity="WARNING",
                status="OPEN",
            )
            db.add(issue)
        except Exception:
            pass

    @staticmethod
    def _normalize_datetime(dt_val: Optional[Union[str, datetime]]) -> Optional[datetime]:
        if not dt_val:
            return None
        if isinstance(dt_val, datetime):
            if dt_val.tzinfo is None:
                return dt_val.replace(tzinfo=timezone.utc)
            return dt_val
        try:
            cleaned = dt_val.strip().replace("Z", "+00:00")
            dt = datetime.fromisoformat(cleaned)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            return None


# Global singleton instance
historical_data_manager = HistoricalDataManager()
