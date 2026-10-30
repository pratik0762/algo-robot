'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  X,
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
  ChevronDown,
  SlidersHorizontal,
  Download,
  Calendar,
  Clock,
  ExternalLink
} from 'lucide-react';
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

interface AllIndicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectIndexForCompanies?: (indexName: string) => void;
}

export default function AllIndicesModal({ isOpen, onClose, onSelectIndexForCompanies }: AllIndicesModalProps) {
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

  const fetchIndicesData = async (force: boolean = false) => {
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
      }
    } catch (err) {
      console.error('Failed to load indices data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchIndicesData();
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

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

  if (!isOpen) return null;

  return (
    <div
      className="drawer-backdrop"
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        padding: '20px',
        zIndex: 60,
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '1380px',
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(10, 14, 26, 0.96)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '20px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 40px rgba(99, 102, 241, 0.15)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'rgba(15, 21, 35, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
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
                <h1 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
                  ALL INDIAN INDICES DIRECTORY & LIVE BAROMETER
                </h1>
                <span className="badge badge-primary" style={{ padding: '3px 8px', fontSize: '0.7rem' }}>
                  {indices.length} INDICES TRACKED
                </span>
                <span className="badge badge-success" style={{ padding: '3px 8px', fontSize: '0.7rem' }}>
                  NSE & BSE OFFICIAL
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Comprehensive coverage of all Broad Market, Sectoral, Thematic, Strategy, and International Benchmark Indices
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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

            <button
              onClick={onClose}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Modal Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Spotlight Hero Grid: GIFT NIFTY and INDIA VIX */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '20px' }}>
            
            {/* 1. GIFT NIFTY HERO CARD */}
            {giftNifty && (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)',
                  border: '1px solid rgba(236, 72, 153, 0.35)',
                  borderRadius: '16px',
                  padding: '22px',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: '0 8px 30px -4px rgba(236, 72, 153, 0.15)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #db2777 0%, #ec4899 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 15px rgba(236, 72, 153, 0.4)',
                      }}
                    >
                      <Globe2 size={22} color="white" />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f472b6', letterSpacing: '-0.01em' }}>
                          GIFT NIFTY
                        </h2>
                        <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.25)', color: '#f472b6', border: '1px solid rgba(236, 72, 153, 0.4)', fontSize: '0.65rem', fontWeight: 700 }}>
                          NSE IX GIFT CITY
                        </span>
                        <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
                          LIVE TRADING
                        </span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        International Benchmark Futures &bull; {giftNifty.contract}
                      </p>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#ffffff' }}>
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

                {/* GIFT NIFTY Metadata Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    fontSize: '0.78rem',
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

                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} color="#ec4899" />
                    {giftNifty.trading_hours}
                  </span>
                  <span>Currency: {giftNifty.currency}</span>
                </div>
              </div>
            )}

            {/* 2. INDIA VIX HERO CARD */}
            {indiaVix && (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(239, 68, 68, 0.08) 100%)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: '16px',
                  padding: '22px',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: '0 8px 30px -4px rgba(245, 158, 11, 0.15)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 15px rgba(245, 158, 11, 0.4)',
                      }}
                    >
                      <Activity size={22} color="white" />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24', letterSpacing: '-0.01em' }}>
                          INDIA VIX
                        </h2>
                        <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.25)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.4)', fontSize: '0.65rem', fontWeight: 700 }}>
                          VOLATILITY GAUGE
                        </span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        NSE 30-Day Implied Volatility &bull; Market Risk Barometer
                      </p>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#ffffff' }}>
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
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
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

                {/* VIX Metadata Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    fontSize: '0.78rem',
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
          </div>

          {/* Search, Category Filter Tabs & Sorting Toolbar */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-subtle)',
              padding: '16px 20px',
              borderRadius: '16px',
            }}
          >
            {/* Category Filter Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginRight: '4px' }}>
                CATEGORY:
              </span>
              {categories.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '10px',
                      fontSize: '0.78rem',
                      fontWeight: isSelected ? 700 : 500,
                      background: isSelected ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'rgba(255, 255, 255, 0.04)',
                      border: isSelected ? '1px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.06)',
                      color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 0 14px rgba(99, 102, 241, 0.4)' : 'none',
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* Search Input & Sorters */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
                <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search among all 140+ indices (e.g. NIFTY BANK, IT, FMCG, AUTO, SENSEX, SMALLCAP)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 40px',
                    borderRadius: '10px',
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid var(--border-subtle)',
                    color: 'white',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Sort By:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="change_desc" style={{ background: '#111827' }}>Top Gainers (% High to Low)</option>
                  <option value="change_asc" style={{ background: '#111827' }}>Top Losers (% Low to High)</option>
                  <option value="price_desc" style={{ background: '#111827' }}>Index Value (Highest First)</option>
                  <option value="name_asc" style={{ background: '#111827' }}>Index Name (A to Z)</option>
                </select>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Showing <strong>{filteredIndices.length}</strong> of {indices.length}
                </span>
              </div>
            </div>
          </div>

          {/* ALL INDICES COMPREHENSIVE DATA TABLE */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.015)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '16px',
              overflow: 'hidden',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'right' }}>
                <thead>
                  <tr style={{ background: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ textAlign: 'left', padding: '14px 18px', fontWeight: 700 }}>INDEX NAME</th>
                    <th style={{ textAlign: 'left', padding: '14px 14px', fontWeight: 700 }}>CATEGORY</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700 }}>LAST PRICE</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700 }}>CHANGE (PTS)</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700 }}>% CHANGE</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700 }}>DAY RANGE</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700 }}>52W HIGH / LOW</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700 }}>P/E</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700 }}>P/B</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700 }}>DIV YIELD</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700 }}>A / D</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700 }}>30D %</th>
                    <th style={{ padding: '14px 16px', fontWeight: 700 }}>365D %</th>
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
                          background: index % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        <td style={{ textAlign: 'left', padding: '14px 18px' }}>
                          <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '0.85rem' }}>
                            {idx.index}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                            {idx.index_symbol}
                          </div>
                        </td>

                        <td style={{ textAlign: 'left', padding: '14px 14px' }}>
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              padding: '2px 8px',
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

                        <td style={{ padding: '14px 16px', fontWeight: 800, color: '#ffffff', fontSize: '0.9rem' }}>
                          ₹{idx.last_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>

                        <td style={{ padding: '14px 16px', fontWeight: 700, color: isPositive ? '#34d399' : '#f87171' }}>
                          {isPositive ? '+' : ''}{idx.variation.toFixed(2)}
                        </td>

                        <td style={{ padding: '14px 16px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                              fontWeight: 800,
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: isPositive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                              color: isPositive ? '#34d399' : '#f87171',
                            }}
                          >
                            {isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                            {isPositive ? '+' : ''}{idx.percent_change.toFixed(2)}%
                          </span>
                        </td>

                        <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                          {idx.high.toLocaleString('en-IN', { maximumFractionDigits: 1 })} / {idx.low.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                        </td>

                        <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                          {idx.year_high.toLocaleString('en-IN', { maximumFractionDigits: 1 })} / {idx.year_low.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                        </td>

                        <td style={{ padding: '14px 16px', fontWeight: 600, color: '#93c5fd' }}>
                          {idx.pe}
                        </td>

                        <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                          {idx.pb}
                        </td>

                        <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                          {idx.dy !== '-' ? `${idx.dy}%` : '-'}
                        </td>

                        <td style={{ padding: '14px 16px', fontSize: '0.75rem' }}>
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

                        <td style={{ padding: '14px 16px', fontWeight: 600, color: idx.per_change_30d >= 0 ? '#34d399' : '#f87171' }}>
                          {idx.per_change_30d !== 0 ? `${idx.per_change_30d >= 0 ? '+' : ''}${idx.per_change_30d.toFixed(1)}%` : '-'}
                        </td>

                        <td style={{ padding: '14px 16px', fontWeight: 600, color: idx.per_change_365d >= 0 ? '#34d399' : '#f87171' }}>
                          {idx.per_change_365d !== 0 ? `${idx.per_change_365d >= 0 ? '+' : ''}${idx.per_change_365d.toFixed(1)}%` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 28px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'rgba(10, 14, 24, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={14} color="#10b981" />
            <span>Official Real-Time Market Feed sourced directly from NSE India & NSE IX</span>
          </div>

          <div>
            Last Updated: <strong style={{ color: '#ffffff' }}>{timestamp || 'Live'}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
