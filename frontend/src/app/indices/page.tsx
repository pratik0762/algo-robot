'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  TrendingUp,
  TrendingDown,
  Activity,
  Globe2,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  RefreshCw,
  Scale,
  ShieldCheck,
  Clock,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import IndicesBarometer from '@/components/IndicesBarometer';
import { getApiBase } from '@/config/api';

export interface IndexData {
  index: string;
  index_symbol: string;
  category: string;
  category_group?: string;
  last_price: number;
  variation: number;
  percent_change: number;
  open: number;
  high: number;
  low: number;
  previous_close: number;
  year_high: number;
  year_low: number;
  pe: string;
  pb: string;
  dy: string;
  advances: string;
  declines: string;
  unchanged: string;
  per_change_30d: number;
  per_change_365d: number;
  chart_today?: string;
}

export interface GiftNiftyData {
  name: string;
  symbol: string;
  exchange: string;
  contract: string;
  last_price: number;
  change: number;
  percent_change: number;
  open: number;
  high: number;
  low: number;
  previous_close: number;
  underlying_spot: number;
  basis_premium: number;
  volume_contracts: number;
  open_interest: number;
  trading_hours: string;
  currency: string;
  status: string;
}

export interface IndiaVixData {
  name: string;
  symbol: string;
  exchange: string;
  last_price: number;
  change: number;
  percent_change: number;
  open: number;
  high: number;
  low: number;
  previous_close: number;
  year_high: number;
  year_low: number;
  volatility_status: string;
  per_change_30d: number;
  per_change_365d: number;
  chart_today?: string;
  interpretation: string;
}

export default function AllIndicesPage() {
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [giftNifty, setGiftNifty] = useState<GiftNiftyData | null>(null);
  const [indiaVix, setIndiaVix] = useState<IndiaVixData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortBy, setSortBy] = useState<string>('change_desc');
  const [marketBreadth, setMarketBreadth] = useState<{ advances: number; declines: number; unchanged: number; ratio: number } | null>(null);
  const [timestamp, setTimestamp] = useState<string>('');
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Ensure body scroll is never blocked on this separate page
  useEffect(() => {
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
  }, []);

  const fetchIndicesData = async (force: boolean = false, retries = 2) => {
    if (force) setRefreshing(true);
    else setLoading(true);

    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/indices?force_refresh=${force}`);
      if (res.ok) {
        const data = await res.json();
        setIndices(data.indices || []);
        setGiftNifty(data.gift_nifty || null);
        setIndiaVix(data.india_vix || null);
        setMarketBreadth(data.market_breadth || null);
        setTimestamp(data.timestamp || '');
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => fetchIndicesData(force, retries - 1), 600);
      } else {
        console.error('Failed to load indices data:', err);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchIndicesData();
    const interval = setInterval(() => fetchIndicesData(false), 15000);
    return () => clearInterval(interval);
  }, []);

  const categories = useMemo(() => {
    return [
      'All',
      'Derivatives (F&O)',
      'Broad Market',
      'Sectoral',
      'Thematic',
      'Strategy',
      'Fixed Income',
    ];
  }, []);

  const filteredIndices = useMemo(() => {
    const s = search.toLowerCase().trim();
    return indices
      .filter((item) => {
        const matchesCategory =
          selectedCategory === 'All' ||
          item.category_group?.toLowerCase() === selectedCategory.toLowerCase() ||
          item.category.toLowerCase().includes(selectedCategory.toLowerCase());

        const matchesSearch =
          !s ||
          item.index.toLowerCase().includes(s) ||
          item.index_symbol.toLowerCase().includes(s) ||
          item.category.toLowerCase().includes(s);

        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        if (sortBy === 'change_desc') return b.percent_change - a.percent_change;
        if (sortBy === 'change_asc') return a.percent_change - b.percent_change;
        if (sortBy === 'price_desc') return b.last_price - a.last_price;
        if (sortBy === 'name_asc') return a.index.localeCompare(b.index);
        return 0;
      });
  }, [indices, search, selectedCategory, sortBy]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0d14' }}>
      {/* Top Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(11, 15, 25, 0.95)',
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
            <Link
              href="/"
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontWeight: 700,
                color: '#a5b4fc',
              }}
            >
              <ArrowLeft size={16} />
              <span>Back to Financial Hub</span>
            </Link>

            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 20px rgba(99, 102, 241, 0.4)',
              }}
            >
              <Layers size={22} color="white" />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
                  ALL INDIAN INDICES DIRECTORY & LIVE BAROMETER
                </h1>
                <span className="badge badge-primary">{indices.length} INDICES</span>
                <span className="badge badge-success">NSE & BSE OFFICIAL</span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Dedicated Full-Page Market Intelligence &bull; Live GIFT NIFTY, INDIA VIX & 140 Benchmark Indices
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {marketBreadth && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  padding: '6px 14px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  fontSize: '0.78rem',
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>Market Breadth:</span>
                <span style={{ color: '#34d399', fontWeight: 700 }}>▲ {marketBreadth.advances} Adv</span>
                <span style={{ color: '#f87171', fontWeight: 700 }}>▼ {marketBreadth.declines} Dec</span>
                <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>({marketBreadth.ratio}:1 A/D)</span>
              </div>
            )}

            <button
              onClick={() => fetchIndicesData(true)}
              disabled={refreshing}
              className="btn btn-secondary"
              style={{ padding: '8px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Refresh live indices from NSE"
            >
              <RefreshCw size={14} className={refreshing ? 'pulse-indicator' : ''} />
              <span>{refreshing ? 'Syncing...' : 'Sync Live'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Top Barometer Strip */}
      <IndicesBarometer onOpenAllIndices={() => {}} />

      {/* Main Page Scrollable Body */}
      <main style={{ flex: 1, maxWidth: '1440px', width: '100%', margin: '0 auto', padding: '24px 24px 80px 24px' }}>
        
        {/* Spotlight Hero Grid: GIFT NIFTY and INDIA VIX */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '20px', marginBottom: '28px' }}>
          
          {/* 1. GIFT NIFTY HERO CARD */}
          {giftNifty && (
            <div
              className="glass-panel"
              style={{
                background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)',
                border: '1px solid rgba(236, 72, 153, 0.35)',
                borderRadius: '16px',
                padding: '24px',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 8px 30px -4px rgba(236, 72, 153, 0.15)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #db2777 0%, #ec4899 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 0 16px rgba(236, 72, 153, 0.4)',
                    }}
                  >
                    <Globe2 size={24} color="white" />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f472b6', letterSpacing: '-0.01em' }}>
                        GIFT NIFTY
                      </h2>
                      <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.25)', color: '#f472b6', border: '1px solid rgba(236, 72, 153, 0.4)', fontSize: '0.68rem', fontWeight: 700 }}>
                        NSE IX GIFT CITY
                      </span>
                      <span className="badge badge-success" style={{ fontSize: '0.68rem' }}>
                        LIVE TRADING
                      </span>
                      <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.4)', fontSize: '0.68rem', fontWeight: 700 }}>
                        TRADINGVIEW LIVE
                      </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      International Benchmark Futures &bull; {giftNifty.contract}
                    </p>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#ffffff' }}>
                    ₹{giftNifty.last_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      color: giftNifty.change >= 0 ? '#34d399' : '#f87171',
                      marginTop: '2px',
                    }}
                  >
                    {giftNifty.change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {giftNifty.change >= 0 ? '+' : ''}{giftNifty.change.toFixed(2)} ({giftNifty.percent_change.toFixed(2)}%)
                  </div>
                </div>
              </div>

              {/* Metadata Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '12px',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  fontSize: '0.8rem',
                }}
              >
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>UNDERLYING SPOT</div>
                  <div style={{ fontWeight: 700, color: '#38bdf8', marginTop: '2px' }}>
                    ₹{giftNifty.underlying_spot.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>BASIS / PREMIUM</div>
                  <div style={{ fontWeight: 700, color: giftNifty.basis_premium >= 0 ? '#34d399' : '#f87171', marginTop: '2px' }}>
                    {giftNifty.basis_premium >= 0 ? '+' : ''}{giftNifty.basis_premium.toFixed(2)} pts
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>DAY RANGE (H / L)</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {giftNifty.high.toLocaleString('en-IN')} / {giftNifty.low.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>VOLUME (CONTRACTS)</div>
                  <div style={{ fontWeight: 700, color: '#fbbf24', marginTop: '2px' }}>
                    {giftNifty.volume_contracts.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={13} color="#ec4899" />
                  {giftNifty.trading_hours}
                </span>
                <span>Currency: <strong>{giftNifty.currency}</strong></span>
              </div>
            </div>
          )}

          {/* 2. INDIA VIX HERO CARD */}
          {indiaVix && (
            <div
              className="glass-panel"
              style={{
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(239, 68, 68, 0.08) 100%)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: '16px',
                padding: '24px',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 8px 30px -4px rgba(245, 158, 11, 0.15)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 0 16px rgba(245, 158, 11, 0.4)',
                    }}
                  >
                    <Activity size={24} color="white" />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fbbf24', letterSpacing: '-0.01em' }}>
                        INDIA VIX
                      </h2>
                      <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.25)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.4)', fontSize: '0.68rem', fontWeight: 700 }}>
                        VOLATILITY GAUGE
                      </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      NSE 30-Day Implied Volatility &bull; Market Risk Barometer
                    </p>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#ffffff' }}>
                    {indiaVix.last_price.toFixed(2)}
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      color: indiaVix.change <= 0 ? '#34d399' : '#f87171',
                      marginTop: '2px',
                    }}
                  >
                    {indiaVix.change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {indiaVix.change >= 0 ? '+' : ''}{indiaVix.change.toFixed(2)} ({indiaVix.percent_change.toFixed(2)}%)
                  </div>
                </div>
              </div>

              {/* VIX Volatility Gauge Bar */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>
                  <span>Sentiment Status: <strong style={{ color: '#fbbf24' }}>{indiaVix.volatility_status}</strong></span>
                  <span>Range: 8.0 &mdash; 30.0+</span>
                </div>
                <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: '25%', background: '#10b981' }} title="Low Volatility (<13)" />
                  <div style={{ width: '25%', background: '#f59e0b' }} title="Normal Volatility (13-17.5)" />
                  <div style={{ width: '25%', background: '#f97316' }} title="Elevated Volatility (17.5-22)" />
                  <div style={{ width: '25%', background: '#ef4444' }} title="High Volatility (>22)" />
                </div>
              </div>

              {/* Metadata Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '12px',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  fontSize: '0.8rem',
                }}
              >
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>52W HIGH / LOW</div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {indiaVix.year_high.toFixed(2)} / {indiaVix.year_low.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>DAY RANGE</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {indiaVix.high.toFixed(2)} / {indiaVix.low.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>30D CHANGE</div>
                  <div style={{ fontWeight: 700, color: indiaVix.per_change_30d >= 0 ? '#f87171' : '#34d399', marginTop: '2px' }}>
                    {indiaVix.per_change_30d >= 0 ? '+' : ''}{indiaVix.per_change_30d.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>365D CHANGE</div>
                  <div style={{ fontWeight: 700, color: indiaVix.per_change_365d >= 0 ? '#f87171' : '#34d399', marginTop: '2px' }}>
                    {indiaVix.per_change_365d >= 0 ? '+' : ''}{indiaVix.per_change_365d.toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Filter & Search Bar */}
        <section
          className="glass-panel"
          style={{
            padding: '20px 24px',
            marginBottom: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Category Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginRight: '6px' }}>
              INDEX CATEGORY:
            </span>
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '10px',
                    fontSize: '0.8rem',
                    fontWeight: isSelected ? 700 : 500,
                    background: isSelected ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'rgba(255, 255, 255, 0.04)',
                    border: isSelected ? '1px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.08)',
                    color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 0 16px rgba(99, 102, 241, 0.4)' : 'none',
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Search Input & Sorters */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 340px' }}>
              <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search across all 140+ indices (e.g. NIFTY BANK, IT, FMCG, AUTO, SENSEX, SMALLCAP)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 42px',
                  borderRadius: '10px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid var(--border-subtle)',
                  color: 'white',
                  fontSize: '0.88rem',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Sort By:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="change_desc" style={{ background: '#111827' }}>Top Gainers (% High to Low)</option>
                <option value="change_asc" style={{ background: '#111827' }}>Top Losers (% Low to High)</option>
                <option value="price_desc" style={{ background: '#111827' }}>Index Value (Highest First)</option>
                <option value="name_asc" style={{ background: '#111827' }}>Index Name (A to Z)</option>
              </select>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Showing <strong>{filteredIndices.length}</strong> of {indices.length}
              </span>
            </div>
          </div>
        </section>

        {/* FULL 140 INDICES DATA TABLE - COMPLETELY SCROLLABLE */}
        <section
          className="glass-panel"
          style={{
            border: '1px solid var(--border-subtle)',
            borderRadius: '16px',
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ textAlign: 'left', padding: '16px 20px', fontWeight: 700 }}>INDEX NAME</th>
                  <th style={{ textAlign: 'left', padding: '16px 16px', fontWeight: 700 }}>CATEGORY</th>
                  <th style={{ padding: '16px 18px', fontWeight: 700 }}>LAST PRICE</th>
                  <th style={{ padding: '16px 18px', fontWeight: 700 }}>CHANGE (PTS)</th>
                  <th style={{ padding: '16px 18px', fontWeight: 700 }}>% CHANGE</th>
                  <th style={{ padding: '16px 18px', fontWeight: 700 }}>DAY RANGE (H / L)</th>
                  <th style={{ padding: '16px 18px', fontWeight: 700 }}>52W HIGH / LOW</th>
                  <th style={{ padding: '16px 18px', fontWeight: 700 }}>P/E</th>
                  <th style={{ padding: '16px 18px', fontWeight: 700 }}>P/B</th>
                  <th style={{ padding: '16px 18px', fontWeight: 700 }}>DIV YIELD</th>
                  <th style={{ padding: '16px 18px', fontWeight: 700 }}>A / D</th>
                  <th style={{ padding: '16px 18px', fontWeight: 700 }}>30D %</th>
                  <th style={{ padding: '16px 18px', fontWeight: 700 }}>365D %</th>
                </tr>
              </thead>
              <tbody>
                {filteredIndices.map((idx, index) => {
                  const isPositive = idx.variation >= 0;
                  return (
                    <tr
                      key={idx.index}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        background: index % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <td style={{ textAlign: 'left', padding: '14px 20px' }}>
                        <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '0.88rem' }}>
                          {idx.index}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {idx.index_symbol}
                        </div>
                      </td>

                      <td style={{ textAlign: 'left', padding: '14px 16px' }}>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'rgba(99, 102, 241, 0.12)',
                            color: '#a5b4fc',
                            border: '1px solid rgba(99, 102, 241, 0.25)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {idx.category_group || idx.category}
                        </span>
                      </td>

                      <td style={{ padding: '14px 18px', fontWeight: 800, color: '#ffffff', fontSize: '0.92rem' }}>
                        ₹{idx.last_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td style={{ padding: '14px 18px', fontWeight: 700, color: isPositive ? '#34d399' : '#f87171' }}>
                        {isPositive ? '+' : ''}{idx.variation.toFixed(2)}
                      </td>

                      <td style={{ padding: '14px 18px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontWeight: 800,
                            padding: '4px 10px',
                            borderRadius: '6px',
                            background: isPositive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            color: isPositive ? '#34d399' : '#f87171',
                          }}
                        >
                          {isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                          {isPositive ? '+' : ''}{idx.percent_change.toFixed(2)}%
                        </span>
                      </td>

                      <td style={{ padding: '14px 18px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {idx.high.toLocaleString('en-IN', { maximumFractionDigits: 1 })} / {idx.low.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                      </td>

                      <td style={{ padding: '14px 18px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {idx.year_high.toLocaleString('en-IN', { maximumFractionDigits: 1 })} / {idx.year_low.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                      </td>

                      <td style={{ padding: '14px 18px', fontWeight: 600, color: '#93c5fd' }}>
                        {idx.pe}
                      </td>

                      <td style={{ padding: '14px 18px', color: 'var(--text-secondary)' }}>
                        {idx.pb}
                      </td>

                      <td style={{ padding: '14px 18px', color: 'var(--text-secondary)' }}>
                        {idx.dy !== '-' ? `${idx.dy}%` : '-'}
                      </td>

                      <td style={{ padding: '14px 18px', fontSize: '0.78rem' }}>
                        {idx.advances !== '0' || idx.declines !== '0' ? (
                          <span>
                            <span style={{ color: '#34d399', fontWeight: 700 }}>{idx.advances}</span>
                            <span style={{ color: 'var(--text-muted)' }}>/</span>
                            <span style={{ color: '#f87171', fontWeight: 700 }}>{idx.declines}</span>
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>

                      <td style={{ padding: '14px 18px', fontWeight: 600, color: idx.per_change_30d >= 0 ? '#34d399' : '#f87171' }}>
                        {idx.per_change_30d !== 0 ? `${idx.per_change_30d >= 0 ? '+' : ''}${idx.per_change_30d.toFixed(1)}%` : '-'}
                      </td>

                      <td style={{ padding: '14px 18px', fontWeight: 600, color: idx.per_change_365d >= 0 ? '#34d399' : '#f87171' }}>
                        {idx.per_change_365d !== 0 ? `${idx.per_change_365d >= 0 ? '+' : ''}${idx.per_change_365d.toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Page Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          background: 'rgba(10, 14, 24, 0.95)',
          padding: '20px 24px',
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={16} color="#10b981" />
          <span>Official Real-Time Market Feed sourced directly from NSE India & NSE IX GIFT City</span>
        </div>
        <div>
          Last Updated: <strong style={{ color: '#ffffff' }}>{timestamp || 'Live'}</strong>
        </div>
      </footer>
    </div>
  );
}
