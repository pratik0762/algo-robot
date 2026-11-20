'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Target,
  Search,
  Filter,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Layers,
  Activity,
  BarChart2,
  SlidersHorizontal,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
  Flame,
  Clock,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Info,
  Maximize2,
  CheckCircle2,
  AlertTriangle,
  Menu,
  BoxSelect,
  Compass,
  PieChart,
  Eye,
  Sliders,
  DollarSign
} from 'lucide-react';
import NavigationDrawer from '@/components/NavigationDrawer';
import IndicesBarometer from '@/components/IndicesBarometer';
import MarketStatusBanner from '@/components/MarketStatusBanner';
import { getApiBase } from '@/config/api';
import { useLiveStockTicks } from '@/hooks/useLiveStockTicks';
import dynamic from 'next/dynamic';

const TradingViewLightweightChart = dynamic(
  () => import('@/components/TradingViewLightweightChart'),
  { ssr: false, loading: () => <div style={{ height: '420px', background: '#090d16', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Loading Institutional TradingView Canvas...</div> }
);

const PaperOrderModal = dynamic(
  () => import('@/components/PaperOrderModal'),
  { ssr: false }
);

// Interfaces for Order Block Intelligence
export interface OrderBlockStockItem {
  rank: number;
  symbol: string;
  company_name: string;
  sector: string;
  current_price: number;
  percent_change: number;
  strength_score: number;
  strength_ratio: number;
  is_directional: boolean;
  rvol: number;
  volume: number;
  order_block_zone: string;
  zone_high: number;
  zone_low: number;
  support_s1: number;
  target_r1: number;
  target_r2: number;
  liquidity_level: string;
  trend_direction: 'BULLISH' | 'BEARISH';
  setup_status: string;
  ob_quality: number;
  has_sweep: boolean;
  last_updated: string;
}

export interface LiquidityEventItem {
  symbol: string;
  company_name: string;
  current_price: number;
  percent_change: number;
  sector: string;
  rvol: number;
  event_type: string;
  level_details: string;
  bias: 'BULLISH' | 'BEARISH';
  confluence: string;
  score: number;
  timestamp: string;
}

export interface SectorFlowItem {
  sector: string;
  percent_change: number;
  avg_strength_score: number;
  advances: number;
  declines: number;
  unchanged: number;
  total_stocks: number;
  top_leader: string;
  top_laggard: string;
  net_bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export interface MarketOverviewData {
  market_status: string;
  indices: {
    NIFTY_50: { price: number; change: number; percent_change: number };
    BANKNIFTY: { price: number; change: number; percent_change: number };
    FINNIFTY: { price: number; change: number; percent_change: number };
    SENSEX: { price: number; change: number; percent_change: number };
    INDIA_VIX: { price: number; change: number; percent_change: number; sentiment: string };
  };
  total_stocks_scanned: number;
  advances: number;
  declines: number;
  unchanged: number;
  advance_decline_ratio: number;
  bullish_percentage: number;
  bearish_percentage: number;
  above_20_ema_pct: number;
  strongest_sector: string;
  weakest_sector: string;
  market_regime: string;
  last_updated: string;
}

export interface StockDetailModalData {
  symbol: string;
  company_name: string;
  sector: string;
  current_price: number;
  percent_change: number;
  timeframe: string;
  bias: string;
  intraday_strength: {
    adm_50: number;
    up_move: number;
    down_move: number;
    opposite_move: number;
    is_directional: boolean;
    strength_score: number;
    strength_ratio: number;
  };
  four_critical_levels: {
    Z_order_block_zone: { label: string; high: number; low: number; mid: number; display: string; description: string };
    S1_invalidation: { label: string; price: number; display: string; description: string };
    R1_first_target: { label: string; price: number; display: string; description: string };
    R2_second_target: { label: string; price: number; display: string; description: string };
  };
  all_bullish_obs: any[];
  all_bearish_obs: any[];
  active_setup?: any;
  liquidity_levels: any;
  sweeps: any[];
  candles: any[];
}

export default function OrderBlockPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'bullish' | 'bearish' | 'strongest' | 'liquidity' | 'sectors' | 'xray' | 'playbook'>('bullish');
  
  // Data state
  const [overview, setOverview] = useState<MarketOverviewData | null>(null);
  const [bullishBoard, setBullishBoard] = useState<OrderBlockStockItem[]>([]);
  const [bearishBoard, setBearishBoard] = useState<OrderBlockStockItem[]>([]);
  const [liquidityBoard, setLiquidityBoard] = useState<LiquidityEventItem[]>([]);
  const [sectorFlow, setSectorFlow] = useState<SectorFlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<string>('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState('ALL');
  const [minStrength, setMinStrength] = useState<number>(0);
  const [minRVol, setMinRVol] = useState<number>(0);
  const [filterFreshOnly, setFilterFreshOnly] = useState(false);

  // Selected Stock Modal
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [selectedStockDetail, setSelectedStockDetail] = useState<StockDetailModalData | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalTimeframe, setModalTimeframe] = useState('15m');
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderModalSide, setOrderModalSide] = useState<'BUY' | 'SELL'>('BUY');

  const { ticks: liveTicks } = useLiveStockTicks();

  // Fetch full scan data
  const fetchData = useCallback(async (isManual: boolean = false) => {
    if (isManual) setRefreshing(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/order-block/scan`);
      if (res.ok) {
        const data = await res.json();
        setOverview(data.market_overview || null);
        setBullishBoard(data.bullish_board || []);
        setBearishBoard(data.bearish_board || []);
        setLiquidityBoard(data.liquidity_board || []);
        setSectorFlow(data.sector_flow || []);
        setLastScanTime(data.timestamp || new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Failed fetching Order-Block scan data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load & 15-second background sync
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData(false);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Fetch single stock details when opened
  const openStockModal = useCallback(async (symbol: string) => {
    setSelectedStock(symbol);
    setModalLoading(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/order-block/stock/${symbol}?timeframe=${modalTimeframe}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedStockDetail(data);
      }
    } catch (err) {
      console.error('Error fetching stock details:', err);
    } finally {
      setModalLoading(false);
    }
  }, [modalTimeframe]);

  // Handle timeframe change inside modal
  const handleTimeframeChange = (tf: string) => {
    setModalTimeframe(tf);
    if (selectedStock) {
      openStockModal(selectedStock);
    }
  };

  // Distinct sectors list
  const sectorsList = useMemo(() => {
    const set = new Set<string>();
    bullishBoard.forEach((b) => set.add(b.sector));
    bearishBoard.forEach((b) => set.add(b.sector));
    return ['ALL', ...Array.from(set).sort()];
  }, [bullishBoard, bearishBoard]);

  // Filtered Bullish Board
  const filteredBullish = useMemo(() => {
    return bullishBoard.filter((item) => {
      if (selectedSector !== 'ALL' && item.sector !== selectedSector) return false;
      if (minStrength > 0 && item.strength_score < minStrength) return false;
      if (minRVol > 0 && item.rvol < minRVol) return false;
      if (filterFreshOnly && item.setup_status !== 'FRESH') return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        return item.symbol.toLowerCase().includes(q) || item.company_name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [bullishBoard, selectedSector, minStrength, minRVol, filterFreshOnly, searchTerm]);

  // Filtered Bearish Board
  const filteredBearish = useMemo(() => {
    return bearishBoard.filter((item) => {
      if (selectedSector !== 'ALL' && item.sector !== selectedSector) return false;
      if (minStrength > 0 && item.strength_score < minStrength) return false;
      if (minRVol > 0 && item.rvol < minRVol) return false;
      if (filterFreshOnly && item.setup_status !== 'FRESH') return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        return item.symbol.toLowerCase().includes(q) || item.company_name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [bearishBoard, selectedSector, minStrength, minRVol, filterFreshOnly, searchTerm]);

  // Unified Strongest Stocks Board
  const strongestStocks = useMemo(() => {
    const combined = [...bullishBoard, ...bearishBoard];
    combined.sort((a, b) => b.strength_score - a.strength_score);
    return combined.slice(0, 25);
  }, [bullishBoard, bearishBoard]);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0d14', color: '#ffffff', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation & Status */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(16px)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
              &larr; Back
            </Link>

            <button
              onClick={() => setDrawerOpen(true)}
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
                cursor: 'pointer',
              }}
            >
              <Menu size={16} />
              <span>Drawer</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #ea580c 0%, #f59e0b 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 14px rgba(234, 88, 12, 0.4)',
                }}
              >
                <Target size={18} color="#ffffff" />
              </div>
              <div>
                <h1 style={{ fontSize: '1.05rem', fontWeight: 900, margin: 0, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>ORDER-BLOCK</span>
                  <span className="badge" style={{ background: 'rgba(234, 88, 12, 0.2)', color: '#ea580c', fontSize: '0.62rem', border: '1px solid rgba(234, 88, 12, 0.4)' }}>
                    SMC QUANT
                  </span>
                </h1>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  Smart Money Concepts &bull; Liquidity Analysis &bull; Intraday Strength Ranking
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                padding: '6px 12px',
                borderRadius: '7px',
                fontSize: '0.74rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Refresh Market Scan"
            >
              <RefreshCw size={13} className={refreshing ? 'spin-animation' : ''} />
              <span>{refreshing ? 'Scanning...' : 'Refresh'}</span>
            </button>

            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'right' }}>
              <span>Feed Updated:</span> <strong style={{ color: '#ffffff' }}>{lastScanTime || 'Active'}</strong>
            </div>
          </div>
        </div>

        {/* Live Indices Barometer */}
        <IndicesBarometer />
      </header>

      {/* Market Status Banner */}
      <MarketStatusBanner />

      {/* Main Body */}
      <main style={{ maxWidth: '1440px', margin: '0 auto', padding: '16px 18px 48px', width: '100%', boxSizing: 'border-box', flex: 1 }}>
        {/* PHASE 3: LIVE MARKET OVERVIEW CARDS */}
        {overview && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
            {/* 1. NIFTY 50 Benchmark */}
            <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '12px 14px' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                NIFTY 50 BENCHMARK
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 900 }}>₹{overview.indices.NIFTY_50.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: overview.indices.NIFTY_50.change >= 0 ? '#34d399' : '#f87171' }}>
                  {overview.indices.NIFTY_50.change >= 0 ? '+' : ''}{overview.indices.NIFTY_50.percent_change}%
                </span>
              </div>
              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Regime: <strong style={{ color: '#38bdf8' }}>{overview.market_regime.replace('_', ' ')}</strong>
              </div>
            </div>

            {/* 2. Advance / Decline Ratio */}
            <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '12px 14px' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                ADVANCE / DECLINE BREADTH
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 900, color: overview.advance_decline_ratio >= 1 ? '#34d399' : '#f87171' }}>
                  {overview.advance_decline_ratio}x
                </span>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  ({overview.advances} Adv / {overview.declines} Dec)
                </span>
              </div>
              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {overview.bullish_percentage}% Bullish Participation
              </div>
            </div>

            {/* 3. INDIA VIX Volatility */}
            <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '12px 14px' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                INDIA VIX VOLATILITY
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fbbf24' }}>
                  {overview.indices.INDIA_VIX.price}
                </span>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#34d399' }}>
                  {overview.indices.INDIA_VIX.percent_change}%
                </span>
              </div>
              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Status: <strong style={{ color: '#34d399' }}>LOW VOLATILITY REGIME</strong>
              </div>
            </div>

            {/* 4. Sector Rotation Summary */}
            <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '12px 14px' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                SECTOR ROTATION LEADERS
              </div>
              <div style={{ marginTop: '4px', fontSize: '0.80rem' }}>
                🟢 Leader: <strong style={{ color: '#34d399' }}>{overview.strongest_sector}</strong>
              </div>
              <div style={{ marginTop: '2px', fontSize: '0.80rem' }}>
                🔴 Laggard: <strong style={{ color: '#f87171' }}>{overview.weakest_sector}</strong>
              </div>
            </div>
          </div>
        )}

        {/* SECTION TABS */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: '16px',
            overflowX: 'auto',
          }}
          className="no-scrollbar"
        >
          {[
            { id: 'bullish', label: 'Bullish Board', icon: TrendingUp, color: '#10b981', count: bullishBoard.length },
            { id: 'bearish', label: 'Bearish Board', icon: TrendingDown, color: '#ef4444', count: bearishBoard.length },
            { id: 'strongest', label: 'Strongest Stocks', icon: Flame, color: '#f59e0b', count: strongestStocks.length },
            { id: 'liquidity', label: 'Liquidity Board', icon: Zap, color: '#38bdf8', count: liquidityBoard.length },
            { id: 'sectors', label: 'Sector Flow', icon: Layers, color: '#a855f7', count: sectorFlow.length },
            { id: 'xray', label: 'Market X-Ray', icon: Activity, color: '#06b6d4' },
            { id: 'playbook', label: 'Order Block Playbook', icon: Info, color: '#fbbf24' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  padding: '10px 16px',
                  fontSize: '0.82rem',
                  fontWeight: isActive ? 800 : 600,
                  color: isActive ? tab.color : 'var(--text-secondary)',
                  borderBottom: isActive ? `2px solid ${tab.color}` : '2px solid transparent',
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
                <Icon size={14} color={isActive ? tab.color : 'var(--text-muted)'} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    style={{
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: isActive ? `${tab.color}25` : 'rgba(255, 255, 255, 0.08)',
                      color: isActive ? tab.color : 'var(--text-muted)',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* FILTER TOOLBAR */}
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
          {/* Search Input */}
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search symbol or company (e.g. RELIANCE, TCS, MARUTI)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px 7px 34px',
                borderRadius: '7px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-subtle)',
                color: '#ffffff',
                fontSize: '0.78rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Sector Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)', fontWeight: 600 }}>Sector:</span>
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
              {sectorsList.map((sec) => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
            </select>
          </div>

          {/* Min Strength Score Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)', fontWeight: 600 }}>Min Strength:</span>
            <select
              value={minStrength}
              onChange={(e) => setMinStrength(Number(e.target.value))}
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
              <option value="0">All Strength</option>
              <option value="40">Strength &ge; 40</option>
              <option value="60">Strength &ge; 60 (Strong)</option>
              <option value="80">Strength &ge; 80 (Extreme)</option>
            </select>
          </div>

          {/* Min RVol */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)', fontWeight: 600 }}>RVol:</span>
            <select
              value={minRVol}
              onChange={(e) => setMinRVol(Number(e.target.value))}
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
              <option value="0">All Volume</option>
              <option value="1.0">RVol &ge; 1.0x</option>
              <option value="1.5">RVol &ge; 1.5x (Surge)</option>
            </select>
          </div>

          {/* Fresh Zones Only Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={filterFreshOnly}
              onChange={(e) => setFilterFreshOnly(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Fresh Zones Only</span>
          </label>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: BULLISH BOARD                                                      */}
        {/* ========================================================================= */}
        {activeTab === 'bullish' && (
          <div style={{ background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.7) 0%, rgba(10, 14, 23, 0.9) 100%)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: '1080px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.80rem' }}>
                <thead>
                  <tr style={{ background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.8) 100%)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <th style={{ padding: '12px 10px', width: '50px', textAlign: 'center' }}>RANK</th>
                    <th style={{ padding: '12px 12px', width: '160px' }}>SYMBOL &amp; COMPANY</th>
                    <th style={{ padding: '12px 10px', width: '110px', textAlign: 'right' }}>LTP &amp; CHG</th>
                    <th style={{ padding: '12px 10px', width: '120px', textAlign: 'center' }}>STRENGTH SCORE</th>
                    <th style={{ padding: '12px 10px', width: '85px', textAlign: 'center' }}>RVOL</th>
                    <th style={{ padding: '12px 12px', width: '145px' }}>ORDER BLOCK ZONE (Z)</th>
                    <th style={{ padding: '12px 10px', width: '105px', textAlign: 'right' }}>SUPPORT (S1)</th>
                    <th style={{ padding: '12px 10px', width: '110px', textAlign: 'right' }}>TARGET (R1)</th>
                    <th style={{ padding: '12px 10px', width: '110px', textAlign: 'center' }}>LIQUIDITY POOL</th>
                    <th style={{ padding: '12px 10px', width: '90px', textAlign: 'center' }}>STATUS</th>
                    <th style={{ padding: '12px 10px', width: '80px', textAlign: 'center' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBullish.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ padding: '48px 18px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No bullish setups match your active filter criteria. Try adjusting the filters above.
                      </td>
                    </tr>
                  ) : (
                    filteredBullish.map((item) => (
                      <tr
                        key={item.symbol}
                        onClick={() => openStockModal(item.symbol)}
                        style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', cursor: 'pointer', transition: 'background 0.15s ease' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(16, 185, 129, 0.04)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 800, color: item.rank <= 3 ? '#fbbf24' : 'var(--text-muted)' }}>
                          #{item.rank}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 800, color: '#ffffff', fontSize: '0.86rem' }}>{item.symbol}</div>
                          <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                            {item.company_name}
                          </div>
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 800 }}>₹{item.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: item.percent_change >= 0 ? '#34d399' : '#f87171' }}>
                            {item.percent_change >= 0 ? '+' : ''}{item.percent_change.toFixed(2)}%
                          </div>
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '42px', height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${item.strength_score}%`, height: '100%', background: item.strength_score >= 70 ? '#10b981' : '#38bdf8' }} />
                            </div>
                            <span style={{ fontWeight: 800, color: item.strength_score >= 70 ? '#34d399' : '#38bdf8', fontSize: '0.76rem' }}>
                              {item.strength_score}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 700, color: item.rvol >= 1.5 ? '#fbbf24' : '#e2e8f0' }}>
                          {item.rvol}x
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', padding: '2px 7px', borderRadius: '5px', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {item.order_block_zone}
                          </span>
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', color: '#f87171', fontWeight: 700 }}>
                          ₹{item.support_s1.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', color: '#34d399', fontWeight: 700 }}>
                          ₹{item.target_r1.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center', fontSize: '0.72rem', color: '#38bdf8' }}>
                          {item.liquidity_level}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                          <span style={{ fontSize: '0.64rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: item.setup_status === 'FRESH' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)', color: item.setup_status === 'FRESH' ? '#34d399' : 'var(--text-secondary)' }}>
                            {item.setup_status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openStockModal(item.symbol);
                            }}
                            style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.35)', color: '#38bdf8', borderRadius: '5px', padding: '4px 8px', fontSize: '0.68rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                          >
                            <BarChart2 size={12} />
                            <span>Chart</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}




        {/* ========================================================================= */}
        {/* TAB 2: BEARISH BOARD                                                      */}
        {/* ========================================================================= */}
        {activeTab === 'bearish' && (
          <div style={{ background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.7) 0%, rgba(10, 14, 23, 0.9) 100%)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: '1080px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.80rem' }}>
                <thead>
                  <tr style={{ background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.8) 100%)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <th style={{ padding: '12px 10px', width: '50px', textAlign: 'center' }}>RANK</th>
                    <th style={{ padding: '12px 12px', width: '160px' }}>SYMBOL &amp; COMPANY</th>
                    <th style={{ padding: '12px 10px', width: '110px', textAlign: 'right' }}>LTP &amp; CHG</th>
                    <th style={{ padding: '12px 10px', width: '120px', textAlign: 'center' }}>STRENGTH SCORE</th>
                    <th style={{ padding: '12px 10px', width: '85px', textAlign: 'center' }}>RVOL</th>
                    <th style={{ padding: '12px 12px', width: '145px' }}>ORDER BLOCK ZONE (Z)</th>
                    <th style={{ padding: '12px 10px', width: '105px', textAlign: 'right' }}>INVALIDATION (S1)</th>
                    <th style={{ padding: '12px 10px', width: '110px', textAlign: 'right' }}>TARGET (R1)</th>
                    <th style={{ padding: '12px 10px', width: '110px', textAlign: 'center' }}>LIQUIDITY POOL</th>
                    <th style={{ padding: '12px 10px', width: '90px', textAlign: 'center' }}>STATUS</th>
                    <th style={{ padding: '12px 10px', width: '80px', textAlign: 'center' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBearish.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ padding: '48px 18px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No bearish setups match your active filter criteria. Try adjusting the filters above.
                      </td>
                    </tr>
                  ) : (
                    filteredBearish.map((item) => (
                      <tr
                        key={item.symbol}
                        onClick={() => openStockModal(item.symbol)}
                        style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', cursor: 'pointer', transition: 'background 0.15s ease' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.04)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 800, color: item.rank <= 3 ? '#fbbf24' : 'var(--text-muted)' }}>
                          #{item.rank}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 800, color: '#ffffff', fontSize: '0.86rem' }}>{item.symbol}</div>
                          <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                            {item.company_name}
                          </div>
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 800 }}>₹{item.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: item.percent_change >= 0 ? '#34d399' : '#f87171' }}>
                            {item.percent_change >= 0 ? '+' : ''}{item.percent_change.toFixed(2)}%
                          </div>
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '42px', height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${item.strength_score}%`, height: '100%', background: item.strength_score >= 70 ? '#ef4444' : '#f97316' }} />
                            </div>
                            <span style={{ fontWeight: 800, color: item.strength_score >= 70 ? '#f87171' : '#f97316', fontSize: '0.76rem' }}>
                              {item.strength_score}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 700, color: item.rvol >= 1.5 ? '#fbbf24' : '#e2e8f0' }}>
                          {item.rvol}x
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '2px 7px', borderRadius: '5px', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {item.order_block_zone}
                          </span>
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', color: '#f87171', fontWeight: 700 }}>
                          ₹{item.support_s1.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', color: '#34d399', fontWeight: 700 }}>
                          ₹{item.target_r1.toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center', fontSize: '0.72rem', color: '#38bdf8' }}>
                          {item.liquidity_level}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                          <span style={{ fontSize: '0.64rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: item.setup_status === 'FRESH' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.08)', color: item.setup_status === 'FRESH' ? '#f87171' : 'var(--text-secondary)' }}>
                            {item.setup_status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openStockModal(item.symbol);
                            }}
                            style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.35)', color: '#38bdf8', borderRadius: '5px', padding: '4px 8px', fontSize: '0.68rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                          >
                            <BarChart2 size={12} />
                            <span>Chart</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}




        {/* ========================================================================= */}
        {/* TAB 3: STRONGEST STOCKS                                                   */}
        {/* ========================================================================= */}
        {activeTab === 'strongest' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
            {strongestStocks.map((item, idx) => {
              const isBull = item.trend_direction === 'BULLISH';
              return (
                <div
                  key={item.symbol}
                  onClick={() => openStockModal(item.symbol)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.75)',
                    border: isBull ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '12px',
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'none')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 900, color: idx < 3 ? '#fbbf24' : 'var(--text-muted)' }}>
                        #{idx + 1}
                      </span>
                      <strong style={{ fontSize: '0.98rem', color: '#ffffff' }}>{item.symbol}</strong>
                      <span style={{ fontSize: '0.64rem', padding: '2px 6px', borderRadius: '4px', background: isBull ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: isBull ? '#34d399' : '#f87171', fontWeight: 800 }}>
                        {item.trend_direction}
                      </span>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>₹{item.current_price.toFixed(2)}</div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: item.percent_change >= 0 ? '#34d399' : '#f87171' }}>
                        {item.percent_change >= 0 ? '+' : ''}{item.percent_change.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                    {item.company_name} &bull; {item.sector}
                  </div>

                  {/* Intraday Strength Bar */}
                  <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '10px', borderRadius: '8px', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Intraday Move / ADM-50 Ratio</span>
                      <strong style={{ color: isBull ? '#34d399' : '#f87171' }}>{item.strength_ratio}x Move ({item.strength_score} Score)</strong>
                    </div>
                    <div style={{ width: '100%', height: '5px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${item.strength_score}%`, height: '100%', background: isBull ? '#10b981' : '#ef4444' }} />
                    </div>
                  </div>

                  {/* Four Critical Levels Preview */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '0.66rem', textAlign: 'center' }}>
                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '6px', borderRadius: '6px' }}>
                      <div style={{ color: 'var(--text-muted)' }}>Zone (Z)</div>
                      <strong style={{ color: '#ffffff' }}>{item.order_block_zone}</strong>
                    </div>
                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '6px', borderRadius: '6px' }}>
                      <div style={{ color: 'var(--text-muted)' }}>Invalidation (S1)</div>
                      <strong style={{ color: '#f87171' }}>₹{item.support_s1.toFixed(2)}</strong>
                    </div>
                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '6px', borderRadius: '6px' }}>
                      <div style={{ color: 'var(--text-muted)' }}>Target (R1)</div>
                      <strong style={{ color: '#34d399' }}>₹{item.target_r1.toFixed(2)}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}




        {/* ========================================================================= */}
        {/* TAB 4: LIQUIDITY BOARD                                                    */}
        {/* ========================================================================= */}
        {activeTab === 'liquidity' && (
          <div style={{ background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.7) 0%, rgba(10, 14, 23, 0.9) 100%)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 800, margin: 0, color: '#38bdf8' }}>
                  Institutional Liquidity Sweeps, Pools &amp; Equal Levels
                </h3>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  Real-time mapping of Buy-Side Liquidity (BSL), Sell-Side Liquidity (SSL), and Failed Breakouts.
                </p>
              </div>
              <span className="badge" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontSize: '0.66rem' }}>
                {liquidityBoard.length} Active Events
              </span>
            </div>

            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: '980px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.80rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 14px' }}>SYMBOL</th>
                    <th style={{ padding: '10px 10px', textAlign: 'right' }}>PRICE &amp; CHG</th>
                    <th style={{ padding: '10px 10px' }}>EVENT TYPE</th>
                    <th style={{ padding: '10px 10px' }}>LEVEL DETAILS</th>
                    <th style={{ padding: '10px 10px', textAlign: 'center' }}>BIAS</th>
                    <th style={{ padding: '10px 10px', textAlign: 'center' }}>CONFLUENCE</th>
                    <th style={{ padding: '10px 10px', textAlign: 'center' }}>SCORE</th>
                    <th style={{ padding: '10px 10px', textAlign: 'center' }}>TIME</th>
                    <th style={{ padding: '10px 10px', textAlign: 'center' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {liquidityBoard.map((item, idx) => (
                    <tr
                      key={`${item.symbol}_${idx}`}
                      onClick={() => openStockModal(item.symbol)}
                      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', cursor: 'pointer' }}
                    >
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 800, color: '#ffffff' }}>{item.symbol}</div>
                        <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>{item.sector}</div>
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                        <div style={{ fontWeight: 800 }}>₹{item.current_price.toFixed(2)}</div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: item.percent_change >= 0 ? '#34d399' : '#f87171' }}>
                          {item.percent_change >= 0 ? '+' : ''}{item.percent_change.toFixed(2)}%
                        </div>
                      </td>
                      <td style={{ padding: '10px 10px' }}>
                        <span style={{ fontSize: '0.70rem', fontWeight: 800, color: item.event_type.includes('SWEEP') ? '#fbbf24' : '#38bdf8' }}>
                          {item.event_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '10px 10px', color: 'var(--text-secondary)' }}>
                        {item.level_details}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.64rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: item.bias === 'BULLISH' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: item.bias === 'BULLISH' ? '#34d399' : '#f87171' }}>
                          {item.bias}
                        </span>
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center', color: '#c084fc', fontSize: '0.72rem', fontWeight: 700 }}>
                        {item.confluence}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 800, color: '#ffffff' }}>
                        {item.score}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.70rem' }}>
                        {item.timestamp}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openStockModal(item.symbol);
                          }}
                          style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.35)', color: '#38bdf8', borderRadius: '5px', padding: '4px 8px', fontSize: '0.68rem', cursor: 'pointer' }}
                        >
                          Chart ↗
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}




        {/* ========================================================================= */}
        {/* TAB 5: SECTOR FLOW                                                        */}
        {/* ========================================================================= */}
        {activeTab === 'sectors' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '14px' }}>
            {sectorFlow.map((sec) => {
              const isBull = sec.percent_change >= 0;
              return (
                <div
                  key={sec.sector}
                  style={{
                    background: 'rgba(15, 23, 42, 0.75)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    padding: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '0.94rem', color: '#ffffff' }}>{sec.sector}</strong>
                    <span style={{ fontSize: '0.84rem', fontWeight: 800, color: isBull ? '#34d399' : '#f87171' }}>
                      {isBull ? '+' : ''}{sec.percent_change.toFixed(2)}%
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    <span>Avg Strength: <strong style={{ color: '#38bdf8' }}>{sec.avg_strength_score}</strong></span>
                    <span>{sec.advances} Adv &bull; {sec.declines} Dec</span>
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '8px 10px', borderRadius: '7px', fontSize: '0.72rem', display: 'flex', justifyContent: 'space-between' }}>
                    <div>Leader: <strong style={{ color: '#34d399' }}>{sec.top_leader}</strong></div>
                    <div>Laggard: <strong style={{ color: '#f87171' }}>{sec.top_laggard}</strong></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}




        {/* ========================================================================= */}
        {/* TAB 6: MARKET X-RAY & BREADTH                                             */}
        {/* ========================================================================= */}
        {activeTab === 'xray' && overview && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.75)', border: '1px solid var(--border-subtle)', borderRadius: '14px', padding: '20px' }}>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#38bdf8', margin: '0 0 12px 0' }}>
                Advance / Decline Participation Ratio
              </h3>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: overview.advance_decline_ratio >= 1 ? '#34d399' : '#f87171' }}>
                {overview.advance_decline_ratio} : 1.0
              </div>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                {overview.advances} stocks advancing out of {overview.total_stocks_scanned} actively tracked universe constituents.
              </p>
              <div style={{ width: '100%', height: '8px', background: 'rgba(239, 68, 68, 0.3)', borderRadius: '4px', overflow: 'hidden', marginTop: '14px' }}>
                <div style={{ width: `${overview.bullish_percentage}%`, height: '100%', background: '#10b981' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.70rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                <span>{overview.bullish_percentage}% Advancing</span>
                <span>{overview.bearish_percentage}% Declining</span>
              </div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.75)', border: '1px solid var(--border-subtle)', borderRadius: '14px', padding: '20px' }}>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#38bdf8', margin: '0 0 12px 0' }}>
                Trend Breadth: % Above 20 EMA
              </h3>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: overview.above_20_ema_pct >= 50 ? '#34d399' : '#f87171' }}>
                {overview.above_20_ema_pct}%
              </div>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                Proportion of constituents trading strictly above their 20-period moving average on the intraday 15m timeframe.
              </p>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden', marginTop: '14px' }}>
                <div style={{ width: `${overview.above_20_ema_pct}%`, height: '100%', background: '#38bdf8' }} />
              </div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.75)', border: '1px solid var(--border-subtle)', borderRadius: '14px', padding: '20px' }}>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#38bdf8', margin: '0 0 12px 0' }}>
                Market Regime Classification
              </h3>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fbbf24', marginTop: '8px' }}>
                {overview.market_regime.replace('_', ' ')}
              </div>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.5 }}>
                Current market conditions reflect high institutional focus on trend continuation with sector rotation into {overview.strongest_sector}.
              </p>
            </div>
          </div>
        )}




        {/* ========================================================================= */}
        {/* TAB 7: PLAYBOOK & DOCUMENTATION                                           */}
        {/* ========================================================================= */}
        {activeTab === 'playbook' && (
          <div style={{ background: 'rgba(15, 23, 42, 0.75)', border: '1px solid var(--border-subtle)', borderRadius: '14px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#ffffff', margin: '0 0 8px 0' }}>
              Order Block &amp; Smart Money Trading Playbook
            </h2>
            <p style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', margin: '0 0 20px 0' }}>
              A quantitative guide to trading institutional footprints, Order Blocks, and Liquidity Pools with zero look-ahead bias.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', padding: '16px' }}>
                <strong style={{ color: '#34d399', fontSize: '0.90rem' }}>1. Bullish Order Block Formation</strong>
                <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
                  The last down-close candle preceding an impulsive displacement that breaks a swing high (BOS). This forms a high-probability demand zone on retest.
                </p>
              </div>

              <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '16px' }}>
                <strong style={{ color: '#f87171', fontSize: '0.90rem' }}>2. Bearish Order Block Formation</strong>
                <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
                  The last up-close candle preceding an impulsive downward displacement that breaks a swing low (BOS). Acts as an institutional supply barrier on pullbacks.
                </p>
              </div>

              <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '10px', padding: '16px' }}>
                <strong style={{ color: '#38bdf8', fontSize: '0.90rem' }}>3. The Four Critical Levels (Z, S1, R1, R2)</strong>
                <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
                  <strong>Z</strong>: The Order Block zone.<br />
                  <strong>S1</strong>: Setup Invalidation level (SL).<br />
                  <strong>R1</strong>: Nearest liquidity pool / 2R target.<br />
                  <strong>R2</strong>: Extended structural target / 3.5R.
                </p>
              </div>

              <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', padding: '16px' }}>
                <strong style={{ color: '#fbbf24', fontSize: '0.90rem' }}>4. Baseline Intraday Strength Formula</strong>
                <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
                  <code>Strength = One-Directional Move / ADM-50</code><br />
                  Requires: <code>Larger Move &gt; 2 &times; Opposite Move</code> to filter choppy sideways consolidation.
                </p>
              </div>
            </div>
          </div>
        )}



      </main>

      {/* ========================================================================= */}
      {/* PHASE 9: STOCK ORDER BLOCK & FOUR CRITICAL LEVELS MODAL                   */}
      {/* ========================================================================= */}
      {selectedStock && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            boxSizing: 'border-box',
          }}
          onClick={() => setSelectedStock(null)}
        >
          <div
            style={{
              background: '#0e1422',
              border: '1px solid var(--border-subtle)',
              borderRadius: '16px',
              maxWidth: '920px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              boxSizing: 'border-box',
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {modalLoading || !selectedStockDetail ? (
              <div style={{ padding: '64px', textAlign: 'center' }}>
                <RefreshCw size={32} className="spin-animation" color="#ea580c" />
                <div style={{ marginTop: '12px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                  Calculating Multi-Timeframe Order Blocks for {selectedStock}...
                </div>
              </div>
            ) : (
              <div>
                {/* Modal Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h2 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0 }}>
                        {selectedStockDetail.symbol}
                      </h2>
                      <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '5px', background: selectedStockDetail.bias === 'BULLISH' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: selectedStockDetail.bias === 'BULLISH' ? '#34d399' : '#f87171', fontWeight: 800 }}>
                        {selectedStockDetail.bias} ORDER BLOCK SETUP
                      </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {selectedStockDetail.company_name} &bull; {selectedStockDetail.sector}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>₹{selectedStockDetail.current_price.toFixed(2)}</div>
                      <div style={{ fontSize: '0.74rem', fontWeight: 800, color: selectedStockDetail.percent_change >= 0 ? '#34d399' : '#f87171' }}>
                        {selectedStockDetail.percent_change >= 0 ? '+' : ''}{selectedStockDetail.percent_change.toFixed(2)}%
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedStock(null)}
                      style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid var(--border-subtle)', color: '#ffffff', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      &times;
                    </button>
                  </div>
                </div>

                {/* Timeframe Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)', fontWeight: 700 }}>TIMEFRAME:</span>
                  {['5m', '15m', '1H', '1D'].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => handleTimeframeChange(tf)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: modalTimeframe === tf ? '1px solid #ea580c' : '1px solid var(--border-subtle)',
                        background: modalTimeframe === tf ? 'rgba(234, 88, 12, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                        color: modalTimeframe === tf ? '#ea580c' : 'var(--text-secondary)',
                      }}
                    >
                      {tf}
                    </button>
                  ))}
                </div>

                {/* THE FOUR CRITICAL LEVELS CARDS */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.04em' }}>
                    THE FOUR CRITICAL LEVELS
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    {/* Z Level */}
                    <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#38bdf8' }}>
                        {selectedStockDetail.four_critical_levels.Z_order_block_zone.label}
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
                        {selectedStockDetail.four_critical_levels.Z_order_block_zone.display}
                      </div>
                      <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {selectedStockDetail.four_critical_levels.Z_order_block_zone.description}
                      </div>
                    </div>

                    {/* S1 Level */}
                    <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f87171' }}>
                        {selectedStockDetail.four_critical_levels.S1_invalidation.label}
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#f87171', marginTop: '4px' }}>
                        {selectedStockDetail.four_critical_levels.S1_invalidation.display}
                      </div>
                      <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {selectedStockDetail.four_critical_levels.S1_invalidation.description}
                      </div>
                    </div>

                    {/* R1 Level */}
                    <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#34d399' }}>
                        {selectedStockDetail.four_critical_levels.R1_first_target.label}
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#34d399', marginTop: '4px' }}>
                        {selectedStockDetail.four_critical_levels.R1_first_target.display}
                      </div>
                      <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {selectedStockDetail.four_critical_levels.R1_first_target.description}
                      </div>
                    </div>

                    {/* R2 Level */}
                    <div style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#c084fc' }}>
                        {selectedStockDetail.four_critical_levels.R2_second_target.label}
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#c084fc', marginTop: '4px' }}>
                        {selectedStockDetail.four_critical_levels.R2_second_target.display}
                      </div>
                      <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {selectedStockDetail.four_critical_levels.R2_second_target.description}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Intraday Strength Metrics Strip */}
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', padding: '14px', marginBottom: '20px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', marginBottom: '8px' }}>
                    INTRADAY STRENGTH &amp; VOLATILITY NORMALIZATION
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', fontSize: '0.74rem' }}>
                    <div>Average Daily Move (ADM-50): <strong>₹{selectedStockDetail.intraday_strength.adm_50}</strong></div>
                    <div>Up Move from Open: <strong style={{ color: '#34d399' }}>₹{selectedStockDetail.intraday_strength.up_move}</strong></div>
                    <div>Opposite Move: <strong style={{ color: '#f87171' }}>₹{selectedStockDetail.intraday_strength.opposite_move}</strong></div>
                    <div>Directional Ratio: <strong>{selectedStockDetail.intraday_strength.strength_ratio}x ADM</strong></div>
                    <div>Normalized Strength Score: <strong style={{ color: '#34d399' }}>{selectedStockDetail.intraday_strength.strength_score} / 100</strong></div>
                  </div>
                </div>

                {/* TradingView Lightweight Charts Visual Canvas & Execution Trigger */}
                <div style={{ marginTop: '16px' }}>
                  <TradingViewLightweightChart
                    symbol={selectedStockDetail.symbol}
                    companyName={selectedStockDetail.company_name}
                    currentPrice={selectedStockDetail.current_price}
                    percentChange={selectedStockDetail.percent_change}
                    candles={selectedStockDetail.candles}
                    orderBlocks={selectedStockDetail.all_bullish_obs?.concat(selectedStockDetail.all_bearish_obs || [])}
                    criticalLevels={{
                      Z: selectedStockDetail.four_critical_levels?.Z_order_block_zone,
                      S1: selectedStockDetail.four_critical_levels?.S1_invalidation,
                      R1: selectedStockDetail.four_critical_levels?.R1_first_target,
                      R2: selectedStockDetail.four_critical_levels?.R2_second_target,
                    }}
                    activeSetup={selectedStockDetail.active_setup}
                    timeframe={modalTimeframe}
                    onTimeframeChange={handleTimeframeChange}
                    onOrderClick={(sym, side) => {
                      setOrderModalSide(side);
                      setOrderModalOpen(true);
                    }}
                    height={380}
                  />

                  {/* Fast Action Desk Trigger */}
                  <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                    <button
                      onClick={() => {
                        setOrderModalSide('BUY');
                        setOrderModalOpen(true);
                      }}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#ffffff',
                        fontWeight: 900,
                        fontSize: '0.84rem',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                      }}
                    >
                      <TrendingUp size={16} /> BUY THIS SETUP (PAPER OMS)
                    </button>
                    <button
                      onClick={() => {
                        setOrderModalSide('SELL');
                        setOrderModalOpen(true);
                      }}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        color: '#ffffff',
                        fontWeight: 900,
                        fontSize: '0.84rem',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                      }}
                    >
                      <TrendingDown size={16} /> SELL THIS SETUP (PAPER OMS)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Paper Order Placement Modal */}
      {selectedStockDetail && (
        <PaperOrderModal
          isOpen={orderModalOpen}
          onClose={() => setOrderModalOpen(false)}
          symbol={selectedStockDetail.symbol}
          companyName={selectedStockDetail.company_name}
          initialSide={orderModalSide}
          initialPrice={selectedStockDetail.current_price}
          initialStopLoss={selectedStockDetail.four_critical_levels?.S1_invalidation?.price}
          initialTarget={selectedStockDetail.four_critical_levels?.R1_first_target?.price}
          onOrderPlaced={() => {
            fetchData();
          }}
        />
      )}

      {/* Navigation Drawer */}
      {drawerOpen && <NavigationDrawer onClose={() => setDrawerOpen(false)} />}
    </div>
  );
}
