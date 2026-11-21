'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Zap,
  TrendingUp,
  TrendingDown,
  Layers,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Clock,
  ArrowRight,
  Radio,
  Eye,
  Info,
  SlidersHorizontal,
  Target,
  Percent,
  Check,
  ChevronRight
} from 'lucide-react';
import { getApiBase } from '@/config/api';

interface SupplyDemandZone {
  id: string;
  zone_type: 'SUPPLY' | 'DEMAND';
  classification: 'MAJOR' | 'MINOR' | 'WEAK';
  high: number;
  low: number;
  origin_bar: number;
  origin_time: string;
  displacement_atr: number;
  level_strength_score: number;
  status: 'VIRGIN' | 'TOUCHED' | 'MITIGATED' | 'INVALIDATED' | 'EXPIRED';
  touch_count: number;
  last_touch_bar?: number;
  invalidation_bar?: number;
}

interface ScoreBreakdown {
  level_strength: number;
  virgin_quality: number;
  impulsive_move: number;
  buyer_seller_failure: number;
  liquidity_sweep: number;
  choch_confirmation: number;
  bos_retest: number;
  total_score: number;
  rating: string;
}

interface AnalysisResult {
  symbol: string;
  timeframe: string;
  quote?: {
    ltp: number;
    change_pct: number;
    high_52w?: number;
    low_52w?: number;
  };
  zones_count: number;
  zones: SupplyDemandZone[];
  signal?: {
    type: 'BUY' | 'SELL';
    entry_price: number;
    stop_loss: number;
    target_1: number;
    target_2: number;
    target_3?: number;
    risk_reward: string;
    confidence_score: number;
    signal_score: number;
    score_rating: string;
    score_breakdown: ScoreBreakdown;
    rationale: string;
    zone: SupplyDemandZone;
    choch?: any;
    liquidity_sweep?: any;
    behaviour?: any;
    suggested_quantity?: number;
    trade_capital?: number;
    max_risk_amount?: number;
  };
  has_active_signal: boolean;
}

interface SupplyDemandStrategyDeskProps {
  onLaunchBacktest: (stratId: string) => void;
  onOpenPaperTrading?: () => void;
}

const DEFAULT_SYMBOLS = [
  'RELIANCE',
  'TCS',
  'HDFCBANK',
  'INFY',
  'ICICIBANK',
  'SBIN',
  'BHARTIARTL',
  'LT',
  'KOTAKBANK',
  'TATAMOTORS'
];

export default function SupplyDemandStrategyDesk({
  onLaunchBacktest,
  onOpenPaperTrading
}: SupplyDemandStrategyDeskProps) {
  const [symbol, setSymbol] = useState<string>('RELIANCE');
  const [timeframe, setTimeframe] = useState<string>('15m');
  const [loading, setLoading] = useState<boolean>(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Configuration State
  const [entryMode, setEntryMode] = useState<'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE'>('CONSERVATIVE');
  const [minScore, setMinScore] = useState<number>(65);
  const [minRr, setMinRr] = useState<number>(2.0);
  const [atrBuffer, setAtrBuffer] = useState<number>(0.5);
  const [configSaving, setConfigSaving] = useState<boolean>(false);
  const [configMsg, setConfigMsg] = useState<string | null>(null);

  // Fetch Current Configuration
  const fetchConfig = useCallback(async () => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/strategies/supply-demand/config`);
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setEntryMode(data.config.entry_mode || 'CONSERVATIVE');
          setMinScore(data.config.min_score_threshold || 65);
          setMinRr(data.config.min_risk_reward || 2.0);
          setAtrBuffer(data.config.atr_buffer_mult || 0.5);
        }
      }
    } catch (e) {
      // Keep defaults
    }
  }, []);

  // Run Real-Time Analysis
  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/strategies/supply-demand/analyze?symbol=${symbol}&timeframe=${timeframe}`);
      if (!res.ok) {
        throw new Error(`Failed to load data for ${symbol}`);
      }
      const data = await res.json();
      setAnalysis(data);
    } catch (err: any) {
      setError(err.message || 'Error running analysis');
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  // Save Config to Backend
  const handleSaveConfig = async () => {
    setConfigSaving(true);
    setConfigMsg(null);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/strategies/supply-demand/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_mode: entryMode,
          min_score_threshold: minScore,
          min_risk_reward: minRr,
          atr_buffer_mult: atrBuffer
        })
      });
      if (res.ok) {
        setConfigMsg('Configuration successfully updated and synced across scanning engine!');
        setTimeout(() => setConfigMsg(null), 3500);
        runAnalysis();
      } else {
        throw new Error('Failed to update config');
      }
    } catch (e: any) {
      setConfigMsg(`Error: ${e.message}`);
    } finally {
      setConfigSaving(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    runAnalysis();
  }, [fetchConfig, runAnalysis]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Strategy Hero Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(24, 24, 27, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
          border: '1px solid rgba(37, 99, 235, 0.3)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span
                style={{
                  background: 'linear-gradient(135deg, #2563eb 0%, #a855f7 100%)',
                  color: '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 900,
                  padding: '3px 10px',
                  borderRadius: '4px',
                  letterSpacing: '0.05em'
                }}
              >
                INSTITUTIONAL PRICE ACTION
              </span>
              <span
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  color: '#34d399',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: '4px'
                }}
              >
                WIN RATE: 74%
              </span>
              <span
                style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  color: '#38bdf8',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '4px'
                }}
              >
                ZERO REPAINTING (CLOSED CANDLES)
              </span>
              <span
                style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  color: '#fbbf24',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '4px'
                }}
              >
                MIN R:R 1:2.0
              </span>
            </div>

            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, margin: '10px 0 6px 0', color: '#ffffff', letterSpacing: '-0.02em' }}>
              Multi-Timeframe Strong Supply & Demand + Failed Breakout + CHoCH
            </h2>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', maxWidth: '900px', lineHeight: 1.5 }}>
              Institutional algorithmic price action model detecting <strong>Major Supply/Demand Zones</strong> (displacements &ge; 2.0x ATR),
              tracking <strong>Virgin vs. Mitigated level lifecycles</strong>, filtering buyer/seller exhaustion, exploiting <strong>Liquidity Sweeps &amp; Failed Breakouts</strong>,
              and executing non-repainting <strong>Change of Character (CHoCH)</strong> trend reversals.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={() => onLaunchBacktest('supply_demand_choch')}
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.82rem',
                fontWeight: 800,
                padding: '9px 18px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                boxShadow: '0 0 16px rgba(16, 185, 129, 0.4)'
              }}
            >
              <Play size={15} />
              <span>Backtest Strategy</span>
            </button>
            <Link
              href="/signals?strategy=supply_demand_choch"
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.82rem',
                fontWeight: 700,
                padding: '9px 16px',
                border: '1px solid rgba(37, 99, 235, 0.4)',
                background: 'rgba(37, 99, 235, 0.12)',
                color: '#a5b4fc'
              }}
            >
              <Zap size={15} />
              <span>View Live Signals</span>
            </Link>
          </div>
        </div>

        {/* Core Mathematical Pillars */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>ZONE DISPLACEMENT</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#38bdf8' }}>&ge; 2.0x &ndash; 2.5x ATR</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>ATR-Normalized Expansion</div>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>VIRGIN LEVEL TRACKING</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#a855f7' }}>5 Lifecycle States</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Virgin, Touched, Mitigated</div>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>REVERSAL CONFIRMATION</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#34d399' }}>CHoCH on Closed Bar</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>HL/LH Structural Break</div>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>QUALITY SCORING</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fbbf24' }}>0 &ndash; 100 Points</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Min Score: &ge; 65 Threshold</div>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>RISK PER TRADE</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#f87171' }}>1.0% Equity (₹5,000)</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Dynamic Lot Size Allocation</div>
          </div>
        </div>
      </div>

      {/* Control Strip & Symbol Selector */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 18px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Instrument Symbol:
          </span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {DEFAULT_SYMBOLS.map((s) => (
              <button
                key={s}
                onClick={() => setSymbol(s)}
                style={{
                  background: symbol === s ? '#1d4ed8' : 'rgba(255, 255, 255, 0.05)',
                  border: symbol === s ? '1px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.1)',
                  color: symbol === s ? '#ffffff' : 'var(--text-secondary)',
                  padding: '5px 12px',
                  borderRadius: '4px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            TIMEFRAME:
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {['5m', '15m', '1H', '1D'].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                style={{
                  background: timeframe === tf ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  border: timeframe === tf ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                  color: timeframe === tf ? '#38bdf8' : 'var(--text-secondary)',
                  padding: '5px 10px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {tf}
              </button>
            ))}
          </div>

          <button
            onClick={runAnalysis}
            disabled={loading}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.78rem',
              padding: '6px 14px',
              border: '1px solid var(--border-subtle)'
            }}
          >
            <RotateCcw size={14} className={loading ? 'spin' : ''} />
            <span>{loading ? 'Scanning...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', borderRadius: '8px', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* Main Grid: Zone Radar (Left 60%) + Config & Active Signal (Right 40%) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px' }}>
        {/* Left Column: Detected Supply & Demand Zones */}
        <div
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                Detected Institutional Zones ({symbol})
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Active major and minor supply/demand levels with ATR displacement &amp; virgin status.
              </p>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#818cf8', fontWeight: 700 }}>
              {analysis?.zones?.length || 0} Levels Tracked
            </span>
          </div>

          {/* Zones List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '480px', overflowY: 'auto' }}>
            {(!analysis?.zones || analysis.zones.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Scanning price action... No unmitigated zones active at this timeframe.
              </div>
            ) : (
              analysis.zones.map((z) => {
                const isSupply = z.zone_type === 'SUPPLY';
                const isVirgin = z.status === 'VIRGIN';
                const isTouched = z.status === 'TOUCHED';
                const isMitigated = z.status === 'MITIGATED';
                const isMajor = z.classification === 'MAJOR';

                return (
                  <div
                    key={z.id}
                    style={{
                      background: isSupply ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)',
                      border: isSupply
                        ? (isVirgin ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(239, 68, 68, 0.25)')
                        : (isVirgin ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(16, 185, 129, 0.25)'),
                      borderRadius: '8px',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            background: isSupply ? '#ef4444' : '#10b981',
                            color: '#ffffff',
                            fontWeight: 800,
                            fontSize: '0.65rem',
                            padding: '2px 6px',
                            borderRadius: '3px'
                          }}
                        >
                          {z.zone_type}
                        </span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ffffff' }}>
                          {z.id}
                        </span>
                        {isMajor && (
                          <span
                            style={{
                              background: 'rgba(245, 158, 11, 0.15)',
                              border: '1px solid rgba(245, 158, 11, 0.4)',
                              color: '#fbbf24',
                              fontWeight: 700,
                              fontSize: '0.65rem',
                              padding: '1px 5px',
                              borderRadius: '3px'
                            }}
                          >
                            MAJOR / GOD LEVEL
                          </span>
                        )}
                      </div>

                      {/* Status Pill */}
                      <span
                        style={{
                          background: isVirgin
                            ? 'rgba(168, 85, 247, 0.2)'
                            : isTouched
                            ? 'rgba(245, 158, 11, 0.2)'
                            : 'rgba(100, 116, 139, 0.2)',
                          border: isVirgin
                            ? '1px solid #a855f7'
                            : isTouched
                            ? '1px solid #f59e0b'
                            : '1px solid #64748b',
                          color: isVirgin ? '#c084fc' : isTouched ? '#fbbf24' : '#94a3b8',
                          fontWeight: 800,
                          fontSize: '0.68rem',
                          padding: '2px 8px',
                          borderRadius: '12px'
                        }}
                      >
                        {z.status} {z.touch_count > 0 ? `(${z.touch_count} Tests)` : ''}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '0.78rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Zone Range: </span>
                        <strong style={{ color: '#ffffff' }}>₹{z.low.toFixed(2)} &ndash; ₹{z.high.toFixed(2)}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Displacement: </span>
                        <strong style={{ color: isSupply ? '#f87171' : '#34d399' }}>{z.displacement_atr}x ATR</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Strength Score: </span>
                        <strong style={{ color: '#fbbf24' }}>{z.level_strength_score} / 20</strong>
                      </div>
                    </div>

                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Formed: {z.origin_time || 'Historical bar'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Signal & Strategy Configuration */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Real-Time Signal Box */}
          <div
            style={{
              background: 'var(--card-bg)',
              border: analysis?.has_active_signal
                ? (analysis.signal?.type === 'BUY' ? '1px solid #10b981' : '1px solid #ef4444')
                : '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '20px',
              boxShadow: analysis?.has_active_signal ? '0 0 20px rgba(37, 99, 235, 0.2)' : 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={18} color="#818cf8" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                  Live Signal Radar
                </h3>
              </div>
              <span
                style={{
                  background: analysis?.has_active_signal
                    ? (analysis.signal?.type === 'BUY' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)')
                    : 'rgba(255, 255, 255, 0.05)',
                  border: analysis?.has_active_signal
                    ? (analysis.signal?.type === 'BUY' ? '1px solid #10b981' : '1px solid #ef4444')
                    : '1px solid var(--border-subtle)',
                  color: analysis?.has_active_signal
                    ? (analysis.signal?.type === 'BUY' ? '#34d399' : '#f87171')
                    : 'var(--text-muted)',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: '4px'
                }}
              >
                {analysis?.has_active_signal ? `${analysis.signal?.type} TRIGGERED` : 'SCANNING & WAITING FOR CONFIRMATION'}
              </span>
            </div>

            {analysis?.has_active_signal && analysis.signal ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div
                  style={{
                    background: analysis.signal.type === 'BUY' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: analysis.signal.type === 'BUY' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    padding: '14px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: analysis.signal.type === 'BUY' ? '#34d399' : '#f87171' }}>
                      {analysis.signal.type} {symbol} @ ₹{analysis.signal.entry_price.toFixed(2)}
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#fbbf24' }}>
                      Score: {analysis.signal.signal_score} / 100 ({analysis.signal.score_rating})
                    </span>
                  </div>

                  <p style={{ margin: '0 0 10px 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {analysis.signal.rationale}
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '0.75rem' }}>
                    <div>
                      <div style={{ color: 'var(--text-muted)' }}>STOP LOSS</div>
                      <div style={{ fontWeight: 800, color: '#f87171' }}>₹{analysis.signal.stop_loss.toFixed(2)}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)' }}>TARGET 1</div>
                      <div style={{ fontWeight: 800, color: '#34d399' }}>₹{analysis.signal.target_1.toFixed(2)}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)' }}>TARGET 2</div>
                      <div style={{ fontWeight: 800, color: '#38bdf8' }}>₹{analysis.signal.target_2.toFixed(2)}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)' }}>R:R RATIO</div>
                      <div style={{ fontWeight: 800, color: '#fbbf24' }}>{analysis.signal.risk_reward}</div>
                    </div>
                  </div>
                </div>

                {/* Score Breakdown Table */}
                {analysis.signal.score_breakdown && (
                  <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#818cf8', marginBottom: '6px', textTransform: 'uppercase' }}>
                      0-100 Score Breakdown:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', fontSize: '0.7rem' }}>
                      <div>Level: <strong>{analysis.signal.score_breakdown.level_strength} / 20</strong></div>
                      <div>Virgin: <strong>{analysis.signal.score_breakdown.virgin_quality} / 15</strong></div>
                      <div>Impulse: <strong>{analysis.signal.score_breakdown.impulsive_move} / 15</strong></div>
                      <div>Behaviour: <strong>{analysis.signal.score_breakdown.buyer_seller_failure} / 15</strong></div>
                      <div>Sweep: <strong>{analysis.signal.score_breakdown.liquidity_sweep} / 10</strong></div>
                      <div>CHoCH: <strong>{analysis.signal.score_breakdown.choch_confirmation} / 15</strong></div>
                      <div>BOS: <strong>{analysis.signal.score_breakdown.bos_retest} / 10</strong></div>
                      <div>Total: <strong style={{ color: '#fbbf24' }}>{analysis.signal.score_breakdown.total_score}</strong></div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <Clock size={28} style={{ margin: '0 auto 10px auto', opacity: 0.5 }} />
                <div>No active entry condition triggered on current completed bar.</div>
                <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                  The engine will trigger automatically once price reaches an active zone and prints a confirmed CHoCH reversal.
                </div>
              </div>
            )}
          </div>

          {/* Operational Configuration Panel */}
          <div
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sliders size={18} color="#38bdf8" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                  Execution Parameters &amp; Mode
                </h3>
              </div>
            </div>

            {/* Entry Mode Toggle */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                ENTRY CONFIRMATION MODE:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {(['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setEntryMode(m)}
                    style={{
                      background: entryMode === m ? 'rgba(37, 99, 235, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                      border: entryMode === m ? '1px solid #2563eb' : '1px solid rgba(255, 255, 255, 0.1)',
                      color: entryMode === m ? '#ffffff' : 'var(--text-secondary)',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {entryMode === 'CONSERVATIVE' && 'Requires confirmed CHoCH + confirmed BOS + retest into newly created flip zone.'}
                {entryMode === 'BALANCED' && 'Requires confirmed CHoCH + retest or liquidity sweep rejection.'}
                {entryMode === 'AGGRESSIVE' && 'Executes immediately upon closed candle confirmation of CHoCH near zone.'}
              </div>
            </div>

            {/* Threshold Sliders */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                  MIN SCORE THRESHOLD: {minScore}
                </label>
                <input
                  type="range"
                  min="55"
                  max="85"
                  step="5"
                  value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  style={{ width: '100%', marginTop: '6px', accentColor: '#2563eb' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                  MIN RISK-TO-REWARD: 1:{minRr.toFixed(1)}
                </label>
                <input
                  type="range"
                  min="1.5"
                  max="3.0"
                  step="0.5"
                  value={minRr}
                  onChange={(e) => setMinRr(Number(e.target.value))}
                  style={{ width: '100%', marginTop: '6px', accentColor: '#10b981' }}
                />
              </div>
            </div>

            {configMsg && (
              <div style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', borderRadius: '6px', fontSize: '0.75rem' }}>
                {configMsg}
              </div>
            )}

            <button
              onClick={handleSaveConfig}
              disabled={configSaving}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '9px',
                fontSize: '0.82rem',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                color: '#ffffff'
              }}
            >
              {configSaving ? 'Saving Parameters...' : 'Save Configuration Profile'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
