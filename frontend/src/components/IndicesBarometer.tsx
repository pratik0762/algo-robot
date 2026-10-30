'use client';

import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Globe2,
  ShieldAlert,
  Layers,
  ChevronRight,
  RefreshCw,
  Sparkles
} from 'lucide-react';

import Link from 'next/link';
import { getApiBase } from '@/config/api';

export interface LiveTickerItem {
  name: string;
  symbol: string;
  last_price: number;
  change: number;
  percent_change: number;
  badge: string;
  special?: 'gift' | 'vix' | null;
  volatility_status?: string;
}

interface IndicesBarometerProps {
  onOpenAllIndices?: () => void;
  onSelectIndex?: (indexName: string) => void;
}

export default function IndicesBarometer({ onOpenAllIndices, onSelectIndex }: IndicesBarometerProps) {
  const [tickerItems, setTickerItems] = useState<LiveTickerItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [timestamp, setTimestamp] = useState<string>('');

  const fetchLiveTicker = async () => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/indices/live`);
      if (res.ok) {
        const data = await res.json();
        setTickerItems(data.items || []);
        setTimestamp(data.timestamp || '');
      }
    } catch (err) {
      console.error('Failed to fetch live indices ticker:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveTicker();
    const interval = setInterval(fetchLiveTicker, 15000); // 15s live refresh
    return () => clearInterval(interval);
  }, []);

  if (loading && tickerItems.length === 0) {
    return (
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.7)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '8px 24px',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <RefreshCw size={13} className="pulse-indicator" color="#6366f1" />
        <span>Loading live market indices, GIFT NIFTY & India VIX...</span>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'linear-gradient(90deg, rgba(13, 17, 28, 0.95) 0%, rgba(17, 24, 39, 0.95) 100%)',
        borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
        padding: '8px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        overflow: 'hidden',
        gap: '16px',
        fontSize: '0.78rem',
      }}
    >
      {/* Left Label & Dedicated Full Page Link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <Link
          href="/indices"
          className="btn"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 12px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.72rem',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 0 12px rgba(99, 102, 241, 0.35)',
            whiteSpace: 'nowrap',
            textDecoration: 'none',
          }}
          title="Open dedicated page with ALL 140+ official Indian indices"
        >
          <Layers size={13} />
          <span>ALL 140+ INDICES (PAGE)</span>
          <ChevronRight size={13} />
        </Link>

        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className="pulse-indicator" style={{ background: '#10b981', width: '6px', height: '6px' }}></span>
          LIVE NSE & NSE IX FEED
        </span>
      </div>

      {/* Marquee Ticker of Key Indices with GIFT NIFTY & INDIA VIX Spotlight */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          padding: '2px 0',
        }}
      >
        {tickerItems.map((item) => {
          const isPositive = item.change >= 0;
          const isGift = item.special === 'gift';
          const isVix = item.special === 'vix';

          return (
            <Link
              key={item.symbol}
              href="/indices"
              style={{
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 10px',
                borderRadius: '8px',
                background: isGift
                  ? 'rgba(236, 72, 153, 0.12)'
                  : isVix
                  ? 'rgba(245, 158, 11, 0.12)'
                  : 'rgba(255, 255, 255, 0.03)',
                border: isGift
                  ? '1px solid rgba(236, 72, 153, 0.4)'
                  : isVix
                  ? '1px solid rgba(245, 158, 11, 0.4)'
                  : '1px solid rgba(255, 255, 255, 0.06)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
              title={
                isGift
                  ? 'GIFT NIFTY: Traded on NSE IX (GIFT City, Gandhinagar) across 21 trading hours'
                  : isVix
                  ? `INDIA VIX: NSE Volatility Index. ${item.volatility_status || ''}`
                  : `Click to view all indices data`
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isGift && <Globe2 size={13} color="#ec4899" />}
                {isVix && <Activity size={13} color="#f59e0b" />}
                <span
                  style={{
                    fontWeight: 700,
                    color: isGift ? '#f472b6' : isVix ? '#fbbf24' : 'var(--text-primary)',
                    fontSize: '0.75rem',
                  }}
                >
                  {item.name}
                </span>
                {isGift && (
                  <span
                    style={{
                      fontSize: '0.6rem',
                      fontWeight: 800,
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: item.badge?.includes('LIVE') ? 'rgba(16, 185, 129, 0.25)' : '#ec4899',
                      border: item.badge?.includes('LIVE') ? '1px solid rgba(16, 185, 129, 0.4)' : 'none',
                      color: item.badge?.includes('LIVE') ? '#34d399' : '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                    }}
                  >
                    {item.badge?.includes('LIVE') && (
                      <span className="pulse-indicator" style={{ background: '#10b981', width: '4px', height: '4px' }}></span>
                    )}
                    {item.badge || 'GIFT CITY'}
                  </span>
                )}
                {isVix && (
                  <span
                    style={{
                      fontSize: '0.6rem',
                      fontWeight: 800,
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: '#f59e0b',
                      color: '#000',
                    }}
                  >
                    VOLATILITY
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 800, color: '#ffffff', fontSize: '0.78rem' }}>
                  {item.last_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    color: isPositive ? '#34d399' : '#f87171',
                  }}
                >
                  {isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {isPositive ? '+' : ''}
                  {item.percent_change.toFixed(2)}%
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Timestamp */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <button
          onClick={fetchLiveTicker}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '4px',
          }}
          title="Refresh live indices feed"
        >
          <RefreshCw size={12} />
        </button>
      </div>
    </div>
  );
}
