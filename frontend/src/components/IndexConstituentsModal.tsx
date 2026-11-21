'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  X,
  Search,
  TrendingUp,
  TrendingDown,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  SlidersHorizontal,
  Building2,
  PieChart,
  Activity,
  BarChart2
} from 'lucide-react';
import { getApiBase } from '@/config/api';

export interface ConstituentStock {
  rank: number;
  symbol: string;
  company_name: string;
  sector: string;
  industry: string;
  last_price: number;
  change: number;
  percent_change: number;
  day_high: number;
  day_low: number;
  previous_close: number;
  high_52w: number;
  low_52w: number;
  market_cap_cr: number;
  weight_pct: number;
  pe: string;
  volume: number;
}

export interface IndexConstituentsResponse {
  index_name: string;
  category?: string;
  last_price?: number;
  variation?: number;
  percent_change?: number;
  high?: number;
  low?: number;
  year_high?: number;
  year_low?: number;
  pe?: string;
  pb?: string;
  dy?: string;
  advances: number;
  declines: number;
  unchanged: number;
  total_constituents: number;
  constituents: ConstituentStock[];
  timestamp: string;
}

interface IndexConstituentsModalProps {
  indexName: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectCompany?: (symbol: string) => void;
}

export default function IndexConstituentsModal({
  indexName,
  isOpen,
  onClose,
  onSelectCompany,
}: IndexConstituentsModalProps) {
  const [data, setData] = useState<IndexConstituentsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('weight_desc');
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchConstituents = async (name: string, force: boolean = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);

    try {
      const apiBase = getApiBase();
      const encoded = encodeURIComponent(name);
      const res = await fetch(`${apiBase}/api/indices/${encoded}/constituents`);
      if (res.ok) {
        const json: IndexConstituentsResponse = await res.json();
        setData(json);
      } else {
        console.error('Failed to load constituents:', res.statusText);
      }
    } catch (err) {
      console.error('Error fetching index constituents:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isOpen && indexName) {
      setSearch('');
      fetchConstituents(indexName);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, indexName]);

  const filteredConstituents = useMemo(() => {
    if (!data?.constituents) return [];
    const q = search.toLowerCase().trim();

    return data.constituents
      .filter((s) => {
        if (!q) return true;
        return (
          s.symbol.toLowerCase().includes(q) ||
          s.company_name.toLowerCase().includes(q) ||
          s.sector.toLowerCase().includes(q) ||
          s.industry.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'weight_desc') return b.weight_pct - a.weight_pct;
        if (sortBy === 'change_desc') return b.percent_change - a.percent_change;
        if (sortBy === 'change_asc') return a.percent_change - b.percent_change;
        if (sortBy === 'price_desc') return b.last_price - a.last_price;
        if (sortBy === 'name_asc') return a.symbol.localeCompare(b.symbol);
        return 0;
      });
  }, [data, search, sortBy]);

  if (!isOpen || !indexName) return null;

  const isIndexPositive = (data?.variation ?? 0) >= 0;

  return (
    <div
      className="drawer-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '20px',
        zIndex: 90,
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '1380px',
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(11, 15, 28, 0.98)',
          border: '1px solid rgba(37, 99, 235, 0.35)',
          borderRadius: '20px',
          boxShadow: '0 30px 80px -15px rgba(0, 0, 0, 0.95), 0 0 50px rgba(37, 99, 235, 0.2)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'rgba(15, 23, 42, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #1d4ed8 0%, #06b6d4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 25px rgba(37, 99, 235, 0.45)',
              }}
            >
              <Building2 size={24} color="white" />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff', margin: 0 }}>
                  {indexName}
                </h1>
                {data?.category && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: '6px',
                      background: 'rgba(37, 99, 235, 0.15)',
                      color: '#a5b4fc',
                      border: '1px solid rgba(37, 99, 235, 0.3)',
                    }}
                  >
                    {data.category}
                  </span>
                )}
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: 'var(--text-secondary)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  {data?.total_constituents || filteredConstituents.length} Constituent Stocks
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '4px', fontSize: '0.82rem' }}>
                {data?.last_price != null && (
                  <span style={{ fontWeight: 800, color: '#ffffff', fontSize: '1.05rem' }}>
                    ₹{data.last_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                )}

                {data?.percent_change != null && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      fontWeight: 700,
                      fontSize: '0.84rem',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: isIndexPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: isIndexPositive ? '#34d399' : '#f87171',
                    }}
                  >
                    {isIndexPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {isIndexPositive ? '+' : ''}
                    {data.variation?.toFixed(2)} ({isIndexPositive ? '+' : ''}
                    {data.percent_change.toFixed(2)}%)
                  </span>
                )}

                {data && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    Breadth: <strong style={{ color: '#34d399' }}>{data.advances} Adv</strong> /{' '}
                    <strong style={{ color: '#f87171' }}>{data.declines} Dec</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => fetchConstituents(indexName, true)}
              disabled={refreshing}
              title="Refresh live quotes"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
              <span>Refresh</span>
            </button>

            <button
              onClick={onClose}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* CONTROLS BAR: SEARCH & SORT */}
        <div
          style={{
            padding: '14px 28px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'rgba(10, 14, 26, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
            flexShrink: 0,
          }}
        >
          <div style={{ position: 'relative', flex: 1, minWidth: '280px', maxWidth: '500px' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder={`Search within ${indexName} (e.g. symbol, company, industry)...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px 10px 40px',
                borderRadius: '10px',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid var(--border-subtle)',
                color: 'white',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Sort By:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="weight_desc" style={{ background: '#111827' }}>Index Weight (% High to Low)</option>
              <option value="change_desc" style={{ background: '#111827' }}>Top Gainers (% High to Low)</option>
              <option value="change_asc" style={{ background: '#111827' }}>Top Losers (% Low to High)</option>
              <option value="price_desc" style={{ background: '#111827' }}>Stock Price (High to Low)</option>
              <option value="name_asc" style={{ background: '#111827' }}>Stock Symbol (A to Z)</option>
            </select>

            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Showing <strong>{filteredConstituents.length}</strong> of {data?.total_constituents || 0}
            </span>
          </div>
        </div>

        {/* CONSTITUENTS TABLE */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '320px', gap: '14px' }}>
              <RefreshCw size={28} className="spin" color="#2563eb" />
              <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                Loading full constituent stocks for {indexName}...
              </div>
            </div>
          ) : filteredConstituents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              No constituent stocks found matching &ldquo;{search}&rdquo;.
            </div>
          ) : (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.015)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '16px',
                overflow: 'hidden',
              }}
            >
              <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
                <table
                  style={{
                    width: '100%',
                    minWidth: '1150px',
                    borderCollapse: 'collapse',
                    fontSize: '0.83rem',
                    textAlign: 'right',
                  }}
                >
                  <thead>
                    <tr style={{ background: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ textAlign: 'center', padding: '14px 12px', fontWeight: 700, width: '50px', whiteSpace: 'nowrap' }}>#</th>
                      <th style={{ textAlign: 'left', padding: '14px 18px', fontWeight: 700, whiteSpace: 'nowrap' }}>STOCK / COMPANY</th>
                      <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>SECTOR / INDUSTRY</th>
                      <th style={{ padding: '14px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>LAST PRICE</th>
                      <th style={{ padding: '14px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>CHANGE</th>
                      <th style={{ padding: '14px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>% CHANGE</th>
                      <th style={{ padding: '14px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>DAY RANGE (H / L)</th>
                      <th style={{ padding: '14px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>52W HIGH / LOW</th>
                      <th style={{ padding: '14px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>INDEX WEIGHT</th>
                      <th style={{ padding: '14px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>P/E</th>
                      <th style={{ padding: '14px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>VOLUME</th>
                      <th style={{ textAlign: 'center', padding: '14px 20px', fontWeight: 700, whiteSpace: 'nowrap' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredConstituents.map((stock, i) => {
                      const isPos = stock.percent_change >= 0;
                      return (
                        <tr
                          key={stock.symbol}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                            background: i % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.012)',
                            transition: 'background 0.15s ease',
                          }}
                        >
                          <td style={{ textAlign: 'center', padding: '13px 12px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            {stock.rank || i + 1}
                          </td>

                          <td style={{ textAlign: 'left', padding: '13px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 800, color: '#ffffff', fontSize: '0.88rem' }}>
                                {stock.symbol}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {stock.company_name}
                            </div>
                          </td>

                          <td style={{ textAlign: 'left', padding: '13px 16px' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                              {stock.sector}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '1px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {stock.industry}
                            </div>
                          </td>

                          <td style={{ padding: '13px 16px', fontWeight: 800, color: '#ffffff', fontSize: '0.92rem', whiteSpace: 'nowrap' }}>
                            ₹{stock.last_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>

                          <td style={{ padding: '13px 16px', fontWeight: 700, color: isPos ? '#34d399' : '#f87171', whiteSpace: 'nowrap' }}>
                            {isPos ? '+' : ''}{stock.change.toFixed(2)}
                          </td>

                          <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px',
                                fontWeight: 800,
                                padding: '3px 8px',
                                borderRadius: '6px',
                                background: isPos ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                color: isPos ? '#34d399' : '#f87171',
                                fontSize: '0.8rem',
                              }}
                            >
                              {isPos ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                              {isPos ? '+' : ''}{stock.percent_change.toFixed(2)}%
                            </span>
                          </td>

                          <td style={{ padding: '13px 16px', color: 'var(--text-secondary)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                            {stock.day_high.toLocaleString('en-IN', { maximumFractionDigits: 1 })} / {stock.day_low.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                          </td>

                          <td style={{ padding: '13px 16px', color: 'var(--text-secondary)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                            {stock.high_52w.toLocaleString('en-IN', { maximumFractionDigits: 1 })} / {stock.low_52w.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                          </td>

                          <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '6px',
                                background: 'rgba(37, 99, 235, 0.12)',
                                color: '#a5b4fc',
                              }}
                            >
                              {stock.weight_pct.toFixed(2)}%
                            </span>
                          </td>

                          <td style={{ padding: '13px 16px', fontWeight: 600, color: '#93c5fd', whiteSpace: 'nowrap' }}>
                            {stock.pe}
                          </td>

                          <td style={{ padding: '13px 16px', color: 'var(--text-muted)', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
                            {stock.volume.toLocaleString('en-IN')}
                          </td>

                          <td style={{ textAlign: 'center', padding: '13px 20px', whiteSpace: 'nowrap' }}>
                            {onSelectCompany ? (
                              <button
                                onClick={() => onSelectCompany(stock.symbol)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '5px 12px',
                                  borderRadius: '6px',
                                  background: 'rgba(37, 99, 235, 0.15)',
                                  border: '1px solid rgba(37, 99, 235, 0.3)',
                                  color: '#a5b4fc',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                <span>Analyze</span>
                                <ExternalLink size={12} />
                              </button>
                            ) : (
                              <a
                                href={`/chart?symbol=${stock.symbol}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '5px 12px',
                                  borderRadius: '6px',
                                  background: 'rgba(255, 255, 255, 0.05)',
                                  border: '1px solid var(--border-subtle)',
                                  color: 'var(--text-secondary)',
                                  fontSize: '0.74rem',
                                  textDecoration: 'none',
                                }}
                              >
                                <span>Chart</span>
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div
          style={{
            padding: '14px 28px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'rgba(10, 14, 24, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={14} color="#10b981" />
            <span>Official Exchange Constituent Weights & Real-Time Price Feeds (NSE India)</span>
          </div>

          <div>
            Data Synced: <strong style={{ color: '#ffffff' }}>{data?.timestamp || 'Live'}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
