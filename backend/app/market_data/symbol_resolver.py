"""
ALGO ROBOT — Canonical Symbol & Identity Resolver
Resolves any identifier format (Symbol, Scrip Code, ISIN, Company ID, or Instrument ID)
into the canonical Company entity and target exchange Instrument.
Ensures 100% backward compatibility for all existing routes and algorithms.
"""

from __future__ import annotations
import logging
import re
from typing import Dict, List, Optional, Tuple, Any
from sqlalchemy.orm import Session

from app.db.models import Company, Instrument, ExchangeCode, BoardType, InstrumentStatus
from app.db.session import SessionLocal

logger = logging.getLogger("algo_robot.market_data.resolver")

ISIN_REGEX = re.compile(r"^IN[A-Z0-9]{9}[0-9]$")
BSE_SCRIP_REGEX = re.compile(r"^\d{6}$")


class SymbolResolver:
    """High-speed in-memory cached symbol and entity resolution engine."""

    def __init__(self):
        # Fast lookup caches:
        # key -> (company_id, instrument_id)
        self._cache_symbol_to_inst: Dict[str, str] = {} # e.g. "RELIANCE" -> "NSE_RELIANCE"
        self._cache_isin_to_comp: Dict[str, str] = {}   # e.g. "INE002A01018" -> "COMP_RELIANCE"
        self._cache_bse_code_to_inst: Dict[str, str] = {} # e.g. "500325" -> "BSE_500325"
        self._cache_inst_details: Dict[str, Dict[str, Any]] = {}
        self._cache_comp_details: Dict[str, Dict[str, Any]] = {}
        self._is_hydrated = False

    def hydrate_cache(self, db: Optional[Session] = None) -> None:
        """Loads canonical companies and instruments from DB into local lookup tables."""
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            instruments = db.query(Instrument).all()
            companies = db.query(Company).all()

            # Cache companies
            for comp in companies:
                self._cache_comp_details[comp.company_id] = comp.to_dict()
                if comp.primary_isin:
                    self._cache_isin_to_comp[comp.primary_isin.upper()] = comp.company_id

            # Cache instruments
            for inst in instruments:
                inst_dict = inst.to_dict()
                self._cache_inst_details[inst.instrument_id] = inst_dict

                # Populate lookup keys
                sym_raw = inst.exchange_symbol.upper()
                trading_sym = inst.trading_symbol.upper()
                ex = inst.exchange.value if hasattr(inst.exchange, "value") else str(inst.exchange)
                
                # Qualified keys: "NSE:RELIANCE", "BSE:500325"
                self._cache_symbol_to_inst[f"{ex}:{sym_raw}"] = inst.instrument_id
                self._cache_symbol_to_inst[f"{ex}:{trading_sym}"] = inst.instrument_id

                # BSE 6-digit scrip code mapping
                if ex == "BSE" and BSE_SCRIP_REGEX.match(sym_raw):
                    self._cache_bse_code_to_inst[sym_raw] = inst.instrument_id

                # Default plain symbol (NSE prioritised over BSE if present)
                if sym_raw not in self._cache_symbol_to_inst or ex == "NSE":
                    self._cache_symbol_to_inst[sym_raw] = inst.instrument_id
                if trading_sym not in self._cache_symbol_to_inst or ex == "NSE":
                    self._cache_symbol_to_inst[trading_sym] = inst.instrument_id

            self._is_hydrated = True
            logger.info("SymbolResolver hydrated: %d companies, %d instruments mapped.", len(companies), len(instruments))
        except Exception as e:
            logger.warning("SymbolResolver hydration deferred: %s", e)
        finally:
            if close_db:
                db.close()

    def resolve(self, query: str, preferred_exchange: Optional[str] = None, db: Optional[Session] = None) -> Optional[Tuple[Dict[str, Any], Dict[str, Any]]]:
        """
        Resolves any input query string to (company_dict, instrument_dict).
        Supports:
        - Plain symbol: "RELIANCE", "TCS"
        - Qualified symbol: "NSE:RELIANCE", "BSE:500325"
        - BSE Scrip Code: "500325"
        - ISIN: "INE002A01018"
        - Instrument ID: "NSE_RELIANCE"
        - Company ID: "COMP_RELIANCE"
        """
        if not query:
            return None

        q = query.strip().upper()
        if not self._is_hydrated:
            self.hydrate_cache(db=db)

        # 1. Direct Instrument ID check
        if q in self._cache_inst_details:
            inst = self._cache_inst_details[q]
            comp = self._get_company_by_id(inst["company_id"], db=db)
            return comp, inst

        # 2. ISIN Lookup
        if ISIN_REGEX.match(q) and q in self._cache_isin_to_comp:
            comp_id = self._cache_isin_to_comp[q]
            comp = self._cache_comp_details.get(comp_id) or self._get_company_by_id(comp_id, db=db)
            if comp:
                # Find preferred instrument
                inst = self._get_default_instrument_for_company(comp["id"], preferred_exchange, db=db)
                return comp, inst

        # 3. BSE Scrip Code Lookup
        if BSE_SCRIP_REGEX.match(q) and q in self._cache_bse_code_to_inst:
            inst_id = self._cache_bse_code_to_inst[q]
            inst = self._cache_inst_details.get(inst_id)
            if inst:
                comp = self._get_company_by_id(inst["company_id"], db=db)
                return comp, inst

        # 4. Qualified Symbol Check (e.g. "NSE:RELIANCE")
        if ":" in q:
            inst_id = self._cache_symbol_to_inst.get(q)
            if inst_id and inst_id in self._cache_inst_details:
                inst = self._cache_inst_details[inst_id]
                comp = self._get_company_by_id(inst["company_id"], db=db)
                return comp, inst

        # 5. Preferred Exchange Qualified Check
        if preferred_exchange:
            pref_key = f"{preferred_exchange.upper()}:{q}"
            inst_id = self._cache_symbol_to_inst.get(pref_key)
            if inst_id and inst_id in self._cache_inst_details:
                inst = self._cache_inst_details[inst_id]
                comp = self._get_company_by_id(inst["company_id"], db=db)
                return comp, inst

        # 6. Plain Symbol Lookup
        inst_id = self._cache_symbol_to_inst.get(q)
        if inst_id and inst_id in self._cache_inst_details:
            inst = self._cache_inst_details[inst_id]
            comp = self._get_company_by_id(inst["company_id"], db=db)
            return comp, inst

        # 7. Database Fallback (if cache miss)
        return self._db_fallback_resolve(q, preferred_exchange, db=db)

    def _get_company_by_id(self, comp_id_or_int: Any, db: Optional[Session] = None) -> Optional[Dict[str, Any]]:
        for cid, cdata in self._cache_comp_details.items():
            if cdata.get("id") == comp_id_or_int or cid == str(comp_id_or_int):
                return cdata

        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            if isinstance(comp_id_or_int, int):
                comp = db.query(Company).filter(Company.id == comp_id_or_int).first()
            else:
                comp = db.query(Company).filter(Company.company_id == str(comp_id_or_int)).first()
            if comp:
                cdict = comp.to_dict()
                self._cache_comp_details[comp.company_id] = cdict
                return cdict
        finally:
            if close_db:
                db.close()
        return None

    def _get_default_instrument_for_company(self, company_db_id: int, preferred_exchange: Optional[str] = None, db: Optional[Session] = None) -> Optional[Dict[str, Any]]:
        candidates = [inst for inst in self._cache_inst_details.values() if inst.get("company_id") == company_db_id]
        if not candidates:
            return None
        
        pref = preferred_exchange.upper() if preferred_exchange else "NSE"
        for cand in candidates:
            if cand.get("exchange") == pref:
                return cand
        return candidates[0]

    def _db_fallback_resolve(self, query: str, preferred_exchange: Optional[str] = None, db: Optional[Session] = None) -> Optional[Tuple[Dict[str, Any], Dict[str, Any]]]:
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            inst_query = db.query(Instrument).filter(
                (Instrument.exchange_symbol == query) | 
                (Instrument.trading_symbol == query) |
                (Instrument.isin == query)
            )
            if preferred_exchange:
                try:
                    ex_enum = ExchangeCode(preferred_exchange.upper())
                    inst_query = inst_query.filter(Instrument.exchange == ex_enum)
                except ValueError:
                    pass

            inst = inst_query.first()
            if inst:
                comp = db.query(Company).filter(Company.id == inst.company_id).first()
                if comp:
                    inst_dict = inst.to_dict()
                    comp_dict = comp.to_dict()
                    self._cache_inst_details[inst.instrument_id] = inst_dict
                    self._cache_comp_details[comp.company_id] = comp_dict
                    return comp_dict, inst_dict
        finally:
            if close_db:
                db.close()
        return None


symbol_resolver = SymbolResolver()
