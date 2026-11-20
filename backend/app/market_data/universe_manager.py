"""
ALGO ROBOT — Canonical Company Universe & Security Master Ingestion Engine
Manages all-India equity universe across NSE & BSE (Mainboard + SME).
Performs ISIN-based canonical deduplication, dual-listing linking,
and dynamic market-cap categorization.
"""

from __future__ import annotations
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple
from sqlalchemy.orm import Session

from app.db.models import (
    Company,
    Instrument,
    MarketQuote,
    DataSubscriptionStatus,
    DataIngestionJob,
    ExchangeCode,
    BoardType,
    MarketCapCategory,
    SecurityType,
    InstrumentStatus,
    DataAuthenticityStatus,
    SubscriptionTier,
    IngestionJobStatus,
)
from app.db.session import SessionLocal
from app.market_data.adapters.nse_adapter import NSESecurityMasterAdapter
from app.market_data.adapters.bse_adapter import BSESecurityMasterAdapter
from app.market_data.symbol_resolver import symbol_resolver

logger = logging.getLogger("algo_robot.market_data.universe")


def normalize_company_name(name: str) -> str:
    """Normalizes company legal names for fuzzy deduplication & search."""
    clean = name.upper()
    clean = re.sub(r"\b(LIMITED|LTD\.?|PVT\.?|PRIVATE|CORP\.?|CORPORATION|INC\.?|INDIA)\b", "", clean)
    clean = re.sub(r"[^\w\s]", "", clean)
    return " ".join(clean.split()).strip()


def classify_market_cap(mcap_cr: float) -> MarketCapCategory:
    """Classifies equity into SEBI market capitalization brackets dynamically."""
    if mcap_cr >= 20000.0:
        return MarketCapCategory.LARGE_CAP
    elif mcap_cr >= 5000.0:
        return MarketCapCategory.MID_CAP
    elif mcap_cr >= 1000.0:
        return MarketCapCategory.SMALL_CAP
    else:
        return MarketCapCategory.MICRO_CAP


class UniverseManager:
    """Central engine orchestrating the All-India Listed Company Universe."""

    def __init__(self):
        pass

    def sync_universe(
        self,
        nse_records: Optional[List[Dict[str, Any]]] = None,
        bse_records: Optional[List[Dict[str, Any]]] = None,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """
        Synchronizes all-India security masters into canonical companies and instruments.
        Performs ISIN matching so dual-listed securities link to 1 Company record.
        """
        job_id = f"JOB_SYNC_{uuid.uuid4().hex[:10].upper()}"
        start_time = datetime.now(timezone.utc)
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        ingestion_job = DataIngestionJob(
            job_id=job_id,
            job_name="ALL_INDIA_UNIVERSE_SYNC",
            provider="EXCHANGE_SECURITY_MASTERS",
            status=IngestionJobStatus.RUNNING,
            started_at=start_time,
        )
        db.add(ingestion_job)
        db.commit()

        stats = {
            "job_id": job_id,
            "processed": 0,
            "companies_created": 0,
            "companies_updated": 0,
            "instruments_created": 0,
            "instruments_updated": 0,
            "errors": 0,
        }

        try:
            cache_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "all_india_company_universe.json")
            if not nse_records and not bse_records and os.path.exists(cache_path):
                from app.market_data.seed_all_india_universe import populate_database_universe
                logger.info("Syncing universe from persistent all-India master cache %s...", cache_path)
                with open(cache_path, "r", encoding="utf-8") as f:
                    cached_companies = json.load(f)
                populate_database_universe(cached_companies)
                stats["companies_created"] = len(cached_companies)
                stats["processed"] = len(cached_companies)
            else:
                # Seed from existing high-fidelity registries first to retain rich sectors and fundamentals
                self._seed_curated_companies(db, stats)

                all_raw = []
                if nse_records:
                    all_raw.extend(nse_records)
                if bse_records:
                    all_raw.extend(bse_records)

                for rec in all_raw:
                    stats["processed"] += 1
                    try:
                        self._ingest_single_record(db, rec, stats)
                    except Exception as e:
                        stats["errors"] += 1
                        logger.warning("Error ingesting record %s: %s", rec.get("exchange_symbol"), e)

            # Re-classify market caps dynamically
            self.refresh_market_cap_categories(db)

            db.commit()
            ingestion_job.status = IngestionJobStatus.COMPLETED
            ingestion_job.ended_at = datetime.now(timezone.utc)
            ingestion_job.records_processed = stats["processed"]
            ingestion_job.records_inserted = stats["companies_created"] + stats["instruments_created"]
            ingestion_job.records_updated = stats["companies_updated"] + stats["instruments_updated"]
            ingestion_job.error_count = stats["errors"]
            db.commit()

            # Refresh symbol resolver
            symbol_resolver.hydrate_cache(db=db)

            logger.info("All-India Universe sync complete: %s", stats)
        except Exception as e:
            db.rollback()
            ingestion_job.status = IngestionJobStatus.FAILED
            ingestion_job.ended_at = datetime.now(timezone.utc)
            ingestion_job.error_details = str(e)
            db.commit()
            logger.error("Universe sync failed: %s", e)
            raise e
        finally:
            if close_db:
                db.close()

        return stats

    def _seed_curated_companies(self, db: Session, stats: Dict[str, Any]) -> None:
        """Seeds curated Nifty 50 and constituents data from companies_data & index_constituents."""
        try:
            from app.companies_data import NIFTY_50_REGISTRY
            from app.index_constituents_data import STOCK_REGISTRY
        except ImportError:
            return

        # 1. Seed Nifty 50
        for reg in NIFTY_50_REGISTRY:
            sym = reg["symbol"].upper()
            isin = reg["isin"].upper()
            comp = db.query(Company).filter((Company.primary_isin == isin) | (Company.company_id == f"COMP_{sym}")).first()
            if not comp:
                comp = Company(
                    company_id=f"COMP_{sym}",
                    legal_name=reg["company_name"],
                    normalized_name=normalize_company_name(reg["company_name"]),
                    primary_isin=isin,
                    sector=reg.get("sector"),
                    industry=reg.get("industry"),
                    market_cap_cr=reg.get("market_cap_cr", 0.0),
                    market_cap_category=classify_market_cap(reg.get("market_cap_cr", 0.0)),
                    listing_status=InstrumentStatus.ACTIVE,
                    description=reg.get("about"),
                )
                db.add(comp)
                db.flush()
                stats["companies_created"] += 1
            else:
                comp.market_cap_cr = reg.get("market_cap_cr", comp.market_cap_cr)
                stats["companies_updated"] += 1

            # Seed NSE Instrument
            inst_id = f"NSE_{sym}"
            inst = db.query(Instrument).filter(Instrument.instrument_id == inst_id).first()
            if not inst:
                inst = Instrument(
                    instrument_id=inst_id,
                    company_id=comp.id,
                    exchange=ExchangeCode.NSE,
                    exchange_symbol=sym,
                    trading_symbol=sym,
                    isin=isin,
                    series="EQ",
                    segment="EQUITY",
                    board_type=BoardType.MAINBOARD,
                    security_type=SecurityType.EQUITY,
                    instrument_status=InstrumentStatus.ACTIVE,
                    lot_size=1,
                    tick_size=0.05,
                    face_value=reg.get("face_value_inr", 10.0),
                    is_fno_eligible=True,
                    source="CURATED_NIFTY50",
                )
                db.add(inst)
                db.flush()
                stats["instruments_created"] += 1

                # Seed Quote
                self._ensure_default_quote(db, inst)

        # 2. Seed Sector Constituents
        for sym, data in STOCK_REGISTRY.items():
            sym_upper = sym.upper()
            # Synthetic placeholder ISIN if not known
            isin = data.get("isin", f"INE{abs(hash(sym_upper)) % 1000000000:09d}1")
            comp = db.query(Company).filter((Company.primary_isin == isin) | (Company.company_id == f"COMP_{sym_upper}")).first()
            if not comp:
                mcap = data.get("mcap_cr", 0.0)
                comp = Company(
                    company_id=f"COMP_{sym_upper}",
                    legal_name=data.get("name", sym_upper),
                    normalized_name=normalize_company_name(data.get("name", sym_upper)),
                    primary_isin=isin,
                    sector=data.get("sector"),
                    industry=data.get("industry"),
                    market_cap_cr=mcap,
                    market_cap_category=classify_market_cap(mcap),
                    listing_status=InstrumentStatus.ACTIVE,
                )
                db.add(comp)
                db.flush()
                stats["companies_created"] += 1

            # Ensure Instrument
            inst_id = f"NSE_{sym_upper}"
            inst = db.query(Instrument).filter(Instrument.instrument_id == inst_id).first()
            if not inst:
                inst = Instrument(
                    instrument_id=inst_id,
                    company_id=comp.id,
                    exchange=ExchangeCode.NSE,
                    exchange_symbol=sym_upper,
                    trading_symbol=sym_upper,
                    isin=isin,
                    series="EQ",
                    segment="EQUITY",
                    board_type=BoardType.MAINBOARD,
                    security_type=SecurityType.EQUITY,
                    instrument_status=InstrumentStatus.ACTIVE,
                    lot_size=1,
                    tick_size=0.05,
                    source="CURATED_CONSTITUENTS",
                )
                db.add(inst)
                db.flush()
                stats["instruments_created"] += 1
                self._ensure_default_quote(db, inst, base_price=data.get("base_price", 100.0), high_52w=data.get("high_52w", 0.0), low_52w=data.get("low_52w", 0.0))

        db.commit()

    def _ingest_single_record(self, db: Session, rec: Dict[str, Any], stats: Dict[str, Any]) -> None:
        isin = rec["isin"].upper()
        ex = rec["exchange"] # ExchangeCode.NSE or BSE
        ex_str = ex.value if hasattr(ex, "value") else str(ex)
        sym = rec["exchange_symbol"].upper()
        trading_sym = rec["trading_symbol"].upper()
        legal_name = rec["legal_name"]

        # 1. Match or Create Canonical Company via ISIN
        comp = db.query(Company).filter(Company.primary_isin == isin).first()
        if not comp:
            comp_id = f"COMP_{sym}_{isin[:6]}"
            comp = Company(
                company_id=comp_id,
                legal_name=legal_name,
                normalized_name=normalize_company_name(legal_name),
                primary_isin=isin,
                sector=rec.get("sector"),
                industry=rec.get("industry"),
                listing_status=rec.get("instrument_status", InstrumentStatus.ACTIVE),
            )
            db.add(comp)
            db.flush()
            stats["companies_created"] += 1
        else:
            if legal_name and len(legal_name) > len(comp.legal_name):
                comp.legal_name = legal_name
            stats["companies_updated"] += 1

        # 2. Match or Create Instrument
        inst_id = f"{ex_str}_{sym}"
        inst = db.query(Instrument).filter(Instrument.instrument_id == inst_id).first()
        if not inst:
            inst = Instrument(
                instrument_id=inst_id,
                company_id=comp.id,
                exchange=ex,
                exchange_symbol=sym,
                trading_symbol=trading_sym,
                isin=isin,
                series=rec.get("series", "EQ"),
                segment=rec.get("segment", "EQUITY"),
                board_type=rec.get("board_type", BoardType.MAINBOARD),
                security_type=rec.get("security_type", SecurityType.EQUITY),
                instrument_status=rec.get("instrument_status", InstrumentStatus.ACTIVE),
                listing_date=rec.get("listing_date"),
                lot_size=rec.get("lot_size", 1),
                tick_size=rec.get("tick_size", 0.05),
                face_value=rec.get("face_value", 10.0),
                currency=rec.get("currency", "INR"),
                source=rec.get("source", "EXCHANGE_MASTER"),
            )
            db.add(inst)
            db.flush()
            stats["instruments_created"] += 1

            self._ensure_default_quote(db, inst)
        else:
            inst.instrument_status = rec.get("instrument_status", inst.instrument_status)
            stats["instruments_updated"] += 1

    def _ensure_default_quote(
        self,
        db: Session,
        inst: Instrument,
        base_price: float = 100.0,
        high_52w: float = 0.0,
        low_52w: float = 0.0,
    ) -> None:
        quote = db.query(MarketQuote).filter(MarketQuote.instrument_id == inst.id).first()
        if not quote:
            quote = MarketQuote(
                instrument_id=inst.id,
                ltp=base_price,
                previous_close=base_price,
                open=base_price,
                high=base_price,
                low=base_price,
                high_52w=high_52w or (base_price * 1.2),
                low_52w=low_52w or (base_price * 0.8),
                volume=10000,
                data_status=DataAuthenticityStatus.EOD,
                timestamp=time.time(),
            )
            db.add(quote)

        sub_status = db.query(DataSubscriptionStatus).filter(DataSubscriptionStatus.instrument_id == inst.id).first()
        if not sub_status:
            sub_status = DataSubscriptionStatus(
                instrument_id=inst.id,
                current_tier=SubscriptionTier.EOD,
                is_live=False,
            )
            db.add(sub_status)

    def refresh_market_cap_categories(self, db: Session) -> None:
        """Rank-orders all companies by market cap and dynamically updates classifications."""
        companies = db.query(Company).order_by(Company.market_cap_cr.desc()).all()
        for idx, comp in enumerate(companies):
            if comp.market_cap_cr > 0:
                if idx < 100:
                    target_cat = MarketCapCategory.LARGE_CAP
                elif idx < 250:
                    target_cat = MarketCapCategory.MID_CAP
                elif idx < 500:
                    target_cat = MarketCapCategory.SMALL_CAP
                else:
                    target_cat = MarketCapCategory.MICRO_CAP
            else:
                target_cat = MarketCapCategory.SMALL_CAP
            if comp.market_cap_category != target_cat:
                comp.market_cap_category = target_cat


universe_manager = UniverseManager()
