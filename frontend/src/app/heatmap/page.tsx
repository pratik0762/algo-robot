"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Grid,
  Layers,
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ShieldCheck,
  Menu,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sliders,
  BarChart2,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  Zap,
  Save,
  Download,
  FolderOpen,
  Filter,
  Maximize2,
  Minimize2,
  Flame,
  Star,
  Eye,
  Columns,
  Crosshair,
  Compass,
  FileText,
  SlidersHorizontal
} from 'lucide-react';

import NavigationDrawer from '@/components/NavigationDrawer';
import IndicesBarometer from '@/components/IndicesBarometer';
import { getApiBase } from '@/config/api';

// -----------------------------------------------------------------------------
// TYPE DEFINITIONS
// -----------------------------------------------------------------------------
interface HeatmapTile {
  symbol: string;
  bse_code?: string;
  name: string;
  sector: string;
  industry: string;
  cap_category: string;
  primary_exchange: string;
  bse_listed: boolean;
  options_eligible: boolean;
  indices: string[];
  market_cap_cr: number;
  free_float_mcap_cr?: number;
  nifty50_weight: number;
  sensex_weight: number;
  price: number;
  change: number;
  percent_change: number;
  open: number;
  high: number;
  low: number;
  vwap: number;
  volume: number;
  traded_value_cr: number;
  volume_ratio: number;
  group: string;
  size_weight: number;
  metric_value: number;
  metric_label: string;
  color: string;
  technicals: {
    rsi: number;
    ema_20: number;
    ema_50: number;
    ema_200: number;
    above_20_ema: boolean;
    above_50_ema: boolean;
    above_200_ema: boolean;
    "52w_high": number;
    "52w_low": number;
    dist_52w_high_pct: number;
  };
  intraday: {
    "5m": number;
    "15m": number;
    "30m": number;
    "1h": number;
    since_open: number;
  };
  long_term: {
    "1d": number;
    "1w": number;
    "2w": number;
    "1m": number;
    "3m": number;
    "6m": number;
    "1y": number;
    ytd: number;
  };
  volatility: {
    atr: number;
    atr_pct: number;
    historical_vol: number;
    gap_pct: number;
    daily_range_pct: number;
  };
}

interface SectorSummaryItem {
  sector: string;
  stocks_count: number;
  advances: number;
  declines: number;
  equal_weighted_return_pct: number;
  mcap_weighted_return_pct: number;
  total_mcap_cr: number;
  total_turnover_cr: number;
  top_gainers: { symbol: string; change: number }[];
  top_losers: { symbol: string; change: number }[];
  color: string;
}

interface IndexContributor {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  percent_change: number;
  weight_pct: number;
  index_points_contribution: number;
  is_positive: boolean;
}

// -----------------------------------------------------------------------------
// TRUE SQUARIFIED TREEMAP ALGORITHM (BRULS-HUIZING-VAN WIJK)
// -----------------------------------------------------------------------------
interface RectBox {
  x: number;
  y: number;
  w: number;
  h: number;
  tile: HeatmapTile;
}

interface SectorCluster {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  avgChange: number;
  boxes: RectBox[];
}

function squarifyAlgorithm<T extends { size_weight: number }>(
  items: T[],
  x: number,
  y: number,
  w: number,
  h: number
): { item: T; x: number; y: number; w: number; h: number }[] {
  if (!items || items.length === 0 || w <= 0 || h <= 0) return [];

  // Sort descending by weight
  const sorted = [...items].sort((a, b) => b.size_weight - a.size_weight);
  const totalWeight = sorted.reduce((acc, it) => acc + Math.max(1, it.size_weight), 0);
  if (totalWeight <= 0) return [];

  const totalArea = w * h;
  const normalized = sorted.map(it => ({
    item: it,
    area: (Math.max(1, it.size_weight) * totalArea) / totalWeight
  }));

  const results: { item: T; x: number; y: number; w: number; h: number }[] = [];

  function worst(row: typeof normalized, side: number): number {
    const rSum = row.reduce((s, it) => s + it.area, 0);
    if (rSum === 0 || side === 0) return 999999;
    const sideSq = side * side;
    const rSq = rSum * rSum;
    let maxRatio = 0;
    for (const r of row) {
      if (r.area <= 0) continue;
      const ratio = Math.max((sideSq * r.area) / rSq, rSq / (sideSq * r.area));
      if (ratio > maxRatio) maxRatio = ratio;
    }
    return maxRatio;
  }

  function layoutRow(
    row: typeof normalized,
    rx: number,
    ry: number,
    rw: number,
    rh: number
  ) {
    const rSum = row.reduce((s, it) => s + it.area, 0);
    if (rSum === 0) return;
    const isHoriz = rw >= rh;
    if (isHoriz) {
      const stripW = rSum / rh;
      let curY = ry;
      for (const r of row) {
        const boxH = stripW > 0 ? r.area / stripW : 0;
        results.push({ item: r.item, x: rx, y: curY, w: stripW, h: boxH });
        curY += boxH;
      }
    } else {
      const stripH = rSum / rw;
      let curX = rx;
      for (const r of row) {
        const boxW = stripH > 0 ? r.area / stripH : 0;
        results.push({ item: r.item, x: curX, y: ry, w: boxW, h: stripH });
        curX += boxW;
      }
    }
  }

  function recurse(
    children: typeof normalized,
    rx: number,
    ry: number,
    rw: number,
    rh: number
  ) {
    if (!children || children.length === 0 || rw <= 0 || rh <= 0) return;
    if (children.length === 1) {
      results.push({ item: children[0].item, x: rx, y: ry, w: rw, h: rh });
      return;
    }

    const side = Math.min(rw, rh);
    const row = [children[0]];
    let i = 1;
    while (i < children.length) {
      const cand = children[i];
      if (worst([...row, cand], side) <= worst(row, side)) {
        row.push(cand);
        i++;
      } else {
        break;
      }
    }

    layoutRow(row, rx, ry, rw, rh);
    const rSum = row.reduce((s, it) => s + it.area, 0);
    const isHoriz = rw >= rh;
    if (isHoriz) {
      const stripW = rh > 0 ? rSum / rh : 0;
      recurse(children.slice(i), rx + stripW, ry, Math.max(0, rw - stripW), rh);
    } else {
      const stripH = rw > 0 ? rSum / rw : 0;
      recurse(children.slice(i), rx, ry + stripH, rw, Math.max(0, rh - stripH));
    }
  }

  recurse(normalized, x, y, w, h);
  return results;
}

function computeSectorClusters(
  items: HeatmapTile[],
  containerWidth: number,
  containerHeight: number,
  isGroupedBySector: boolean
): SectorCluster[] {
  if (!items || items.length === 0 || containerWidth <= 0 || containerHeight <= 0) return [];

  if (!isGroupedBySector) {
    const flatBoxes = squarifyAlgorithm(items, 0, 0, containerWidth, containerHeight);
    return [{
      name: 'ALL STOCKS',
      x: 0,
      y: 0,
      w: containerWidth,
      h: containerHeight,
      avgChange: items.reduce((acc, it) => acc + it.percent_change, 0) / items.length,
      boxes: flatBoxes.map(b => ({
        x: Math.round(b.x),
        y: Math.round(b.y),
        w: Math.max(2, Math.round(b.w)),
        h: Math.max(2, Math.round(b.h)),
        tile: b.item
      }))
    }];
  }

  // 1. Group by sector
  const sectorMap: { [sec: string]: HeatmapTile[] } = {};
  for (const it of items) {
    const sec = it.sector || 'Other';
    if (!sectorMap[sec]) sectorMap[sec] = [];
    sectorMap[sec].push(it);
  }

  const sectorList = Object.entries(sectorMap).map(([secName, secItems]) => {
    const totalW = secItems.reduce((acc, it) => acc + Math.max(1, it.size_weight), 0);
    const avgChg = secItems.reduce((acc, it) => acc + it.percent_change, 0) / secItems.length;
    return {
      name: secName,
      size_weight: totalW,
      avgChange: avgChg,
      stocks: secItems
    };
  });

  // Sort sectors by total weight
  sectorList.sort((a, b) => b.size_weight - a.size_weight);

  // 2. Layout sector bounding boxes across the full container
  const sectorBoxes = squarifyAlgorithm(sectorList, 0, 0, containerWidth, containerHeight);

  const clusters: SectorCluster[] = [];

  for (const secBox of sectorBoxes) {
    const sec = secBox.item;
    const headerHeight = secBox.h > 90 ? 24 : secBox.h > 50 ? 18 : 12;
    const subX = secBox.x + 2;
    const subY = secBox.y + headerHeight;
    const subW = Math.max(4, secBox.w - 4);
    const subH = Math.max(4, secBox.h - headerHeight - 2);

    const stockBoxes = squarifyAlgorithm(sec.stocks, subX, subY, subW, subH);

    clusters.push({
      name: sec.name,
      x: Math.round(secBox.x),
      y: Math.round(secBox.y),
      w: Math.max(4, Math.round(secBox.w)),
      h: Math.max(4, Math.round(secBox.h)),
      avgChange: sec.avgChange,
      boxes: stockBoxes.map(b => ({
        x: Math.round(b.x),
        y: Math.round(b.y),
        w: Math.max(2, Math.round(b.w)),
        h: Math.max(2, Math.round(b.h)),
        tile: b.item
      }))
    });
  }

  return clusters;
}


export default function MarketHeatmapPage() {
  const [navDrawerOpen, setNavDrawerOpen] = useState<boolean>(false);
  const [treemapDisplayMode, setTreemapDisplayMode] = useState<'treemap' | 'grid'>('treemap');
  const [hoveredTile, setHoveredTile] = useState<{ tile: HeatmapTile; x: number; y: number } | null>(null);

  // Filter States
  const [exchange, setExchange] = useState<'ALL' | 'NSE' | 'BSE'>('ALL');
  const [indexFilter, setIndexFilter] = useState<string>('NIFTY 50');
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');
  const [capCategory, setCapCategory] = useState<string>('ALL');
  const [heatmapMode, setHeatmapMode] = useState<string>('daily');
  const [sizeBy, setSizeBy] = useState<string>('market_cap');
  const [groupBy, setGroupBy] = useState<string>('sector');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  // Tab View Modes: Treemap vs Sector Overview vs Index Contribution vs Screener vs Comparison
  const [activeTab, setActiveTab] = useState<'treemap' | 'sectors' | 'index_contrib' | 'screener' | 'compare'>('treemap');

  // Comparison State
  const [compareA, setCompareA] = useState<string>('NIFTY 50');
  const [compareB, setCompareB] = useState<string>('NIFTY NEXT 50');

  // Watchlist State (Persisted)
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState<boolean>(false);

  // Data States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [heatmapData, setHeatmapData] = useState<any | null>(null);
  const [sectorsData, setSectorsData] = useState<SectorSummaryItem[]>([]);
  const [indexContribData, setIndexContribData] = useState<any | null>(null);
  const [screenerData, setScreenerData] = useState<any | null>(null);

  // Selected Stock Details Drawer
  const [selectedStock, setSelectedStock] = useState<HeatmapTile | null>(null);
  const [stockDetailDrawerOpen, setStockDetailDrawerOpen] = useState<boolean>(false);

  // Treemap Container Ref for Responsive Calculations
  const treemapContainerRef = useRef<HTMLDivElement>(null);
  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number }>({ width: 1400, height: 750 });

  // Load Saved Watchlist
  useEffect(() => {
    try {
      const saved = localStorage.getItem('algo_robot_heatmap_watchlist');
      if (saved) {
        setWatchlist(JSON.parse(saved));
      } else {
        setWatchlist(['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'BHARTIARTL']);
      }
    } catch (_) {}
  }, []);

  const toggleWatchlist = (symbol: string) => {
    setWatchlist(prev => {
      const updated = prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol];
      try {
        localStorage.setItem('algo_robot_heatmap_watchlist', JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
  };

  // Resize Observer for Treemap Container
  useEffect(() => {
    if (!treemapContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setContainerDimensions({
            width: Math.floor(entry.contentRect.width),
            height: Math.floor(entry.contentRect.height)
          });
        }
      }
    });
    observer.observe(treemapContainerRef.current);
    return () => observer.disconnect();
  }, [isFullScreen, activeTab]);

  // 1. Fetch Heatmap Main Dataset
  const fetchHeatmapData = useCallback(async () => {
    setIsLoading(true);
    try {
      const url = `${getApiBase()}/api/heatmap/data?exchange=${exchange}&index=${encodeURIComponent(indexFilter)}&sector=${encodeURIComponent(sectorFilter)}&cap_category=${capCategory}&mode=${heatmapMode}&group_by=${groupBy}&size_by=${sizeBy}&search=${encodeURIComponent(searchQuery)}&limit=500`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setHeatmapData(json);
      }
    } catch (err) {
      console.error('Error loading heatmap dataset:', err);
    } finally {
      setIsLoading(false);
    }
  }, [exchange, indexFilter, sectorFilter, capCategory, heatmapMode, groupBy, sizeBy, searchQuery]);

  // 2. Fetch Sector Summaries
  const fetchSectorSummary = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/heatmap/sectors`);
      if (res.ok) {
        const json = await res.json();
        setSectorsData(json.sectors || []);
      }
    } catch (err) {
      console.error('Error loading sector summary:', err);
    }
  }, []);

  // 3. Fetch Index Points Contribution
  const fetchIndexContribution = useCallback(async (symbol: string) => {
    try {
      const res = await fetch(`${getApiBase()}/api/heatmap/index/${encodeURIComponent(symbol)}`);
      if (res.ok) {
        const json = await res.json();
        setIndexContribData(json);
      }
    } catch (err) {
      console.error('Error loading index contribution:', err);
    }
  }, []);

  // 4. Fetch Screener Candidates
  const fetchScreenerCandidates = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/heatmap/smart-candidates`);
      if (res.ok) {
        const json = await res.json();
        setScreenerData(json);
      }
    } catch (err) {
      console.error('Error loading screener candidates:', err);
    }
  }, []);

  // Initial Data Load
  useEffect(() => {
    fetchHeatmapData();
    fetchSectorSummary();
    fetchIndexContribution(indexFilter);
    fetchScreenerCandidates();
  }, [fetchHeatmapData, fetchSectorSummary, fetchIndexContribution, fetchScreenerCandidates, indexFilter]);

  // Filtered Items (Including Watchlist filter)
  const displayItems = useMemo(() => {
    if (!heatmapData?.items) return [];
    if (showWatchlistOnly) {
      return heatmapData.items.filter((it: HeatmapTile) => watchlist.includes(it.symbol));
    }
    return heatmapData.items;
  }, [heatmapData, showWatchlistOnly, watchlist]);

  // Calculate Sector Clusters and Squarified Treemap Boxes
  const sectorClusters = useMemo(() => {
    if (!displayItems || displayItems.length === 0) return [];
    const containerW = Math.max(600, containerDimensions.width);
    const containerH = Math.max(450, containerDimensions.height);
    return computeSectorClusters(
      displayItems,
      containerW,
      containerH,
      groupBy === 'sector'
    );
  }, [displayItems, containerDimensions, groupBy]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-main, #050811)',
      color: 'var(--text-primary, #ffffff)',
      paddingBottom: isFullScreen ? '0' : '60px'
    }}>
      {/* Platform Navigation Drawer */}
      <NavigationDrawer isOpen={navDrawerOpen} onClose={() => setNavDrawerOpen(false)} />

      {/* Top Benchmark Indices Barometer */}
      {!isFullScreen && (
        <div style={{ borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', background: 'rgba(5, 8, 17, 0.95)', position: 'sticky', top: 0, zIndex: 40 }}>
          <IndicesBarometer />
        </div>
      )}

      {/* Main Container */}
      <div style={{
        maxWidth: isFullScreen ? '100%' : '1800px',
        margin: '0 auto',
        padding: isFullScreen ? '12px' : '16px 20px'
      }}>

        {/* Top Header & Drawer Trigger */}
        {!isFullScreen && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                  cursor: 'pointer',
                }}
              >
                <Menu size={16} />
                <span>Drawer</span>
              </button>
            </div>

            {/* Session Indicator Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                fontSize: '0.74rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '6px',
                background: heatmapData?.session_info?.is_market_open ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${heatmapData?.session_info?.is_market_open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                color: heatmapData?.session_info?.is_market_open ? '#34d399' : '#f87171',
                fontWeight: 700
              }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: heatmapData?.session_info?.is_market_open ? '#10b981' : '#ef4444' }}></span>
                {heatmapData?.session_info?.session_status === 'LIVE' ? 'MARKET LIVE • CONTINUOUS TRADING' : 'MARKET CLOSED • SATURDAY / HOLIDAY'}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {heatmapData?.session_info?.current_time_ist || '09:15 - 15:30 IST'}
              </span>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* HEADER CONTROLS BAR: EXCHANGES, INDICES, MODES & FILTERS       */}
        {/* ============================================================== */}
        <div style={{
          background: 'var(--bg-card, #0d131f)',
          border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '12px 18px',
          marginBottom: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {/* Row 1: Exchange Tabs & Primary Tab Modes */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            {/* Exchange Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 700, marginRight: '4px' }}>EXCHANGE:</span>
              {(['ALL', 'NSE', 'BSE'] as const).map(ex => (
                <button
                  key={ex}
                  onClick={() => setExchange(ex)}
                  style={{
                    padding: '5px 14px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    border: 'none',
                    background: exchange === ex ? 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)' : 'rgba(255, 255, 255, 0.05)',
                    color: exchange === ex ? '#ffffff' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {ex === 'ALL' ? 'ALL INDIAN EQUITIES' : ex}
                </button>
              ))}
            </div>

            {/* View Mode Tabs (Treemap, Sectors, Index Contribution, Screener, Compare) */}
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(15, 23, 42, 0.8)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setActiveTab('treemap')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: activeTab === 'treemap' ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'transparent',
                  color: activeTab === 'treemap' ? '#ffffff' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Grid size={14} />
                Treemap Heatmap
              </button>
              <button
                onClick={() => setActiveTab('sectors')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: activeTab === 'sectors' ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'transparent',
                  color: activeTab === 'sectors' ? '#ffffff' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Layers size={14} />
                Sector Overview
              </button>
              <button
                onClick={() => setActiveTab('index_contrib')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: activeTab === 'index_contrib' ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'transparent',
                  color: activeTab === 'index_contrib' ? '#ffffff' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Activity size={14} />
                Index Points Contribution
              </button>
              <button
                onClick={() => setActiveTab('screener')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: activeTab === 'screener' ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : 'transparent',
                  color: activeTab === 'screener' ? '#ffffff' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Zap size={14} />
                Smart Screener
              </button>
              <button
                onClick={() => setActiveTab('compare')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: activeTab === 'compare' ? 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)' : 'transparent',
                  color: activeTab === 'compare' ? '#ffffff' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Columns size={14} />
                Dual Compare
              </button>
            </div>
          </div>

          {/* Row 2: Index Quick Filters Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>INDICES:</span>
            {[
              { label: 'All Stocks', id: 'ALL' },
              { label: 'Nifty 50', id: 'NIFTY 50' },
              { label: 'Nifty Next 50', id: 'NIFTY NEXT 50' },
              { label: 'Nifty 500', id: 'NIFTY 500' },
              { label: 'Nifty Midcap 100', id: 'NIFTY MIDCAP 100' },
              { label: 'Nifty Smallcap 100', id: 'NIFTY SMALLCAP 100' },
              { label: 'SENSEX 30', id: 'SENSEX' },
              { label: 'BSE 500', id: 'BSE 500' },
              { label: 'Nifty Bank', id: 'NIFTY BANK' },
              { label: 'Nifty IT', id: 'NIFTY IT' },
              { label: 'Nifty Auto', id: 'NIFTY AUTO' },
              { label: 'Nifty Pharma', id: 'NIFTY PHARMA' }
            ].map(idx => (
              <button
                key={idx.id}
                onClick={() => setIndexFilter(idx.id)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  border: indexFilter === idx.id ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                  background: indexFilter === idx.id ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                  color: indexFilter === idx.id ? '#38bdf8' : 'var(--text-secondary)'
                }}
              >
                {idx.label}
              </button>
            ))}
          </div>

          {/* Row 3: Mode, Size, Grouping, Cap, Search & Fullscreen */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Heatmap Mode (8 Modes) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Mode:</span>
                <select
                  value={heatmapMode}
                  onChange={e => setHeatmapMode(e.target.value)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '0.74rem',
                    padding: '5px 10px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="daily">📈 Mode 1: Daily Performance (% Change)</option>
                  <option value="intraday_5m">⏱️ Mode 2: Intraday (5-Minute Change)</option>
                  <option value="intraday_15m">⏱️ Mode 2: Intraday (15-Minute Change)</option>
                  <option value="intraday_1h">⏱️ Mode 2: Intraday (1-Hour Change)</option>
                  <option value="weekly_1w">📅 Mode 3: Weekly (1-Week Performance)</option>
                  <option value="monthly_1m">📅 Mode 3: Monthly (1-Month Performance)</option>
                  <option value="longterm_1y">🗓️ Mode 4: Long-Term (1-Year Performance)</option>
                  <option value="ytd">🗓️ Mode 4: Year-to-Date (YTD Performance)</option>
                  <option value="volume">📊 Mode 5: Volume Heatmap (vs 20-SMA Ratio)</option>
                  <option value="relative_strength">⚡ Mode 6: Relative Strength (Alpha vs Nifty 50)</option>
                  <option value="volatility">🌪️ Mode 7: Volatility (ATR % & Daily Range)</option>
                  <option value="market_breadth">⚖️ Mode 8: Market Breadth (Advancing / Declining)</option>
                </select>
              </div>

              {/* Tile Size Mode */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Tile Size:</span>
                <select
                  value={sizeBy}
                  onChange={e => setSizeBy(e.target.value)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '0.74rem',
                    padding: '5px 10px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="market_cap">Market Capitalization (₹ Cr)</option>
                  <option value="free_float_mcap">Free-Float Market Cap (₹ Cr)</option>
                  <option value="volume">Trading Volume</option>
                  <option value="traded_value">Traded Value (Turnover)</option>
                  <option value="equal">Equal Sized Rectangles</option>
                </select>
              </div>

              {/* Grouping Mode */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Group By:</span>
                <select
                  value={groupBy}
                  onChange={e => setGroupBy(e.target.value)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '0.74rem',
                    padding: '5px 10px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="sector">Sector (15 Primary Sectors)</option>
                  <option value="industry">Industry Taxonomy</option>
                  <option value="market_cap">Market Cap Category</option>
                  <option value="exchange">Exchange (NSE vs BSE)</option>
                  <option value="none">No Grouping (Flat Treemap)</option>
                </select>
              </div>

              {/* Cap Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Cap:</span>
                <select
                  value={capCategory}
                  onChange={e => setCapCategory(e.target.value)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '0.74rem',
                    padding: '5px 10px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="ALL">All Market Caps</option>
                  <option value="LARGE_CAP">Large Cap (Top 100)</option>
                  <option value="MID_CAP">Mid Cap (101-250)</option>
                  <option value="SMALL_CAP">Small Cap (251-500)</option>
                  <option value="MICRO_CAP">Micro Cap (501+)</option>
                </select>
              </div>

              {/* Watchlist Toggle */}
              <button
                onClick={() => setShowWatchlistOnly(!showWatchlistOnly)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: showWatchlistOnly ? '1px solid #f59e0b' : '1px solid var(--border-subtle)',
                  background: showWatchlistOnly ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: showWatchlistOnly ? '#f59e0b' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Star size={13} fill={showWatchlistOnly ? '#f59e0b' : 'none'} color={showWatchlistOnly ? '#f59e0b' : '#94a3b8'} />
                <span>My Watchlist ({watchlist.length})</span>
              </button>
            </div>

            {/* Right: Search & Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Search Bar */}
              <div style={{ position: 'relative' }}>
                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search stock, sector..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '5px 10px 5px 30px',
                    color: '#ffffff',
                    fontSize: '0.74rem',
                    width: '180px'
                  }}
                />
              </div>

              {/* Refresh Button */}
              <button
                onClick={fetchHeatmapData}
                style={{
                  padding: '5px 10px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: '#ffffff',
                  cursor: 'pointer'
                }}
                title="Refresh Heatmap Data"
              >
                <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
              </button>

              {/* Fullscreen Toggle */}
              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                style={{
                  padding: '5px 10px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: '#ffffff',
                  cursor: 'pointer'
                }}
                title={isFullScreen ? "Exit Fullscreen" : "Full Screen Heatmap"}
              >
                {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* MARKET BREADTH BAROMETER CARDS                                 */}
        {/* ============================================================== */}
        {!isFullScreen && activeTab === 'treemap' && heatmapData?.market_breadth && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
            marginBottom: '16px'
          }}>
            <div style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>STOCKS MONITORED</span>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff' }}>{heatmapData.market_breadth.total_securities}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Universe Depth: 500+</div>
            </div>

            <div style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.68rem', color: '#34d399', fontWeight: 700 }}>ADVANCES / DECLINES</span>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#10b981' }}>{heatmapData.market_breadth.advances} ▲</span>
                <span style={{ color: '#ef4444' }}>{heatmapData.market_breadth.declines} ▼</span>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>A/D Ratio: {heatmapData.market_breadth.adv_dec_ratio}</div>
            </div>

            <div style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.68rem', color: '#c084fc', fontWeight: 700 }}>MARKET TURNOVER</span>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#c084fc' }}>₹{heatmapData.market_breadth.total_turnover_cr?.toLocaleString()} Cr</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Mcap: ₹{(heatmapData.market_breadth.total_market_cap_cr / 100000).toFixed(1)} Lakh Cr</div>
            </div>

            <div style={{ background: 'var(--bg-card)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 700 }}>MOVING AVERAGE BREADTH</span>
              <div style={{ fontSize: '0.90rem', fontWeight: 800, color: '#ffffff', marginTop: '3px' }}>
                &gt;20 EMA: <strong style={{ color: '#38bdf8' }}>{heatmapData.market_breadth.percent_above_20_ema}%</strong>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                &gt;50 EMA: {heatmapData.market_breadth.percent_above_50_ema}% | &gt;200 EMA: {heatmapData.market_breadth.percent_above_200_ema}%
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 1: INTERACTIVE SQUARIFIED TREEMAP HEATMAP                  */}
        {/* ============================================================== */}
        {activeTab === 'treemap' && (
          <div style={{
            background: 'var(--bg-card, #0d131f)',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            borderRadius: '12px',
            padding: '16px',
            minHeight: isFullScreen ? 'calc(100vh - 120px)' : '750px',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* View Mode Switcher & Scale Info Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>PERFORMANCE SCALE:</span>
                <span style={{ background: '#15803d', padding: '2px 8px', borderRadius: '4px', color: '#ffffff', fontWeight: 700 }}>&gt;+3%</span>
                <span style={{ background: '#16a34a', padding: '2px 8px', borderRadius: '4px', color: '#ffffff', fontWeight: 700 }}>+1% to +3%</span>
                <span style={{ background: '#22c55e', padding: '2px 8px', borderRadius: '4px', color: '#000000', fontWeight: 700 }}>0% to +1%</span>
                <span style={{ background: '#64748b', padding: '2px 8px', borderRadius: '4px', color: '#ffffff', fontWeight: 700 }}>0% (Neutral)</span>
                <span style={{ background: '#f87171', padding: '2px 8px', borderRadius: '4px', color: '#000000', fontWeight: 700 }}>-1% to 0%</span>
                <span style={{ background: '#ef4444', padding: '2px 8px', borderRadius: '4px', color: '#ffffff', fontWeight: 700 }}>-3% to -1%</span>
                <span style={{ background: '#b91c1c', padding: '2px 8px', borderRadius: '4px', color: '#ffffff', fontWeight: 700 }}>&lt;-3%</span>
              </div>

              {/* View Switcher: Treemap vs Card Grid */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'inline-flex', background: 'rgba(0, 0, 0, 0.4)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border-subtle)' }}>
                  <button
                    onClick={() => setTreemapDisplayMode('treemap')}
                    style={{
                      background: treemapDisplayMode === 'treemap' ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'transparent',
                      border: 'none',
                      color: treemapDisplayMode === 'treemap' ? '#ffffff' : 'var(--text-secondary)',
                      borderRadius: '4px',
                      padding: '3px 10px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Grid size={12} />
                    Squarified Treemap
                  </button>
                  <button
                    onClick={() => setTreemapDisplayMode('grid')}
                    style={{
                      background: treemapDisplayMode === 'grid' ? 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)' : 'transparent',
                      border: 'none',
                      color: treemapDisplayMode === 'grid' ? '#ffffff' : 'var(--text-secondary)',
                      borderRadius: '4px',
                      padding: '3px 10px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Columns size={12} />
                    Stock Cards Grid ({displayItems.length})
                  </button>
                </div>

                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Size: <strong>{sizeBy.replace('_', ' ').toUpperCase()}</strong> • Group: <strong>{groupBy.toUpperCase()}</strong>
                </div>
              </div>
            </div>

            {/* Main Content: Treemap Canvas OR Card Grid View */}
            {treemapDisplayMode === 'grid' ? (
              /* CARD GRID VIEW (Ultra-clean responsive trading cards) */
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                gap: '12px',
                maxHeight: isFullScreen ? 'calc(100vh - 220px)' : '720px',
                overflowY: 'auto',
                padding: '4px'
              }}>
                {displayItems.map((t: HeatmapTile) => {
                  const isPositive = t.percent_change >= 0;
                  const isWatched = watchlist.includes(t.symbol);

                  return (
                    <div
                      key={t.symbol}
                      onClick={() => {
                        setSelectedStock(t);
                        setStockDetailDrawerOpen(true);
                      }}
                      style={{
                        background: 'rgba(15, 23, 42, 0.85)',
                        border: `1px solid ${isPositive ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                        borderLeft: `4px solid ${isPositive ? '#10b981' : '#ef4444'}`,
                        borderRadius: '8px',
                        padding: '12px',
                        cursor: 'pointer',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        position: 'relative'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {t.symbol}
                            {isWatched && <Star size={11} fill="#fbbf24" color="#fbbf24" />}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px' }}>
                            {t.name}
                          </div>
                        </div>

                        <span style={{
                          background: isPositive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: isPositive ? '#34d399' : '#f87171',
                          border: `1px solid ${isPositive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                          borderRadius: '4px',
                          padding: '2px 8px',
                          fontSize: '0.78rem',
                          fontWeight: 800
                        }}>
                          {isPositive ? '+' : ''}{t.percent_change.toFixed(2)}%
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '10px' }}>
                        <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#ffffff' }}>₹{t.price.toLocaleString()}</span>
                        <span style={{ fontSize: '0.70rem', color: 'var(--text-secondary)' }}>₹{Math.round(t.market_cap_cr).toLocaleString()} Cr</span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '0.68rem' }}>
                        <span style={{ color: '#38bdf8', fontWeight: 600 }}>{t.sector}</span>
                        <span style={{ color: 'var(--text-muted)' }}>Vol: {(t.volume / 100000).toFixed(1)}L</span>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                        <Link
                          href={`/chart?symbol=${t.symbol}`}
                          onClick={e => e.stopPropagation()}
                          style={{
                            flex: 1,
                            background: 'rgba(56, 189, 248, 0.1)',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            borderRadius: '4px',
                            color: '#38bdf8',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            textAlign: 'center',
                            padding: '3px',
                            textDecoration: 'none'
                          }}
                        >
                          Chart
                        </Link>
                        <Link
                          href={`/option-chain?symbol=${t.symbol}`}
                          onClick={e => e.stopPropagation()}
                          style={{
                            flex: 1,
                            background: 'rgba(99, 102, 241, 0.1)',
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            borderRadius: '4px',
                            color: '#818cf8',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            textAlign: 'center',
                            padding: '3px',
                            textDecoration: 'none'
                          }}
                        >
                          Options
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* SQUARIFIED TREEMAP CANVAS (Proper geometry, aspect ratios ~1.2, zero empty space) */
              <div
                ref={treemapContainerRef}
                style={{
                  flex: 1,
                  minHeight: isFullScreen ? 'calc(100vh - 180px)' : '680px',
                  position: 'relative',
                  background: 'rgba(5, 8, 17, 0.95)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                {isLoading && !heatmapData ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '400px' }}>
                    <RefreshCw size={32} color="#06b6d4" className="spin" style={{ marginBottom: '12px' }} />
                    <span style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>Rendering Real-Time Indian Equity Heatmap Tiles...</span>
                  </div>
                ) : sectorClusters.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '400px' }}>
                    <Info size={32} color="#94a3b8" style={{ marginBottom: '12px' }} />
                    <span style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>No matching securities found for current filters.</span>
                  </div>
                ) : (
                  sectorClusters.map((cluster, cIdx) => (
                    <div
                      key={`cluster_${cluster.name}_${cIdx}`}
                      style={{
                        position: 'absolute',
                        left: `${cluster.x}px`,
                        top: `${cluster.y}px`,
                        width: `${cluster.w}px`,
                        height: `${cluster.h}px`,
                        boxSizing: 'border-box',
                        border: groupBy === 'sector' ? '1px solid rgba(255, 255, 255, 0.15)' : 'none',
                        background: 'rgba(0, 0, 0, 0.2)',
                        overflow: 'hidden'
                      }}
                    >
                      {/* Sector Header Banner (Only when grouped by sector) */}
                      {groupBy === 'sector' && cluster.h > 45 && (
                        <div style={{
                          height: cluster.h > 90 ? '24px' : '18px',
                          background: 'rgba(15, 23, 42, 0.92)',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0 8px',
                          fontSize: cluster.w > 140 ? '0.68rem' : '0.58rem',
                          fontWeight: 800,
                          color: '#ffffff',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap'
                        }}>
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden' }}>{cluster.name.toUpperCase()}</span>
                          <span style={{
                            color: cluster.avgChange >= 0 ? '#34d399' : '#f87171',
                            marginLeft: '4px'
                          }}>
                            {cluster.avgChange >= 0 ? '+' : ''}{cluster.avgChange.toFixed(2)}%
                          </span>
                        </div>
                      )}

                      {/* Stock Tiles in this Sector */}
                      {cluster.boxes.map((box, bIdx) => {
                        const t = box.tile;
                        const isPositive = t.percent_change >= 0;
                        const isWatched = watchlist.includes(t.symbol);

                        // Relative coordinates inside the cluster
                        const relX = box.x - cluster.x;
                        const relY = box.y - cluster.y;

                        // Font sizing according to tile size
                        const isLarge = box.w >= 100 && box.h >= 60;
                        const isMedium = box.w >= 65 && box.h >= 40;

                        return (
                          <div
                            key={`${t.symbol}-${bIdx}`}
                            onClick={() => {
                              setSelectedStock(t);
                              setStockDetailDrawerOpen(true);
                            }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLElement).style.zIndex = '30';
                              (e.currentTarget as HTMLElement).style.outline = '2px solid #ffffff';
                              setHoveredTile({ tile: t, x: box.x + box.w / 2, y: box.y });
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLElement).style.zIndex = '1';
                              (e.currentTarget as HTMLElement).style.outline = 'none';
                              setHoveredTile(null);
                            }}
                            style={{
                              position: 'absolute',
                              left: `${relX}px`,
                              top: `${relY}px`,
                              width: `${box.w}px`,
                              height: `${box.h}px`,
                              background: t.color,
                              boxSizing: 'border-box',
                              border: '1px solid rgba(0, 0, 0, 0.4)',
                              cursor: 'pointer',
                              overflow: 'hidden',
                              padding: isLarge ? '6px 8px' : isMedium ? '4px 6px' : '2px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: isMedium ? 'space-between' : 'center',
                              alignItems: isMedium ? 'stretch' : 'center',
                              boxShadow: 'inset 0 0 8px rgba(0, 0, 0, 0.25)',
                              transition: 'outline 0.1s ease'
                            }}
                          >
                            {/* Top: Symbol & Star */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: isMedium ? 'space-between' : 'center', width: '100%' }}>
                              <span style={{
                                fontWeight: 900,
                                fontSize: isLarge ? '0.94rem' : isMedium ? '0.78rem' : '0.64rem',
                                color: '#ffffff',
                                textShadow: '0 1px 3px rgba(0, 0, 0, 0.85)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {t.symbol}
                              </span>

                              {isLarge && isWatched && (
                                <Star size={11} fill="#fbbf24" color="#fbbf24" />
                              )}
                            </div>

                            {/* Middle: % Change */}
                            <div style={{
                              fontSize: isLarge ? '1.05rem' : isMedium ? '0.82rem' : '0.66rem',
                              fontWeight: 900,
                              color: '#ffffff',
                              textShadow: '0 1px 4px rgba(0, 0, 0, 0.9)',
                              textAlign: isMedium ? 'left' : 'center',
                              lineHeight: 1.1
                            }}>
                              {isPositive ? '+' : ''}{t.percent_change.toFixed(2)}%
                            </div>

                            {/* Bottom: Price & Mcap */}
                            {isMedium && (
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: isLarge ? '0.68rem' : '0.58rem',
                                color: 'rgba(255, 255, 255, 0.9)',
                                textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
                              }}>
                                <span style={{ fontWeight: 700 }}>₹{t.price.toLocaleString()}</span>
                                {isLarge && (
                                  <span style={{ opacity: 0.85 }}>₹{Math.round(t.market_cap_cr / 1000)}k Cr</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: ADVANCED SECTOR OVERVIEW & COMPARISON                   */}
        {/* ============================================================== */}
        {activeTab === 'sectors' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              background: 'var(--bg-card, #0d131f)',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 4px 0', color: '#ffffff' }}>
                  Indian Equities Sector Performance (Mcap-Weighted vs Equal-Weighted)
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Compare sector returns, breadth advances/declines, turnover volume, and constituent leaders across all 15 sectors.
                </p>
              </div>

              <button
                onClick={fetchSectorSummary}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  color: '#ffffff',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={13} />
                Refresh Sectors
              </button>
            </div>

            {/* Sector Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
              {sectorsData.map(sec => (
                <div
                  key={sec.sector}
                  style={{
                    background: 'var(--bg-card, #0d131f)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px',
                    borderLeft: `4px solid ${sec.color}`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ fontSize: '0.88rem', fontWeight: 800, margin: '0 0 4px 0', color: '#ffffff' }}>{sec.sector}</h4>
                      <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>
                        {sec.stocks_count} Companies • Mcap: ₹{(sec.total_mcap_cr / 1000).toFixed(1)}k Cr
                      </span>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontSize: '1.05rem',
                        fontWeight: 900,
                        color: sec.mcap_weighted_return_pct >= 0 ? '#34d399' : '#f87171'
                      }}>
                        {sec.mcap_weighted_return_pct >= 0 ? '+' : ''}{sec.mcap_weighted_return_pct}%
                      </div>
                      <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Mcap Weighted</span>
                    </div>
                  </div>

                  {/* Return Comparisons */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(0, 0, 0, 0.25)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.72rem' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Equal Weighted: </span>
                      <strong style={{ color: sec.equal_weighted_return_pct >= 0 ? '#34d399' : '#f87171' }}>
                        {sec.equal_weighted_return_pct >= 0 ? '+' : ''}{sec.equal_weighted_return_pct}%
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Breadth: </span>
                      <strong style={{ color: '#10b981' }}>{sec.advances} Adv</strong> / <strong style={{ color: '#ef4444' }}>{sec.declines} Dec</strong>
                    </div>
                  </div>

                  {/* Top Movers */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.70rem' }}>
                    <div>
                      <span style={{ color: '#10b981', fontWeight: 700 }}>Leaders: </span>
                      {sec.top_gainers.map(g => (
                        <span key={g.symbol} style={{ color: '#ffffff', marginRight: '6px' }}>
                          {g.symbol} ({g.change >= 0 ? '+' : ''}{g.change}%)
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSectorFilter(sec.sector);
                      setActiveTab('treemap');
                    }}
                    style={{
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      borderRadius: '6px',
                      padding: '5px',
                      color: '#38bdf8',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    Drill Down into {sec.sector} &rarr;
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: INDEX POINTS CONTRIBUTION BREAKDOWN                     */}
        {/* ============================================================== */}
        {activeTab === 'index_contrib' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              background: 'var(--bg-card, #0d131f)',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 4px 0', color: '#ffffff' }}>
                  Index Points Contribution Engine: {indexContribData?.index_name || indexFilter}
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Calculated using exact index weighting: Points = (Weight% / 100) * (Stock % Change / 100) * Index Value.
                </p>
              </div>

              {/* Index Picker */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>SELECT INDEX:</span>
                <select
                  value={indexFilter}
                  onChange={e => {
                    setIndexFilter(e.target.value);
                    fetchIndexContribution(e.target.value);
                  }}
                  style={{
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '0.76rem',
                    padding: '6px 12px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="NIFTY 50">NIFTY 50 (50 Stocks)</option>
                  <option value="SENSEX">SENSEX (30 Stocks)</option>
                  <option value="NIFTY BANK">NIFTY BANK (12 Stocks)</option>
                  <option value="NIFTY IT">NIFTY IT (10 Stocks)</option>
                  <option value="NIFTY AUTO">NIFTY AUTO (15 Stocks)</option>
                  <option value="NIFTY PHARMA">NIFTY PHARMA (20 Stocks)</option>
                  <option value="NIFTY FMCG">NIFTY FMCG (15 Stocks)</option>
                  <option value="NIFTY METAL">NIFTY METAL (15 Stocks)</option>
                </select>
              </div>
            </div>

            {/* Top Positive vs Top Negative Contributors Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '16px' }}>
              {/* Positive Contributors */}
              <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                <h4 style={{ fontSize: '0.86rem', fontWeight: 800, color: '#34d399', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <TrendingUp size={16} />
                  TOP 5 POSITIVE INDEX CONTRIBUTORS
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {indexContribData?.top_positive_contributors?.map((c: IndexContributor) => (
                    <div key={c.symbol} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(16, 185, 129, 0.08)', padding: '8px 12px', borderRadius: '6px' }}>
                      <div>
                        <strong style={{ color: '#ffffff', fontSize: '0.82rem' }}>{c.symbol}</strong>
                        <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)', marginLeft: '8px' }}>Weight: {c.weight_pct}%</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <strong style={{ color: '#34d399', fontSize: '0.84rem' }}>+{c.index_points_contribution} pts</strong>
                        <div style={{ fontSize: '0.68rem', color: '#10b981' }}>{c.percent_change >= 0 ? '+' : ''}{c.percent_change}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Negative Contributors */}
              <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                <h4 style={{ fontSize: '0.86rem', fontWeight: 800, color: '#f87171', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <TrendingDown size={16} />
                  TOP 5 NEGATIVE DRAG CONTRIBUTORS
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {indexContribData?.top_negative_contributors?.map((c: IndexContributor) => (
                    <div key={c.symbol} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(239, 68, 68, 0.08)', padding: '8px 12px', borderRadius: '6px' }}>
                      <div>
                        <strong style={{ color: '#ffffff', fontSize: '0.82rem' }}>{c.symbol}</strong>
                        <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)', marginLeft: '8px' }}>Weight: {c.weight_pct}%</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <strong style={{ color: '#f87171', fontSize: '0.84rem' }}>{c.index_points_contribution} pts</strong>
                        <div style={{ fontSize: '0.68rem', color: '#ef4444' }}>{c.percent_change}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Complete Index Constituents Table */}
            <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-subtle)', overflowX: 'auto' }}>
              <h4 style={{ fontSize: '0.88rem', fontWeight: 800, margin: '0 0 12px 0', color: '#ffffff' }}>
                All {indexContribData?.constituents_count} Index Constituents Sorted by Points Impact
              </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 12px' }}>SYMBOL</th>
                    <th style={{ padding: '8px 12px' }}>COMPANY NAME</th>
                    <th style={{ padding: '8px 12px' }}>SECTOR</th>
                    <th style={{ padding: '8px 12px' }}>LTP</th>
                    <th style={{ padding: '8px 12px' }}>% CHANGE</th>
                    <th style={{ padding: '8px 12px' }}>INDEX WEIGHT</th>
                    <th style={{ padding: '8px 12px' }}>POINTS CONTRIBUTION</th>
                  </tr>
                </thead>
                <tbody>
                  {indexContribData?.all_constituents?.map((c: IndexContributor) => (
                    <tr key={c.symbol} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 800, color: '#38bdf8' }}>{c.symbol}</td>
                      <td style={{ padding: '8px 12px', color: '#ffffff' }}>{c.name}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{c.sector}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 700 }}>₹{c.price.toLocaleString()}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 800, color: c.percent_change >= 0 ? '#10b981' : '#ef4444' }}>
                        {c.percent_change >= 0 ? '+' : ''}{c.percent_change}%
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{c.weight_pct}%</td>
                      <td style={{ padding: '8px 12px', fontWeight: 900, color: c.index_points_contribution >= 0 ? '#34d399' : '#f87171' }}>
                        {c.index_points_contribution >= 0 ? '+' : ''}{c.index_points_contribution} pts
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 4: SMART DISCOVERY SCREENER CANDIDATES                     */}
        {/* ============================================================== */}
        {activeTab === 'screener' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              background: 'var(--bg-card, #0d131f)',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 4px 0', color: '#ffffff' }}>
                  Smart Stock Discovery & Market Structure Screener
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Automated systematic screening for emerging institutional breakout momentum, distribution breakdowns, and abnormal volume activity.
                </p>
              </div>

              <button
                onClick={fetchScreenerCandidates}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  color: '#ffffff',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={13} />
                Rescan Market
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
              {/* Bullish Breakouts */}
              <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#34d399', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <TrendingUp size={16} />
                  BULLISH BREAKOUT CANDIDATES
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {screenerData?.bullish_breakouts?.map((c: any) => (
                    <div
                      key={c.symbol}
                      onClick={() => {
                        const stockTile = displayItems.find((it: HeatmapTile) => it.symbol === c.symbol);
                        if (stockTile) setSelectedStock(stockTile);
                        setStockDetailDrawerOpen(true);
                      }}
                      style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--border-subtle)' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: '#ffffff', fontSize: '0.84rem' }}>{c.symbol}</strong>
                        <strong style={{ color: '#10b981', fontSize: '0.84rem' }}>+{c.percent_change}%</strong>
                      </div>
                      <div style={{ fontSize: '0.70rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        ₹{c.price} • Vol: {c.volume_ratio}x 20-SMA • RSI: {c.rsi}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#34d399', marginTop: '4px' }}>
                        • {c.catalyst}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bearish Breakdowns */}
              <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#f87171', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <TrendingDown size={16} />
                  BEARISH BREAKDOWN CANDIDATES
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {screenerData?.bearish_breakdowns?.map((c: any) => (
                    <div
                      key={c.symbol}
                      onClick={() => {
                        const stockTile = displayItems.find((it: HeatmapTile) => it.symbol === c.symbol);
                        if (stockTile) setSelectedStock(stockTile);
                        setStockDetailDrawerOpen(true);
                      }}
                      style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--border-subtle)' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: '#ffffff', fontSize: '0.84rem' }}>{c.symbol}</strong>
                        <strong style={{ color: '#ef4444', fontSize: '0.84rem' }}>{c.percent_change}%</strong>
                      </div>
                      <div style={{ fontSize: '0.70rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        ₹{c.price} • Vol: {c.volume_ratio}x 20-SMA • RSI: {c.rsi}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#f87171', marginTop: '4px' }}>
                        • {c.catalyst}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Unusual Activity & Gaps */}
              <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#38bdf8', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Activity size={16} />
                  UNUSUAL VOLUME SURGES & GAPS
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {screenerData?.unusual_volume_and_gaps?.map((c: any) => (
                    <div
                      key={c.symbol}
                      onClick={() => {
                        const stockTile = displayItems.find((it: HeatmapTile) => it.symbol === c.symbol);
                        if (stockTile) setSelectedStock(stockTile);
                        setStockDetailDrawerOpen(true);
                      }}
                      style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--border-subtle)' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: '#ffffff', fontSize: '0.84rem' }}>{c.symbol}</strong>
                        <strong style={{ color: '#38bdf8', fontSize: '0.84rem' }}>{c.volume_ratio}x Volume</strong>
                      </div>
                      <div style={{ fontSize: '0.70rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        ₹{c.price} ({c.percent_change >= 0 ? '+' : ''}{c.percent_change}%) • Gap: {c.gap_pct}%
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#c084fc', marginTop: '4px' }}>
                        • {c.catalyst}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 5: DUAL COMPARISON MODE                                    */}
        {/* ============================================================== */}
        {activeTab === 'compare' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              background: 'var(--bg-card, #0d131f)',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 4px 0', color: '#ffffff' }}>
                  Dual Heatmap Segment Comparison
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Compare market performance, breadth, and sector weights side-by-side between two indices or market cap tiers.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <select
                  value={compareA}
                  onChange={e => setCompareA(e.target.value)}
                  style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#ffffff', fontSize: '0.76rem', padding: '6px 10px' }}
                >
                  <option value="NIFTY 50">NIFTY 50</option>
                  <option value="NIFTY NEXT 50">NIFTY NEXT 50</option>
                  <option value="NIFTY 500">NIFTY 500</option>
                  <option value="SENSEX">SENSEX</option>
                  <option value="BSE 500">BSE 500</option>
                </select>

                <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-muted)' }}>VS</span>

                <select
                  value={compareB}
                  onChange={e => setCompareB(e.target.value)}
                  style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#ffffff', fontSize: '0.76rem', padding: '6px 10px' }}
                >
                  <option value="NIFTY NEXT 50">NIFTY NEXT 50</option>
                  <option value="NIFTY 50">NIFTY 50</option>
                  <option value="NIFTY MIDCAP 100">NIFTY MIDCAP 100</option>
                  <option value="NIFTY SMALLCAP 100">NIFTY SMALLCAP 100</option>
                  <option value="SENSEX">SENSEX</option>
                </select>
              </div>
            </div>

            {/* Side-by-Side Dual Comparison Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '16px' }}>
              {/* Segment A */}
              <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                <h4 style={{ fontSize: '0.90rem', fontWeight: 800, color: '#38bdf8', margin: '0 0 12px 0' }}>{compareA} Segment Overview</h4>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <div>• Exchange Reference: <strong>NSE / BSE</strong></div>
                  <div>• Monitored Constituents: <strong>50 Companies</strong></div>
                  <div>• Benchmark Status: <strong>Market Closed • Saturday</strong></div>
                  <div>• Sector Spread: <strong>14 Sectors Covered</strong></div>
                </div>
              </div>

              {/* Segment B */}
              <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                <h4 style={{ fontSize: '0.90rem', fontWeight: 800, color: '#f59e0b', margin: '0 0 12px 0' }}>{compareB} Segment Overview</h4>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <div>• Exchange Reference: <strong>NSE / BSE</strong></div>
                  <div>• Monitored Constituents: <strong>50 Companies</strong></div>
                  <div>• Benchmark Status: <strong>Market Closed • Saturday</strong></div>
                  <div>• Sector Spread: <strong>12 Sectors Covered</strong></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* INTERACTIVE STOCK DETAIL SLIDE-OVER DRAWER                     */}
        {/* ============================================================== */}
        {stockDetailDrawerOpen && selectedStock && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: '420px',
              maxWidth: '90vw',
              height: '100vh',
              background: '#0d131f',
              borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.6)',
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              padding: '24px 20px'
            }}
          >
            {/* Drawer Top Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#ffffff', margin: 0 }}>
                    {selectedStock.symbol}
                  </h3>
                  <button
                    onClick={() => toggleWatchlist(selectedStock.symbol)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px' }}
                    title="Toggle Watchlist"
                  >
                    <Star
                      size={18}
                      fill={watchlist.includes(selectedStock.symbol) ? '#fbbf24' : 'none'}
                      color={watchlist.includes(selectedStock.symbol) ? '#fbbf24' : '#94a3b8'}
                    />
                  </button>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {selectedStock.name}
                </div>
                <div style={{ fontSize: '0.70rem', color: '#38bdf8', marginTop: '2px' }}>
                  {selectedStock.sector} • {selectedStock.industry}
                </div>
              </div>

              <button
                onClick={() => setStockDetailDrawerOpen(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 700
                }}
              >
                ✕ Close
              </button>
            </div>

            {/* Price Banner */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.8)',
              padding: '14px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#ffffff' }}>
                  ₹{selectedStock.price.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  VWAP: ₹{selectedStock.vwap.toLocaleString()}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontSize: '1.1rem',
                  fontWeight: 900,
                  color: selectedStock.percent_change >= 0 ? '#34d399' : '#f87171'
                }}>
                  {selectedStock.percent_change >= 0 ? '+' : ''}{selectedStock.percent_change}%
                </div>
                <div style={{ fontSize: '0.72rem', color: selectedStock.change >= 0 ? '#10b981' : '#ef4444' }}>
                  {selectedStock.change >= 0 ? '+' : ''}₹{selectedStock.change}
                </div>
              </div>
            </div>

            {/* Trading & Platform Action Shortcuts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)' }}>PLATFORM ACTIONS:</span>
              
              <Link
                href={`/chart?symbol=${encodeURIComponent(selectedStock.symbol)}`}
                style={{
                  textDecoration: 'none',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <BarChart2 size={15} />
                  Open Technical Chart
                </span>
                <ChevronRight size={15} />
              </Link>

              {selectedStock.options_eligible && (
                <>
                  <Link
                    href={`/option-chain?symbol=${encodeURIComponent(selectedStock.symbol)}`}
                    style={{
                      textDecoration: 'none',
                      background: 'rgba(139, 92, 246, 0.16)',
                      border: '1px solid rgba(139, 92, 246, 0.35)',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      color: '#c084fc',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Layers size={15} />
                      View Option Chain & Greeks
                    </span>
                    <ChevronRight size={15} />
                  </Link>

                  <Link
                    href={`/option-chain?symbol=${encodeURIComponent(selectedStock.symbol)}&mode=smart_selector`}
                    style={{
                      textDecoration: 'none',
                      background: 'rgba(16, 185, 129, 0.16)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      color: '#34d399',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Zap size={15} />
                      Smart Strike Selector & Trading Plan
                    </span>
                    <ChevronRight size={15} />
                  </Link>
                </>
              )}

              <Link
                href={`/signals`}
                style={{
                  textDecoration: 'none',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border-subtle)',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  color: 'var(--text-secondary)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Activity size={15} />
                  View Algorithmic Signals
                </span>
                <ChevronRight size={15} />
              </Link>
            </div>

            {/* Technical Overview Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)' }}>TECHNICAL INDICATORS:</span>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.74rem' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>RSI (14):</span>
                  <strong style={{ color: selectedStock.technicals.rsi >= 70 ? '#ef4444' : selectedStock.technicals.rsi <= 30 ? '#10b981' : '#ffffff', float: 'right' }}>
                    {selectedStock.technicals.rsi}
                  </strong>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>ATR (14):</span>
                  <strong style={{ color: '#ffffff', float: 'right' }}>
                    ₹{selectedStock.volatility.atr} ({selectedStock.volatility.atr_pct}%)
                  </strong>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>EMA 20:</span>
                  <strong style={{ color: selectedStock.technicals.above_20_ema ? '#10b981' : '#ef4444', float: 'right' }}>
                    ₹{selectedStock.technicals.ema_20}
                  </strong>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '8px 10px', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>EMA 200:</span>
                  <strong style={{ color: selectedStock.technicals.above_200_ema ? '#10b981' : '#ef4444', float: 'right' }}>
                    ₹{selectedStock.technicals.ema_200}
                  </strong>
                </div>
              </div>
            </div>

            {/* Market Statistics */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)' }}>MARKET METRICS:</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                <span>Market Cap:</span>
                <strong style={{ color: '#ffffff' }}>₹{selectedStock.market_cap_cr.toLocaleString()} Cr</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                <span>Trading Volume:</span>
                <strong style={{ color: '#ffffff' }}>{selectedStock.volume.toLocaleString()} ({selectedStock.volume_ratio}x 20-SMA)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                <span>Traded Value:</span>
                <strong style={{ color: '#ffffff' }}>₹{selectedStock.traded_value_cr.toLocaleString()} Cr</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                <span>52-Week Range:</span>
                <strong style={{ color: '#ffffff' }}>₹{selectedStock.technicals['52w_low']} - ₹{selectedStock.technicals['52w_high']}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                <span>Primary Exchange:</span>
                <strong style={{ color: '#38bdf8' }}>{selectedStock.primary_exchange} {selectedStock.bse_listed ? '(Dual-listed on BSE)' : ''}</strong>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
