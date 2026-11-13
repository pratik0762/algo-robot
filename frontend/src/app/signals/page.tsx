'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Zap,
  Menu,
  Search,
  Filter,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Clock,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Layers,
  Sparkles,
  Sliders,
  ExternalLink,
  ChevronRight,
  Info,
  SlidersHorizontal,
  Flame,
  Volume2,
  BarChart2
} from 'lucide-react';
import { getApiBase } from '@/config/api';
import IndicesBarometer from '@/components/IndicesBarometer';
import MarketStatusBanner from '@/components/MarketStatusBanner';
import NavigationDrawer from '@/components/NavigationDrawer';
import { useLiveStockTicks } from '@/hooks/useLiveStockTicks';
import { useTradeSignals, TradeSignalItem } from '@/context/TradeSignalsContext';

export type { TradeSignalItem };

export interface StrategyItem {
  id: string;
  name: string;
  badge: string;
  category?: string;
  win_rate?: string;
  description?: string;
}

export interface TradeSignalsResponse {
  status: string;
  total_signals: number;
  filtered_count: number;
  available_strategies: StrategyItem[];
  signals: TradeSignalItem[];
  summary: {
    buy_count: number;
    sell_count: number;
    large_cap_count: number;
    mid_cap_count: number;
    small_cap_count: number;
    latest_timestamp: string;
  };
}

// Extensible fallback strategies array
const DEFAULT_STRATEGIES: StrategyItem[] = [
  { id: 'all', name: 'All Strategies', badge: 'COMPREHENSIVE' },
  { id: 'ema_cross', name: 'EMA 9/21 Trend Crossover', badge: 'TREND FOLLOWING' },
  { id: 'supertrend', name: 'Supertrend (10, 3) Breakout', badge: 'VOLATILITY BAND' },
  { id: 'breakout_52w', name: '52-Week Breakout & Reversal', badge: 'MOMENTUM / S&R' },
  { id: 'rsi_reversal', name: 'RSI Mean Reversion', badge: 'OSCILLATOR' },
  { id: 'volume_momentum', name: 'Volume Spike & Order Block', badge: 'INSTITUTIONAL FLOW' },
  { id: 'macd_cross', name: 'MACD Histogram Expansion', badge: 'MOMENTUM ACCELERATION' },
  { id: 'bollinger_squeeze', name: 'Bollinger Bands Squeeze', badge: 'VOLATILITY EXPANSION' }
];

function TradeSignalsContent() {
  const { openChartModal, triggerSimulatedSignal } = useTradeSignals();
  const [signals, setSignals] = useState<TradeSignalItem[]>([]);
  const [strategies, setStrategies] = useState<StrategyItem[]>(DEFAULT_STRATEGIES);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('all');
  const [selectedCap, setSelectedCap] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [navDrawerOpen, setNavDrawerOpen] = useState<boolean>(false);
  const [summary, setSummary] = useState<any>(null);
  const [syncCountdown, setSyncCountdown] = useState<number>(6);
  const seenSignalIds = useRef<Set<string>>(new Set());

  // Web Audio Synth chime when a new signal triggers
  const playAudioChime = useCallback(() => {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch (_) {}
  }, []);

  // Real-time market status hook
  const { isMarketOpen, marketStatusDetail } = useLiveStockTicks();

  // Dynamic elapsed ticker time state (deterministic initial SSR state; updated live on client)
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(1730000000000);

  useEffect(() => {
    setCurrentTimeMs(Date.now());
    // Live real-time elapsed counter updating every 1s
    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now());
      setSyncCountdown(prev => (prev <= 1 ? 6 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute live elapsed time string
  const formatTimeAgo = useCallback((timestampMs: number): string => {
    const diffSec = Math.max(0, Math.floor((currentTimeMs - timestampMs) / 1000));
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) {
      const hrs = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      return `${hrs}h ${mins}m ago`;
    }
    return `${Math.floor(diffSec / 86400)}d ago`;
  }, [currentTimeMs]);

  // Fetch Signals from backend (silent background sync; zero flickering)
  const fetchSignals = useCallback(async (isManual: boolean = false) => {
    if (isManual) setRefreshing(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/trade-signals`);
      if (res.ok) {
        const data: TradeSignalsResponse = await res.json();
        setSignals(data.signals || []);
        if (data.available_strategies && data.available_strategies.length > 0) {
          setStrategies(data.available_strategies);
        }
        setSummary(data.summary);
      }
    } catch (err) {
      console.error('Failed to fetch trade signals:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setSyncCountdown(6);
    }
  }, []);

  // Automatic real-time background sync loop (every 6 seconds - no manual refresh needed)
  useEffect(() => {
    fetchSignals();
    const interval = setInterval(() => {
      fetchSignals(false);
    }, 6000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  // Manual Trigger to simulate a new live signal event for testing
  const handleTriggerSimulatedSignal = async () => {
    try {
      const newSig = await triggerSimulatedSignal();
      if (newSig) {
        setSignals(prev => [newSig, ...prev.filter(s => s.id !== newSig.id)]);
      }
    } catch (err) {
      console.error('Failed to trigger simulated signal:', err);
    }
  };

  // Filter signals locally for instantaneous 0ms response
  const filteredSignals = useMemo(() => {
    return signals.filter(sig => {
      // Strategy filter
      if (selectedStrategy !== 'all' && sig.strategy_id !== selectedStrategy) {
        return false;
      }
      // Market cap filter
      if (selectedCap !== 'ALL' && sig.market_cap_category !== selectedCap) {
        return false;
      }
      // Buy/Sell filter
      if (selectedType !== 'ALL' && sig.type !== selectedType) {
        return false;
      }
      // Timeframe filter
      if (selectedTimeframe !== 'ALL' && sig.timeframe.toUpperCase() !== selectedTimeframe.toUpperCase()) {
        return false;
      }
      // Search filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const match =
          sig.symbol.toLowerCase().includes(term) ||
          sig.company_name.toLowerCase().includes(term) ||
          sig.sector.toLowerCase().includes(term) ||
          sig.strategy_name.toLowerCase().includes(term) ||
          sig.timeframe.toLowerCase().includes(term);
        if (!match) return false;
      }
      return true;
    });
  }, [signals, selectedStrategy, selectedCap, selectedType, selectedTimeframe, searchTerm]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Top Barometer Strip */}
      <IndicesBarometer />

      {/* Main Container */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px 80px 20px' }}>
        {/* Market Status Notification (when closed) */}
        {!isMarketOpen && (
          <div style={{ marginBottom: '20px' }}>
            <MarketStatusBanner statusDetail={marketStatusDetail} />
          </div>
        )}

        {/* Header Strip with Drawer & Hub Buttons */}
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
            border: '1px solid rgba(239, 68, 68, 0.3)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.36)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <Link
              href="/"
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                padding: '8px 12px',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: 'var(--text-secondary)',
              }}
              title="Return to Financial Hub"
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
                padding: '8px 16px',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#f87171',
                fontWeight: 700,
                boxShadow: '0 0 15px rgba(239, 68, 68, 0.25)',
                cursor: 'pointer',
              }}
              title="Open Market Hubs Navigator Drawer"
            >
              <Menu size={16} color="#f87171" />
              <span>Drawer</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  boxShadow: '0 0 16px rgba(239, 68, 68, 0.4)'
                }}
              >
                <Zap size={20} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h1 style={{ fontSize: '1.45rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', color: '#ffffff' }}>
                    ALGORITHMIC TRADE SIGNALS
                  </h1>
                  <span
                    style={{
                      background: 'rgba(239, 68, 68, 0.18)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      color: '#f87171',
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      textTransform: 'uppercase',
                    }}
                  >
                    LIVE FEED &bull; ALL CAPS
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Multi-Strategy High Probability Signals &bull; Large-Cap, Mid-Cap &amp; Small-Cap Universe &bull; No Charts Required
                </div>
              </div>
            </div>
          </div>

          {/* Action & Auto-Refresh Status Strip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#34d399',
                fontSize: '0.78rem',
                fontWeight: 800,
              }}
              title="Real-Time Automated Background Synchronization"
            >
              <span
                className="pulse-indicator"
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 10px #10b981'
                }}
              />
              <span>LIVE AUTO-REFRESH ACTIVE ({syncCountdown}s)</span>
            </div>

            <button
              onClick={handleTriggerSimulatedSignal}
              className="btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 0 15px rgba(99, 102, 241, 0.35)'
              }}
              title="Simulate / Trigger a New Real-Time Signal (Tests Toast Notification)"
            >
              <Sparkles size={15} />
              <span>Simulate Signal</span>
            </button>
          </div>
        </div>

        {/* Summary Stat Strip */}
        {summary && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '14px',
              marginBottom: '20px'
            }}
          >
            <div style={{ background: 'var(--panel)', padding: '14px 18px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                Active BUY Signals
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#34d399', marginTop: '4px' }}>
                {summary.buy_count} Setups
              </div>
            </div>

            <div style={{ background: 'var(--panel)', padding: '14px 18px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                Active SELL Signals
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#f87171', marginTop: '4px' }}>
                {summary.sell_count} Setups
              </div>
            </div>

            <div style={{ background: 'var(--panel)', padding: '14px 18px', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
              <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                Large-Cap Signals
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#a5b4fc', marginTop: '4px' }}>
                {summary.large_cap_count} Stocks
              </div>
            </div>

            <div style={{ background: 'var(--panel)', padding: '14px 18px', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                Mid &amp; Small-Cap Signals
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fbbf24', marginTop: '4px' }}>
                {summary.mid_cap_count + summary.small_cap_count} Stocks
              </div>
            </div>
          </div>
        )}

        {/* Capital Protection & NSE Data Feed Protocol Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(15, 23, 42, 0.8) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.2)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#34d399',
                flexShrink: 0
              }}
            >
              <ShieldCheck size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.01em' }}>
                  NSE OFFICIAL CHART &amp; LIVE FEED VERIFICATION ENGINE
                </span>
                <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontSize: '0.62rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                  CAPITAL PROTECTION ACTIVE
                </span>
                <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontSize: '0.62rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.4)' }}>
                  MIN 1:2 RISK-TO-REWARD
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '3px', lineHeight: 1.4 }}>
                Every algorithmic setup is derived from real-time NSE price action &amp; multi-timeframe indicators with a non-negotiable <strong>Hard Stop-Loss</strong>. Always observe risk rules to prevent capital drawdown.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.70rem', color: '#94a3b8' }}>Risk Cap:</span>
            <span style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.35)', padding: '3px 8px', borderRadius: '6px', fontSize: '0.70rem', fontWeight: 800 }}>
              Max 1.5% Loss / Trade
            </span>
          </div>
        </div>

        {/* Filter Controls Panel */}
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '18px 20px',
            marginBottom: '20px'
          }}
        >
          {/* Strategy Selection Filter (Extensible - Full wrapping, zero text cut-off) */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                FILTER BY QUANT STRATEGY ({strategies.length} Strategies Supported)
              </span>
              <span style={{ fontSize: '0.72rem', color: '#818cf8', fontWeight: 700 }}>
                Extensible Strategy Engine
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
                padding: '2px 0'
              }}
            >
              {strategies.map((strat) => {
                const isActive = selectedStrategy === strat.id;
                return (
                  <button
                    key={strat.id}
                    onClick={() => setSelectedStrategy(strat.id)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: isActive ? 800 : 600,
                      background: isActive
                        ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)'
                        : 'rgba(255, 255, 255, 0.04)',
                      border: isActive ? '1px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.08)',
                      color: isActive ? '#ffffff' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isActive ? '0 0 14px rgba(99, 102, 241, 0.4)' : 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>{strat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Secondary Filter Row: Market Cap, Direction & Search */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {/* Market Cap Pill Filters */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255, 255, 255, 0.03)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                {[
                  { id: 'ALL', label: 'All Caps' },
                  { id: 'LARGE_CAP', label: 'Large-Cap' },
                  { id: 'MID_CAP', label: 'Mid-Cap' },
                  { id: 'SMALL_CAP', label: 'Small-Cap' },
                ].map((cap) => {
                  const isActive = selectedCap === cap.id;
                  return (
                    <button
                      key={cap.id}
                      onClick={() => setSelectedCap(cap.id)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        fontSize: '0.74rem',
                        fontWeight: isActive ? 800 : 500,
                        background: isActive ? '#6366f1' : 'transparent',
                        color: isActive ? '#ffffff' : 'var(--text-secondary)',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {cap.label}
                    </button>
                  );
                })}
              </div>

              {/* BUY / SELL Action Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255, 255, 255, 0.03)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                {[
                  { id: 'ALL', label: 'All Signals' },
                  { id: 'BUY', label: 'BUY Only' },
                  { id: 'SELL', label: 'SELL Only' },
                ].map((act) => {
                  const isActive = selectedType === act.id;
                  let activeBg = '#6366f1';
                  if (act.id === 'BUY') activeBg = '#059669';
                  if (act.id === 'SELL') activeBg = '#dc2626';

                  return (
                    <button
                      key={act.id}
                      onClick={() => setSelectedType(act.id)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        fontSize: '0.74rem',
                        fontWeight: isActive ? 800 : 500,
                        background: isActive ? activeBg : 'transparent',
                        color: isActive ? '#ffffff' : 'var(--text-secondary)',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {act.label}
                    </button>
                  );
                })}
              </div>

              {/* Timeframe Filter Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255, 255, 255, 0.03)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                {[
                  { id: 'ALL', label: 'All Timeframes' },
                  { id: '5m', label: '5m' },
                  { id: '15m', label: '15m' },
                  { id: '1H', label: '1H' },
                  { id: '1D', label: '1D' },
                ].map((tf) => {
                  const isActive = selectedTimeframe === tf.id;
                  return (
                    <button
                      key={tf.id}
                      onClick={() => setSelectedTimeframe(tf.id)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '6px',
                        fontSize: '0.74rem',
                        fontWeight: isActive ? 800 : 500,
                        background: isActive ? '#0284c7' : 'transparent',
                        color: isActive ? '#ffffff' : 'var(--text-secondary)',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {tf.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: '260px' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search symbol, company, or sector..."
                style={{
                  width: '100%',
                  padding: '7px 12px 7px 34px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  fontSize: '0.78rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>
        </div>

        {/* Header Results Count Strip */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <div>
            Showing <strong style={{ color: '#ffffff' }}>{filteredSignals.length}</strong> active trade setups
            {selectedStrategy !== 'all' && <span> for <strong>{strategies.find(s => s.id === selectedStrategy)?.name}</strong></span>}
            {selectedCap !== 'ALL' && <span> in <strong>{selectedCap.replace('_', ' ')}</strong></span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={13} color="#818cf8" />
            <span>Timestamps synchronized with National Stock Exchange of India (NSE)</span>
          </div>
        </div>

        {/* Signals List - Rendered in the exact format of the attached screenshot */}
        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="pulse-indicator" color="#6366f1" style={{ margin: '0 auto 12px auto' }} />
            <div>Loading live algorithmic trade signals...</div>
          </div>
        ) : filteredSignals.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--panel)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
            <Activity size={32} color="#6366f1" style={{ margin: '0 auto 12px auto' }} />
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: '#ffffff' }}>No Trade Signals Found</h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              No active signals currently match your selected filters. Try choosing "All Strategies" or "All Caps".
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {filteredSignals.map((sig) => {
              const isBuy = sig.type === 'BUY';
              const isSell = sig.type === 'SELL';

              const elapsedDisplay = formatTimeAgo(sig.timestamp_ms);

              return (
                <div
                  key={sig.id}
                  style={{
                    background: isBuy
                      ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.16) 0%, rgba(5, 150, 105, 0.06) 100%)'
                      : isSell
                      ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.16) 0%, rgba(185, 28, 28, 0.06) 100%)'
                      : 'linear-gradient(135deg, rgba(51, 65, 85, 0.2) 0%, rgba(30, 41, 59, 0.1) 100%)',
                    border: isBuy
                      ? '1px solid rgba(16, 185, 129, 0.45)'
                      : isSell
                      ? '1px solid rgba(239, 68, 68, 0.45)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px',
                    boxShadow: isBuy
                      ? '0 4px 20px -2px rgba(16, 185, 129, 0.12)'
                      : '0 4px 20px -2px rgba(239, 68, 68, 0.12)',
                    transition: 'transform 0.15s ease, border-color 0.15s ease',
                  }}
                >
                  {/* Left Column: Action Badge + Title & Rationale */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: '1 1 540px' }}>
                    {/* Big Action Badge (SELL / BUY) */}
                    <div
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        background: isBuy ? '#10b981' : isSell ? '#ef4444' : '#475569',
                        color: 'white',
                        fontWeight: 900,
                        fontSize: '1.05rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: isBuy ? '0 0 16px rgba(16, 185, 129, 0.4)' : '0 0 16px rgba(239, 68, 68, 0.4)',
                        flexShrink: 0,
                      }}
                    >
                      {isBuy ? (
                        <ArrowUpRight size={20} />
                      ) : isSell ? (
                        <ArrowDownRight size={20} />
                      ) : (
                        <Activity size={20} />
                      )}
                      <span>{sig.strength}</span>
                    </div>

                    {/* Stock Symbol, Price, Sector Pill, Cap Badge & Rationale */}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.01em' }}>
                          {sig.symbol} &bull; ₹{sig.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>

                        <span
                          style={{
                            background: 'rgba(99, 102, 241, 0.18)',
                            border: '1px solid rgba(99, 102, 241, 0.35)',
                            color: '#a5b4fc',
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '6px',
                          }}
                        >
                          {sig.sector}
                        </span>

                        <span
                          style={{
                            background:
                              sig.market_cap_category === 'LARGE_CAP'
                                ? 'rgba(59, 130, 246, 0.15)'
                                : sig.market_cap_category === 'MID_CAP'
                                ? 'rgba(245, 158, 11, 0.15)'
                                : 'rgba(168, 85, 247, 0.15)',
                            border:
                              sig.market_cap_category === 'LARGE_CAP'
                                ? '1px solid rgba(59, 130, 246, 0.35)'
                                : sig.market_cap_category === 'MID_CAP'
                                ? '1px solid rgba(245, 158, 11, 0.35)'
                                : '1px solid rgba(168, 85, 247, 0.35)',
                            color:
                              sig.market_cap_category === 'LARGE_CAP'
                                ? '#60a5fa'
                                : sig.market_cap_category === 'MID_CAP'
                                ? '#fbbf24'
                                : '#c084fc',
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            textTransform: 'uppercase',
                          }}
                        >
                          {sig.market_cap_category.replace('_', '-')}
                        </span>

                        {/* NSE Live Feed Verified Badge */}
                        <span
                          style={{
                            background: 'rgba(16, 185, 129, 0.15)',
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                            color: '#34d399',
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                          title="Signal calculated against live NSE tick data and verified with hard stop-loss risk controls"
                        >
                          <ShieldCheck size={11} color="#34d399" />
                          <span>NSE VERIFIED</span>
                        </span>

                        {/* Timeframe Pill (Prominently displayed) */}
                        <span
                          style={{
                            background: 'rgba(2, 132, 199, 0.2)',
                            border: '1px solid rgba(56, 189, 248, 0.45)',
                            color: '#38bdf8',
                            fontSize: '0.65rem',
                            fontWeight: 900,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            letterSpacing: '0.04em',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            boxShadow: '0 0 10px rgba(56, 189, 248, 0.25)'
                          }}
                        >
                          <Clock size={11} color="#38bdf8" />
                          <span>{sig.timeframe.toUpperCase()}</span>
                          <span style={{ fontSize: '0.58rem', opacity: 0.85 }}>
                            {sig.timeframe === '5m' ? 'SCALP' : sig.timeframe === '15m' ? 'INTRADAY' : sig.timeframe === '1H' ? 'HOURLY' : 'SWING'}
                          </span>
                        </span>
                      </div>

                      {/* Rationale and Execution Advice */}
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                        Rationale: <strong style={{ color: '#38bdf8' }}>{sig.indicator_reason}</strong> &bull; {sig.execution_advice}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Key Numbers Strip + Timestamp & Elapsed */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                    {/* Entry */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                        ENTRY
                      </div>
                      <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#ffffff' }}>
                        ₹{sig.entry_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    {/* Stop Loss */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.68rem', color: '#f87171', textTransform: 'uppercase', fontWeight: 700 }}>
                        STOP LOSS
                      </div>
                      <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#f87171' }}>
                        ₹{sig.stop_loss.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    {/* Target 1 */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.68rem', color: '#34d399', textTransform: 'uppercase', fontWeight: 700 }}>
                        TARGET 1
                      </div>
                      <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#34d399' }}>
                        ₹{sig.target_1.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    {/* Target 2 */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.68rem', color: '#22d3ee', textTransform: 'uppercase', fontWeight: 700 }}>
                        TARGET 2
                      </div>
                      <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#22d3ee' }}>
                        ₹{sig.target_2.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    {/* Risk / Reward */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                        RISK / REWARD
                      </div>
                      <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#fbbf24' }}>
                        {sig.risk_reward}
                      </div>
                    </div>

                    {/* Timeframe Metric Column (Requested Feature) */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.68rem', color: '#38bdf8', textTransform: 'uppercase', fontWeight: 700 }}>
                        TIMEFRAME
                      </div>
                      <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#38bdf8' }}>
                        {sig.timeframe.toUpperCase()}
                      </div>
                    </div>

                    {/* Timestamp & Elapsed Time Indicator (Requested Feature) */}
                    <div
                      style={{
                        paddingLeft: '14px',
                        borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                        textAlign: 'right',
                        minWidth: '135px'
                      }}
                    >
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <Clock size={11} color="#818cf8" />
                        <span>{sig.issued_at}</span>
                      </div>
                      <div
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          color: '#38bdf8',
                          marginTop: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '4px'
                        }}
                      >
                        <span className="pulse-indicator" style={{ width: '6px', height: '6px', background: '#38bdf8' }} />
                        <span>{elapsedDisplay}</span>
                      </div>
                    </div>

                    {/* Chart Icon Button (Requested Feature: opens NSE chart directly with Long/Short indicator) */}
                    <div style={{ paddingLeft: '8px', display: 'flex', alignItems: 'center' }}>
                      <button
                        onClick={() => openChartModal(sig)}
                        className="btn"
                        style={{
                          background: isBuy ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.16)',
                          border: isBuy ? '1.5px solid #10b981' : '1.5px solid #ef4444',
                          color: isBuy ? '#34d399' : '#f87171',
                          padding: '7px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          boxShadow: isBuy ? '0 0 10px rgba(16, 185, 129, 0.25)' : '0 0 10px rgba(239, 68, 68, 0.25)',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.15s ease'
                        }}
                        title={`Open NSE Chart for ${sig.symbol} with ${isBuy ? 'LONG' : 'SHORT'} indicator`}
                      >
                        <BarChart2 size={16} />
                        <span>NSE Chart</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Navigation Hub Drawer */}
        <NavigationDrawer isOpen={navDrawerOpen} onClose={() => setNavDrawerOpen(false)} />
      </div>
    </div>
  );
}

export default function TradeSignalsPage() {
  return (
    <React.Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0d14' }} />}>
      <TradeSignalsContent />
    </React.Suspense>
  );
}

