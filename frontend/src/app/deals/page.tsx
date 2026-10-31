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
  BookOpen,
  Calendar,
  XCircle,
  ArrowDownRight
} from 'lucide-react';
import IndicesBarometer from '@/components/IndicesBarometer';
import NavigationDrawer from '@/components/NavigationDrawer';
import { getApiBase } from '@/config/api';

export interface DealItem {
  id: string;
  deal_type: 'BULK' | 'BLOCK' | 'SHORT_SELLING';
  symbol: string;
  company_name: string;
  sector: string;
  client_name: string;
  client_category: 'FII' | 'DII' | 'MUTUAL_FUND' | 'PROMOTER' | 'HNI' | 'PROP_DESK' | 'INSTITUTIONAL';
  action: 'BUY' | 'SELL';
  quantity: number;
  trade_price: number;
  deal_value_cr: number;
  equity_percentage: number;
  execution_window: string;
  trade_date: string;
  trade_date_iso?: string;
  trade_time: string;
  timestamp_epoch?: number;
  days_ago?: number;
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
    total_bulk_deal_value_cr?: number;
    total_block_deal_value_cr?: number;
    total_short_selling_value_cr?: number;
    total_buy_value_cr?: number;
    total_sell_value_cr?: number;
    net_institutional_bias?: string;
    total_deals_count?: number;
    bulk_deals_count?: number;
    block_deals_count?: number;
    short_selling_count?: number;
    most_active_stocks?: Array<{
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

type DateFilterOption = 'ALL' | '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'CUSTOM';

// Module-level client cache for instant 0ms transitions
let globalDealsCache: DealsResponse | null = null;

function DealsPageContent() {
  const searchParams = useSearchParams();
  const initialTypeParam = searchParams.get('type');

  const [activeTab, setActiveTab] = useState<'all' | 'bulk' | 'block' | 'short' | 'playbook'>(() => {
    if (initialTypeParam === 'bulk') return 'bulk';
    if (initialTypeParam === 'block') return 'block';
    if (initialTypeParam === 'short' || initialTypeParam === 'short_selling') return 'short';
    if (initialTypeParam === 'playbook') return 'playbook';
    return 'all';
  });

  const [dealsData, setDealsData] = useState<DealsResponse | null>(() => globalDealsCache);
  const [loading, setLoading] = useState<boolean>(!globalDealsCache);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  // Exact required Date Filters: 1D, 1W, 1M, 3M, 6M, 1Y, 'Custom', and 'Clear'
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('ALL');
  const [customStartDate, setCustomStartDate] = useState<string>('2026-10-01');
  const [customEndDate, setCustomEndDate] = useState<string>('2026-10-31');
  const [showCustomInputs, setShowCustomInputs] = useState<boolean>(false);

  // Other filters & search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('date_desc'); // Default: most recent on top

  // Sync tab with URL search parameter if changed
  useEffect(() => {
    const typeParam = searchParams.get('type');
    if (typeParam === 'bulk') setActiveTab('bulk');
    else if (typeParam === 'block') setActiveTab('block');
    else if (typeParam === 'short' || typeParam === 'short_selling') setActiveTab('short');
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
      const res = await fetch(`${apiBase}/api/deals?limit=100&sort_by=date_desc`);
      if (res.ok) {
        const json: DealsResponse = await res.json();
        globalDealsCache = json;
        try {
          sessionStorage.setItem('deals_cache_v3', JSON.stringify(json));
        } catch (_) {}
        setDealsData(json);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => fetchDeals(isManual, retries - 1), 600);
      } else {
        console.error('Failed to fetch market deals:', err);
      }
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    // Clear legacy or outdated cache keys
    try {
      sessionStorage.removeItem('deals_cache');
      sessionStorage.removeItem('deals_cache_v2');
      const stored = sessionStorage.getItem('deals_cache_v3');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.summary && typeof parsed.summary.total_short_selling_value_cr === 'number') {
          globalDealsCache = parsed;
          setDealsData(parsed);
          setLoading(false);
        } else {
          sessionStorage.removeItem('deals_cache_v3');
        }
      }
    } catch (_) {}

    fetchDeals();
    const interval = setInterval(() => fetchDeals(), 45000); // 45s live refresh
    return () => clearInterval(interval);
  }, []);

  // Filtered & Chronologically Organized Deals
  const filteredDeals = useMemo(() => {
    if (!dealsData?.items) return [];

    const timeRangeDaysMap: Record<string, number> = {
      '1D': 1,
      '1W': 7,
      '1M': 30,
      '3M': 90,
      '6M': 180,
      '1Y': 365,
    };

    const maxDays = timeRangeDaysMap[dateFilter];

    return dealsData.items.filter((item) => {
      // Tab filter
      if (activeTab === 'bulk' && item.deal_type !== 'BULK') return false;
      if (activeTab === 'block' && item.deal_type !== 'BLOCK') return false;
      if (activeTab === 'short' && item.deal_type !== 'SHORT_SELLING') return false;

      // Date Filter: 1D, 1W, 1M, 3M, 6M, 1Y
      if (maxDays !== undefined) {
        if (item.days_ago !== undefined && item.days_ago > maxDays) {
          return false;
        }
      }

      // Date Filter: Custom
      if (dateFilter === 'CUSTOM' && item.trade_date_iso) {
        if (customStartDate && item.trade_date_iso < customStartDate) return false;
        if (customEndDate && item.trade_date_iso > customEndDate) return false;
      }

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
        const inDate = item.trade_date.toLowerCase().includes(s);
        if (!inSym && !inComp && !inClient && !inSector && !inDate) return false;
      }

      return true;
    }).sort((a, b) => {
      // Primary requirement: ORGANIZED BY DATE (Most recent entries at the top)
      if (sortBy === 'date_desc') {
        return (b.timestamp_epoch || 0) - (a.timestamp_epoch || 0);
      }
      if (sortBy === 'date_asc') {
        return (a.timestamp_epoch || 0) - (b.timestamp_epoch || 0);
      }
      if (sortBy === 'value_desc') return b.deal_value_cr - a.deal_value_cr;
      if (sortBy === 'value_asc') return a.deal_value_cr - b.deal_value_cr;
      if (sortBy === 'qty_desc') return b.quantity - a.quantity;
      if (sortBy === 'equity_desc') return b.equity_percentage - a.equity_percentage;
      if (sortBy === 'diff_desc') return (b.price_difference_pct || 0) - (a.price_difference_pct || 0);
      // Default fallback: newest date first
      return (b.timestamp_epoch || 0) - (a.timestamp_epoch || 0);
    });
  }, [dealsData, activeTab, dateFilter, customStartDate, customEndDate, actionFilter, categoryFilter, searchTerm, sortBy]);

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
                <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: '#ffffff' }}>
                  MARKET DEAL
                </h1>
                <span
                  style={{
                    background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%)',
                    color: '#22d3ee',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    letterSpacing: '0.04em',
                  }}
                >
                  BULK &bull; BLOCK &bull; SHORT SELLING
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Track who is trading which companies, traded volume, short selling disclosures &amp; date-filtered institutional analytics
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
              title="View Institutional Trading Playbook & Short Squeeze Tactics"
            >
              <BookOpen size={14} />
              <span>How to Trade Deals</span>
            </button>

            <button
              onClick={() => fetchDeals(true)}
              disabled={refreshing}
              className="btn btn-secondary"
              style={{ padding: '8px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Refresh latest deals feed"
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
            marginBottom: '20px',
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
                background: 'linear-gradient(135deg, #0891b2 0%, #a855f7 100%)',
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
                  Institutional Strategy: How to Trade Bulk Deals, Block Windows &amp; Short Squeezes
                </span>
                <span className="badge badge-success" style={{ fontSize: '0.62rem' }}>
                  TRADER&apos;S PLAYBOOK
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '3px 0 0 0', lineHeight: 1.4 }}>
                Discover how to exploit <strong>Floor Price Reversals</strong>, track <strong>Short Selling Traps &amp; Squeezes</strong>, and filter out HFT prop churn.
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
                background: 'linear-gradient(135deg, #0891b2 0%, #a855f7 100%)',
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
              title="Official NSE Bulk, Block Deals & Short Selling Reports"
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
              marginBottom: '20px',
            }}
          >
            {/* Card 1: Bulk Deals Value */}
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                borderRadius: '14px',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#22d3ee' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  BULK DEALS (SEBI &ge;0.5%)
                </span>
                <Layers size={16} />
              </div>
              <div style={{ margin: '8px 0 2px 0' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ffffff' }}>
                  ₹{(summary?.total_bulk_deal_value_cr ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {summary?.bulk_deals_count ?? 0} Open-Market Transactions
                </div>
              </div>
              <div style={{ fontSize: '0.68rem', color: '#22d3ee', fontWeight: 600 }}>
                Normal exchange trading hours
              </div>
            </div>

            {/* Card 2: Block Deals Value */}
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
                  BLOCK DEALS (&ge;₹10 CR)
                </span>
                <Boxes size={16} />
              </div>
              <div style={{ margin: '8px 0 2px 0' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ffffff' }}>
                  ₹{(summary?.total_block_deal_value_cr ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {summary?.block_deals_count ?? 0} Dedicated Window Deals
                </div>
              </div>
              <div style={{ fontSize: '0.68rem', color: '#c084fc', fontWeight: 600 }}>
                Concealed order book matching
              </div>
            </div>

            {/* Card 3: Short Selling Disclosures Value */}
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid rgba(236, 72, 153, 0.3)',
                borderRadius: '14px',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#f472b6' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  SHORT SELLING DISCLOSURES
                </span>
                <ArrowDownRight size={16} />
              </div>
              <div style={{ margin: '8px 0 2px 0' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ffffff' }}>
                  ₹{(summary?.total_short_selling_value_cr ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {summary?.short_selling_count ?? 0} Institutional Short Positions
                </div>
              </div>
              <div style={{ fontSize: '0.68rem', color: '#f472b6', fontWeight: 600 }}>
                SEBI daily mandated institutional reporting
              </div>
            </div>

            {/* Card 4: Institutional Bias & Net Buy/Sell */}
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#34d399' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  NET INSTITUTIONAL BIAS
                </span>
                <TrendingUp size={16} />
              </div>
              <div style={{ margin: '8px 0 2px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 900, color: (summary?.net_institutional_bias || 'BULLISH') === 'BULLISH' ? '#34d399' : '#f87171' }}>
                    {summary?.net_institutional_bias || 'BULLISH'}
                  </span>
                  <span className={`badge ${(summary?.net_institutional_bias || 'BULLISH') === 'BULLISH' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.60rem' }}>
                    ACCUMULATION
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Buy: <strong style={{ color: '#34d399' }}>₹{(summary?.total_buy_value_cr ?? 0).toFixed(0)} Cr</strong> &bull; Sell: <strong style={{ color: '#f87171' }}>₹{(summary?.total_sell_value_cr ?? 0).toFixed(0)} Cr</strong>
                </div>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                {((summary?.total_buy_value_cr ?? 0) / Math.max(summary?.total_sell_value_cr ?? 1, 1)).toFixed(2)}x Absorption
              </div>
            </div>
          </div>
        )}

        {/* Section Tabs: All, Bulk, Block, Short Selling, Playbook */}
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
            onClick={() => setActiveTab('all')}
            style={{
              padding: '10px 16px',
              fontSize: '0.84rem',
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
            <span>All Deals &amp; Disclosures</span>
            <span className="badge badge-primary" style={{ fontSize: '0.62rem' }}>
              {dealsData?.items.length || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('bulk')}
            style={{
              padding: '10px 16px',
              fontSize: '0.84rem',
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
            <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.2)', color: '#22d3ee', fontSize: '0.62rem' }}>
              {dealsData?.items.filter((d) => d.deal_type === 'BULK').length || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('block')}
            style={{
              padding: '10px 16px',
              fontSize: '0.84rem',
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
            <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', fontSize: '0.62rem' }}>
              {dealsData?.items.filter((d) => d.deal_type === 'BLOCK').length || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('short')}
            style={{
              padding: '10px 16px',
              fontSize: '0.84rem',
              fontWeight: activeTab === 'short' ? 800 : 500,
              color: activeTab === 'short' ? '#f472b6' : 'var(--text-secondary)',
              borderBottom: activeTab === 'short' ? '2px solid #f472b6' : '2px solid transparent',
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
            <ArrowDownRight size={14} />
            <span>Short Selling Data</span>
            <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.2)', color: '#f472b6', fontSize: '0.62rem' }}>
              {dealsData?.items.filter((d) => d.deal_type === 'SHORT_SELLING').length || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('playbook')}
            style={{
              padding: '10px 16px',
              fontSize: '0.84rem',
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
            <span>Trader&apos;s Playbook</span>
            <span className="badge badge-success" style={{ fontSize: '0.62rem' }}>
              5 STRATEGIES
            </span>
          </button>
        </div>

        {/* DATE FILTERING SYSTEM (1D, 1W, 1M, 3M, 6M, 1Y, 'Custom', and 'Clear') */}
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            borderRadius: '12px',
            padding: '12px 18px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Calendar size={14} />
              Date Filter:
            </span>

            {/* 1D */}
            <button
              onClick={() => { setDateFilter('1D'); setShowCustomInputs(false); }}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: dateFilter === '1D' ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                background: dateFilter === '1D' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                color: dateFilter === '1D' ? '#38bdf8' : 'var(--text-secondary)',
              }}
              title="Filter entries within the last 1 day"
            >
              1D
            </button>

            {/* 1W */}
            <button
              onClick={() => { setDateFilter('1W'); setShowCustomInputs(false); }}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: dateFilter === '1W' ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                background: dateFilter === '1W' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                color: dateFilter === '1W' ? '#38bdf8' : 'var(--text-secondary)',
              }}
              title="Filter entries within the last 1 week (7 days)"
            >
              1W
            </button>

            {/* 1M */}
            <button
              onClick={() => { setDateFilter('1M'); setShowCustomInputs(false); }}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: dateFilter === '1M' ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                background: dateFilter === '1M' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                color: dateFilter === '1M' ? '#38bdf8' : 'var(--text-secondary)',
              }}
              title="Filter entries within the last 1 month (30 days)"
            >
              1M
            </button>

            {/* 3M */}
            <button
              onClick={() => { setDateFilter('3M'); setShowCustomInputs(false); }}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: dateFilter === '3M' ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                background: dateFilter === '3M' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                color: dateFilter === '3M' ? '#38bdf8' : 'var(--text-secondary)',
              }}
              title="Filter entries within the last 3 months (90 days)"
            >
              3M
            </button>

            {/* 6M */}
            <button
              onClick={() => { setDateFilter('6M'); setShowCustomInputs(false); }}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: dateFilter === '6M' ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                background: dateFilter === '6M' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                color: dateFilter === '6M' ? '#38bdf8' : 'var(--text-secondary)',
              }}
              title="Filter entries within the last 6 months (180 days)"
            >
              6M
            </button>

            {/* 1Y */}
            <button
              onClick={() => { setDateFilter('1Y'); setShowCustomInputs(false); }}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: dateFilter === '1Y' ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                background: dateFilter === '1Y' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                color: dateFilter === '1Y' ? '#38bdf8' : 'var(--text-secondary)',
              }}
              title="Filter entries within the last 1 year (365 days)"
            >
              1Y
            </button>

            {/* 'Custom' */}
            <button
              onClick={() => {
                setDateFilter('CUSTOM');
                setShowCustomInputs(!showCustomInputs || dateFilter !== 'CUSTOM');
              }}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: dateFilter === 'CUSTOM' ? '1px solid #a855f7' : '1px solid var(--border-subtle)',
                background: dateFilter === 'CUSTOM' ? 'rgba(168, 85, 247, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                color: dateFilter === 'CUSTOM' ? '#c084fc' : 'var(--text-secondary)',
              }}
              title="Pick a custom start and end date range"
            >
              Custom
            </button>

            {/* 'Clear' */}
            <button
              onClick={() => {
                setDateFilter('ALL');
                setShowCustomInputs(false);
              }}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#f87171',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Clear all date filters and show complete historical records"
            >
              <XCircle size={13} />
              Clear
            </button>
          </div>

          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={13} color="#10b981" />
            <span>Organized chronologically: <strong>Most recent entries on top</strong></span>
          </div>
        </div>

        {/* Custom Date Picker Bar (when 'Custom' is selected) */}
        {showCustomInputs && dateFilter === 'CUSTOM' && (
          <div
            style={{
              background: 'rgba(168, 85, 247, 0.08)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: '10px',
              padding: '12px 18px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: '#c084fc', fontWeight: 700 }}>From Date:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(168, 85, 247, 0.4)',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: '#c084fc', fontWeight: 700 }}>To Date:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(168, 85, 247, 0.4)',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  outline: 'none',
                }}
              />
            </div>

            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Filtering between {customStartDate} and {customEndDate}
            </span>
          </div>
        )}

        {/* IF PLAYBOOK TAB SELECTED */}
        {activeTab === 'playbook' ? (
          <div>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
                INSTITUTIONAL TRADER&apos;S PLAYBOOK: HOW TO TRADE MARKET DEALS &amp; SHORT SELLING
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                A step-by-step masterclass on decoding institutional footprints, identifying floor prices, exploiting short squeezes, and protecting trading capital.
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
                Market Deals Architecture: Bulk Deals, Block Windows &amp; Short Selling
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div style={{ background: 'rgba(6, 182, 212, 0.06)', border: '1px solid rgba(6, 182, 212, 0.25)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <Layers size={16} color="#06b6d4" />
                    <strong style={{ color: '#22d3ee', fontSize: '0.85rem' }}>BULK DEALS (SEBI LODR)</strong>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    <li><strong>Threshold:</strong> Single or aggregate trade &ge; <strong>0.5% of total listed equity shares</strong>.</li>
                    <li><strong>Execution Window:</strong> Traded during <strong>Normal Market Hours (09:15 AM - 03:30 PM)</strong>.</li>
                    <li><strong>Impact:</strong> Consumes regular exchange liquidity, causing immediate intraday volatility.</li>
                  </ul>
                </div>

                <div style={{ background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.25)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <Boxes size={16} color="#a855f7" />
                    <strong style={{ color: '#c084fc', fontSize: '0.85rem' }}>BLOCK DEALS (DEDICATED WINDOW)</strong>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    <li><strong>Threshold:</strong> Minimum transaction value of <strong>₹10 Crore</strong>.</li>
                    <li><strong>Execution Window:</strong> <strong>Morning (08:45 - 09:00 AM)</strong> and <strong>Afternoon (02:05 - 02:20 PM)</strong>.</li>
                    <li><strong>Impact:</strong> Matched within &plusmn;1% price band with concealed order book.</li>
                  </ul>
                </div>

                <div style={{ background: 'rgba(236, 72, 153, 0.06)', border: '1px solid rgba(236, 72, 153, 0.25)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <ArrowDownRight size={16} color="#ec4899" />
                    <strong style={{ color: '#f472b6', fontSize: '0.85rem' }}>SHORT SELLING (SEBI MANDATE)</strong>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    <li><strong>Threshold:</strong> Daily mandatory reporting of all institutional short sales.</li>
                    <li><strong>Mechanism:</strong> Borrowed shares sold to capture downside or hedge equity portfolios.</li>
                    <li><strong>Squeeze Potential:</strong> If price pushes above short level, forced buy-backs trigger explosive short squeezes.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 5 Strategy Deep-Dive Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
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
          /* DEALS & SHORT SELLING TABLE VIEW */
          <div>
            {/* Filter Toolbar */}
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '14px',
                padding: '14px 18px',
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
                  placeholder="Search by symbol, company, investor or date (e.g. Citadel, Zomato, 30-Oct)..."
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

              {/* Action Filter (BUY vs SELL) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Action:</span>
                {(['ALL', 'BUY', 'SELL'] as const).map((act) => (
                  <button
                    key={act}
                    onClick={() => setActionFilter(act)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
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
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Investor:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
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
                  <option value="ALL">All Categories</option>
                  <option value="FII">Foreign Inst. (FII / FPI)</option>
                  <option value="MUTUAL_FUND">Mutual Funds &amp; AMCs</option>
                  <option value="DII">Domestic Inst. (DII / LIC)</option>
                  <option value="PROMOTER">Promoter &amp; Strategic</option>
                  <option value="HNI">Marquee HNIs &amp; Celebrities</option>
                  <option value="PROP_DESK">Prop Desks &amp; Arbitrage</option>
                </select>
              </div>

              {/* Sort By: Default is strictly Newest Date First */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Sort Order:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    color: '#38bdf8',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="date_desc">📅 Date: Newest First (Top)</option>
                  <option value="date_asc">📅 Date: Oldest First</option>
                  <option value="value_desc">💰 Highest Value (₹ Cr)</option>
                  <option value="value_asc">💰 Lowest Value (₹ Cr)</option>
                  <option value="qty_desc">📊 Highest Volume (Shares)</option>
                  <option value="equity_desc">📈 Highest Equity %</option>
                  <option value="diff_desc">🚀 Best Price Gain Since Deal</option>
                </select>
              </div>
            </div>

            {/* Results count & chronological order notice */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', fontSize: '0.74rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                Showing <strong style={{ color: '#ffffff' }}>{filteredDeals.length}</strong> entries &bull; Active Date Filter: <strong style={{ color: '#38bdf8' }}>{dateFilter}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge-success" style={{ fontSize: '0.62rem' }}>
                  CHRONOLOGICAL ORDER: MOST RECENT AT TOP
                </span>
                <ShieldCheck size={14} color="#10b981" />
                <span>Audited SEBI &bull; NSE Disclosures</span>
              </div>
            </div>

            {/* Detailed Table with Date Display */}
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
                      <th style={{ padding: '12px 16px', color: '#38bdf8' }}>DATE &amp; TIME</th>
                      <th style={{ padding: '12px 16px' }}>COMPANY &amp; SECTOR</th>
                      <th style={{ padding: '12px 16px' }}>CLIENT / TRADER NAME</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>DEAL TYPE &amp; ACTION</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>VOLUME (SHARES)</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>DEAL PRICE vs LTP</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>TOTAL VALUE</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>EQUITY %</th>
                      <th style={{ padding: '12px 16px' }}>SIGNAL &amp; STRATEGY TAKEAWAY</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>NSE LINK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeals.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ padding: '48px 18px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No transactions matching your active date or filter criteria. Click <strong>&quot;Clear&quot;</strong> in the Date Filter bar to reset.
                        </td>
                      </tr>
                    ) : (
                      filteredDeals.map((item, idx) => {
                        const isBuy = item.action === 'BUY';
                        const isBulk = item.deal_type === 'BULK';
                        const isBlock = item.deal_type === 'BLOCK';
                        const isShort = item.deal_type === 'SHORT_SELLING';
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
                            {/* 1. Explicit DATE & TIME (Mandatory User Requirement) */}
                            <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Calendar size={13} color="#38bdf8" />
                                <strong style={{ color: '#ffffff', fontSize: '0.82rem' }}>
                                  {item.trade_date}
                                </strong>
                              </div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Clock size={11} />
                                <span>{item.trade_time}</span>
                                {item.days_ago !== undefined && (
                                  <span style={{ color: item.days_ago === 0 ? '#34d399' : item.days_ago === 1 ? '#38bdf8' : 'var(--text-muted)', fontWeight: 600 }}>
                                    &bull; {item.days_ago === 0 ? 'Today' : item.days_ago === 1 ? 'Yesterday' : `${item.days_ago}d ago`}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 2. Company Name & Sector */}
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ fontWeight: 800, color: '#ffffff', fontSize: '0.90rem' }}>
                                  {item.symbol}
                                </div>
                                {item.live_change !== undefined && (
                                  <span style={{ fontSize: '0.70rem', color: (item.live_change || 0) >= 0 ? '#34d399' : '#f87171', fontWeight: 700 }}>
                                    {(item.live_change || 0) >= 0 ? '+' : ''}{(item.live_percent_change || 0).toFixed(2)}%
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px', whiteSpace: 'nowrap' }}>
                                {item.company_name}
                              </div>
                              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                                {item.sector}
                              </div>
                            </td>

                            {/* 3. Client Name & Category */}
                            <td style={{ padding: '12px 16px', maxWidth: '260px' }}>
                              <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.82rem', lineHeight: 1.35 }}>
                                {item.client_name}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                <span
                                  style={{
                                    fontSize: '0.60rem',
                                    fontWeight: 800,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: item.client_category === 'FII' ? 'rgba(56, 189, 248, 0.15)' :
                                      item.client_category === 'MUTUAL_FUND' ? 'rgba(168, 85, 247, 0.15)' :
                                      item.client_category === 'PROMOTER' ? 'rgba(245, 158, 11, 0.15)' :
                                      item.client_category === 'HNI' ? 'rgba(236, 72, 153, 0.15)' :
                                      item.client_category === 'PROP_DESK' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                    color: item.client_category === 'FII' ? '#38bdf8' :
                                      item.client_category === 'MUTUAL_FUND' ? '#c084fc' :
                                      item.client_category === 'PROMOTER' ? '#fbbf24' :
                                      item.client_category === 'HNI' ? '#f472b6' :
                                      item.client_category === 'PROP_DESK' ? '#fb7185' : '#34d399',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                  }}
                                >
                                  {item.client_category}
                                </span>
                              </div>
                            </td>

                            {/* 4. Combined DEAL TYPE & ACTION Column */}
                            <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                {/* Deal Type Badge */}
                                <span
                                  style={{
                                    fontSize: '0.66rem',
                                    fontWeight: 800,
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    background: isBulk ? 'rgba(6, 182, 212, 0.15)' : isBlock ? 'rgba(168, 85, 247, 0.15)' : 'rgba(236, 72, 153, 0.15)',
                                    color: isBulk ? '#22d3ee' : isBlock ? '#c084fc' : '#f472b6',
                                    border: isBulk ? '1px solid rgba(6, 182, 212, 0.35)' : isBlock ? '1px solid rgba(168, 85, 247, 0.35)' : '1px solid rgba(236, 72, 153, 0.35)',
                                    letterSpacing: '0.02em',
                                  }}
                                >
                                  {isBulk ? 'BULK' : isBlock ? 'BLOCK' : 'SHORT'}
                                </span>

                                {/* Action Badge */}
                                <span
                                  style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 900,
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    background: isBuy ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                    color: isBuy ? '#34d399' : '#f87171',
                                    border: isBuy ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                  }}
                                >
                                  {isBuy ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                  {isShort ? 'SHORT' : item.action}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                {isBulk ? 'Normal Market' : isBlock ? 'Block Window' : 'Daily Mandate'}
                              </div>
                            </td>

                            {/* 6. Traded Volume (Shares) */}
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              <div style={{ fontWeight: 800, color: '#ffffff', fontSize: '0.84rem' }}>
                                {(item.quantity ?? 0).toLocaleString('en-IN')}
                              </div>
                              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                                {((item.quantity ?? 0) / 100000).toFixed(2)} Lakh Shares
                              </div>
                            </td>

                            {/* 7. Deal Price vs Current LTP */}
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              <div style={{ fontWeight: 800, color: '#38bdf8', fontSize: '0.85rem' }}>
                                ₹{(item.trade_price ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              {item.current_market_price && (
                                <div style={{ fontSize: '0.68rem', color: diffPct >= 0 ? '#34d399' : '#f87171', marginTop: '2px', fontWeight: 600 }}>
                                  LTP: ₹{item.current_market_price.toFixed(1)} ({diffPct >= 0 ? '+' : ''}{diffPct.toFixed(1)}%)
                                </div>
                              )}
                            </td>

                            {/* 8. Total Deal Value (Crores) */}
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              <div style={{ fontWeight: 900, color: '#ffffff', fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
                                ₹{(item.deal_value_cr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Cr
                              </div>
                              <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                                Transaction Size
                              </div>
                            </td>

                            {/* 9. Equity % */}
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <span
                                style={{
                                  fontSize: '0.76rem',
                                  fontWeight: 800,
                                  color: item.equity_percentage >= 1.0 ? '#fbbf24' : '#ffffff',
                                }}
                              >
                                {item.equity_percentage.toFixed(2)}%
                              </span>
                              <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                                of Capital
                              </div>
                            </td>

                            {/* 10. Signal & Takeaway */}
                            <td style={{ padding: '12px 16px', maxWidth: '320px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                <span style={{ fontWeight: 800, fontSize: '0.74rem', color: '#ffffff' }}>
                                  {item.actionable_signal}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                                {item.strategy_takeaway}
                              </div>
                            </td>

                            {/* 11. NSE Link */}
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <a
                                href={getOfficialNseUrl(item.symbol, item.nse_official_url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-secondary"
                                style={{
                                  fontSize: '0.70rem',
                                  padding: '5px 8px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  whiteSpace: 'nowrap',
                                  color: '#38bdf8',
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                }}
                                title={`Open ${item.symbol} quote & official disclosures on NSE India`}
                              >
                                <span>NSE Portal</span>
                                <ExternalLink size={11} />
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
