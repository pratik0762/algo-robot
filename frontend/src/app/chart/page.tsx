'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Search,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  Maximize2,
  Filter,
  BarChart2,
  Sliders,
  RefreshCw,
  Compass,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Target,
  Crosshair,
  Grid,
  PenTool,
  Minus,
  Square,
  Hash,
  Trash2,
  BookOpen
} from 'lucide-react';
import { getApiBase } from '@/config/api';
import IndicesBarometer from '@/components/IndicesBarometer';
import MarketStatusBanner from '@/components/MarketStatusBanner';
import { useLiveStockTicks } from '@/hooks/useLiveStockTicks';

export interface Candle {
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema_9: number;
  ema_21: number;
  rsi: number;
  supertrend: number;
  supertrend_dir: number;
}

export interface TradeSignal {
  id: string;
  type: 'BUY' | 'SELL' | 'NEUTRAL';
  time: string;
  timestamp: number;
  candle_index?: number;
  entry_price: number;
  stop_loss: number;
  target_1: number;
  target_2: number;
  risk_reward: string;
  strength: string;
  indicator_reason: string;
  execution_advice: string;
}

export interface ChartDataResponse {
  status: string;
  symbol: string;
  company_name: string;
  sector: string;
  timeframe: string;
  current_price: number;
  latest_signal: TradeSignal;
  all_signals: TradeSignal[];
  candles: Candle[];
  timestamp: string;
}

export interface HeatmapStock {
  symbol: string;
  company_name: string;
  sector: string;
  industry: string;
  ltp: number;
  change: number;
  percent_change: number;
  market_cap_cr: number;
  index_weight_pct: number;
  signal: string;
  heat_grade: string;
  color: string;
  pe_ratio: number;
  high_52w: number;
  low_52w: number;
  nse_official_url: string;
}

export interface HeatmapSector {
  sector: string;
  average_percent_change: number;
  total_market_cap_cr: number;
  total_index_weight_pct: number;
  stocks_count: number;
  color: string;
  stocks: HeatmapStock[];
}

export interface HeatmapResponse {
  status: string;
  source: string;
  official_url: string;
  timestamp: string;
  breadth: {
    advances: number;
    declines: number;
    unchanged: number;
    advance_decline_ratio: number;
  };
  sectors: HeatmapSector[];
}

type DrawingTool = 'none' | 'trendline' | 'horizontal' | 'rect' | 'fibonacci' | 'measure';

interface DrawingItem {
  id: string;
  tool: DrawingTool;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startPrice?: number;
  endPrice?: number;
}

const NIFTY_SYMBOLS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'BHARTIARTL', 'ICICIBANK',
  'INFY', 'SBIN', 'LICI', 'ITC', 'HINDUNILVR',
  'LT', 'BAJFINANCE', 'HCLTECH', 'MARUTI', 'SUNPHARMA',
  'ADANIENT', 'KOTAKBANK', 'TITAN', 'ONGC', 'TATAMOTORS',
  'NTPC', 'AXISBANK', 'ADANIPORTS', 'POWERGRID', 'M&M',
  'COALINDIA', 'BAJAJFINSV', 'ASIANPAINT', 'NESTLEIND', 'ULTRACEMCO',
  'JSWSTEEL', 'TATASTEEL', 'GRASIM', 'TECHM', 'WIPRO',
  'HDFCLIFE', 'SBILIFE', 'HINDALCO', 'DRREDDY', 'BRITANNIA',
  'CIPLA', 'TATACONSUM', 'EICHERMOT', 'APOLLOHOSP', 'INDUSINDBK',
  'DIVISLAB', 'BPCL', 'HEROMOTOCO', 'BAJAJ-AUTO', 'SHRIRAMFIN'
];

function generateDefaultChartData(symbol: string): ChartDataResponse {
  const basePrice = symbol === 'RELIANCE' ? 1285.0 : 1500.0;
  const candles: Candle[] = [];
  let cur = basePrice * 0.94;
  let ema9 = cur;
  let ema21 = cur;
  const BASE_TIMESTAMP = 1730000000000;
  for (let i = 0; i < 45; i++) {
    const timeStr = `${45 - i}d ago`;
    const delta = (Math.sin(i * 0.4) * 0.015 + (i * 0.002)) * basePrice;
    const open = Math.round((cur + delta * 0.2) * 100) / 100;
    const close = Math.round((open + (Math.sin(i * 0.8) * 0.012 + 0.002) * basePrice) * 100) / 100;
    const high = Math.round((Math.max(open, close) + 0.008 * basePrice) * 100) / 100;
    const low = Math.round((Math.min(open, close) - 0.007 * basePrice) * 100) / 100;
    const vol = Math.floor(1200000 + Math.sin(i) * 500000);
    ema9 = Math.round((close * 0.2 + ema9 * 0.8) * 100) / 100;
    ema21 = Math.round((close * 0.09 + ema21 * 0.91) * 100) / 100;
    const rsi = Math.round((50 + Math.sin(i * 0.5) * 18) * 10) / 10;
    const st = Math.round((close > ema21 ? low * 0.985 : high * 1.015) * 100) / 100;
    candles.push({
      time: timeStr,
      timestamp: BASE_TIMESTAMP - (45 - i) * 86400000,
      open,
      high,
      low,
      close,
      volume: vol,
      ema_9: ema9,
      ema_21: ema21,
      rsi,
      supertrend: st,
      supertrend_dir: close >= st ? 1 : -1,
    });
    cur = close;
  }
  const lastC = candles[candles.length - 1];
  const sigBuy: TradeSignal = {
    id: `${symbol}_BUY_40`,
    type: 'BUY',
    time: candles[38].time,
    timestamp: candles[38].timestamp,
    candle_index: 38,
    entry_price: candles[38].close,
    stop_loss: Math.round(candles[38].low * 0.985 * 100) / 100,
    target_1: Math.round(candles[38].close * 1.045 * 100) / 100,
    target_2: Math.round(candles[38].close * 1.085 * 100) / 100,
    risk_reward: '1 : 3.2',
    strength: 'STRONG',
    indicator_reason: 'Golden Cross (EMA 9 crossed above EMA 21) + Supertrend Bullish flip + RSI at 58.4.',
    execution_advice: 'Enter Long above breakout candle high. Place hard Stop Loss below swing low.'
  };
  return {
    status: 'success',
    symbol,
    company_name: symbol === 'RELIANCE' ? 'Reliance Industries Limited' : symbol,
    sector: 'Energy',
    timeframe: '1D',
    current_price: lastC.close,
    latest_signal: sigBuy,
    all_signals: [sigBuy],
    candles,
    timestamp: 'Live'
  };
}

function ChartingAndHeatmapContent() {
  const [activeView, setActiveView] = useState<'chart' | 'heatmap' | 'signals' | 'playbook'>('chart');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('RELIANCE');
  const [timeframe, setTimeframe] = useState<string>('1D');
  const [chartData, setChartData] = useState<ChartDataResponse | null>(() => generateDefaultChartData('RELIANCE'));
  const [heatmapData, setHeatmapData] = useState<HeatmapResponse | null>(null);
  const [loadingChart, setLoadingChart] = useState<boolean>(false);
  const [loadingHeatmap, setLoadingHeatmap] = useState<boolean>(true);
  const [selectedSignal, setSelectedSignal] = useState<TradeSignal | null>(() => generateDefaultChartData('RELIANCE').latest_signal);

  // Live market status & ticks hook
  const { isMarketOpen, marketStatusDetail } = useLiveStockTicks();

  // Drawing tools state
  const [activeTool, setActiveTool] = useState<DrawingTool>('none');
  const [drawings, setDrawings] = useState<DrawingItem[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentDrawing, setCurrentDrawing] = useState<DrawingItem | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Fetch chart data with signals
  const fetchChart = async (sym: string, tf: string) => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/chart-data/${encodeURIComponent(sym)}?timeframe=${encodeURIComponent(tf)}&candle_count=45`);
      if (res.ok) {
        const json: ChartDataResponse = await res.json();
        setChartData(json);
        setSelectedSignal(json.latest_signal);
      }
    } catch (e) {
      console.error('Failed to load chart data:', e);
    } finally {
      setLoadingChart(false);
    }
  };

  // Fetch official NSE heatmap data
  const fetchHeatmap = async () => {
    try {
      setLoadingHeatmap(true);
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/heatmap`);
      if (res.ok) {
        const json: HeatmapResponse = await res.json();
        setHeatmapData(json);
      }
    } catch (e) {
      console.error('Failed to load heatmap data:', e);
    } finally {
      setLoadingHeatmap(false);
    }
  };

  useEffect(() => {
    fetchChart(selectedSymbol, timeframe);
  }, [selectedSymbol, timeframe]);

  useEffect(() => {
    fetchHeatmap();
    const interval = setInterval(fetchHeatmap, 30000);
    return () => clearInterval(interval);
  }, []);

  // Compute SVG chart coordinates and scaling
  const chartMetrics = useMemo(() => {
    if (!chartData || !chartData.candles || chartData.candles.length === 0) {
      return null;
    }
    const candles = chartData.candles;
    const n = candles.length;
    const width = 960;
    const height = 480;
    const paddingLeft = 60;
    const paddingRight = 70;
    const paddingTop = 30;
    const paddingBottom = 60;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const minPrice = Math.min(...lows) * 0.995;
    const maxPrice = Math.max(...highs) * 1.005;
    const priceRange = maxPrice - minPrice || 1;

    const slotWidth = plotWidth / n;
    const candleWidth = Math.max(slotWidth * 0.65, 4);

    const priceToY = (p: number) => {
      return paddingTop + (1 - (p - minPrice) / priceRange) * plotHeight;
    };

    const yToPrice = (y: number) => {
      const norm = 1 - (y - paddingTop) / plotHeight;
      return minPrice + norm * priceRange;
    };

    const indexToX = (idx: number) => {
      return paddingLeft + idx * slotWidth + slotWidth / 2;
    };

    return {
      width,
      height,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      plotWidth,
      plotHeight,
      minPrice,
      maxPrice,
      priceRange,
      slotWidth,
      candleWidth,
      priceToY,
      yToPrice,
      indexToX
    };
  }, [chartData]);

  // Handle SVG drawing interaction
  const getSvgCoordinates = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = 960 / rect.width;
    const scaleY = 480 / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'none' || !chartMetrics) return;
    const { x, y } = getSvgCoordinates(e);
    setIsDrawing(true);
    const newDrawing: DrawingItem = {
      id: `draw_${Date.now()}`,
      tool: activeTool,
      startX: x,
      startY: y,
      endX: x,
      endY: y,
      startPrice: chartMetrics.yToPrice(y),
      endPrice: chartMetrics.yToPrice(y)
    };
    setCurrentDrawing(newDrawing);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing || !currentDrawing || !chartMetrics) return;
    const { x, y } = getSvgCoordinates(e);
    setCurrentDrawing({
      ...currentDrawing,
      endX: x,
      endY: y,
      endPrice: chartMetrics.yToPrice(y)
    });
  };

  const handleMouseUp = () => {
    if (isDrawing && currentDrawing) {
      setDrawings((prev) => [...prev, currentDrawing]);
      setCurrentDrawing(null);
      setIsDrawing(false);
    }
  };

  const clearDrawings = () => {
    setDrawings([]);
    setCurrentDrawing(null);
    setIsDrawing(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Top Barometer Strip */}
      <IndicesBarometer />

      {/* Main Container */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px' }}>
        {/* Market Status Notification (Prominent when closed with authentic reason & next session) */}
        {!isMarketOpen && (
          <div style={{ marginBottom: '20px' }}>
            <MarketStatusBanner statusDetail={marketStatusDetail} />
          </div>
        )}

        {/* Header Strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '20px',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.7))',
            padding: '20px 24px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.36)'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  boxShadow: '0 0 16px rgba(56, 189, 248, 0.4)'
                }}
              >
                <PenTool size={18} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.45rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', color: '#ffffff' }}>
                  CHARTING DESK &amp; NSE HEAT MAP
                </h1>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Algorithmic Buy &amp; Sell Signals &bull; Interactive Drawing Tools &bull; Official NSE India Market Map
                </div>
              </div>
            </div>
          </div>

          {/* View Mode Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveView('chart')}
              className={`btn ${activeView === 'chart' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.82rem', padding: '9px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <BarChart2 size={15} />
              Interactive Chart &amp; Signals
            </button>

            <button
              onClick={() => setActiveView('heatmap')}
              className={`btn ${activeView === 'heatmap' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.82rem', padding: '9px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Grid size={15} />
              NSE Market Heat Map
            </button>

            <button
              onClick={() => setActiveView('signals')}
              className={`btn ${activeView === 'signals' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.82rem', padding: '9px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Target size={15} />
              Active Signals Terminal
            </button>

            <button
              onClick={() => setActiveView('playbook')}
              className={`btn ${activeView === 'playbook' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.82rem', padding: '9px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <BookOpen size={15} />
              Trade Execution Guide
            </button>
          </div>
        </div>

        {/* VIEW 1: INTERACTIVE CHART & SIGNALS */}
        {activeView === 'chart' && (
          <div>
            {/* Chart Toolbar Strip */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                padding: '12px 18px',
                background: 'rgba(15, 23, 42, 0.85)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '16px'
              }}
            >
              {/* Stock Selector & Timeframe */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 700 }}>STOCK:</span>
                  <select
                    value={selectedSymbol}
                    onChange={(e) => setSelectedSymbol(e.target.value)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer'
                    }}
                  >
                    {NIFTY_SYMBOLS.map((s) => (
                      <option key={s} value={s} style={{ background: '#0f172a', color: 'white' }}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Timeframe Buttons */}
                <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '8px', padding: '2px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  {['1m', '5m', '15m', '1D', '1W'].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        background: timeframe === tf ? 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)' : 'transparent',
                        color: timeframe === tf ? 'white' : 'var(--text-secondary)',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              {/* Drawing Tools Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, marginRight: '4px' }}>DRAW TOOLS:</span>

                <button
                  onClick={() => setActiveTool(activeTool === 'trendline' ? 'none' : 'trendline')}
                  title="Draw Trendline: Click and drag across two price points"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: activeTool === 'trendline' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: activeTool === 'trendline' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                    color: activeTool === 'trendline' ? '#38bdf8' : 'white',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <PenTool size={13} />
                  Trendline
                </button>

                <button
                  onClick={() => setActiveTool(activeTool === 'horizontal' ? 'none' : 'horizontal')}
                  title="Horizontal Line: Click and drag to place support or resistance level"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: activeTool === 'horizontal' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: activeTool === 'horizontal' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                    color: activeTool === 'horizontal' ? '#38bdf8' : 'white',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Minus size={13} />
                  Horizontal S/R
                </button>

                <button
                  onClick={() => setActiveTool(activeTool === 'rect' ? 'none' : 'rect')}
                  title="Supply / Demand Zone: Draw a colored rectangle zone"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: activeTool === 'rect' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: activeTool === 'rect' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                    color: activeTool === 'rect' ? '#38bdf8' : 'white',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Square size={13} />
                  Zone Box
                </button>

                <button
                  onClick={() => setActiveTool(activeTool === 'fibonacci' ? 'none' : 'fibonacci')}
                  title="Fibonacci Retracement: Click swing low to swing high"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: activeTool === 'fibonacci' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: activeTool === 'fibonacci' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                    color: activeTool === 'fibonacci' ? '#38bdf8' : 'white',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Hash size={13} />
                  Fibonacci
                </button>

                <button
                  onClick={clearDrawings}
                  title="Clear all drawings from chart"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#f87171',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Trash2 size={13} />
                  Clear
                </button>
              </div>
            </div>

            {/* Active Signal Banner */}
            {chartData && chartData.latest_signal && (
              <div
                style={{
                  background:
                    chartData.latest_signal.type === 'BUY'
                      ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.18) 0%, rgba(5, 150, 105, 0.08) 100%)'
                      : chartData.latest_signal.type === 'SELL'
                      ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.18) 0%, rgba(185, 28, 28, 0.08) 100%)'
                      : 'linear-gradient(135deg, rgba(51, 65, 85, 0.2) 0%, rgba(30, 41, 59, 0.1) 100%)',
                  border:
                    chartData.latest_signal.type === 'BUY'
                      ? '1px solid rgba(16, 185, 129, 0.4)'
                      : chartData.latest_signal.type === 'SELL'
                      ? '1px solid rgba(239, 68, 68, 0.4)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 20px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '16px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                  <div
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      background:
                        chartData.latest_signal.type === 'BUY'
                          ? '#10b981'
                          : chartData.latest_signal.type === 'SELL'
                          ? '#ef4444'
                          : '#475569',
                      color: 'white',
                      fontWeight: 900,
                      fontSize: '1.05rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 0 16px rgba(0,0,0,0.3)'
                    }}
                  >
                    {chartData.latest_signal.type === 'BUY' ? (
                      <ArrowUpRight size={20} />
                    ) : chartData.latest_signal.type === 'SELL' ? (
                      <ArrowDownRight size={20} />
                    ) : (
                      <Activity size={20} />
                    )}
                    {chartData.latest_signal.strength}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white' }}>
                        {chartData.symbol} &bull; ₹{chartData.current_price.toLocaleString('en-IN')}
                      </span>
                      <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>
                        {chartData.sector}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                      Rationale: <strong style={{ color: '#38bdf8' }}>{chartData.latest_signal.indicator_reason}</strong> &bull; {chartData.latest_signal.execution_advice}
                    </div>
                  </div>
                </div>

                {/* Key Numbers Strip */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>ENTRY</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffffff' }}>
                      ₹{chartData.latest_signal.entry_price.toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.68rem', color: '#f87171', textTransform: 'uppercase' }}>STOP LOSS</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f87171' }}>
                      ₹{chartData.latest_signal.stop_loss.toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.68rem', color: '#34d399', textTransform: 'uppercase' }}>TARGET 1</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#34d399' }}>
                      ₹{chartData.latest_signal.target_1.toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.68rem', color: '#22d3ee', textTransform: 'uppercase' }}>TARGET 2</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#22d3ee' }}>
                      ₹{chartData.latest_signal.target_2.toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>RISK / REWARD</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fbbf24' }}>
                      {chartData.latest_signal.risk_reward}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Main Interactive SVG Chart Canvas */}
            <div
              style={{
                background: '#090d16',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                padding: '16px 12px',
                position: 'relative',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
                overflow: 'hidden'
              }}
            >
              {loadingChart && !chartData ? (
                <div style={{ height: '480px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <RefreshCw className="spin" size={24} style={{ marginRight: '8px' }} />
                  Loading candlestick feed &amp; indicators for {selectedSymbol}...
                </div>
              ) : chartMetrics ? (
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${chartMetrics.width} ${chartMetrics.height}`}
                  style={{
                    width: '100%',
                    height: 'auto',
                    cursor: activeTool !== 'none' ? 'crosshair' : 'default',
                    userSelect: 'none'
                  }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                >
                  {/* Grid Lines */}
                  {[0.2, 0.4, 0.6, 0.8].map((ratio) => {
                    const y = chartMetrics.paddingTop + chartMetrics.plotHeight * ratio;
                    const price = chartMetrics.yToPrice(y);
                    return (
                      <g key={ratio}>
                        <line
                          x1={chartMetrics.paddingLeft}
                          y1={y}
                          x2={chartMetrics.width - chartMetrics.paddingRight}
                          y2={y}
                          stroke="rgba(255, 255, 255, 0.05)"
                          strokeDasharray="4 4"
                        />
                        <text
                          x={chartMetrics.width - chartMetrics.paddingRight + 8}
                          y={y + 4}
                          fill="var(--text-muted)"
                          fontSize="10"
                          fontFamily="monospace"
                        >
                          ₹{price.toFixed(1)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Volume Bars Background */}
                  {chartData?.candles.map((c, i) => {
                    const x = chartMetrics.indexToX(i);
                    const maxVol = Math.max(...chartData.candles.map((x) => x.volume)) || 1;
                    const volHeight = (c.volume / maxVol) * 60;
                    const volY = chartMetrics.height - chartMetrics.paddingBottom - volHeight;
                    const isGreen = c.close >= c.open;
                    return (
                      <rect
                        key={`vol_${i}`}
                        x={x - chartMetrics.candleWidth / 2}
                        y={volY}
                        width={chartMetrics.candleWidth}
                        height={volHeight}
                        fill={isGreen ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.18)'}
                      />
                    );
                  })}

                  {/* EMA 9 Polyline */}
                  <polyline
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                    points={chartData?.candles
                      .map((c, i) => `${chartMetrics.indexToX(i)},${chartMetrics.priceToY(c.ema_9)}`)
                      .join(' ')}
                  />

                  {/* EMA 21 Polyline */}
                  <polyline
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    points={chartData?.candles
                      .map((c, i) => `${chartMetrics.indexToX(i)},${chartMetrics.priceToY(c.ema_21)}`)
                      .join(' ')}
                  />

                  {/* Supertrend Line */}
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    strokeDasharray="3 3"
                    points={chartData?.candles
                      .map((c, i) => `${chartMetrics.indexToX(i)},${chartMetrics.priceToY(c.supertrend)}`)
                      .join(' ')}
                  />

                  {/* Candlesticks */}
                  {chartData?.candles.map((c, i) => {
                    const x = chartMetrics.indexToX(i);
                    const openY = chartMetrics.priceToY(c.open);
                    const closeY = chartMetrics.priceToY(c.close);
                    const highY = chartMetrics.priceToY(c.high);
                    const lowY = chartMetrics.priceToY(c.low);
                    const isGreen = c.close >= c.open;
                    const bodyTop = Math.min(openY, closeY);
                    const bodyHeight = Math.max(Math.abs(closeY - openY), 2);
                    const candleColor = isGreen ? '#10b981' : '#ef4444';

                    return (
                      <g key={i}>
                        {/* Upper & Lower Wicks */}
                        <line x1={x} y1={highY} x2={x} y2={lowY} stroke={candleColor} strokeWidth="1.2" />
                        {/* Real Body */}
                        <rect
                          x={x - chartMetrics.candleWidth / 2}
                          y={bodyTop}
                          width={chartMetrics.candleWidth}
                          height={bodyHeight}
                          fill={candleColor}
                          stroke={candleColor}
                          rx="1"
                        />
                      </g>
                    );
                  })}

                  {/* Buy / Sell Signal Markers on Chart */}
                  {chartData?.all_signals.map((sig, sIdx) => {
                    if (sig.candle_index === undefined) return null;
                    const c = chartData.candles[sig.candle_index];
                    if (!c) return null;
                    const x = chartMetrics.indexToX(sig.candle_index);
                    const isBuy = sig.type === 'BUY';
                    const y = isBuy ? chartMetrics.priceToY(c.low) + 20 : chartMetrics.priceToY(c.high) - 20;
                    const badgeBg = isBuy ? '#10b981' : '#ef4444';

                    return (
                      <g
                        key={`sig_${sIdx}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedSignal(sig)}
                      >
                        {/* Triangular pointer */}
                        <polygon
                          points={
                            isBuy
                              ? `${x},${y - 12} ${x - 5},${y - 4} ${x + 5},${y - 4}`
                              : `${x},${y + 12} ${x - 5},${y + 4} ${x + 5},${y + 4}`
                          }
                          fill={badgeBg}
                        />
                        {/* Pill badge */}
                        <rect
                          x={x - 24}
                          y={isBuy ? y - 3 : y - 22}
                          width="48"
                          height="18"
                          rx="4"
                          fill={badgeBg}
                          stroke="#ffffff"
                          strokeWidth="0.8"
                        />
                        <text
                          x={x}
                          y={isBuy ? y + 9 : y - 10}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="9"
                          fontWeight="900"
                        >
                          {sig.type}
                        </text>
                      </g>
                    );
                  })}

                  {/* User Drawings */}
                  {drawings.map((d) => {
                    if (d.tool === 'trendline') {
                      return (
                        <line
                          key={d.id}
                          x1={d.startX}
                          y1={d.startY}
                          x2={d.endX}
                          y2={d.endY}
                          stroke="#38bdf8"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      );
                    }
                    if (d.tool === 'horizontal') {
                      return (
                        <g key={d.id}>
                          <line
                            x1={chartMetrics.paddingLeft}
                            y1={d.startY}
                            x2={chartMetrics.width - chartMetrics.paddingRight}
                            y2={d.startY}
                            stroke="#fbbf24"
                            strokeWidth="2"
                            strokeDasharray="5 3"
                          />
                          <text
                            x={chartMetrics.width - chartMetrics.paddingRight + 6}
                            y={d.startY + 4}
                            fill="#fbbf24"
                            fontSize="10"
                            fontWeight="800"
                          >
                            ₹{d.startPrice?.toFixed(1)}
                          </text>
                        </g>
                      );
                    }
                    if (d.tool === 'rect') {
                      const rx = Math.min(d.startX, d.endX);
                      const ry = Math.min(d.startY, d.endY);
                      const rw = Math.abs(d.endX - d.startX);
                      const rh = Math.abs(d.endY - d.startY);
                      return (
                        <rect
                          key={d.id}
                          x={rx}
                          y={ry}
                          width={rw}
                          height={rh}
                          fill="rgba(56, 189, 248, 0.14)"
                          stroke="#38bdf8"
                          strokeWidth="1.5"
                          strokeDasharray="4 2"
                        />
                      );
                    }
                    if (d.tool === 'fibonacci') {
                      const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
                      const dy = d.endY - d.startY;
                      return (
                        <g key={d.id}>
                          {fibLevels.map((lvl) => {
                            const curY = d.startY + dy * lvl;
                            return (
                              <g key={lvl}>
                                <line
                                  x1={chartMetrics.paddingLeft}
                                  y1={curY}
                                  x2={chartMetrics.width - chartMetrics.paddingRight}
                                  y2={curY}
                                  stroke={lvl === 0.5 || lvl === 0.618 ? '#10b981' : '#c084fc'}
                                  strokeWidth="1.2"
                                  strokeDasharray="3 3"
                                />
                                <text
                                  x={chartMetrics.paddingLeft + 6}
                                  y={curY - 3}
                                  fill="#c084fc"
                                  fontSize="9"
                                  fontWeight="700"
                                >
                                  {(lvl * 100).toFixed(1)}% Fib
                                </text>
                              </g>
                            );
                          })}
                        </g>
                      );
                    }
                    return null;
                  })}

                  {/* Active In-Progress Drawing */}
                  {currentDrawing && currentDrawing.tool === 'trendline' && (
                    <line
                      x1={currentDrawing.startX}
                      y1={currentDrawing.startY}
                      x2={currentDrawing.endX}
                      y2={currentDrawing.endY}
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                      strokeDasharray="4 2"
                    />
                  )}
                  {currentDrawing && currentDrawing.tool === 'rect' && (
                    <rect
                      x={Math.min(currentDrawing.startX, currentDrawing.endX)}
                      y={Math.min(currentDrawing.startY, currentDrawing.endY)}
                      width={Math.abs(currentDrawing.endX - currentDrawing.startX)}
                      height={Math.abs(currentDrawing.endY - currentDrawing.startY)}
                      fill="rgba(56, 189, 248, 0.15)"
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                    />
                  )}
                  {currentDrawing && currentDrawing.tool === 'horizontal' && (
                    <line
                      x1={chartMetrics.paddingLeft}
                      y1={currentDrawing.startY}
                      x2={chartMetrics.width - chartMetrics.paddingRight}
                      y2={currentDrawing.startY}
                      stroke="#fbbf24"
                      strokeWidth="2"
                      strokeDasharray="4 2"
                    />
                  )}
                </svg>
              ) : null}

              {/* Chart Legend Footer */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  marginTop: '10px',
                  padding: '8px 12px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '12px', height: '2px', background: '#38bdf8' }} />
                    <span>EMA 9 (Momentum)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '12px', height: '2px', background: '#f59e0b' }} />
                    <span>EMA 21 (Baseline)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '12px', height: '2px', background: '#10b981', borderTop: '1px dashed #10b981' }} />
                    <span>Supertrend (10, 3)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>▲ BUY</span> / <span style={{ color: '#ef4444', fontWeight: 800 }}>▼ SELL</span>
                    <span>Signals</span>
                  </div>
                </div>

                <div>Click on any BUY/SELL signal marker to inspect execution details.</div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: OFFICIAL NSE MARKET HEAT MAP */}
        {activeView === 'heatmap' && (
          <div>
            {/* Heatmap Subheader */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                padding: '16px 20px',
                background: 'rgba(15, 23, 42, 0.85)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '20px'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'white' }}>
                    OFFICIAL NSE NIFTY 50 LIVE MARKET HEAT MAP
                  </span>
                  <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>LIVE EXCHANGE SYNC</span>
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Sized by Index Weightage &bull; Color-graded by Live % Change &bull; Click any tile to load technical chart
                </div>
              </div>

              {/* Market Breadth Pill */}
              {heatmapData && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.74rem', color: '#34d399', fontWeight: 800 }}>
                      ▲ {heatmapData.breadth.advances} Advances
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>&bull;</span>
                    <span style={{ fontSize: '0.74rem', color: '#f87171', fontWeight: 800 }}>
                      ▼ {heatmapData.breadth.declines} Declines
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>&bull;</span>
                    <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                      {heatmapData.breadth.unchanged} Unchanged
                    </span>
                  </div>

                  <a
                    href="https://www.nseindia.com/market-data/live-market-indices"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.74rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <ExternalLink size={13} />
                    NSE Official Market Map
                  </a>
                </div>
              )}
            </div>

            {/* Heatmap Grid of Sectors */}
            {loadingHeatmap ? (
              <div style={{ height: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw className="spin" size={24} style={{ marginRight: '8px' }} />
                Loading NSE Nifty 50 Market Map...
              </div>
            ) : heatmapData?.sectors ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {heatmapData.sectors.map((sec) => (
                  <div
                    key={sec.sector}
                    style={{
                      background: 'rgba(15, 23, 42, 0.7)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      padding: '16px 18px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
                    }}
                  >
                    {/* Sector Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#ffffff' }}>
                          {sec.sector.toUpperCase()}
                        </span>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: sec.color,
                            color: '#ffffff'
                          }}
                        >
                          {sec.average_percent_change >= 0 ? '+' : ''}
                          {sec.average_percent_change.toFixed(2)}% Avg
                        </span>
                      </div>

                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Weight: <strong style={{ color: '#38bdf8' }}>{sec.total_index_weight_pct}%</strong> &bull; {sec.stocks_count} Stocks
                      </div>
                    </div>

                    {/* Stock Tiles in this Sector */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                        gap: '10px'
                      }}
                    >
                      {sec.stocks.map((stock) => {
                        const isGain = stock.percent_change >= 0;
                        return (
                          <div
                            key={stock.symbol}
                            onClick={() => {
                              setSelectedSymbol(stock.symbol);
                              setActiveView('chart');
                            }}
                            title={`Click to open ${stock.symbol} Chart with Buy/Sell Signals`}
                            style={{
                              background: stock.color,
                              borderRadius: '8px',
                              padding: '12px 14px',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              color: '#ffffff',
                              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.25)'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'translateY(-2px)';
                              e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '0.88rem', fontWeight: 900, letterSpacing: '0.01em' }}>
                                {stock.symbol}
                              </span>
                              <span
                                style={{
                                  fontSize: '0.62rem',
                                  fontWeight: 800,
                                  background: 'rgba(0,0,0,0.3)',
                                  padding: '1px 5px',
                                  borderRadius: '4px'
                                }}
                              >
                                {stock.signal}
                              </span>
                            </div>

                            <div style={{ marginTop: '8px' }}>
                              <div style={{ fontSize: '1.05rem', fontWeight: 900 }}>
                                ₹{stock.ltp.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                              </div>
                              <div style={{ fontSize: '0.74rem', fontWeight: 700, marginTop: '2px', opacity: 0.95 }}>
                                {isGain ? '+' : ''}
                                {stock.percent_change.toFixed(2)}% ({isGain ? '+' : ''}₹{stock.change.toFixed(1)})
                              </div>
                            </div>

                            <div style={{ marginTop: '6px', fontSize: '0.62rem', opacity: 0.8, display: 'flex', justifyContent: 'space-between' }}>
                              <span>Weight: {stock.index_weight_pct}%</span>
                              <span>P/E: {stock.pe_ratio.toFixed(1)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* VIEW 3: ACTIVE SIGNALS TERMINAL */}
        {activeView === 'signals' && (
          <div>
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.85)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                padding: '20px 24px',
                marginBottom: '20px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'white' }}>
                    QUANTITATIVE ALGORITHMIC SIGNALS ENGINE
                  </h2>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Automated multi-factor triggers based on EMA 9/21 crossovers, Supertrend (10, 3) reversals, and RSI volume expansion
                  </div>
                </div>

                <div style={{ fontSize: '0.74rem', color: '#38bdf8', fontWeight: 700 }}>
                  50 Constituents Tracked Live
                </div>
              </div>

              {/* Signals Grid Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>SYMBOL &amp; SECTOR</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>LTP</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center' }}>SIGNAL TYPE</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>ENTRY PRICE</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>STOP LOSS (SL)</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>TARGET 1</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>TARGET 2</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left' }}>INDICATOR REASON</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapData?.sectors
                      .flatMap((s) => s.stocks)
                      .slice(0, 25)
                      .map((stock) => {
                        const isBuy = stock.signal.includes('BUY');
                        const isSell = stock.signal.includes('SELL');
                        const entry = stock.ltp;
                        const sl = isBuy ? round2(entry * 0.985) : round2(entry * 1.015);
                        const t1 = isBuy ? round2(entry * 1.025) : round2(entry * 0.975);
                        const t2 = isBuy ? round2(entry * 1.045) : round2(entry * 0.955);

                        return (
                          <tr
                            key={stock.symbol}
                            style={{
                              borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                              transition: 'background 0.15s ease'
                            }}
                          >
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ fontWeight: 800, color: 'white' }}>{stock.symbol}</div>
                              <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>{stock.sector}</div>
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800 }}>
                              ₹{stock.ltp.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <span
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontWeight: 800,
                                  fontSize: '0.72rem',
                                  background: isBuy ? 'rgba(16, 185, 129, 0.2)' : isSell ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.06)',
                                  color: isBuy ? '#34d399' : isSell ? '#f87171' : '#94a3b8',
                                  border: isBuy ? '1px solid rgba(16, 185, 129, 0.4)' : isSell ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255,255,255,0.1)'
                                }}
                              >
                                {stock.signal}
                              </span>
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700 }}>
                              ₹{entry.toFixed(1)}
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#f87171' }}>
                              ₹{sl.toFixed(1)}
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#34d399' }}>
                              ₹{t1.toFixed(1)}
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>
                              ₹{t2.toFixed(1)}
                            </td>

                            <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: '0.74rem' }}>
                              {isBuy
                                ? 'EMA 9 > EMA 21 Momentum Golden Cross & Bullish Volume'
                                : isSell
                                ? 'EMA 9 < EMA 21 Death Cross & Supertrend Breakdown'
                                : 'Neutral Rangebound Consolidation'}
                            </td>

                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <button
                                onClick={() => {
                                  setSelectedSymbol(stock.symbol);
                                  setActiveView('chart');
                                }}
                                className="btn btn-primary"
                                style={{ fontSize: '0.72rem', padding: '5px 12px' }}
                              >
                                Open Chart
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: TRADE EXECUTION GUIDE & PLAYBOOK */}
        {activeView === 'playbook' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Guide Header Banner */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(99, 102, 241, 0.15))',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: 'var(--radius-lg)',
                padding: '24px 28px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <ShieldCheck size={22} color="#38bdf8" />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, color: 'white' }}>
                  INSTITUTIONAL TRADE EXECUTION PLAYBOOK: HEAT MAP &amp; SIGNALS
                </h2>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                This institutional framework outlines exactly how professional traders combine macro sector breadth (via the NSE Heat Map) with micro-technical entry points (via Algorithmic Buy/Sell Signals and Chart Drawing Tools) to generate positive expected alpha while rigorously controlling downside risk.
              </p>
            </div>

            {/* 4-Step Execution Workflow Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
              {/* Step 1 */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 'var(--radius-md)',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: '#0284c7',
                      color: 'white',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.85rem'
                    }}
                  >
                    1
                  </div>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 800, margin: 0, color: 'white' }}>
                    Scan Sector Breadth on NSE Heat Map
                  </h3>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  Open the <strong>NSE Market Heat Map</strong> at market open (9:15 AM - 9:30 AM). Look for <strong>sector clusters</strong> with high green intensity (e.g. Financial Services or IT advancing &gt;+1.5%). Never buy a stock whose entire sector is deep red; trade with sectoral tailwinds.
                </p>
                <div style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700 }}>
                  Rule: Identify top 2 performing sectors and avoid lagging sectors.
                </div>
              </div>

              {/* Step 2 */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 'var(--radius-md)',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: '#10b981',
                      color: 'white',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.85rem'
                    }}
                  >
                    2
                  </div>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 800, margin: 0, color: 'white' }}>
                    Chart Analysis &amp; S/R Drawing Setup
                  </h3>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  Click the leading stock tile from the Heat Map to load its chart. Use the <strong>Horizontal S/R</strong> and <strong>Trendline</strong> drawing tools to mark the prior day high/low and key swing levels. Validate that price is trading above the cyan <strong>EMA 9</strong> and orange <strong>EMA 21</strong>.
                </p>
                <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 700 }}>
                  Rule: Price must be supported by the 9-EMA and 21-EMA dynamic band.
                </div>
              </div>

              {/* Step 3 */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 'var(--radius-md)',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: '#f59e0b',
                      color: 'white',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.85rem'
                    }}
                  >
                    3
                  </div>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 800, margin: 0, color: 'white' }}>
                    Confirm Algorithmic Buy/Sell Trigger
                  </h3>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  Wait for the green <strong>▲ BUY</strong> signal flag to form at candle close. Confirm that the Supertrend has flipped green and volume is at least 1.3x higher than previous candles. Avoid entering mid-candle before closing confirmation.
                </p>
                <div style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 700 }}>
                  Rule: Never trade on anticipating signals; wait for candle close.
                </div>
              </div>

              {/* Step 4 */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 'var(--radius-md)',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: '#8b5cf6',
                      color: 'white',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.85rem'
                    }}
                  >
                    4
                  </div>
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 800, margin: 0, color: 'white' }}>
                    Execute Bracket / Cover Order with Strict SL
                  </h3>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  Place an intraday <strong>Bracket Order (BO)</strong> or Cover Order with your broker (Zerodha, Groww, AngelOne):
                  <br />&bull; <strong>Entry</strong>: Signal Entry Price
                  <br />&bull; <strong>Stop Loss</strong>: Algorithmic SL level (1.5% - 2.0% risk)
                  <br />&bull; <strong>Target 1</strong>: Book 50% profits; move SL to breakeven
                  <br />&bull; <strong>Target 2</strong>: Trail remainder using the Supertrend line
                </p>
                <div style={{ fontSize: '0.72rem', color: '#c084fc', fontWeight: 700 }}>
                  Rule: Never risk more than 1.5% of total trading capital on a single setup.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChartingAndHeatmapPage() {
  return (
    <React.Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0d14' }} />}>
      <ChartingAndHeatmapContent />
    </React.Suspense>
  );
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
