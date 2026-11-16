'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Globe2,
  ShieldAlert,
  Layers,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sparkles
} from 'lucide-react';

import Link from 'next/link';
import { getApiBase } from '@/config/api';
import MarketStatusBanner, { MarketStatusDetail } from '@/components/MarketStatusBanner';

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
  const [isMarketOpen, setIsMarketOpen] = useState<boolean>(true);
  const [marketStatusDetail, setMarketStatusDetail] = useState<MarketStatusDetail | null>(null);

  // Scroll, Drag & Marquee Controls
  const tickerRef = useRef<HTMLDivElement>(null);
  const isHoveredRef = useRef<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startScrollLeftRef = useRef<number>(0);
  const hasDraggedRef = useRef<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const fetchLiveTicker = async () => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/indices/live`);
      if (res.ok) {
        const data = await res.json();
        setTickerItems(data.items || []);
        setTimestamp(data.timestamp || '');
        if (data.is_market_open !== undefined) {
          setIsMarketOpen(Boolean(data.is_market_open));
        }
        if (data.market_status_detail) {
          setMarketStatusDetail(data.market_status_detail);
        }
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

  // Continuous smooth marquee animation with loop & pause on hover
  useEffect(() => {
    const el = tickerRef.current;
    if (!el || tickerItems.length === 0) return;

    let animId: number;
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      const delta = currentTime - lastTime;
      lastTime = currentTime;

      if (!isHoveredRef.current && !isDraggingRef.current && el) {
        // Comfortable readable ticker speed (~30px per sec)
        const step = 0.032 * Math.min(delta, 64);
        el.scrollLeft += step;

        // When reached midpoint of duplicated list, seamlessly loop back
        const halfWidth = el.scrollWidth / 2;
        if (halfWidth > 0 && el.scrollLeft >= halfWidth) {
          el.scrollLeft -= halfWidth;
        }
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [tickerItems]);

  // Horizontal mouse wheel scrolling
  const handleWheel = (e: React.WheelEvent) => {
    const el = tickerRef.current;
    if (!el) return;
    if (e.deltaY !== 0) {
      el.scrollLeft += e.deltaY;
      const halfWidth = el.scrollWidth / 2;
      if (halfWidth > 0) {
        if (el.scrollLeft >= halfWidth) el.scrollLeft -= halfWidth;
        else if (el.scrollLeft < 0) el.scrollLeft += halfWidth;
      }
    }
  };

  // Manual scroll buttons
  const scrollManual = (offset: number) => {
    const el = tickerRef.current;
    if (!el) return;
    el.scrollBy({ left: offset, behavior: 'smooth' });
  };

  // Drag-to-scroll handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const el = tickerRef.current;
    if (!el) return;
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    setIsDragging(true);
    startXRef.current = e.pageX - el.offsetLeft;
    startScrollLeftRef.current = el.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const el = tickerRef.current;
    if (!isDraggingRef.current || !el) return;
    const x = e.pageX - el.offsetLeft;
    const walk = (x - startXRef.current) * 1.4;
    if (Math.abs(walk) > 4) {
      hasDraggedRef.current = true;
    }
    el.scrollLeft = startScrollLeftRef.current - walk;

    const halfWidth = el.scrollWidth / 2;
    if (halfWidth > 0) {
      if (el.scrollLeft >= halfWidth) el.scrollLeft -= halfWidth;
      else if (el.scrollLeft < 0) el.scrollLeft += halfWidth;
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  const handleMouseEnter = () => {
    isHoveredRef.current = true;
  };

  const handleMouseLeave = () => {
    isHoveredRef.current = false;
    isDraggingRef.current = false;
    setIsDragging(false);
  };

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

  // Duplicate items array for seamless continuous marquee loop
  const displayItems = tickerItems.length > 0 ? [...tickerItems, ...tickerItems] : [];

  return (
    <>
      {!isMarketOpen && (
        <MarketStatusBanner statusDetail={marketStatusDetail} compact={true} />
      )}
      <div
        style={{
          background: 'linear-gradient(90deg, rgba(13, 17, 28, 0.95) 0%, rgba(17, 24, 39, 0.95) 100%)',
          borderBottom: '1px solid rgba(99, 102, 241, 0.2)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          overflow: 'hidden',
          gap: '10px',
          fontSize: '0.78rem',
        }}
      >
        {/* Left Label & Dedicated Full Page Link */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <Link
            href="/indices"
            className="btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              minHeight: '34px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.74rem',
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

          {isMarketOpen ? (
            <span style={{ color: '#34d399', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span className="pulse-indicator" style={{ background: '#10b981', width: '6px', height: '6px' }}></span>
              LIVE NSE &amp; BSE FEED
            </span>
          ) : (
            <span style={{ color: '#f87171', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 700 }}>
              <span style={{ background: '#ef4444', width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 6px #ef4444' }}></span>
              MARKET CLOSED
            </span>
          )}
        </div>

        {/* Marquee Ticker of Key Indices with GIFT NIFTY & INDIA VIX Spotlight */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            position: 'relative',
            gap: '6px',
          }}
        >
          {/* Scroll Left Button */}
          <button
            onClick={() => scrollManual(-260)}
            style={{
              flexShrink: 0,
              width: '26px',
              height: '32px',
              borderRadius: '6px',
              background: 'rgba(30, 41, 59, 0.85)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              color: '#c7d2fe',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              transition: 'all 0.15s ease',
              zIndex: 3,
            }}
            title="Scroll ticker left"
            aria-label="Scroll ticker left"
          >
            <ChevronLeft size={15} />
          </button>

          {/* Scrolling Ticker Track */}
          <div
            ref={tickerRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="no-scrollbar"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              overflowX: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              padding: '2px 0',
              flex: 1,
              minWidth: 0,
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
            }}
          >
            {displayItems.map((item, idx) => {
              const isPositive = item.change >= 0;
              const isGift = item.special === 'gift';
              const isVix = item.special === 'vix';

              return (
                <Link
                  key={`${item.symbol}-${idx}`}
                  href="/indices"
                  onClick={(e) => {
                    if (hasDraggedRef.current) {
                      e.preventDefault();
                    }
                  }}
                  style={{
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 12px',
                    minHeight: '34px',
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
                    flexShrink: 0,
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

          {/* Scroll Right Button */}
          <button
            onClick={() => scrollManual(260)}
            style={{
              flexShrink: 0,
              width: '26px',
              height: '32px',
              borderRadius: '6px',
              background: 'rgba(30, 41, 59, 0.85)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              color: '#c7d2fe',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              transition: 'all 0.15s ease',
              zIndex: 3,
            }}
            title="Scroll ticker right"
            aria-label="Scroll ticker right"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        {/* Timestamp & Refresh Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            onClick={fetchLiveTicker}
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '34px',
              height: '34px',
              minHeight: '34px',
              borderRadius: '6px',
              transition: 'all 0.15s ease',
            }}
            title="Refresh live indices feed"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>
    </>
  );
}
