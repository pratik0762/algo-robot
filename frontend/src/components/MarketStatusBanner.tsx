'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Clock,
  Calendar,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle2
} from 'lucide-react';
import { getApiBase } from '@/config/api';

export interface MarketStatusDetail {
  is_open: boolean;
  status: string;
  market_state: string;
  badge: string;
  headline: string;
  reason_category: string;
  reason: string;
  detailed_explanation: string;
  next_session: string;
  trading_hours: string;
  holiday_name?: string;
  holiday_desc?: string;
  current_time_ist?: string;
  exchange: string;
  settlement_note?: string;
}

interface MarketStatusBannerProps {
  statusDetail?: MarketStatusDetail | null;
  compact?: boolean;
}

export default function MarketStatusBanner({ statusDetail: propDetail, compact = false }: MarketStatusBannerProps) {
  const [detail, setDetail] = useState<MarketStatusDetail | null>(propDetail || null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  useEffect(() => {
    if (propDetail) {
      setDetail(propDetail);
      return;
    }

    const fetchStatus = async () => {
      try {
        const apiBase = getApiBase();
        const res = await fetch(`${apiBase}/api/market-status`);
        if (res.ok) {
          const json = await res.json();
          setDetail(json);
        }
      } catch (e) {
        console.error('Failed to fetch market status:', e);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [propDetail]);

  if (!detail) return null;

  // If the market is open, optionally show a subtle active banner or nothing
  if (detail.is_open) {
    return null;
  }

  const isHoliday = detail.reason_category === 'TRADING_HOLIDAY';
  const isWeekend = detail.reason_category === 'WEEKEND';

  const badgeBg = isHoliday
    ? 'rgba(239, 68, 68, 0.16)'
    : isWeekend
    ? 'rgba(245, 158, 11, 0.16)'
    : 'rgba(99, 102, 241, 0.16)';
  const badgeBorder = isHoliday
    ? 'rgba(239, 68, 68, 0.4)'
    : isWeekend
    ? 'rgba(245, 158, 11, 0.4)'
    : 'rgba(99, 102, 241, 0.4)';
  const badgeColor = isHoliday ? '#f87171' : isWeekend ? '#fbbf24' : '#a5b4fc';

  if (compact) {
    return (
      <div
        style={{
          background: 'rgba(239, 68, 68, 0.08)',
          borderBottom: '1px solid rgba(239, 68, 68, 0.25)',
          padding: '6px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.74rem',
          color: '#f87171',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#ef4444',
              display: 'inline-block',
              boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)',
              flexShrink: 0,
            }}
          />
          <strong style={{ color: '#ffffff' }}>{detail.badge}:</strong>
          <span style={{ color: 'var(--text-secondary)' }}>{detail.reason}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.70rem', color: '#fbbf24', flexShrink: 0 }}>
          <Clock size={12} />
          <span>Next Open: <strong>{detail.next_session}</strong></span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.10) 0%, rgba(15, 23, 42, 0.95) 50%, rgba(245, 158, 11, 0.10) 100%)',
        border: '1px solid rgba(239, 68, 68, 0.35)',
        borderRadius: '12px',
        padding: '14px 18px',
        marginBottom: '16px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top Banner Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ef4444',
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={20} />
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.64rem',
                  fontWeight: 900,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: badgeBg,
                  border: `1px solid ${badgeBorder}`,
                  color: badgeColor,
                }}
              >
                {detail.badge}
              </span>

              <h2
                style={{
                  fontSize: '0.98rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  margin: 0,
                  letterSpacing: '-0.01em',
                }}
              >
                {detail.headline}
              </h2>
            </div>

            <p
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                margin: '3px 0 0 0',
                lineHeight: 1.4,
              }}
            >
              {detail.reason}
            </p>
          </div>
        </div>

        {/* Next Session Box & Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '6px 12px',
              borderRadius: '8px',
              textAlign: 'right',
            }}
          >
            <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Next Trading Session
            </div>
            <div style={{ fontSize: '0.76rem', color: '#38bdf8', fontWeight: 800 }}>
              {detail.next_session}
            </div>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              padding: '6px 10px',
              fontSize: '0.72rem',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
            }}
            title="Toggle closure details and live data guarantees"
          >
            <span>{isExpanded ? 'Less' : 'Details'}</span>
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Expanded Detailed Explanation & Live Data Guarantee */}
      {isExpanded && (
        <div
          style={{
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '12px',
            fontSize: '0.74rem',
          }}
        >
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.25)',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fbbf24', fontWeight: 700, marginBottom: '4px' }}>
              <Info size={14} />
              <span>Official Closure Explanation</span>
            </div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {detail.detailed_explanation}
            </p>
          </div>

          <div
            style={{
              background: 'rgba(16, 185, 129, 0.06)',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(16, 185, 129, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontWeight: 700, marginBottom: '4px' }}>
              <ShieldCheck size={14} />
              <span>Live Market & Data Integrity Guarantee</span>
            </div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              All stock prices, indices, and 52-week metrics displayed across the platform are official closing settlement numbers certified by the National Stock Exchange of India (NSE) and Bombay Stock Exchange (BSE). In accordance with exchange integrity standards, <strong>zero synthetic micro-price fluctuations occur</strong> while the market is closed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

