'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  Building2,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Menu,
  ChevronRight,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Sparkles,
  Compass,
  FileText
} from 'lucide-react';
import IndicesBarometer from '@/components/IndicesBarometer';
import NavigationDrawer from '@/components/NavigationDrawer';
import CompanyDetailModal from '@/components/CompanyDetailModal';
import { useLiveStockTicks } from '@/hooks/useLiveStockTicks';
import { getApiBase } from '@/config/api';
import type { CompanyDetail } from '@/components/CompanyDrawer';

export interface Week52Item {
  symbol: string;
  company_name: string;
  sector: string;
  industry: string;
  market_cap_cr: number;
  current_price: number;
  price_change: number;
  percent_change: number;
  high_52w: number;
  low_52w: number;
  distance_from_high_pct: number;
  distance_from_high_inr: number;
  gain_from_low_pct: number;
  gain_from_low_inr: number;
  range_position_pct: number;
  signal_badge: string;
  signal_category: string;
  sentiment: string;
  pe_ratio: number;
  dividend_yield_pct: number;
  nse_official_url: string;
}

export interface Week52Response {
  status: string;
  official_source: string;
  regulatory_framework: string;
  summary: {
    total_companies_tracked: number;
    breakout_stocks_count: number;
    near_52w_high_count: number;
    near_52w_low_count: number;
    average_distance_from_high_pct: number;
    average_gain_from_low_pct: number;
    average_range_position_pct: number;
    top_breakouts: Array<{
      symbol: string;
      name: string;
      ltp: number;
      high_52w: number;
      distance_from_high_pct: number;
    }>;
    top_value_near_low: Array<{
      symbol: string;
      name: string;
      ltp: number;
      low_52w: number;
      gain_from_low_pct: number;
    }>;
  };
  timestamp: string;
  items: Week52Item[];
  count: number;
}

let globalWeek52Cache: Week52Response | null = null;

export default function Week52Page() {
  const [data, setData] = useState<Week52Response | null>(() => globalWeek52Cache);
  const [loading, setLoading] = useState<boolean>(!globalWeek52Cache);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [navDrawerOpen, setNavDrawerOpen] = useState<boolean>(false);

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState<'ALL' | 'BREAKOUT' | 'NEAR_HIGH' | 'NEAR_LOW' | 'MID_RANGE'>('ALL');
  const [selectedSector, setSelectedSector] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('dist_high_asc');

  // Company Detail Modal
  const [selectedCompany, setSelectedCompany] = useState<CompanyDetail | null>(null);
  const [modalLoading, setModalLoading] = useState<boolean>(false);

  // Live real-time ticks
  const { ticks: liveTicks, flashMap } = useLiveStockTicks();

  const fetchWeek52Data = useCallback(async (isManual: boolean = false, retries: number = 2) => {
    if (isManual) setRefreshing(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/52-week?limit=100`);
      if (res.ok) {
        const json: Week52Response = await res.json();
        globalWeek52Cache = json;
        try {
          sessionStorage.setItem('week52_cache', JSON.stringify(json));
        } catch (_) {}
        setData(json);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => fetchWeek52Data(isManual, retries - 1), 600);
      } else {
        console.error('Failed to fetch 52-week data:', err);
      }
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!globalWeek52Cache) {
      try {
        const stored = sessionStorage.getItem('week52_cache');
        if (stored) {
          const parsed = JSON.parse(stored);
          globalWeek52Cache = parsed;
          setData(parsed);
          setLoading(false);
        }
      } catch (_) {}
    }

    fetchWeek52Data();
    const interval = setInterval(() => fetchWeek52Data(), 30000);
    return () => clearInterval(interval);
  }, [fetchWeek52Data]);

  // Open Company Detail Modal
  const openCompanyDetail = async (symbol: string) => {
    setModalLoading(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/companies/${symbol}`);
      if (res.ok) {
        const detail: CompanyDetail = await res.json();
        setSelectedCompany(detail);
      }
    } catch (err) {
      console.error(`Failed to fetch company detail for ${symbol}:`, err);
    } finally {
      setModalLoading(false);
    }
  };

  // Distinct sectors
  const sectors = useMemo(() => {
    if (!data?.items) return ['All'];
    const s = new Set<string>();
    data.items.forEach((item) => {
      if (item.sector) s.add(item.sector);
    });
    return ['All', ...Array.from(s).sort()];
  }, [data]);

  // Filtered & Sorted Items
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];

    return data.items
      .map((item) => {
        // Overlay live tick if present
        const live = liveTicks[item.symbol];
        if (!live) return item;

        const liveLtp = live.ltp;
        const liveChg = live.change;
        const livePct = live.percent_change;
        const h52 = item.high_52w;
        const l52 = item.low_52w;

        const distHigh = roundDec(((h52 - liveLtp) / h52) * 100.0, 2);
        const gainLow = roundDec(((liveLtp - l52) / l52) * 100.0, 2);
        const span = h52 - l52;
        const rangePos = roundDec(Math.min(Math.max(((liveLtp - l52) / Math.max(span, 0.01)) * 100.0, 0.0), 100.0), 1);

        return {
          ...item,
          current_price: liveLtp,
          price_change: liveChg,
          percent_change: livePct,
          distance_from_high_pct: distHigh,
          distance_from_high_inr: roundDec(h52 - liveLtp, 2),
          gain_from_low_pct: gainLow,
          gain_from_low_inr: roundDec(liveLtp - l52, 2),
          range_position_pct: rangePos,
        };
      })
      .filter((item) => {
        // Tab Filter
        if (activeTab === 'BREAKOUT' && item.distance_from_high_pct > 2.0) return false;
        if (activeTab === 'NEAR_HIGH' && item.distance_from_high_pct > 5.0) return false;
        if (activeTab === 'NEAR_LOW' && item.gain_from_low_pct > 8.0) return false;
        if (activeTab === 'MID_RANGE' && (item.range_position_pct < 25.0 || item.range_position_pct > 75.0)) return false;

        // Sector Filter
        if (selectedSector !== 'All' && !item.sector.toLowerCase().includes(selectedSector.toLowerCase())) {
          return false;
        }

        // Search Filter
        if (searchTerm.trim()) {
          const s = searchTerm.toLowerCase().trim();
          const inSym = item.symbol.toLowerCase().includes(s);
          const inName = item.company_name.toLowerCase().includes(s);
          const inSec = item.sector.toLowerCase().includes(s);
          if (!inSym && !inName && !inSec) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'dist_high_asc') return a.distance_from_high_pct - b.distance_from_high_pct;
        if (sortBy === 'dist_high_desc') return b.distance_from_high_pct - a.distance_from_high_pct;
        if (sortBy === 'gain_low_desc') return b.gain_from_low_pct - a.gain_from_low_pct;
        if (sortBy === 'gain_low_asc') return a.gain_from_low_pct - b.gain_from_low_pct;
        if (sortBy === 'high52_desc') return b.high_52w - a.high_52w;
        if (sortBy === 'low52_asc') return a.low_52w - b.low_52w;
        if (sortBy === 'range_pos_desc') return b.range_position_pct - a.range_position_pct;
        if (sortBy === 'mcap_desc') return b.market_cap_cr - a.market_cap_cr;
        if (sortBy === 'symbol_asc') return a.symbol.localeCompare(b.symbol);
        return a.distance_from_high_pct - b.distance_from_high_pct;
      });
  }, [data, liveTicks, activeTab, selectedSector, searchTerm, sortBy]);

  const summary = data?.summary;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0d14' }}>
      {/* Top Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(16px)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: '1440px',
            margin: '0 auto',
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Link
              href="/"
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                padding: '8px 12px',
              }}
            >
              &larr; Hub
            </Link>

            <button
              onClick={() => setNavDrawerOpen(true)}
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.82rem',
                padding: '8px 14px',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                background: 'rgba(16, 185, 129, 0.1)',
                color: '#34d399',
                fontWeight: 700,
              }}
            >
              <Menu size={16} />
              <span>Drawer</span>
            </button>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    display: 'inline-block',
                    boxShadow: '0 0 10px rgba(16, 185, 129, 0.8)',
                  }}
                />
                <h1
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 900,
                    letterSpacing: '-0.02em',
                    margin: 0,
                    color: '#ffffff',
                  }}
                >
                  52-WEEK HIGH &amp; LOW RADAR
                </h1>
                <span
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    color: '#34d399',
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    textTransform: 'uppercase',
                  }}
                >
                  LIVE BREAKOUTS &bull; SPECTRUM
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                National Stock Exchange of India (NSE) Real-Time 52-Week Price Discovery &amp; Breakout Proximity
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => fetchWeek52Data(true)}
              disabled={refreshing}
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={13} className={refreshing ? 'pulse-indicator' : ''} />
              {refreshing ? 'Syncing...' : 'Refresh'}
            </button>

            <a
              href="https://www.nseindia.com/market-data/52-week-high-low-market-cap"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              title="Official NSE 52-Week High & Low Portal"
            >
              <ExternalLink size={13} />
              NSE Portal
            </a>
          </div>
        </div>
      </header>

      {/* Indices Barometer */}
      <IndicesBarometer />

      {/* Main Container */}
      <main style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px', width: '100%', boxSizing: 'border-box' }}>
        {/* 4 Summary Highlight Cards */}
        {summary && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              marginBottom: '20px',
            }}
          >
            {/* Card 1: 52W Breakouts */}
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '14px',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#34d399' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  52W BREAKOUTS (&le;2% FROM HIGH)
                </span>
                <Flame size={16} />
              </div>
              <div style={{ margin: '8px 0 2px 0' }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ffffff' }}>
                  {summary.breakout_stocks_count} Stocks
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Fresh Breakouts &amp; Multi-Month Highs
                </div>
              </div>
              <div style={{ fontSize: '0.68rem', color: '#34d399', fontWeight: 600 }}>
                High-Momentum Candidates
              </div>
            </div>

            {/* Card 2: Near 52W High */}
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '14px',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#38bdf8' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  NEAR 52W HIGH (&le;5%)
                </span>
                <TrendingUp size={16} />
              </div>
              <div style={{ margin: '8px 0 2px 0' }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ffffff' }}>
                  {summary.near_52w_high_count} Stocks
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Testing Key Overhead Resistance
                </div>
              </div>
              <div style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 600 }}>
                Expansion Radar
              </div>
            </div>

            {/* Card 3: Near 52W Low */}
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '14px',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#f87171' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  52W LOW SUPPORT (&le;8%)
                </span>
                <TrendingDown size={16} />
              </div>
              <div style={{ margin: '8px 0 2px 0' }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ffffff' }}>
                  {summary.near_52w_low_count} Stocks
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Accumulation / Floor Defense Zone
                </div>
              </div>
              <div style={{ fontSize: '0.68rem', color: '#f87171', fontWeight: 600 }}>
                Contrarian Deep Value
              </div>
            </div>

            {/* Card 4: Average Spectrum */}
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: '14px',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#c084fc' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  INDEX 52W SPECTRUM
                </span>
                <Compass size={16} />
              </div>
              <div style={{ margin: '8px 0 2px 0' }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ffffff' }}>
                  {summary.average_range_position_pct}%
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Avg Distance to 52W High: {summary.average_distance_from_high_pct}%
                </div>
              </div>
              <div style={{ fontSize: '0.68rem', color: '#c084fc', fontWeight: 600 }}>
                Avg Gain from 52W Low: +{summary.average_gain_from_low_pct}%
              </div>
            </div>
          </div>
        )}

        {/* Section Tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: '16px',
            overflowX: 'auto',
          }}
        >
          <button
            onClick={() => setActiveTab('ALL')}
            style={{
              padding: '10px 16px',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'ALL' ? 800 : 500,
              color: activeTab === 'ALL' ? '#38bdf8' : 'var(--text-secondary)',
              borderBottom: activeTab === 'ALL' ? '2px solid #38bdf8' : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>All 52-Week Stocks</span>
            <span className="badge badge-primary" style={{ fontSize: '0.62rem' }}>
              {data?.items.length || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('BREAKOUT')}
            style={{
              padding: '10px 16px',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'BREAKOUT' ? 800 : 500,
              color: activeTab === 'BREAKOUT' ? '#34d399' : 'var(--text-secondary)',
              borderBottom: activeTab === 'BREAKOUT' ? '2px solid #34d399' : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <Flame size={14} />
            <span>52W Breakouts (&le;2%)</span>
            <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontSize: '0.62rem' }}>
              {summary?.breakout_stocks_count || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('NEAR_HIGH')}
            style={{
              padding: '10px 16px',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'NEAR_HIGH' ? 800 : 500,
              color: activeTab === 'NEAR_HIGH' ? '#22d3ee' : 'var(--text-secondary)',
              borderBottom: activeTab === 'NEAR_HIGH' ? '2px solid #22d3ee' : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <TrendingUp size={14} />
            <span>Near 52W High (&le;5%)</span>
            <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.2)', color: '#22d3ee', fontSize: '0.62rem' }}>
              {summary?.near_52w_high_count || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('NEAR_LOW')}
            style={{
              padding: '10px 16px',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'NEAR_LOW' ? 800 : 500,
              color: activeTab === 'NEAR_LOW' ? '#f87171' : 'var(--text-secondary)',
              borderBottom: activeTab === 'NEAR_LOW' ? '2px solid #f87171' : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <TrendingDown size={14} />
            <span>Near 52W Low (Support)</span>
            <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', fontSize: '0.62rem' }}>
              {summary?.near_52w_low_count || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('MID_RANGE')}
            style={{
              padding: '10px 16px',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'MID_RANGE' ? 800 : 500,
              color: activeTab === 'MID_RANGE' ? '#c084fc' : 'var(--text-secondary)',
              borderBottom: activeTab === 'MID_RANGE' ? '2px solid #c084fc' : '2px solid transparent',
              background: 'transparent',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <Compass size={14} />
            <span>Mid Range Spectrum (25-75%)</span>
          </button>
        </div>

        {/* Filter Toolbar: Search, Sector, Sort */}
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          {/* Search Bar */}
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search by Symbol (e.g. RELIANCE, TCS) or Company Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-subtle)',
                color: '#ffffff',
                fontSize: '0.80rem',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          {/* Sector Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Sector:</span>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                color: '#ffffff',
                fontSize: '0.74rem',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {sectors.map((sec) => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
            </select>
          </div>

          {/* Sort Order */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Sort Order:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#34d399',
                fontSize: '0.74rem',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="dist_high_asc">🔥 Distance to 52W High (Closest First)</option>
              <option value="dist_high_desc">Distance to 52W High (Furthest First)</option>
              <option value="gain_low_desc">🚀 Gain from 52W Low (Highest Gain)</option>
              <option value="gain_low_asc">💎 Gain from 52W Low (Lowest / Near Floor)</option>
              <option value="high52_desc">💰 52-Week High (Highest Price)</option>
              <option value="low52_asc">52-Week Low (Lowest Price)</option>
              <option value="range_pos_desc">📊 Spectrum Position (Top of Range)</option>
              <option value="mcap_desc">Market Cap (Highest)</option>
              <option value="symbol_asc">Symbol (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Results Counter & Freshness */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', fontSize: '0.74rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            Showing <strong style={{ color: '#ffffff' }}>{filteredItems.length}</strong> of <strong>{data?.items.length || 0}</strong> constituents &bull; Active Tab: <strong style={{ color: '#34d399' }}>{activeTab}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="badge badge-success" style={{ fontSize: '0.62rem' }}>
              AUTHENTIC NSE CASH MARKET FEED
            </span>
            <ShieldCheck size={14} color="#10b981" />
            <span>Tickertape &amp; Exchange Verified</span>
          </div>
        </div>

        {/* 52-Week Comprehensive Table */}
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '14px',
            overflow: 'hidden',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderBottom: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  <th style={{ padding: '12px 16px' }}>COMPANY &amp; SECTOR</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>LIVE LTP</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', color: '#34d399' }}>52-WEEK HIGH</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', color: '#f87171' }}>52-WEEK LOW</th>
                  <th style={{ padding: '12px 20px', minWidth: '220px' }}>52-WEEK PRICE SPECTRUM</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>BREAKOUT RADAR / SIGNAL</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>ACTIONS &bull; NSE</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '48px 18px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No companies match your active tab or search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, idx) => {
                    const flash = flashMap[item.symbol];
                    const isPos = item.price_change >= 0;

                    return (
                      <tr
                        key={item.symbol}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          background: flash === 'UP'
                            ? 'rgba(16, 185, 129, 0.12)'
                            : flash === 'DOWN'
                            ? 'rgba(239, 68, 68, 0.12)'
                            : idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)',
                          transition: 'background 0.2s ease',
                          cursor: 'pointer',
                        }}
                        onClick={() => openCompanyDetail(item.symbol)}
                      >
                        {/* 1. Company Name & Sector */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '0.90rem', color: '#ffffff' }}>
                              {item.symbol}
                            </strong>
                            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.04)', padding: '2px 6px', borderRadius: '4px' }}>
                              NSE
                            </span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px', whiteSpace: 'nowrap' }}>
                            {item.company_name}
                          </div>
                          <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                            {item.sector} &bull; M-Cap: ₹{(item.market_cap_cr / 1000).toFixed(1)}k Cr
                          </div>
                        </td>

                        {/* 2. Live LTP */}
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ fontSize: '0.92rem', fontWeight: 900, color: '#ffffff' }}>
                            ₹{item.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div
                            style={{
                              fontSize: '0.70rem',
                              fontWeight: 700,
                              color: isPos ? '#34d399' : '#f87171',
                              marginTop: '2px',
                            }}
                          >
                            {isPos ? '+' : ''}{item.price_change.toFixed(2)} ({isPos ? '+' : ''}{item.percent_change.toFixed(2)}%)
                          </div>
                        </td>

                        {/* 3. 52-Week High & Distance */}
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#34d399' }}>
                            ₹{item.high_52w.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: item.distance_from_high_pct <= 3.0 ? '#34d399' : 'var(--text-muted)', marginTop: '2px', fontWeight: 600 }}>
                            {item.distance_from_high_pct <= 0.01 ? (
                              <span style={{ color: '#34d399', fontWeight: 800 }}>★ AT 52W HIGH</span>
                            ) : (
                              <span>-{item.distance_from_high_pct.toFixed(2)}% below high</span>
                            )}
                          </div>
                        </td>

                        {/* 4. 52-Week Low & Gain */}
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#f87171' }}>
                            ₹{item.low_52w.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#38bdf8', marginTop: '2px', fontWeight: 600 }}>
                            +{item.gain_from_low_pct.toFixed(2)}% above low
                          </div>
                        </td>

                        {/* 5. 52-Week Price Spectrum Gauge */}
                        <td style={{ padding: '12px 20px', minWidth: '220px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', marginBottom: '4px' }}>
                            <span style={{ color: '#f87171' }}>₹{item.low_52w.toFixed(0)}</span>
                            <span style={{ color: '#ffffff', fontWeight: 700 }}>{item.range_position_pct.toFixed(0)}% Range</span>
                            <span style={{ color: '#34d399' }}>₹{item.high_52w.toFixed(0)}</span>
                          </div>
                          <div
                            style={{
                              position: 'relative',
                              height: '7px',
                              background: 'rgba(255, 255, 255, 0.08)',
                              borderRadius: '4px',
                            }}
                          >
                            <div
                              style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: `${item.range_position_pct}%`,
                                background: 'linear-gradient(90deg, #ef4444 0%, #fbbf24 50%, #10b981 100%)',
                                borderRadius: '4px',
                              }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                left: `calc(${item.range_position_pct}% - 5px)`,
                                top: '-3px',
                                width: '10px',
                                height: '13px',
                                background: '#ffffff',
                                borderRadius: '2px',
                                boxShadow: '0 0 6px rgba(255, 255, 255, 0.9)',
                              }}
                            />
                          </div>
                        </td>

                        {/* 6. Technical Status Badge */}
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              padding: '4px 10px',
                              borderRadius: '6px',
                              background: item.distance_from_high_pct <= 2.0
                                ? 'rgba(16, 185, 129, 0.2)'
                                : item.distance_from_high_pct <= 5.0
                                ? 'rgba(6, 182, 212, 0.2)'
                                : item.gain_from_low_pct <= 8.0
                                ? 'rgba(239, 68, 68, 0.2)'
                                : 'rgba(255, 255, 255, 0.05)',
                              color: item.distance_from_high_pct <= 2.0
                                ? '#34d399'
                                : item.distance_from_high_pct <= 5.0
                                ? '#22d3ee'
                                : item.gain_from_low_pct <= 8.0
                                ? '#f87171'
                                : '#94a3b8',
                              border: item.distance_from_high_pct <= 2.0
                                ? '1px solid rgba(16, 185, 129, 0.4)'
                                : item.distance_from_high_pct <= 5.0
                                ? '1px solid rgba(6, 182, 212, 0.4)'
                                : item.gain_from_low_pct <= 8.0
                                ? '1px solid rgba(239, 68, 68, 0.4)'
                                : '1px solid rgba(255, 255, 255, 0.1)',
                              whiteSpace: 'nowrap',
                              display: 'inline-block',
                            }}
                          >
                            {item.signal_badge}
                          </span>
                        </td>

                        {/* 7. Action Buttons */}
                        <td style={{ padding: '12px 16px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              onClick={() => openCompanyDetail(item.symbol)}
                              className="btn btn-secondary"
                              style={{
                                fontSize: '0.70rem',
                                padding: '5px 10px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                color: '#38bdf8',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                              }}
                              title={`View full financial statements & 52-week breakdown for ${item.symbol}`}
                            >
                              <FileText size={12} />
                              Report
                            </button>
                            <a
                              href={item.nse_official_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary"
                              style={{
                                fontSize: '0.70rem',
                                padding: '5px 8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#94a3b8',
                              }}
                              title={`View official quote for ${item.symbol} on NSE India Portal`}
                            >
                              <ExternalLink size={12} />
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Navigation Drawer */}
      {navDrawerOpen && (
        <NavigationDrawer
          isOpen={navDrawerOpen}
          onClose={() => setNavDrawerOpen(false)}
        />
      )}

      {/* Company Detail Modal */}
      {selectedCompany && (
        <CompanyDetailModal
          company={selectedCompany}
          onClose={() => setSelectedCompany(null)}
          onSyncLive={() => {}}
          syncingLive={false}
          syncStatus=""
        />
      )}
    </div>
  );
}

function roundDec(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}
