'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  RefreshCw,
  Search,
  Filter,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Layers,
  Boxes,
  HelpCircle,
  Clock,
  Building2,
  ChevronRight,
  Flame,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Crosshair,
  BarChart3,
  BookOpen
} from 'lucide-react';
import IndicesBarometer from '@/components/IndicesBarometer';
import NavigationDrawer from '@/components/NavigationDrawer';
import { getApiBase } from '@/config/api';

export interface DealItem {
  id: string;
  deal_type: 'BULK' | 'BLOCK';
  symbol: string;
  company_name: string;
  sector: string;
  client_name: string;
  client_category: 'FII' | 'DII' | 'MUTUAL_FUND' | 'PROMOTER' | 'HNI' | 'PROP_DESK';
  action: 'BUY' | 'SELL';
  quantity: number;
  trade_price: number;
  deal_value_cr: number;
  equity_percentage: number;
  execution_window: string;
  trade_date: string;
  trade_time: string;
  actionable_signal: string;
  strategy_takeaway: string;
  nse_official_url: string;
  current_market_price?: number;
  price_difference_pct?: number;
  live_change?: number;
  live_percent_change?: number;
}

export interface TradingStrategyGuideItem {
  id: string;
  title: string;
  category: string;
  badge: string;
  color: string;
  summary: string;
  core_mechanic: string;
  rules: string[];
  entry_setup: string;
  stop_loss: string;
  target: string;
  caution: string;
}

export interface DealsResponse {
  status: string;
  official_source: string;
  regulatory_framework: string;
  summary: {
    total_bulk_deal_value_cr: number;
    total_block_deal_value_cr: number;
    total_buy_value_cr: number;
    total_sell_value_cr: number;
    net_institutional_bias: string;
    total_deals_count: number;
    bulk_deals_count: number;
    block_deals_count: number;
    most_active_stocks: Array<{
      symbol: string;
      name: string;
      total_value_cr: number;
      deals_count: number;
    }>;
  };
  strategies: TradingStrategyGuideItem[];
  items: DealItem[];
  count: number;
  timestamp: string;
}

// Module-level client cache for instant 0ms transitions
let globalDealsCache: DealsResponse | null = null;

function DealsPageContent() {
  const searchParams = useSearchParams();
  const initialTypeParam = searchParams.get('type');

  const [activeTab, setActiveTab] = useState<'all' | 'bulk' | 'block' | 'playbook'>(() => {
    if (initialTypeParam === 'bulk') return 'bulk';
    if (initialTypeParam === 'block') return 'block';
    if (initialTypeParam === 'playbook') return 'playbook';
    return 'all';
  });

  const [dealsData, setDealsData] = useState<DealsResponse | null>(() => globalDealsCache);
  const [loading, setLoading] = useState<boolean>(!globalDealsCache);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('value_desc');
  const [selectedStrategy, setSelectedStrategy] = useState<TradingStrategyGuideItem | null>(null);

  // Sync tab with URL search parameter if changed
  useEffect(() => {
    const typeParam = searchParams.get('type');
    if (typeParam === 'bulk') setActiveTab('bulk');
    else if (typeParam === 'block') setActiveTab('block');
    else if (typeParam === 'playbook') setActiveTab('playbook');
  }, [searchParams]);

  // Sanitizer guaranteeing valid official NSE URLs
  const getOfficialNseUrl = (symbol: string, rawUrl?: string) => {
    if (!rawUrl || rawUrl.includes('nsearchives') || rawUrl.includes('.xml') || rawUrl.includes('.pdf')) {
      return `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(symbol)}`;
    }
    return rawUrl;
  };

  const fetchDeals = async (isManual: boolean = false, retries = 2) => {
    if (isManual) setRefreshing(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/deals?limit=100`);
      if (res.ok) {
        const json: DealsResponse = await res.json();
        globalDealsCache = json;
        try {
          sessionStorage.setItem('deals_cache', JSON.stringify(json));
        } catch (_) {}
        setDealsData(json);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => fetchDeals(isManual, retries - 1), 600);
      } else {
        console.error('Failed to fetch bulk/block deals:', err);
      }
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!globalDealsCache) {
      try {
        const stored = sessionStorage.getItem('deals_cache');
        if (stored) {
          const parsed = JSON.parse(stored);
          globalDealsCache = parsed;
          setDealsData(parsed);
          setLoading(false);
        }
      } catch (_) {}
    }

    fetchDeals();
    const interval = setInterval(() => fetchDeals(), 45000); // 45s auto-refresh
    return () => clearInterval(interval);
  }, []);

  // Filtered Deals
  const filteredDeals = useMemo(() => {
    if (!dealsData?.items) return [];

    return dealsData.items.filter((item) => {
      // Tab filter
      if (activeTab === 'bulk' && item.deal_type !== 'BULK') return false;
      if (activeTab === 'block' && item.deal_type !== 'BLOCK') return false;

      // Action filter
      if (actionFilter !== 'ALL' && item.action !== actionFilter) return false;

      // Category filter
      if (categoryFilter !== 'ALL' && item.client_category !== categoryFilter) return false;

      // Search term
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase().trim();
        const inSym = item.symbol.toLowerCase().includes(s);
        const inComp = item.company_name.toLowerCase().includes(s);
        const inClient = item.client_name.toLowerCase().includes(s);
        const inSector = item.sector.toLowerCase().includes(s);
        if (!inSym && !inComp && !inClient && !inSector) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'value_desc') return b.deal_value_cr - a.deal_value_cr;
      if (sortBy === 'value_asc') return a.deal_value_cr - b.deal_value_cr;
      if (sortBy === 'qty_desc') return b.quantity - a.quantity;
      if (sortBy === 'equity_desc') return b.equity_percentage - a.equity_percentage;
      if (sortBy === 'diff_desc') return (b.price_difference_pct || 0) - (a.price_difference_pct || 0);
      return 0;
    });
  }, [dealsData, activeTab, actionFilter, categoryFilter, searchTerm, sortBy]);

  const summary = dealsData?.summary;
  const strategies = dealsData?.strategies || [];

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
              title="Return to Main Dashboard"
            >
              <ArrowLeft size={14} />
              Dashboard
            </Link>

            <button
              onClick={() => setDrawerOpen(true)}
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                padding: '8px 14px',
                background: 'rgba(6, 182, 212, 0.1)',
                border: '1px solid rgba(6, 182, 212, 0.35)',
                color: '#22d3ee',
                cursor: 'pointer',
              }}
              title="Open Navigation Hub Drawer"
            >
              <Layers size={14} />
              <span>Market Hubs</span>
            </button>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: '#ffffff' }}>
                  BULK & BLOCK DEALS
                </h1>
                <span
                  style={{
                    background: 'rgba(6, 182, 212, 0.15)',
                    color: '#22d3ee',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    letterSpacing: '0.05em',
                  }}
                >
                  SEBI DISCLOSURES & TRADING PLAYBOOK
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Track who is trading which companies, traded volume, execution price cushion & actionable trading strategies
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setActiveTab('playbook')}
              className="btn btn-secondary"
              style={{
                padding: '8px 14px',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: activeTab === 'playbook' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                color: activeTab === 'playbook' ? '#34d399' : '#ffffff',
                border: activeTab === 'playbook' ? '1px solid #10b981' : '1px solid var(--border-subtle)',
              }}
              title="View Institutional Trading Playbook"
            >
              <BookOpen size={14} />
              <span>How to Trade Deals</span>
            </button>

            <button
              onClick={() => fetchDeals(true)}
              disabled={refreshing}
              className="btn btn-secondary"
              style={{ padding: '8px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Refresh latest deals"
            >
              <RefreshCw size={14} className={refreshing ? 'pulse-indicator' : ''} />
              {refreshing ? 'Updating...' : 'Refresh Feed'}
            </button>
          </div>
        </div>
      </header>

      {/* Top Live Barometer (GIFT Nifty, VIX & Indices) */}
      <IndicesBarometer />

      {/* Main Content Container */}
      <main style={{ maxWidth: '1440px', margin: '0 auto', width: '100%', padding: '24px 24px 48px 24px', boxSizing: 'border-box' }}>
        
        {/* Playbook Highlight Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)',
            border: '1px solid rgba(6, 182, 212, 0.35)',
            borderRadius: '14px',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                boxShadow: '0 0 16px rgba(6, 182, 212, 0.4)',
                flexShrink: 0,
              }}
            >
              <Lightbulb size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#ffffff' }}>
                  Actionable Trader&apos;s Playbook: How to Trade Bulk &amp; Block Deals
                </span>
                <span className="badge badge-success" style={{ fontSize: '0.62rem' }}>
                  INSTITUTIONAL STRATEGY
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '3px 0 0 0', lineHeight: 1.4 }}>
                Learn how to exploit the <strong>Institutional Floor Price Setup</strong>, trade <strong>Whale Breakouts</strong>, and avoid high-frequency arbitrage traps.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('playbook')}
              className="btn btn-primary"
              style={{
                fontSize: '0.78rem',
                padding: '8px 16px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
                border: 'none',
              }}
            >
              <Crosshair size={14} />
              Read Trading Playbook
            </button>
            <a
              href="https://www.nseindia.com/report-detail/display-bulk-and-block-deals"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              title="Official NSE Bulk & Block Deals Report"
            >
              <ExternalLink size={14} />
              NSE Official Portal
            </a>
          </div>
        </div>

        {/* 4 Summary Metric Cards */}
        {summary && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            {/* Card 1: Bulk Deals Value */}
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                borderRadius: '14px',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#22d3ee' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  BULK DEALS (SEBI &ge;0.5%)
                </span>
                <Layers size={16} />
              </div>
              <div style={{ margin: '10px 0 4px 0' }}>
                <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#ffffff' }}>
                  ₹{summary.total_bulk_deal_value_cr.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  {summary.bulk_deals_count} High-Impact Open Market Deals
                </div>
              </div>
              <div style={{ fontSize: '0.70rem', color: '#22d3ee', fontWeight: 600 }}>
                Disclosed post-market / live exchange hours
              </div>
            </div>

            {/* Card 2: Block Deals Value */}
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: '14px',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#c084fc' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  BLOCK DEALS (&ge;₹10 CR)
                </span>
                <Boxes size={16} />
              </div>
              <div style={{ margin: '10px 0 4px 0' }}>
                <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#ffffff' }}>
                  ₹{summary.total_block_deal_value_cr.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  {summary.block_deals_count} Dedicated Window Executions
                </div>
              </div>
              <div style={{ fontSize: '0.70rem', color: '#c084fc', fontWeight: 600 }}>
                Concealed order book (Window 1 &amp; Window 2)
              </div>
            </div>

            {/* Card 3: Institutional Buy vs Sell Flow */}
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '14px',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#34d399' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  INSTITUTIONAL BIAS
                </span>
                <TrendingUp size={16} />
              </div>
              <div style={{ margin: '10px 0 4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.65rem', fontWeight: 900, color: summary.net_institutional_bias === 'BULLISH' ? '#34d399' : '#f87171' }}>
                    {summary.net_institutional_bias}
                  </span>
                  <span className={`badge ${summary.net_institutional_bias === 'BULLISH' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.62rem' }}>
                    NET ACCUMULATION
                  </span>
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Buys: <strong style={{ color: '#34d399' }}>₹{summary.total_buy_value_cr.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr</strong> &bull; Sells: <strong style={{ color: '#f87171' }}>₹{summary.total_sell_value_cr.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr</strong>
                </div>
              </div>
              <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>
                Absorption ratio: {(summary.total_buy_value_cr / Math.max(summary.total_sell_value_cr, 1)).toFixed(2)}x
              </div>
            </div>

            {/* Card 4: Most Active Marquee Stocks */}
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '14px',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fbbf24' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  MOST ACTIVE STOCKS
                </span>
                <Flame size={16} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '10px 0 4px 0' }}>
                {summary.most_active_stocks.map((stk) => (
                  <button
                    key={stk.symbol}
                    onClick={() => {
                      setSearchTerm(stk.symbol);
                      if (activeTab === 'playbook') setActiveTab('all');
                    }}
                    style={{
                      background: searchTerm === stk.symbol ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                      border: searchTerm === stk.symbol ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: searchTerm === stk.symbol ? '#38bdf8' : '#ffffff',
                      cursor: 'pointer',
                    }}
                    title={`Filter deals for ${stk.symbol} (₹${stk.total_value_cr} Cr)`}
                  >
                    {stk.symbol} <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}>₹{stk.total_value_cr.toFixed(0)}Cr</span>
                  </button>
                ))}
              </div>
              <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>
                Click any symbol to isolate transactions
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: '20px',
            overflowX: 'auto',
          }}
        >
          <button
            onClick={() => setActiveTab('all')}
            style={{
              padding: '12px 18px',
              fontSize: '0.85rem',
              fontWeight: activeTab === 'all' ? 800 : 500,
              color: activeTab === 'all' ? '#38bdf8' : 'var(--text-secondary)',
              borderBottom: activeTab === 'all' ? '2px solid #38bdf8' : '2px solid transparent',
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
            <span>All Deals</span>
            <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>
              {dealsData?.items.length || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('bulk')}
            style={{
              padding: '12px 18px',
              fontSize: '0.85rem',
              fontWeight: activeTab === 'bulk' ? 800 : 500,
              color: activeTab === 'bulk' ? '#06b6d4' : 'var(--text-secondary)',
              borderBottom: activeTab === 'bulk' ? '2px solid #06b6d4' : '2px solid transparent',
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
            <Layers size={14} />
            <span>Bulk Deals (SEBI &ge;0.5%)</span>
            <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.2)', color: '#22d3ee', fontSize: '0.65rem' }}>
              {dealsData?.items.filter((d) => d.deal_type === 'BULK').length || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('block')}
            style={{
              padding: '12px 18px',
              fontSize: '0.85rem',
              fontWeight: activeTab === 'block' ? 800 : 500,
              color: activeTab === 'block' ? '#a855f7' : 'var(--text-secondary)',
              borderBottom: activeTab === 'block' ? '2px solid #a855f7' : '2px solid transparent',
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
            <Boxes size={14} />
            <span>Block Deals (&ge;₹10 Cr Window)</span>
            <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', fontSize: '0.65rem' }}>
              {dealsData?.items.filter((d) => d.deal_type === 'BLOCK').length || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('playbook')}
            style={{
              padding: '12px 18px',
              fontSize: '0.85rem',
              fontWeight: activeTab === 'playbook' ? 800 : 500,
              color: activeTab === 'playbook' ? '#34d399' : 'var(--text-secondary)',
              borderBottom: activeTab === 'playbook' ? '2px solid #34d399' : '2px solid transparent',
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
            <BookOpen size={14} />
            <span>Trader&apos;s Playbook (How to Trade)</span>
            <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
              4 STRATEGIES
            </span>
          </button>
        </div>

        {/* IF PLAYBOOK TAB SELECTED */}
        {activeTab === 'playbook' ? (
          <div>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
                INSTITUTIONAL TRADER&apos;S PLAYBOOK: HOW TO TRADE BULK &amp; BLOCK DEALS
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                A step-by-step masterclass on decoding institutional footprint, identifying floor prices, timing whale breakout momentum, and protecting your trading capital.
              </p>
            </div>

            {/* SEBI Technical Distinction Box */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '14px',
                padding: '20px',
                marginBottom: '28px',
              }}
            >
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#38bdf8', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HelpCircle size={18} />
                The Fundamental Difference: Bulk Deal vs. Block Deal
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                <div style={{ background: 'rgba(6, 182, 212, 0.06)', border: '1px solid rgba(6, 182, 212, 0.25)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <Layers size={16} color="#06b6d4" />
                    <strong style={{ color: '#22d3ee', fontSize: '0.85rem' }}>BULK DEAL (SEBI LODR)</strong>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <li><strong>Threshold:</strong> Any single or aggregate trade exceeding <strong>0.5% of total listed equity shares</strong>.</li>
                    <li><strong>Execution Window:</strong> Traded during <strong>Normal Market Hours (09:15 AM - 03:30 PM)</strong>.</li>
                    <li><strong>Impact:</strong> Directly consumes regular exchange order book liquidity, causing immediate intraday price volatility.</li>
                    <li><strong>Reporting:</strong> Disclosed to NSE immediately or within 1 hour after market close.</li>
                  </ul>
                </div>

                <div style={{ background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.25)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <Boxes size={16} color="#a855f7" />
                    <strong style={{ color: '#c084fc', fontSize: '0.85rem' }}>BLOCK DEAL (SEBI DEDICATED WINDOW)</strong>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <li><strong>Threshold:</strong> Minimum transaction value of <strong>₹10 Crore</strong>.</li>
                    <li><strong>Execution Window:</strong> Dedicated matching windows: <strong>Morning (08:45 - 09:00 AM)</strong> and <strong>Afternoon (02:05 - 02:20 PM)</strong>.</li>
                    <li><strong>Impact:</strong> Executed within a tight &plusmn;1% price band of reference price. Orders are concealed to prevent market impact.</li>
                    <li><strong>Strategic Value:</strong> Establishes major institutional benchmark cost basis for the stock.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 4 Strategy Deep-Dive Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px' }}>
              {strategies.map((strat, i) => (
                <div
                  key={strat.id}
                  style={{
                    background: 'var(--panel)',
                    border: `1px solid ${strat.color}40`,
                    borderRadius: '14px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: strat.color, textTransform: 'uppercase' }}>
                        Strategy #{i + 1} &bull; {strat.category}
                      </span>
                      <span
                        style={{
                          fontSize: '0.62rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: `${strat.color}20`,
                          color: strat.color,
                          border: `1px solid ${strat.color}40`,
                        }}
                      >
                        {strat.badge}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', margin: '0 0 10px 0' }}>
                      {strat.title}
                    </h3>

                    <p style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 14px 0' }}>
                      {strat.summary}
                    </p>

                    <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '6px' }}>
                        Institutional Rules of Engagement:
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.76rem', color: '#e2e8f0', lineHeight: 1.55 }}>
                        {strat.rules.map((r, ri) => (
                          <li key={ri} style={{ marginBottom: '4px' }}>{r}</li>
                        ))}
                      </ul>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                      <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', padding: '10px' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#34d399', textTransform: 'uppercase' }}>ENTRY SETUP</div>
                        <div style={{ fontSize: '0.75rem', color: '#ffffff', marginTop: '3px', lineHeight: 1.4 }}>
                          {strat.entry_setup}
                        </div>
                      </div>

                      <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '8px', padding: '10px' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f87171', textTransform: 'uppercase' }}>STOP-LOSS &amp; RISK</div>
                        <div style={{ fontSize: '0.75rem', color: '#ffffff', marginTop: '3px', lineHeight: 1.4 }}>
                          {strat.stop_loss}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', marginTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#fbbf24' }}>
                      <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                      <span><strong>Warning:</strong> {strat.caution}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Practical Checklist */}
            <div
              style={{
                marginTop: '32px',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: '14px',
                padding: '24px',
              }}
            >
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={20} color="#10b981" />
                The 6-Step Retail Trader Checklist Before Taking Any Deal Trade
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <strong style={{ color: '#38bdf8', fontSize: '0.82rem' }}>1. Check Buyer Category</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Only trade with Long-Only Funds (Mutual Funds, FIIs, Sovereign Wealth). Ignore matched Buy+Sell prop churn.
                  </p>
                </div>
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <strong style={{ color: '#38bdf8', fontSize: '0.82rem' }}>2. Verify Delivery Percentage</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Confirm that NSE Bhavcopy daily delivery volume is &gt;60%. Intraday volume without delivery is meaningless.
                  </p>
                </div>
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <strong style={{ color: '#38bdf8', fontSize: '0.82rem' }}>3. Mark the Deal Price Pivot</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Plot the exact Deal Execution Price on your chart. This acts as the institutional support floor or resistance ceiling.
                  </p>
                </div>
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <strong style={{ color: '#38bdf8', fontSize: '0.82rem' }}>4. Wait for Candle Confirmation</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Never blind-buy on the deal announcement. Wait for a bullish hammer or engulfing candle retesting the deal price.
                  </p>
                </div>
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <strong style={{ color: '#38bdf8', fontSize: '0.82rem' }}>5. Position Size Against Stop-Loss</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Set your stop-loss strictly 1.5% to 2.5% below the deal price. If institutions cannot defend it, you must exit.
                  </p>
                </div>
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <strong style={{ color: '#38bdf8', fontSize: '0.82rem' }}>6. Target 2R to 3R R:R</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Trail profits using the 20 EMA on the daily chart as institutional accumulation pushes price into momentum trends.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* DEALS TABLE & CARD VIEW */
          <div>
            {/* Filter Toolbar */}
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '14px',
                padding: '16px 20px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '14px',
                flexWrap: 'wrap',
              }}
            >
              {/* Search Bar */}
              <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search by company, symbol or investor (e.g. Morgan Stanley, Zomato, Rekha)..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 36px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Action Filter (BUY vs SELL) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>Action:</span>
                {(['ALL', 'BUY', 'SELL'] as const).map((act) => (
                  <button
                    key={act}
                    onClick={() => setActionFilter(act)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: actionFilter === act ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                      background: actionFilter === act
                        ? (act === 'BUY' ? 'rgba(16, 185, 129, 0.25)' : act === 'SELL' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(56, 189, 248, 0.25)')
                        : 'rgba(255, 255, 255, 0.04)',
                      color: actionFilter === act
                        ? (act === 'BUY' ? '#34d399' : act === 'SELL' ? '#f87171' : '#38bdf8')
                        : 'var(--text-secondary)',
                    }}
                  >
                    {act === 'BUY' ? '🟢 BUY' : act === 'SELL' ? '🔴 SELL' : 'All'}
                  </button>
                ))}
              </div>

              {/* Category Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>Investor:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    fontSize: '0.76rem',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="ALL">All Categories</option>
                  <option value="FII">Foreign Inst. (FII / FPI)</option>
                  <option value="MUTUAL_FUND">Mutual Funds &amp; AMCs</option>
                  <option value="DII">Domestic Inst. (DII / LIC)</option>
                  <option value="PROMOTER">Promoter &amp; Strategic</option>
                  <option value="HNI">Marquee HNIs &amp; Celebrities</option>
                </select>
              </div>

              {/* Sort By */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    fontSize: '0.76rem',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="value_desc">Highest Value (₹ Cr)</option>
                  <option value="value_asc">Lowest Value (₹ Cr)</option>
                  <option value="qty_desc">Highest Volume (Shares)</option>
                  <option value="equity_desc">Highest Equity %</option>
                  <option value="diff_desc">Best Price Gain Since Deal</option>
                </select>
              </div>
            </div>

            {/* Results count banner */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              <div>
                Showing <strong style={{ color: '#ffffff' }}>{filteredDeals.length}</strong> verified transactions across Indian exchanges
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={14} color="#10b981" />
                <span>Audited SEBI &bull; Sourced directly from NSE India</span>
              </div>
            </div>

            {/* Detailed Deals Table */}
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
                      <th style={{ padding: '14px 18px' }}>COMPANY &amp; SECTOR</th>
                      <th style={{ padding: '14px 18px' }}>CLIENT / TRADER NAME</th>
                      <th style={{ padding: '14px 18px', textAlign: 'center' }}>DEAL TYPE</th>
                      <th style={{ padding: '14px 18px', textAlign: 'center' }}>ACTION</th>
                      <th style={{ padding: '14px 18px', textAlign: 'right' }}>VOLUME (SHARES)</th>
                      <th style={{ padding: '14px 18px', textAlign: 'right' }}>DEAL PRICE vs LTP</th>
                      <th style={{ padding: '14px 18px', textAlign: 'right' }}>TOTAL VALUE</th>
                      <th style={{ padding: '14px 18px', textAlign: 'center' }}>EQUITY %</th>
                      <th style={{ padding: '14px 18px' }}>TRADING SIGNAL &amp; TAKEAWAY</th>
                      <th style={{ padding: '14px 18px', textAlign: 'center' }}>NSE LINK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeals.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ padding: '48px 18px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No transactions matching your active filter criteria. Try clearing search or switching deal type tab.
                        </td>
                      </tr>
                    ) : (
                      filteredDeals.map((item, idx) => {
                        const isBuy = item.action === 'BUY';
                        const isBulk = item.deal_type === 'BULK';
                        const diffPct = item.price_difference_pct || 0.0;

                        return (
                          <tr
                            key={item.id}
                            style={{
                              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                              background: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)',
                              transition: 'background 0.15s ease',
                            }}
                          >
                            {/* Company Name & Sector */}
                            <td style={{ padding: '14px 18px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ fontWeight: 800, color: '#ffffff', fontSize: '0.92rem' }}>
                                  {item.symbol}
                                </div>
                                {item.live_change !== undefined && (
                                  <span style={{ fontSize: '0.72rem', color: (item.live_change || 0) >= 0 ? '#34d399' : '#f87171', fontWeight: 700 }}>
                                    {(item.live_change || 0) >= 0 ? '+' : ''}{(item.live_percent_change || 0).toFixed(2)}%
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px', whiteSpace: 'nowrap' }}>
                                {item.company_name}
                              </div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                {item.sector}
                              </div>
                            </td>

                            {/* Client Name & Category */}
                            <td style={{ padding: '14px 18px', maxWidth: '280px' }}>
                              <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.84rem', lineHeight: 1.35 }}>
                                {item.client_name}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                <span
                                  style={{
                                    fontSize: '0.62rem',
                                    fontWeight: 800,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: item.client_category === 'FII' ? 'rgba(56, 189, 248, 0.15)' :
                                      item.client_category === 'MUTUAL_FUND' ? 'rgba(168, 85, 247, 0.15)' :
                                      item.client_category === 'PROMOTER' ? 'rgba(245, 158, 11, 0.15)' :
                                      item.client_category === 'HNI' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                    color: item.client_category === 'FII' ? '#38bdf8' :
                                      item.client_category === 'MUTUAL_FUND' ? '#c084fc' :
                                      item.client_category === 'PROMOTER' ? '#fbbf24' :
                                      item.client_category === 'HNI' ? '#f472b6' : '#34d399',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                  }}
                                >
                                  {item.client_category}
                                </span>
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                  {item.trade_date}
                                </span>
                              </div>
                            </td>

                            {/* Deal Type */}
                            <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 800,
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  background: isBulk ? 'rgba(6, 182, 212, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                                  color: isBulk ? '#22d3ee' : '#c084fc',
                                  border: isBulk ? '1px solid rgba(6, 182, 212, 0.35)' : '1px solid rgba(168, 85, 247, 0.35)',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {isBulk ? 'BULK DEAL' : 'BLOCK DEAL'}
                              </span>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {isBulk ? 'Normal Hours' : 'Concealed Window'}
                              </div>
                            </td>

                            {/* Action BUY / SELL */}
                            <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 900,
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  background: isBuy ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                  color: isBuy ? '#34d399' : '#f87171',
                                  border: isBuy ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                {isBuy ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                {item.action}
                              </span>
                            </td>

                            {/* Traded Volume (Shares) */}
                            <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                              <div style={{ fontWeight: 800, color: '#ffffff', fontSize: '0.88rem' }}>
                                {item.quantity.toLocaleString('en-IN')}
                              </div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                {(item.quantity / 100000).toFixed(2)} Lakh Shares
                              </div>
                            </td>

                            {/* Deal Price vs Current LTP */}
                            <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                              <div style={{ fontWeight: 800, color: '#38bdf8', fontSize: '0.88rem' }}>
                                ₹{item.trade_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              {item.current_market_price && (
                                <div style={{ fontSize: '0.70rem', color: diffPct >= 0 ? '#34d399' : '#f87171', marginTop: '2px', fontWeight: 600 }}>
                                  LTP: ₹{item.current_market_price.toFixed(1)} ({diffPct >= 0 ? '+' : ''}{diffPct.toFixed(1)}%)
                                </div>
                              )}
                            </td>

                            {/* Total Deal Value (Crores) */}
                            <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                              <div style={{ fontWeight: 900, color: '#ffffff', fontSize: '1.0rem', letterSpacing: '-0.01em' }}>
                                ₹{item.deal_value_cr.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Cr
                              </div>
                              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                                Transaction Size
                              </div>
                            </td>

                            {/* Equity % */}
                            <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                              <span
                                style={{
                                  fontSize: '0.78rem',
                                  fontWeight: 800,
                                  color: item.equity_percentage >= 1.0 ? '#fbbf24' : '#ffffff',
                                }}
                              >
                                {item.equity_percentage.toFixed(2)}%
                              </span>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                of Total Capital
                              </div>
                            </td>

                            {/* Trading Signal & Actionable Takeaway */}
                            <td style={{ padding: '14px 18px', maxWidth: '340px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                <span style={{ fontWeight: 800, fontSize: '0.76rem', color: '#ffffff' }}>
                                  {item.actionable_signal}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                {item.strategy_takeaway}
                              </div>
                            </td>

                            {/* NSE Official Link */}
                            <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                              <a
                                href={getOfficialNseUrl(item.symbol, item.nse_official_url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-secondary"
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '6px 10px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  whiteSpace: 'nowrap',
                                  color: '#38bdf8',
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                }}
                                title={`Open ${item.symbol} quote & official disclosures on NSE India`}
                              >
                                <span>Quote &amp; Filing</span>
                                <ExternalLink size={12} />
                              </a>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Navigation Hub Drawer */}
      {drawerOpen && <NavigationDrawer onClose={() => setDrawerOpen(false)} />}
    </div>
  );
}

export default function DealsPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0d14' }}>
          <RefreshCw size={32} className="pulse-indicator" color="#06b6d4" />
        </div>
      }
    >
      <DealsPageContent />
    </Suspense>
  );
}
