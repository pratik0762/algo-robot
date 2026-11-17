'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  ColorType,
  IChartApi,
  ISeriesApi,
  Time,
} from 'lightweight-charts';
import {
  Layers,
  Maximize2,
  Minimize2,
  RefreshCw,
  Sliders,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Eye,
  EyeOff,
  Zap
} from 'lucide-react';

export interface ChartCandle {
  timestamp?: number;
  time?: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface OrderBlockZone {
  id?: string;
  type: 'BULLISH' | 'BEARISH';
  zone_high: number;
  zone_low: number;
  zone_mid?: number;
  is_active?: boolean;
  timeframe?: string;
  label?: string;
}

export interface CriticalLevels {
  Z?: { high: number; low: number; mid: number; display?: string };
  S1?: { price: number; display?: string };
  R1?: { price: number; display?: string };
  R2?: { price: number; display?: string };
}

export interface TradingViewLightweightChartProps {
  symbol: string;
  companyName?: string;
  currentPrice?: number;
  percentChange?: number;
  candles: ChartCandle[];
  orderBlocks?: OrderBlockZone[];
  criticalLevels?: CriticalLevels;
  activeSetup?: any;
  timeframe?: string;
  onTimeframeChange?: (tf: string) => void;
  onOrderClick?: (symbol: string, initialSide: 'BUY' | 'SELL', price?: number) => void;
  height?: number;
}

// Indicator Calculation Helpers
function calculateEMA(candles: { close: number }[], period: number): (number | null)[] {
  if (candles.length < period) return candles.map(() => null);
  const k = 2 / (period + 1);
  const result: (number | null)[] = [];
  let prevEma: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += candles[j].close;
      prevEma = sum / period;
      result.push(prevEma);
    } else if (prevEma !== null) {
      prevEma = candles[i].close * k + prevEma * (1 - k);
      result.push(prevEma);
    }
  }
  return result;
}

function calculateSMA(candles: { close: number }[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += candles[i - j].close;
      result.push(sum / period);
    }
  }
  return result;
}

function calculateVWAP(candles: { high: number; low: number; close: number; volume?: number }[]): (number | null)[] {
  let cumulativeTPV = 0;
  let cumulativeVol = 0;
  const result: (number | null)[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume && c.volume > 0 ? c.volume : 1000;
    cumulativeTPV += typicalPrice * vol;
    cumulativeVol += vol;
    result.push(cumulativeVol > 0 ? cumulativeTPV / cumulativeVol : typicalPrice);
  }
  return result;
}

export default function TradingViewLightweightChart({
  symbol,
  companyName,
  currentPrice,
  percentChange,
  candles,
  orderBlocks = [],
  criticalLevels,
  activeSetup,
  timeframe = '15m',
  onTimeframeChange,
  onOrderClick,
  height = 500,
}: TradingViewLightweightChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema9SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema21SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const sma50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceLinesRef = useRef<any[]>([]);

  // Toggles for overlays
  const [showEMA9, setShowEMA9] = useState(true);
  const [showEMA21, setShowEMA21] = useState(true);
  const [showSMA50, setShowSMA50] = useState(false);
  const [showVWAP, setShowVWAP] = useState(true);
  const [showOrderBlocks, setShowOrderBlocks] = useState(true);
  const [showCriticalLevels, setShowCriticalLevels] = useState(true);

  // Crosshair Legend data
  const [legend, setLegend] = useState<{
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    volume?: number;
    time?: string;
    change?: number;
    changePct?: number;
  }>({});

  // Format candles for lightweight-charts
  const formattedData = useMemo(() => {
    if (!candles || candles.length === 0) return { candles: [], volume: [] };

    const seenTimes = new Set<number>();
    const sortedCandles = [...candles].sort((a, b) => {
      const ta = typeof a.timestamp === 'number' ? a.timestamp : (typeof a.time === 'number' ? a.time : 0);
      const tb = typeof b.timestamp === 'number' ? b.timestamp : (typeof b.time === 'number' ? b.time : 0);
      return ta - tb;
    });

    const cData: any[] = [];
    const vData: any[] = [];

    // Base fallback timestamp if timestamps are missing
    let fallbackSeconds = Math.floor(Date.now() / 1000) - sortedCandles.length * 900;

    for (let i = 0; i < sortedCandles.length; i++) {
      const c = sortedCandles[i];
      let tSec: number;

      if (typeof c.timestamp === 'number' && c.timestamp > 0) {
        tSec = c.timestamp > 100000000000 ? Math.floor(c.timestamp / 1000) : c.timestamp;
      } else if (typeof c.time === 'number' && c.time > 0) {
        tSec = c.time > 100000000000 ? Math.floor(c.time / 1000) : c.time;
      } else if (typeof c.time === 'string' && c.time.length > 0) {
        const parsed = Date.parse(c.time);
        tSec = !isNaN(parsed) ? Math.floor(parsed / 1000) : fallbackSeconds + i * 900;
      } else {
        tSec = fallbackSeconds + i * 900;
      }

      // Guarantee strictly ascending time
      if (seenTimes.has(tSec)) {
        tSec += 1;
      }
      seenTimes.add(tSec);

      const isUp = c.close >= c.open;
      cData.push({
        time: tSec as Time,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      });

      const vol = c.volume && c.volume > 0 ? c.volume : 50000;
      vData.push({
        time: tSec as Time,
        value: vol,
        color: isUp ? 'rgba(52, 211, 153, 0.35)' : 'rgba(248, 113, 113, 0.35)',
      });
    }

    return { candles: cData, volume: vData };
  }, [candles]);

  // Set default legend to latest candle
  useEffect(() => {
    if (formattedData.candles.length > 0) {
      const last = formattedData.candles[formattedData.candles.length - 1];
      const prev = formattedData.candles.length > 1 ? formattedData.candles[formattedData.candles.length - 2] : last;
      const chg = last.close - prev.close;
      const chgPct = prev.close > 0 ? (chg / prev.close) * 100 : 0;
      const lastVol = formattedData.volume[formattedData.volume.length - 1]?.value;

      setLegend({
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
        volume: lastVol,
        change: chg,
        changePct: chgPct,
      });
    }
  }, [formattedData]);

  // Initialize and mount chart
  useEffect(() => {
    if (!containerRef.current) return;

    // Clear any previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: height,
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#94a3b8',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.5)', style: LineStyle.Dotted },
        horzLines: { color: 'rgba(30, 41, 59, 0.5)', style: LineStyle.Dotted },
      },
      crosshair: {
        vertLine: {
          color: '#38bdf8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#0284c7',
        },
        horzLine: {
          color: '#38bdf8',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#0284c7',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(51, 65, 85, 0.6)',
        scaleMargins: {
          top: 0.1,
          bottom: 0.22,
        },
      },
      timeScale: {
        borderColor: 'rgba(51, 65, 85, 0.6)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Volume Sub-Series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#38bdf8',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume_scale',
    });
    chart.priceScale('volume_scale').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // Main Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    // Overlay Lines
    const ema9 = chart.addSeries(LineSeries, {
      color: '#06b6d4',
      lineWidth: 1,
      title: 'EMA 9',
      crosshairMarkerVisible: false,
    });
    const ema21 = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1,
      title: 'EMA 21',
      crosshairMarkerVisible: false,
    });
    const sma50 = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 1,
      title: 'SMA 50',
      crosshairMarkerVisible: false,
    });
    const vwap = chart.addSeries(LineSeries, {
      color: '#a855f7',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: 'VWAP',
      crosshairMarkerVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    ema9SeriesRef.current = ema9;
    ema21SeriesRef.current = ema21;
    sma50SeriesRef.current = sma50;
    vwapSeriesRef.current = vwap;

    // Crosshair move handler
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) return;
      const barData: any = param.seriesData.get(candleSeries);
      const volData: any = param.seriesData.get(volumeSeries);
      if (barData) {
        setLegend({
          open: barData.open,
          high: barData.high,
          low: barData.low,
          close: barData.close,
          volume: volData ? volData.value : undefined,
          change: barData.close - barData.open,
          changePct: barData.open > 0 ? ((barData.close - barData.open) / barData.open) * 100 : 0,
        });
      }
    });

    // Responsive Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width } = entries[0].contentRect;
      if (width > 0 && chartRef.current) {
        chartRef.current.applyOptions({ width });
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [height]);

  // Update Data & Indicators
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || formattedData.candles.length === 0) return;

    candleSeriesRef.current.setData(formattedData.candles);
    volumeSeriesRef.current.setData(formattedData.volume);

    // EMA 9
    if (ema9SeriesRef.current) {
      if (showEMA9) {
        const emaVals = calculateEMA(formattedData.candles, 9);
        const emaData = formattedData.candles
          .map((c, idx) => (emaVals[idx] !== null ? { time: c.time, value: emaVals[idx]! } : null))
          .filter(Boolean) as any[];
        ema9SeriesRef.current.setData(emaData);
      } else {
        ema9SeriesRef.current.setData([]);
      }
    }

    // EMA 21
    if (ema21SeriesRef.current) {
      if (showEMA21) {
        const emaVals = calculateEMA(formattedData.candles, 21);
        const emaData = formattedData.candles
          .map((c, idx) => (emaVals[idx] !== null ? { time: c.time, value: emaVals[idx]! } : null))
          .filter(Boolean) as any[];
        ema21SeriesRef.current.setData(emaData);
      } else {
        ema21SeriesRef.current.setData([]);
      }
    }

    // SMA 50
    if (sma50SeriesRef.current) {
      if (showSMA50) {
        const smaVals = calculateSMA(formattedData.candles, 50);
        const smaData = formattedData.candles
          .map((c, idx) => (smaVals[idx] !== null ? { time: c.time, value: smaVals[idx]! } : null))
          .filter(Boolean) as any[];
        sma50SeriesRef.current.setData(smaData);
      } else {
        sma50SeriesRef.current.setData([]);
      }
    }

    // VWAP
    if (vwapSeriesRef.current) {
      if (showVWAP) {
        const vwapVals = calculateVWAP(formattedData.candles);
        const vwapData = formattedData.candles
          .map((c, idx) => (vwapVals[idx] !== null ? { time: c.time, value: vwapVals[idx]! } : null))
          .filter(Boolean) as any[];
        vwapSeriesRef.current.setData(vwapData);
      } else {
        vwapSeriesRef.current.setData([]);
      }
    }

    // Fit content nicely
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [formattedData, showEMA9, showEMA21, showSMA50, showVWAP]);

  // Draw SMC Order Blocks & Four Critical Levels
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const series = candleSeriesRef.current;

    // Clear previously drawn price lines
    priceLinesRef.current.forEach((pl) => {
      try {
        series.removePriceLine(pl);
      } catch (e) {
        // Safe ignore
      }
    });
    priceLinesRef.current = [];

    // 1. Order Blocks Price Bands
    if (showOrderBlocks && orderBlocks && orderBlocks.length > 0) {
      orderBlocks.slice(0, 3).forEach((ob) => {
        const isBull = ob.type === 'BULLISH';
        const color = isBull ? '#10b981' : '#ef4444';
        const highLine = series.createPriceLine({
          price: ob.zone_high,
          color: color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `${ob.type} OB HIGH`,
        });
        const lowLine = series.createPriceLine({
          price: ob.zone_low,
          color: color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `${ob.type} OB LOW`,
        });
        priceLinesRef.current.push(highLine, lowLine);
      });
    }

    // 2. Four Critical Levels (Z, S1, R1, R2)
    if (showCriticalLevels && criticalLevels) {
      // Z — Zone Midpoint
      if (criticalLevels.Z?.mid) {
        const zLine = series.createPriceLine({
          price: criticalLevels.Z.mid,
          color: '#fbbf24', // Gold
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: 'Z (OB Midpoint)',
        });
        priceLinesRef.current.push(zLine);
      }

      // S1 — Invalidation / Stop-Loss Level
      if (criticalLevels.S1?.price) {
        const s1Line = series.createPriceLine({
          price: criticalLevels.S1.price,
          color: '#f43f5e', // Crimson Rose
          lineWidth: 2,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'S1 (Invalidation / SL)',
        });
        priceLinesRef.current.push(s1Line);
      }

      // R1 — First Liquidity Target
      if (criticalLevels.R1?.price) {
        const r1Line = series.createPriceLine({
          price: criticalLevels.R1.price,
          color: '#34d399', // Emerald
          lineWidth: 2,
          lineStyle: LineStyle.LargeDashed,
          axisLabelVisible: true,
          title: 'R1 (Target 1)',
        });
        priceLinesRef.current.push(r1Line);
      }

      // R2 — Second Liquidity Target
      if (criticalLevels.R2?.price) {
        const r2Line = series.createPriceLine({
          price: criticalLevels.R2.price,
          color: '#38bdf8', // Sky Blue
          lineWidth: 2,
          lineStyle: LineStyle.LargeDashed,
          axisLabelVisible: true,
          title: 'R2 (Target 2)',
        });
        priceLinesRef.current.push(r2Line);
      }
    }
  }, [orderBlocks, criticalLevels, showOrderBlocks, showCriticalLevels]);

  const ltp = currentPrice ?? (legend.close ?? 0);
  const chg = percentChange ?? (legend.changePct ?? 0);
  const isPositive = chg >= 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#090d16',
        borderRadius: '16px',
        border: '1px solid rgba(51, 65, 85, 0.4)',
        boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.7)',
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
      }}
    >
      {/* Chart Top Header & Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 18px',
          background: 'rgba(15, 23, 42, 0.85)',
          borderBottom: '1px solid rgba(51, 65, 85, 0.4)',
        }}
      >
        {/* Left: Symbol & Live Price Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                {symbol}
              </span>
              <span
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                }}
              >
                NSE LIVE
              </span>
              {activeSetup && (
                <span
                  style={{
                    fontSize: '0.66rem',
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: activeSetup.type === 'BULLISH' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: activeSetup.type === 'BULLISH' ? '#34d399' : '#f87171',
                    border: `1px solid ${activeSetup.type === 'BULLISH' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  }}
                >
                  {activeSetup.type} OB ({activeSetup.risk_reward_ratio || 2.0}x RR)
                </span>
              )}
            </div>
            {companyName && (
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '1px' }}>{companyName}</div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f8fafc' }}>
              ₹{ltp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span
              style={{
                fontSize: '0.80rem',
                fontWeight: 800,
                color: isPositive ? '#34d399' : '#f87171',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              {isPositive ? '+' : ''}
              {chg.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Center: Timeframe Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(2, 6, 23, 0.6)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(51, 65, 85, 0.4)' }}>
          {['1m', '3m', '5m', '15m', '1h', '1D'].map((tf) => {
            const isActive = timeframe === tf;
            return (
              <button
                key={tf}
                onClick={() => onTimeframeChange && onTimeframeChange(tf)}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  fontWeight: isActive ? 800 : 600,
                  borderRadius: '6px',
                  background: isActive ? '#2563eb' : 'transparent',
                  color: isActive ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tf}
              </button>
            );
          })}
        </div>

        {/* Right: Technical Overlays Toggle & Fast Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Overlays Pill Group */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => setShowEMA9(!showEMA9)}
              style={{
                padding: '4px 8px',
                fontSize: '0.68rem',
                fontWeight: 700,
                borderRadius: '5px',
                background: showEMA9 ? 'rgba(6, 182, 212, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                color: showEMA9 ? '#06b6d4' : '#64748b',
                border: `1px solid ${showEMA9 ? '#06b6d4' : 'transparent'}`,
                cursor: 'pointer',
              }}
              title="Toggle Exponential Moving Average 9"
            >
              EMA 9
            </button>
            <button
              onClick={() => setShowEMA21(!showEMA21)}
              style={{
                padding: '4px 8px',
                fontSize: '0.68rem',
                fontWeight: 700,
                borderRadius: '5px',
                background: showEMA21 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                color: showEMA21 ? '#f59e0b' : '#64748b',
                border: `1px solid ${showEMA21 ? '#f59e0b' : 'transparent'}`,
                cursor: 'pointer',
              }}
              title="Toggle Exponential Moving Average 21"
            >
              EMA 21
            </button>
            <button
              onClick={() => setShowVWAP(!showVWAP)}
              style={{
                padding: '4px 8px',
                fontSize: '0.68rem',
                fontWeight: 700,
                borderRadius: '5px',
                background: showVWAP ? 'rgba(168, 85, 247, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                color: showVWAP ? '#a855f7' : '#64748b',
                border: `1px solid ${showVWAP ? '#a855f7' : 'transparent'}`,
                cursor: 'pointer',
              }}
              title="Toggle Volume Weighted Average Price"
            >
              VWAP
            </button>
            <button
              onClick={() => setShowOrderBlocks(!showOrderBlocks)}
              style={{
                padding: '4px 8px',
                fontSize: '0.68rem',
                fontWeight: 700,
                borderRadius: '5px',
                background: showOrderBlocks ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                color: showOrderBlocks ? '#34d399' : '#64748b',
                border: `1px solid ${showOrderBlocks ? '#34d399' : 'transparent'}`,
                cursor: 'pointer',
              }}
              title="Toggle Smart Money Order Blocks"
            >
              OB ZONES
            </button>
            <button
              onClick={() => setShowCriticalLevels(!showCriticalLevels)}
              style={{
                padding: '4px 8px',
                fontSize: '0.68rem',
                fontWeight: 700,
                borderRadius: '5px',
                background: showCriticalLevels ? 'rgba(251, 191, 36, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                color: showCriticalLevels ? '#fbbf24' : '#64748b',
                border: `1px solid ${showCriticalLevels ? '#fbbf24' : 'transparent'}`,
                cursor: 'pointer',
              }}
              title="Toggle Four Critical Levels (Z, S1, R1, R2)"
            >
              CRITICAL LEVELS
            </button>
          </div>

          {/* Quick Trade Trigger Buttons */}
          {onOrderClick && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px' }}>
              <button
                onClick={() => onOrderClick(symbol, 'BUY', ltp)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 14px',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                }}
              >
                <TrendingUp size={13} />
                BUY
              </button>
              <button
                onClick={() => onOrderClick(symbol, 'SELL', ltp)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 14px',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                }}
              >
                <TrendingDown size={13} />
                SELL
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Floating Crosshair OHLCV Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '6px 18px',
          background: 'rgba(15, 23, 42, 0.95)',
          fontSize: '0.72rem',
          color: '#94a3b8',
          borderBottom: '1px solid rgba(51, 65, 85, 0.25)',
          overflowX: 'auto',
        }}
      >
        <span>
          O:{' '}
          <strong style={{ color: '#f8fafc' }}>
            {legend.open ? `₹${legend.open.toFixed(2)}` : '—'}
          </strong>
        </span>
        <span>
          H:{' '}
          <strong style={{ color: '#34d399' }}>
            {legend.high ? `₹${legend.high.toFixed(2)}` : '—'}
          </strong>
        </span>
        <span>
          L:{' '}
          <strong style={{ color: '#f87171' }}>
            {legend.low ? `₹${legend.low.toFixed(2)}` : '—'}
          </strong>
        </span>
        <span>
          C:{' '}
          <strong style={{ color: '#f8fafc' }}>
            {legend.close ? `₹${legend.close.toFixed(2)}` : '—'}
          </strong>
        </span>
        {legend.change !== undefined && (
          <span>
            Chg:{' '}
            <strong style={{ color: legend.change >= 0 ? '#34d399' : '#f87171' }}>
              {legend.change >= 0 ? '+' : ''}
              {legend.change.toFixed(2)} ({legend.changePct?.toFixed(2)}%)
            </strong>
          </span>
        )}
        {legend.volume !== undefined && (
          <span>
            Vol:{' '}
            <strong style={{ color: '#38bdf8' }}>
              {legend.volume.toLocaleString('en-IN')}
            </strong>
          </span>
        )}

        {/* Level Legend Key */}
        {showCriticalLevels && criticalLevels && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: '#fbbf24' }}>● Z Mid</span>
            <span style={{ color: '#f43f5e' }}>■ S1 Inval</span>
            <span style={{ color: '#34d399' }}>▲ R1 Target</span>
            <span style={{ color: '#38bdf8' }}>★ R2 Target</span>
          </div>
        )}
      </div>

      {/* Lightweight Charts Canvas Host Container */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: `${height}px`,
          position: 'relative',
        }}
      />
    </div>
  );
}
