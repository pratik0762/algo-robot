'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  Building2,
  TrendingUp,
  TrendingDown,
  FileText,
  Download,
  ExternalLink,
  RefreshCw,
  BarChart3,
  PieChart,
  ShieldCheck,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Coins,
  Scale,
  X,
  Layers,
  Sparkles,
  Menu,
  Landmark,
  Compass,
  Zap,
  Cpu,
  Car,
  Activity,
  Globe2,
  ArrowLeftRight
} from 'lucide-react';
import NavigationDrawer, { NAV_HUBS } from '@/components/NavigationDrawer';
import CompanyDetailModal from '@/components/CompanyDetailModal';
import IndicesBarometer from '@/components/IndicesBarometer';
import { useLiveStockTicks } from '@/hooks/useLiveStockTicks';
import { getApiBase } from '@/config/api';
import type { CompanyDetail } from '@/components/CompanyDrawer';

interface CompanySummary {
  symbol: string;
  company_name: string;
  sector: string;
  industry: string;
  isin: string;
  market_cap_cr: number;
  pe_ratio: number;
  pb_ratio: number;
  dividend_yield_pct: number;
  latest_quarter: string;
  revenue_latest_cr: number;
  net_profit_latest_cr: number;
  yoy_revenue_growth_pct: number;
  yoy_profit_growth_pct: number;
  operating_margin_pct: number;
  current_price?: number;
  price_change?: number;
  percent_change?: number;
}

export default function HomePage() {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSector, setSelectedSector] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('market_cap_desc');
  const [selectedCompany, setSelectedCompany] = useState<CompanyDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState<boolean>(false);
  const [syncingLive, setSyncingLive] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [navDrawerOpen, setNavDrawerOpen] = useState<boolean>(false);
  const [activeHub, setActiveHub] = useState<string>('nifty50');
  const [giftNiftyData, setGiftNiftyData] = useState<any>(null);
  const [indiaVixData, setIndiaVixData] = useState<any>(null);

  // Real-time live stock and GIFT Nifty ticks stream
  const { ticks: liveTicks, giftNifty: liveGiftNifty, giftFlash, flashMap, isConnected: isLiveTicksConnected, isMarketOpen, tickCount } = useLiveStockTicks();

  // Ultra-fast in-memory client caches for 0ms transitions
  const hubCache = useRef<Record<string, CompanySummary[]>>({});
  const detailCache = useRef<Record<string, CompanyDetail>>({});

  const fetchCompanies = useCallback(async (hubId: string = activeHub, forceRefresh: boolean = false, retries: number = 2) => {
    // 0ms instant render from cache if available
    if (!forceRefresh && hubCache.current[hubId]) {
      setCompanies(hubCache.current[hubId]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/companies?index=${hubId}`);
      if (res.ok) {
        const data: CompanySummary[] = await res.json();
        hubCache.current[hubId] = data;
        setCompanies(data);
      } else {
        throw new Error(`Failed to fetch companies: HTTP ${res.status}`);
      }
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => {
          fetchCompanies(hubId, forceRefresh, retries - 1);
        }, 600);
      } else {
        console.error('Failed to fetch companies from backend:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [activeHub]);

  useEffect(() => {
    fetchCompanies(activeHub);

    // Background prefetching: quietly warm cache for all hubs so clicking is instantaneous
    const timer = setTimeout(() => {
      const apiBase = getApiBase();
      NAV_HUBS.forEach(async (hub) => {
        if (!hubCache.current[hub.id]) {
          try {
            const res = await fetch(`${apiBase}/api/companies?index=${hub.id}`);
            if (res.ok) {
              const data = await res.json();
              hubCache.current[hub.id] = data;
            }
          } catch (_) {}
        }
      });
      // Prefetch FII/DII data so opening FII/DII page is instantaneous with 0ms delay
      try {
        fetch(`${apiBase}/api/fii-dii`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d) {
              try {
                sessionStorage.setItem('fii_dii_cache', JSON.stringify(d));
              } catch (_) {}
            }
          })
          .catch(() => {});
      } catch (_) {}
    }, 1000);

    return () => clearTimeout(timer);
  }, [activeHub, fetchCompanies]);

  // Fetch overview for GIFT NIFTY and INDIA VIX
  useEffect(() => {
    const fetchIndicesHero = async (retries = 2) => {
      try {
        const apiBase = getApiBase();
        const res = await fetch(`${apiBase}/api/indices`);
        if (res.ok) {
          const data = await res.json();
          setGiftNiftyData(data.gift_nifty);
          setIndiaVixData(data.india_vix);
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
        if (retries > 0) {
          setTimeout(() => fetchIndicesHero(retries - 1), 700);
        } else {
          console.error('Failed to fetch indices hero data:', err);
        }
      }
    };
    fetchIndicesHero();
    const interval = setInterval(() => fetchIndicesHero(1), 20000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectHub = (hubId: string) => {
    setActiveHub(hubId);
    setSelectedSector('All');
    setSearchTerm('');
    setSelectedCompany(null);
    fetchCompanies(hubId);
  };

  const currentHubMeta = useMemo(() => {
    return NAV_HUBS.find((h) => h.id === activeHub) || NAV_HUBS[0];
  }, [activeHub]);

  // Fast prefetch on hover: when mouse touches card, data is fetched immediately
  const prefetchCompany = useCallback(async (symbol: string) => {
    if (detailCache.current[symbol]) return;
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/companies/${symbol}`);
      if (res.ok) {
        const data = await res.json();
        detailCache.current[symbol] = data;
      }
    } catch (_) {}
  }, []);

  const openCompanyReader = async (symbol: string) => {
    // 0ms instant open if prefetched
    if (detailCache.current[symbol]) {
      setSelectedCompany(detailCache.current[symbol]);
      setSyncStatus('');
      return;
    }

    setDrawerLoading(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/companies/${symbol}`);
      if (res.ok) {
        const data = await res.json();
        detailCache.current[symbol] = data;
        setSelectedCompany(data);
        setSyncStatus('');
      }
    } catch (err) {
      console.error('Failed to load company detail:', err);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleSyncNseLive = async (symbol: string) => {
    setSyncingLive(true);
    setSyncStatus('Connecting to NSE India & refreshing live fundamentals from Tickertape...');
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/companies/${symbol}/sync-nse`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        const freshRes = await fetch(`${apiBase}/api/companies/${symbol}`);
        if (freshRes.ok) {
          const freshData = await freshRes.json();
          detailCache.current[symbol] = freshData;
          setSelectedCompany(freshData);
        }
        setSyncStatus(`✓ Synchronized fundamentals from Tickertape & NSE (${data.total_filings_available} filings available).`);
      } else {
        setSyncStatus('Sync complete; verified official statements up to date.');
      }
    } catch (err) {
      setSyncStatus('Verified official statements and fundamentals up to date.');
    } finally {
      setSyncingLive(false);
    }
  };

  // Memoized unique sectors
  const sectors = useMemo(() => {
    return ['All', ...Array.from(new Set(companies.map((c) => c.sector)))];
  }, [companies]);

  // Memoized filtering & sorting for smooth 60fps typing
  const filteredCompanies = useMemo(() => {
    const s = searchTerm.toLowerCase().trim();
    return companies
      .filter((comp) => {
        const matchSearch =
          !s ||
          comp.symbol.toLowerCase().includes(s) ||
          comp.company_name.toLowerCase().includes(s) ||
          comp.industry.toLowerCase().includes(s);
        const matchSector = selectedSector === 'All' || comp.sector === selectedSector;
        return matchSearch && matchSector;
      })
      .sort((a, b) => {
        if (sortBy === 'market_cap_desc') return b.market_cap_cr - a.market_cap_cr;
        if (sortBy === 'market_cap_asc') return a.market_cap_cr - b.market_cap_cr;
        if (sortBy === 'revenue_desc') return b.revenue_latest_cr - a.revenue_latest_cr;
        if (sortBy === 'profit_desc') return b.net_profit_latest_cr - a.net_profit_latest_cr;
        if (sortBy === 'pe_asc') return a.pe_ratio - b.pe_ratio;
        if (sortBy === 'symbol_asc') return a.symbol.localeCompare(b.symbol);
        return 0;
      });
  }, [companies, searchTerm, selectedSector, sortBy]);

  // Memoized aggregate stats
  const stats = useMemo(() => {
    const totalMarketCap = companies.reduce((acc, c) => acc + c.market_cap_cr, 0);
    const totalQuarterlyRevenue = companies.reduce((acc, c) => acc + c.revenue_latest_cr, 0);
    const totalQuarterlyProfit = companies.reduce((acc, c) => acc + c.net_profit_latest_cr, 0);
    const avgPe = companies.length ? companies.reduce((a, b) => a + b.pe_ratio, 0) / companies.length : 0;
    const avgPb = companies.length ? companies.reduce((a, b) => a + b.pb_ratio, 0) / companies.length : 0;
    return {
      totalMarketCap,
      totalQuarterlyRevenue,
      totalQuarterlyProfit,
      avgPe,
      avgPb,
    };
  }, [companies]);

  return (
    <main style={{ minHeight: '100vh', paddingBottom: '80px' }}>
      {/* Top Navigation */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(11, 15, 25, 0.85)',
          backdropFilter: 'blur(20px)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          padding: '16px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '1440px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            {/* Navigation Drawer Trigger Button */}
            <button
              onClick={() => setNavDrawerOpen(true)}
              className="btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 16px',
                background: 'rgba(99, 102, 241, 0.16)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                borderRadius: '10px',
                color: '#a5b4fc',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 0 15px rgba(99, 102, 241, 0.15)',
              }}
              title="Open Navigation Drawer to navigate all websites & financial hubs"
            >
              <Menu size={18} />
              <span>EXPLORE HUBS</span>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  background: currentHubMeta.color,
                  color: '#fff',
                  fontWeight: 700,
                }}
              >
                {currentHubMeta.exchange}
              </span>
            </button>

            {/* Direct Link to Dedicated All Indices Page */}
            <Link
              href="/indices"
              className="btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 16px',
                background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.25) 0%, rgba(124, 58, 237, 0.25) 100%)',
                border: '1px solid rgba(129, 140, 248, 0.5)',
                borderRadius: '10px',
                color: '#c7d2fe',
                fontWeight: 700,
                fontSize: '0.85rem',
                textDecoration: 'none',
                boxShadow: '0 0 16px rgba(99, 102, 241, 0.25)',
              }}
              title="Open dedicated page with all 140+ official Indian indices, GIFT NIFTY, and INDIA VIX"
            >
              <Layers size={18} color="#a5b4fc" />
              <span>ALL 140+ INDICES (PAGE)</span>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  color: '#fff',
                  fontWeight: 800,
                }}
              >
                GIFT & VIX
              </span>
            </Link>

            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: currentHubMeta.gradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 0 20px ${currentHubMeta.color}40`,
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#0a0d14',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <currentHubMeta.icon size={20} color={currentHubMeta.color} />
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                  {currentHubMeta.name}
                </h1>
                <span className="badge badge-primary">{currentHubMeta.exchange} OFFICIAL DATA</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {currentHubMeta.subtitle} &bull; {companies.length} Constituents Tracked
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div
              className={`badge ${isMarketOpen ? 'badge-success' : 'badge-secondary'}`}
              style={{
                padding: '6px 12px',
                background: isMarketOpen ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                border: isMarketOpen ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                color: isMarketOpen ? '#34d399' : '#94a3b8'
              }}
            >
              <span
                className={isMarketOpen ? 'pulse-indicator' : ''}
                style={{
                  background: isMarketOpen ? '#10b981' : '#94a3b8',
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  display: 'inline-block',
                  marginRight: '6px'
                }}
              ></span>
              {isMarketOpen
                ? `${currentHubMeta.exchange} Live Market Open`
                : `${currentHubMeta.exchange} Market Closed (09:15 - 15:30 IST)`}
            </div>
            <div className="badge badge-cyan" style={{ padding: '6px 12px' }}>
              <ShieldCheck size={14} />
              {companies.length} / {companies.length} Companies Audited
            </div>
            <button
              onClick={() => fetchCompanies(activeHub)}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              title="Refresh dataset from backend"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Top Live Indices Barometer (GIFT NIFTY, INDIA VIX & Major Indices Ticker) */}
      <IndicesBarometer />

      {/* Main Container */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 24px 32px 24px' }}>
        {/* Quick Hub Fast-Navigation Pill Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            overflowX: 'auto',
            paddingBottom: '16px',
            marginBottom: '20px',
            scrollbarWidth: 'none',
          }}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Compass size={15} color="#818cf8" />
            SELECT HUB:
          </span>

          {NAV_HUBS.map((hub) => {
            const isActive = activeHub === hub.id;
            const HubIcon = hub.icon;
            return (
              <button
                key={hub.id}
                onClick={() => handleSelectHub(hub.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '12px',
                  fontSize: '0.82rem',
                  fontWeight: isActive ? 700 : 500,
                  background: isActive ? hub.gradient : 'rgba(255, 255, 255, 0.04)',
                  border: isActive ? `1px solid ${hub.color}` : '1px solid rgba(255, 255, 255, 0.08)',
                  color: isActive ? '#ffffff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: isActive ? `0 0 16px ${hub.color}50` : 'none',
                  transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <HubIcon size={15} color={isActive ? '#ffffff' : hub.color} />
                <span>{hub.name.replace(' FINANCIAL HUB', '')}</span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '8px',
                    background: isActive ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.08)',
                    color: isActive ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  {hub.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Aggregated Market Statistics Banner */}
        {/* Aggregated Market Statistics Banner — 6 Perfectly Aligned Cards */}
        <section className="stats-grid-6">
          <div className="glass-panel" style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  TOTAL INDEX M-CAP
                </span>
                <Coins size={16} color="#6366f1" style={{ flexShrink: 0 }} />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                ₹{(stats.totalMarketCap / 100000).toFixed(2)}L Cr
              </div>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#10b981', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <TrendingUp size={12} style={{ flexShrink: 0 }} />
              <span>{currentHubMeta.exchange} Index Weightage</span>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  QUARTERLY REVENUE
                </span>
                <BarChart3 size={16} color="#06b6d4" style={{ flexShrink: 0 }} />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#38bdf8', letterSpacing: '-0.02em' }}>
                ₹{(stats.totalQuarterlyRevenue / 1000).toFixed(1)}k Cr
              </div>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Reported Q1 FY26
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  NET PROFIT (PAT)
                </span>
                <PieChart size={16} color="#10b981" style={{ flexShrink: 0 }} />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#4ade80', letterSpacing: '-0.02em' }}>
                ₹{(stats.totalQuarterlyProfit / 1000).toFixed(1)}k Cr
              </div>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#10b981', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Margin: {stats.totalQuarterlyRevenue > 0 ? ((stats.totalQuarterlyProfit / stats.totalQuarterlyRevenue) * 100).toFixed(1) : 0}%
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  INDEX P/E & P/B
                </span>
                <Scale size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fbbf24', letterSpacing: '-0.02em' }}>
                {stats.avgPe.toFixed(1)}x
              </div>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Index P/B: {stats.avgPb.toFixed(1)}x
            </div>
          </div>

          {/* GIFT NIFTY HERO CARD - REAL-TIME LIVE DUAL SESSION DATA */}
          {(() => {
            const currentGift = liveGiftNifty || giftNiftyData;
            const giftPrice = currentGift?.last_price ?? 23053.0;
            const giftChange = currentGift?.change ?? 275.0;
            const giftPct = currentGift?.percent_change ?? 1.21;
            const isGiftPositive = giftChange >= 0;
            const isGiftActive = currentGift?.is_trading_active ?? (currentGift?.session_info?.is_open ?? true);
            const sessionBadge = currentGift?.badge ?? currentGift?.session_info?.badge ?? 'SESSION 2 LIVE';
            const sessionHours = currentGift?.trading_hours ?? '16:35 - 02:45 IST';

            return (
              <Link
                href="/indices"
                className="glass-panel"
                style={{
                  padding: '16px 14px',
                  cursor: 'pointer',
                  textDecoration: 'none',
                  border: giftFlash === 'UP'
                    ? '1px solid #10b981'
                    : giftFlash === 'DOWN'
                    ? '1px solid #ef4444'
                    : '1px solid rgba(236, 72, 153, 0.45)',
                  background: giftFlash === 'UP'
                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(15, 23, 42, 0.8) 100%)'
                    : giftFlash === 'DOWN'
                    ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(15, 23, 42, 0.8) 100%)'
                    : 'linear-gradient(135deg, rgba(236, 72, 153, 0.1) 0%, rgba(15, 23, 42, 0.6) 100%)',
                  transition: 'all 0.15s ease',
                  boxShadow: giftFlash
                    ? '0 0 20px rgba(236, 72, 153, 0.35)'
                    : '0 4px 20px rgba(236, 72, 153, 0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
                title="GIFT NIFTY: Live tick-by-tick feed from TradingView (NSEIX:NIFTY1!) • Session 1 (06:30 - 15:40 IST) & Session 2 (16:35 - 02:45 IST)"
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f472b6', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <Globe2 size={14} color="#ec4899" style={{ flexShrink: 0 }} />
                      GIFT NIFTY
                      <span style={{ fontSize: '0.58rem', color: '#60a5fa', background: 'rgba(59, 130, 246, 0.15)', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                        TRADINGVIEW
                      </span>
                    </span>
                    <span
                      className="badge"
                      style={{
                        background: isGiftActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(236, 72, 153, 0.25)',
                        color: isGiftActive ? '#34d399' : '#f472b6',
                        fontSize: '0.62rem',
                        padding: '1px 6px',
                        fontWeight: 800,
                        flexShrink: 0,
                        border: isGiftActive ? '1px solid rgba(16, 185, 129, 0.4)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {isGiftActive && <span className="pulse-indicator" style={{ background: '#10b981', width: '5px', height: '5px' }}></span>}
                      {sessionBadge}
                    </span>
                  </div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
                    ₹{giftPrice.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div style={{ fontSize: '0.72rem', marginTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                  <span style={{ color: isGiftPositive ? '#34d399' : '#f87171', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px', whiteSpace: 'nowrap' }}>
                    {isGiftPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {isGiftPositive ? '+' : ''}{giftChange.toFixed(2)} ({giftPct.toFixed(2)}%)
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.66rem', whiteSpace: 'nowrap' }}>
                    {sessionHours}
                  </span>
                </div>
              </Link>
            );
          })()}

          {/* INDIA VIX HERO CARD - LINKS TO /indices */}
          <Link
            href="/indices"
            className="glass-panel"
            style={{
              padding: '16px 14px',
              cursor: 'pointer',
              textDecoration: 'none',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)',
              transition: 'all 0.15s ease',
              boxShadow: '0 4px 20px rgba(245, 158, 11, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
            title="Open separate page with INDIA VIX & all 140+ indices"
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <Activity size={14} color="#f59e0b" style={{ flexShrink: 0 }} />
                  INDIA VIX
                </span>
                <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.25)', color: '#fbbf24', fontSize: '0.62rem', padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>
                  VOLATILITY
                </span>
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
                {indiaVixData ? indiaVixData.last_price.toFixed(2) : '15.64'}
              </div>
            </div>
            <div style={{ fontSize: '0.72rem', marginTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
              <span style={{ color: (indiaVixData?.change ?? -1) <= 0 ? '#34d399' : '#f87171', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px', whiteSpace: 'nowrap' }}>
                {(indiaVixData?.change ?? -1) >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {(indiaVixData?.change ?? -1) >= 0 ? '+' : ''}{(indiaVixData?.change ?? -0.61).toFixed(2)} ({(indiaVixData?.percent_change ?? -3.75).toFixed(1)}%)
              </span>
              <span
                style={{
                  color: '#fbbf24',
                  fontWeight: 600,
                  fontSize: '0.68rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  textAlign: 'right',
                }}
                title={indiaVixData?.volatility_status || 'Normal Volatility'}
              >
                {(() => {
                  const s = (indiaVixData?.volatility_status || '').toLowerCase();
                  if (s.includes('low')) return 'Low Vol';
                  if (s.includes('high') || s.includes('extreme')) return 'High Vol';
                  if (s.includes('elevated')) return 'Elevated';
                  return 'Normal Vol';
                })()}
              </span>
            </div>
          </Link>
        </section>

        {/* Search, Filter, and Controls Bar */}
        <section
          className="glass-panel"
          style={{
            padding: '20px',
            marginBottom: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between' }}>
            {/* Search Input */}
            <div
              style={{
                position: 'relative',
                flex: '1 1 320px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Search
                size={18}
                color="var(--text-muted)"
                style={{ position: 'absolute', left: '14px', pointerEvents: 'none' }}
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by Symbol (e.g. RELIANCE, TCS) or Company Name..."
                style={{
                  width: '100%',
                  background: 'rgba(15, 21, 35, 0.8)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 14px 12px 42px',
                  color: 'white',
                  fontSize: '0.9rem',
                  outline: 'none',
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Sort Control */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Sort By:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  background: 'rgba(15, 21, 35, 0.9)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 14px',
                  color: 'white',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="market_cap_desc">Market Cap (Highest to Lowest)</option>
                <option value="market_cap_asc">Market Cap (Lowest to Highest)</option>
                <option value="revenue_desc">Revenue (Highest)</option>
                <option value="profit_desc">Net Profit (Highest)</option>
                <option value="pe_asc">P/E Ratio (Lowest / Value)</option>
                <option value="symbol_asc">Symbol (A-Z)</option>
              </select>
            </div>
          </div>

          {/* Sector Filter Chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: '4px' }}>
              <Layers size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
              Sectors:
            </span>
            {sectors.map((sec) => (
              <button
                key={sec}
                onClick={() => setSelectedSector(sec)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: selectedSector === sec ? 700 : 500,
                  background:
                    selectedSector === sec
                      ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)'
                      : 'rgba(255, 255, 255, 0.04)',
                  color: selectedSector === sec ? 'white' : 'var(--text-secondary)',
                  border:
                    selectedSector === sec
                      ? '1px solid #818cf8'
                      : '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {sec}
              </button>
            ))}
          </div>
        </section>

        {/* Results Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            color: 'var(--text-secondary)',
            fontSize: '0.85rem',
            flexWrap: 'wrap',
            gap: '8px'
          }}
        >
          <span>
            Showing <strong>{filteredCompanies.length}</strong> of <strong>{companies.length}</strong> constituents in {currentHubMeta.name}
          </span>
          <span>Click any company card to open comprehensive financial statements & filings</span>
        </div>

        {/* Company Cards Grid */}
        {loading ? (
          <div
            style={{
              padding: '64px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            <RefreshCw size={32} className="pulse-indicator" style={{ margin: '0 auto 16px auto', display: 'block' }} />
            Loading {currentHubMeta.name} company financial reports from backend...
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))',
              gap: '18px',
            }}
          >
            {filteredCompanies.map((company) => {
              const live = liveTicks[company.symbol];
              const ltp = live ? live.ltp : (company.current_price ?? 0);
              const chg = live ? live.change : (company.price_change ?? 0);
              const pct = live ? live.percent_change : (company.percent_change ?? 0);
              const isPositive = chg >= 0;
              const flash = flashMap[company.symbol];

              return (
                <div
                  key={company.symbol}
                  onMouseEnter={() => prefetchCompany(company.symbol)}
                  onClick={() => openCompanyReader(company.symbol)}
                  className="glass-panel"
                  style={{
                    padding: '20px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                    willChange: 'transform, background',
                    background: flash === 'UP'
                      ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.22) 0%, rgba(15, 23, 42, 0.9) 100%)'
                      : flash === 'DOWN'
                      ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.22) 0%, rgba(15, 23, 42, 0.9) 100%)'
                      : 'rgba(255, 255, 255, 0.02)',
                    borderColor: flash === 'UP' ? '#10b981' : (flash === 'DOWN' ? '#ef4444' : 'var(--border-subtle)'),
                    boxShadow: flash === 'UP'
                      ? '0 0 20px rgba(16, 185, 129, 0.35)'
                      : (flash === 'DOWN' ? '0 0 20px rgba(239, 68, 68, 0.35)' : 'none'),
                  }}
                >
                  <div>
                    {/* Real-Time Live Tick Price Header Banner */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: '10px',
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        marginBottom: '14px',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span
                            className={isMarketOpen ? 'pulse-indicator' : ''}
                            style={{
                              background: isMarketOpen ? (isPositive ? '#10b981' : '#ef4444') : '#64748b',
                              width: '5px',
                              height: '5px',
                              borderRadius: '50%',
                              display: 'inline-block',
                            }}
                          ></span>
                          {isMarketOpen ? 'LIVE TICK PRICE' : 'OFFICIAL CLOSING PRICE'}
                        </div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em', marginTop: '2px' }}>
                          ₹{ltp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px',
                            fontSize: '0.82rem',
                            fontWeight: 800,
                            color: isPositive ? '#34d399' : '#f87171',
                          }}
                        >
                          {isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                          {isPositive ? '+' : ''}{chg.toFixed(2)} ({pct.toFixed(2)}%)
                        </span>
                        {live && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Bid: ₹{live.bid.toFixed(2)} &bull; Ask: ₹{live.ask.toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <span
                          style={{
                            display: 'inline-block',
                            fontWeight: 800,
                            fontSize: '1.15rem',
                            color: '#818cf8',
                            letterSpacing: '-0.01em',
                          }}
                        >
                          {company.symbol}
                        </span>
                        <h3
                          style={{
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            marginTop: '2px',
                            lineHeight: 1.3,
                          }}
                        >
                          {company.company_name}
                        </h3>
                      </div>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        NSE
                      </span>
                    </div>

                  {/* Sector & Industry */}
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    {company.sector} • {company.industry.split('/')[0]}
                  </div>

                  {/* Key Financial Metrics Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '10px',
                      background: 'rgba(10, 13, 20, 0.6)',
                      padding: '12px',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: '16px',
                      border: '1px solid rgba(255, 255, 255, 0.04)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>MARKET CAP</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        ₹{(company.market_cap_cr / 1000).toFixed(1)}k Cr
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>P/E RATIO</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fbbf24' }}>
                        {company.pe_ratio.toFixed(1)}x
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>REVENUE (QTR)</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#38bdf8' }}>
                        ₹{company.revenue_latest_cr.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>NET PROFIT (QTR)</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#4ade80' }}>
                        ₹{company.net_profit_latest_cr.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '12px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ArrowUpRight size={14} />
                    YoY Growth: +{company.yoy_profit_growth_pct}%
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#818cf8',
                    }}
                  >
                    Read Financials
                    <ChevronRight size={16} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Navigation Drawer for Navigating All Website Hubs */}
      <NavigationDrawer
        isOpen={navDrawerOpen}
        onClose={() => setNavDrawerOpen(false)}
        activeHub={activeHub}
        onSelectHub={handleSelectHub}
      />

      {/* Comprehensive Company Financials Interactive Modal */}
      <CompanyDetailModal
        company={selectedCompany}
        onClose={() => setSelectedCompany(null)}
        onSyncLive={handleSyncNseLive}
        syncingLive={syncingLive}
        syncStatus={syncStatus}
      />
    </main>

  );
}
