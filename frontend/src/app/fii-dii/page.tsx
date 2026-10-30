'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  RefreshCw,
  BarChart3,
  PieChart,
  Activity,
  Layers,
  ChevronRight,
  Sparkles,
  Info,
  Scale,
  Calendar,
  Globe2,
  Building2,
  Zap,
  CheckCircle2
} from 'lucide-react';
import IndicesBarometer from '@/components/IndicesBarometer';
import { getApiBase } from '@/config/api';

export interface FiiDiiData {
  trade_date: string;
  source: string;
  fii: {
    category: string;
    buy_value_cr: number;
    sell_value_cr: number;
    net_value_cr: number;
    action: string;
  };
  dii: {
    category: string;
    buy_value_cr: number;
    sell_value_cr: number;
    net_value_cr: number;
    action: string;
  };
  combined: {
    total_buy_value_cr: number;
    total_sell_value_cr: number;
    net_institutional_flow_cr: number;
    status: string;
  };
  market_impact: {
    sentiment: string;
    impact_rating: string;
    impact_score: number;
    nifty_bias: string;
    headline: string;
    strategic_insights: Array<{
      pillar: string;
      status: string;
      summary: string;
      action: string;
    }>;
    sectoral_flows: Array<{
      sector: string;
      fii_bias: string;
      dii_bias: string;
      net_impact: string;
    }>;
  };
  historical_trend: Array<{
    date: string;
    fii_buy: number;
    fii_sell: number;
    fii_net: number;
    dii_buy: number;
    dii_sell: number;
    dii_net: number;
    combined_net: number;
    market_reaction: string;
    sentiment: string;
  }>;
  timestamp: string;
}

export default function FiiDiiPage() {
  const [data, setData] = useState<FiiDiiData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'impact' | 'sectors' | 'history'>('overview');

  const fetchFiiDiiData = async (isManual: boolean = false, retries = 2) => {
    if (isManual) setRefreshing(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/fii-dii`);
      if (res.ok) {
        const json: FiiDiiData = await res.json();
        setData(json);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => fetchFiiDiiData(isManual, retries - 1), 600);
      } else {
        console.error('Failed to fetch FII/DII data:', err);
      }
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFiiDiiData();
    const interval = setInterval(() => fetchFiiDiiData(), 30000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0d14' }}>
        <IndicesBarometer />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
          <RefreshCw size={36} className="pulse-indicator" color="#10b981" />
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Fetching Official FII/DII Institutional Flow Data from NSE India...
          </div>
        </div>
      </div>
    );
  }

  const fiiNet = data?.fii.net_value_cr ?? 0;
  const diiNet = data?.dii.net_value_cr ?? 0;
  const combinedNet = data?.combined.net_institutional_flow_cr ?? 0;
  const isCombinedPositive = combinedNet >= 0;
  const impact = data?.market_impact;

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
                background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)',
              }}
            >
              <ArrowLeftRight size={22} color="white" />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
                  FII / DII INSTITUTIONAL TRADING & MARKET IMPACT
                </h1>
                <span className="badge badge-success">NSE OFFICIAL DATA</span>
                <span className="badge badge-primary">CASH MARKET FEED</span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Real-Time Foreign & Domestic Institutional Flows &bull; Trade Date: <strong style={{ color: '#fff' }}>{data?.trade_date}</strong>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: isCombinedPositive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                border: isCombinedPositive ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                padding: '6px 14px',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: isCombinedPositive ? '#34d399' : '#f87171',
              }}
            >
              <span className="pulse-indicator" style={{ background: isCombinedPositive ? '#10b981' : '#ef4444' }}></span>
              <span>Net Balance: {isCombinedPositive ? '+' : ''}₹{combinedNet.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Cr</span>
            </div>

            <button
              onClick={() => fetchFiiDiiData(true)}
              disabled={refreshing}
              className="btn btn-secondary"
              style={{ padding: '8px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Refresh live FII/DII data directly from NSE"
            >
              <RefreshCw size={14} className={refreshing ? 'pulse-indicator' : ''} />
              <span>{refreshing ? 'Fetching...' : 'Sync Live from NSE'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Top Barometer Strip */}
      <IndicesBarometer />

      {/* Main Page Scrollable Body */}
      <main style={{ flex: 1, maxWidth: '1440px', width: '100%', margin: '0 auto', padding: '24px 24px 80px 24px' }}>

        {/* =========================================================================
            MARKET IMPACT ENGINE (HERO BANNER)
        ========================================================================= */}
        <section
          className="glass-panel"
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(15, 23, 42, 0.85) 50%, rgba(99, 102, 241, 0.1) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            borderRadius: '20px',
            padding: '28px',
            marginBottom: '32px',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(16, 185, 129, 0.15)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px', marginBottom: '20px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: '#34d399',
                    background: 'rgba(16, 185, 129, 0.15)',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Sparkles size={14} />
                  QUANTITATIVE MARKET IMPACT ENGINE
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Assessed from NSE Cash & Derivatives Settlement
                </span>
              </div>

              <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                {impact?.sentiment}
              </h2>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#818cf8', marginTop: '4px' }}>
                {impact?.impact_rating} &bull; Nifty 50 Bias: <span style={{ color: '#ffffff' }}>{impact?.nifty_bias}</span>
              </div>
            </div>

            {/* Impact Score Gauge Card */}
            <div
              style={{
                background: 'rgba(10, 14, 24, 0.75)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '16px 24px',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
              }}
            >
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  MARKET IMPACT SCORE
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
                  <span style={{ fontSize: '2rem', fontWeight: 900, color: (impact?.impact_score ?? 5) >= 6 ? '#34d399' : (impact?.impact_score ?? 5) <= 4 ? '#f87171' : '#fbbf24' }}>
                    {impact?.impact_score.toFixed(1)}
                  </span>
                  <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 700 }}>/ 10</span>
                </div>
              </div>
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  background: (impact?.impact_score ?? 5) >= 6
                    ? 'conic-gradient(#10b981 0% 75%, rgba(255,255,255,0.08) 75% 100%)'
                    : 'conic-gradient(#f59e0b 0% 50%, rgba(255,255,255,0.08) 50% 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '5px'
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    background: '#0a0d14',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    color: '#fff',
                  }}
                >
                  {(impact?.impact_score ?? 5) >= 6 ? 'BULL' : 'MIX'}
                </div>
              </div>
            </div>
          </div>

          {/* Headline Banner */}
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.08)',
              borderLeft: '4px solid #10b981',
              padding: '12px 18px',
              borderRadius: '0 12px 12px 0',
              fontSize: '0.95rem',
              color: '#f8fafc',
              marginBottom: '24px',
              lineHeight: 1.5,
              fontWeight: 500
            }}
          >
            <strong>Market Verdict:</strong> {impact?.headline}
          </div>

          {/* 4 Strategic Analysis Pillars */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            {impact?.strategic_insights.map((insight, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(10, 14, 24, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '14px',
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#818cf8' }}>
                      {insight.pillar}
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#34d399',
                      }}
                    >
                      {insight.status}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '12px' }}>
                    {insight.summary}
                  </p>
                </div>

                <div
                  style={{
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    paddingTop: '10px',
                    fontSize: '0.74rem',
                    color: '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <CheckCircle2 size={13} color="#10b981" style={{ flexShrink: 0 }} />
                  <span><strong>Tactical Action:</strong> {insight.action}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* =========================================================================
            3 SPOTLIGHT CARDS: FII, DII & COMBINED FLOWS
        ========================================================================= */}
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Scale size={18} color="#818cf8" />
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
            INSTITUTIONAL CASH MARKET BREAKDOWN (NSE)
          </h2>
        </div>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '20px',
            marginBottom: '36px',
          }}
        >
          {/* FII CARD */}
          <div
            className="glass-panel"
            style={{
              padding: '24px',
              border: fiiNet >= 0 ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
              background: fiiNet >= 0
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.7) 100%)'
                : 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(15, 23, 42, 0.7) 100%)',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                    }}
                  >
                    <Globe2 size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>
                      FII / FPI ACTIVITY
                    </h3>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Foreign Portfolio & Institutional Investors
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    background: fiiNet >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: fiiNet >= 0 ? '#34d399' : '#f87171',
                    border: fiiNet >= 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                  }}
                >
                  {data?.fii.action}
                </span>
              </div>

              {/* Net Flow Display */}
              <div style={{ background: 'rgba(0, 0, 0, 0.35)', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                  FII NET CASH FLOW
                </div>
                <div style={{ fontSize: '1.9rem', fontWeight: 900, color: fiiNet >= 0 ? '#34d399' : '#f87171', letterSpacing: '-0.02em', marginTop: '2px' }}>
                  {fiiNet >= 0 ? '+' : ''}₹{fiiNet.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Cr
                </div>
              </div>

              {/* Buy vs Sell Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>GROSS BUY VALUE</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
                    ₹{data?.fii.buy_value_cr.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Cr
                  </div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>GROSS SELL VALUE</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f87171', marginTop: '2px' }}>
                    ₹{data?.fii.sell_value_cr.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Cr
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              Reported to NSE & NSDL &bull; Official Closing Settlement
            </div>
          </div>

          {/* DII CARD */}
          <div
            className="glass-panel"
            style={{
              padding: '24px',
              border: diiNet >= 0 ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
              background: diiNet >= 0
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.7) 100%)'
                : 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(15, 23, 42, 0.7) 100%)',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                    }}
                  >
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>
                      DII ACTIVITY
                    </h3>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Mutual Funds, Insurance (LIC), Pension & Banks
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    background: diiNet >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: diiNet >= 0 ? '#34d399' : '#f87171',
                    border: diiNet >= 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                  }}
                >
                  {data?.dii.action}
                </span>
              </div>

              {/* Net Flow Display */}
              <div style={{ background: 'rgba(0, 0, 0, 0.35)', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                  DII NET CASH FLOW
                </div>
                <div style={{ fontSize: '1.9rem', fontWeight: 900, color: diiNet >= 0 ? '#34d399' : '#f87171', letterSpacing: '-0.02em', marginTop: '2px' }}>
                  {diiNet >= 0 ? '+' : ''}₹{diiNet.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Cr
                </div>
              </div>

              {/* Buy vs Sell Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>GROSS BUY VALUE</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
                    ₹{data?.dii.buy_value_cr.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Cr
                  </div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>GROSS SELL VALUE</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f87171', marginTop: '2px' }}>
                    ₹{data?.dii.sell_value_cr.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Cr
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              Domestic Retail SIP Inflow Rate: ₹24,000+ Cr/Month
            </div>
          </div>

          {/* COMBINED NET INSTITUTIONAL FLOW CARD */}
          <div
            className="glass-panel"
            style={{
              padding: '24px',
              border: isCombinedPositive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
              background: isCombinedPositive
                ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(15, 23, 42, 0.7) 100%)'
                : 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(15, 23, 42, 0.7) 100%)',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                    }}
                  >
                    <Scale size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>
                      TOTAL NET FLOW
                    </h3>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      FII + DII Combined Net Cash Balance
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    background: isCombinedPositive ? 'rgba(56, 189, 248, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: isCombinedPositive ? '#38bdf8' : '#f87171',
                    border: isCombinedPositive ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                  }}
                >
                  {data?.combined.status}
                </span>
              </div>

              {/* Net Balance Display */}
              <div style={{ background: 'rgba(0, 0, 0, 0.35)', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                  COMBINED INSTITUTIONAL INFLOW
                </div>
                <div style={{ fontSize: '1.9rem', fontWeight: 900, color: isCombinedPositive ? '#38bdf8' : '#f87171', letterSpacing: '-0.02em', marginTop: '2px' }}>
                  {isCombinedPositive ? '+' : ''}₹{combinedNet.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Cr
                </div>
              </div>

              {/* Gross Volumes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>TOTAL GROSS BUY</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
                    ₹{data?.combined.total_buy_value_cr.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Cr
                  </div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>TOTAL GROSS SELL</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f87171', marginTop: '2px' }}>
                    ₹{data?.combined.total_sell_value_cr.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Cr
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              Absorption Ratio: {((data?.dii.buy_value_cr ?? 1) / (data?.fii.sell_value_cr || 1)).toFixed(2)}x (Domestic Coverage)
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTORAL FLOW DIVERGENCE MAP
        ========================================================================= */}
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <PieChart size={18} color="#06b6d4" />
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
            SECTORAL INSTITUTIONAL CAPITAL ROTATION MAP
          </h2>
        </div>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
            gap: '16px',
            marginBottom: '40px',
          }}
        >
          {impact?.sectoral_flows.map((sec, idx) => (
            <div
              key={idx}
              className="glass-panel"
              style={{
                padding: '18px',
                borderRadius: '14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                border: '1px solid rgba(255, 255, 255, 0.07)',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff' }}>
                    {sec.sector}
                  </h4>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: sec.net_impact.toLowerCase().includes('bullish')
                        ? 'rgba(16, 185, 129, 0.15)'
                        : 'rgba(245, 158, 11, 0.15)',
                      color: sec.net_impact.toLowerCase().includes('bullish') ? '#34d399' : '#fbbf24',
                    }}
                  >
                    {sec.net_impact.split('/')[0].trim()}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px' }}>
                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>FII STANCE</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: sec.fii_bias.includes('Buyers') ? '#34d399' : '#f87171', marginTop: '2px' }}>
                      {sec.fii_bias}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>DII STANCE</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: sec.dii_bias.includes('Buyers') ? '#34d399' : '#f87171', marginTop: '2px' }}>
                      {sec.dii_bias}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                <strong>Net Influence:</strong> {sec.net_impact}
              </div>
            </div>
          ))}
        </section>

        {/* =========================================================================
            HISTORICAL 6-SESSION INSTITUTIONAL TREND TABLE
        ========================================================================= */}
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} color="#a855f7" />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
              HISTORICAL 6-SESSION INSTITUTIONAL FLOW TRACKER
            </h2>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            All figures in ₹ Crores (INR) &bull; Official Daily Settlement
          </span>
        </div>

        <section
          className="glass-panel"
          style={{
            overflow: 'hidden',
            borderRadius: '16px',
            border: '1px solid var(--border-subtle)',
            marginBottom: '32px',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.85)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>DATE</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, textAlign: 'right' }}>FII BUY (₹ CR)</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, textAlign: 'right' }}>FII SELL (₹ CR)</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, textAlign: 'right' }}>FII NET (₹ CR)</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, textAlign: 'right' }}>DII BUY (₹ CR)</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, textAlign: 'right' }}>DII SELL (₹ CR)</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, textAlign: 'right' }}>DII NET (₹ CR)</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, textAlign: 'right' }}>COMBINED NET</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>MARKET REACTION</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700 }}>SENTIMENT STANCE</th>
                </tr>
              </thead>
              <tbody>
                {data?.historical_trend.map((row, idx) => {
                  const isFiiPositive = row.fii_net >= 0;
                  const isDiiPositive = row.dii_net >= 0;
                  const isCombPositive = row.combined_net >= 0;

                  return (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        background: idx === 0 ? 'rgba(16, 185, 129, 0.05)' : idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: idx === 0 ? '#34d399' : '#ffffff' }}>
                        {row.date} {idx === 0 && <span className="badge badge-success" style={{ marginLeft: '6px', fontSize: '0.62rem', padding: '1px 5px' }}>LATEST</span>}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right', color: '#94a3b8' }}>
                        ₹{row.fii_buy.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right', color: '#94a3b8' }}>
                        ₹{row.fii_sell.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 800, color: isFiiPositive ? '#34d399' : '#f87171' }}>
                        {isFiiPositive ? '+' : ''}₹{row.fii_net.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right', color: '#94a3b8' }}>
                        ₹{row.dii_buy.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right', color: '#94a3b8' }}>
                        ₹{row.dii_sell.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 800, color: isDiiPositive ? '#34d399' : '#f87171' }}>
                        {isDiiPositive ? '+' : ''}₹{row.dii_net.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 900, color: isCombPositive ? '#38bdf8' : '#f87171' }}>
                        {isCombPositive ? '+' : ''}₹{row.combined_net.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                      </td>
                      <td style={{ padding: '14px 18px', color: '#f8fafc', fontWeight: 600 }}>
                        {row.market_reaction}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            background: row.sentiment.includes('BULL')
                              ? 'rgba(16, 185, 129, 0.15)'
                              : row.sentiment.includes('BEAR')
                                ? 'rgba(239, 68, 68, 0.15)'
                                : 'rgba(245, 158, 11, 0.15)',
                            color: row.sentiment.includes('BULL')
                              ? '#34d399'
                              : row.sentiment.includes('BEAR')
                                ? '#f87171'
                                : '#fbbf24',
                          }}
                        >
                          {row.sentiment}
                        </span>
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
          <span>Official FII/DII Cash Market Settlement Feed sourced directly from NSE India</span>
        </div>
        <div>
          Last Updated: <strong style={{ color: '#ffffff' }}>{data?.timestamp || 'Live'}</strong>
        </div>
      </footer>
    </div>
  );
}
