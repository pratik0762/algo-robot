'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Newspaper,
  TrendingUp,
  TrendingDown,
  Activity,
  Flame,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  Building2,
  Calendar,
  Globe2,
  Zap,
  Sparkles,
  Layers,
  ArrowUpRight,
  AlertTriangle,
  Clock,
  Tag
} from 'lucide-react';
import IndicesBarometer from '@/components/IndicesBarometer';
import { getApiBase } from '@/config/api';

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  company_symbol: string;
  company_name: string;
  sector: string;
  published_time: string;
  published_at: string;
  source: string;
  url: string;
  impact_rating: string;
  impact_score: number;
  sentiment: string;
  impact_analysis: string;
  market_relevance: string;
  is_top_market_moving: boolean;
  tags: string[];
}

export interface NewsResponse {
  status: string;
  market_news_sentiment: string;
  bullish_count: number;
  bearish_count: number;
  high_impact_count: number;
  top_market_moving: NewsItem[];
  all_news: NewsItem[];
  total_count: number;
  timestamp: string;
}

// Client-side cache to guarantee instant 0ms transitions
let globalNewsCache: NewsResponse | null = null;

export default function NewsPage() {
  const [newsData, setNewsData] = useState<NewsResponse | null>(() => globalNewsCache);
  const [loading, setLoading] = useState<boolean>(!globalNewsCache);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedCompany, setSelectedCompany] = useState<string>('ALL');
  const [selectedSentiment, setSelectedSentiment] = useState<string>('ALL');
  const [selectedImpact, setSelectedImpact] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const fetchNews = async (isManual: boolean = false, retries = 2) => {
    if (isManual) setRefreshing(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/news`);
      if (res.ok) {
        const json: NewsResponse = await res.json();
        globalNewsCache = json;
        try {
          sessionStorage.setItem('news_cache', JSON.stringify(json));
        } catch (_) {}
        setNewsData(json);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      if (retries > 0) {
        setTimeout(() => fetchNews(isManual, retries - 1), 600);
      } else {
        console.error('Failed to fetch news data:', err);
      }
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!globalNewsCache) {
      try {
        const stored = sessionStorage.getItem('news_cache');
        if (stored) {
          const parsed = JSON.parse(stored);
          globalNewsCache = parsed;
          setNewsData(parsed);
          setLoading(false);
        }
      } catch (_) {}
    }

    fetchNews();
    const interval = setInterval(() => fetchNews(), 45000); // 45s live refresh
    return () => clearInterval(interval);
  }, []);

  const topMarketMoving = useMemo(() => {
    if (!newsData?.all_news) return [];
    return newsData.all_news.filter((item) => item.is_top_market_moving);
  }, [newsData]);

  const uniqueCompanies = useMemo(() => {
    if (!newsData?.all_news) return [];
    const set = new Set<string>();
    newsData.all_news.forEach((n) => {
      if (n.company_symbol && n.company_symbol !== 'BROAD_MARKET') {
        set.add(n.company_symbol);
      }
    });
    return Array.from(set).sort();
  }, [newsData]);

  const filteredNews = useMemo(() => {
    if (!newsData?.all_news) return [];
    const s = searchTerm.toLowerCase().trim();

    return newsData.all_news.filter((item) => {
      // Company filter
      if (selectedCompany !== 'ALL') {
        if (item.company_symbol !== selectedCompany) return false;
      }

      // Sentiment filter
      if (selectedSentiment !== 'ALL') {
        if (item.sentiment.toUpperCase() !== selectedSentiment.toUpperCase()) return false;
      }

      // Impact filter
      if (selectedImpact !== 'ALL') {
        if (!item.impact_rating.toUpperCase().includes(selectedImpact.toUpperCase())) return false;
      }

      // Search keyword
      if (s) {
        const inHeadline = item.headline.toLowerCase().includes(s);
        const inComp = item.company_name.toLowerCase().includes(s) || item.company_symbol.toLowerCase().includes(s);
        const inAnalysis = item.impact_analysis.toLowerCase().includes(s);
        const inTags = item.tags.some((t) => t.toLowerCase().includes(s));
        if (!inHeadline && !inComp && !inAnalysis && !inTags) return false;
      }

      return true;
    });
  }, [newsData, selectedCompany, selectedSentiment, selectedImpact, searchTerm]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0d14' }}>
      {/* Top Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(16px)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: '1440px',
            margin: '0 auto',
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <Link
              href="/"
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                fontSize: '0.8rem',
                textDecoration: 'none',
              }}
              title="Return to Financial Hub"
            >
              <ArrowLeft size={16} />
              <span>Back to Hub</span>
            </Link>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
                  MARKET & COMPANY NEWS
                </h1>
                <span
                  className="badge"
                  style={{
                    background: 'rgba(245, 158, 11, 0.2)',
                    color: '#fbbf24',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                  }}
                >
                  LIVE CATALYSTS
                </span>
                <span className="badge badge-success" style={{ fontSize: '0.68rem' }}>
                  REAL-TIME IMPACT ENGINE
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Verified market-moving news, stock price impact analysis & official reference links across Indian Equities
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => fetchNews(true)}
              disabled={refreshing}
              className="btn btn-secondary"
              style={{ padding: '8px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Refresh latest news feed"
            >
              <RefreshCw size={14} className={refreshing ? 'pulse-indicator' : ''} />
              {refreshing ? 'Updating News...' : 'Refresh News'}
            </button>
          </div>
        </div>
      </header>

      {/* Top Live Barometer (GIFT Nifty, VIX & Indices Ticker) */}
      <IndicesBarometer />

      {/* Main Content Area */}
      <main style={{ maxWidth: '1440px', margin: '0 auto', width: '100%', padding: '24px 24px 48px 24px', boxSizing: 'border-box' }}>
        
        {/* Market News Sentiment Banner */}
        {newsData?.market_news_sentiment && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(99, 102, 241, 0.12) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 20px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              flexWrap: 'wrap',
              boxShadow: '0 4px 24px rgba(245, 158, 11, 0.12)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Zap size={20} color="#fbbf24" style={{ flexShrink: 0 }} />
              <div>
                <span style={{ fontSize: '0.70rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  MARKET SENTIMENT VERDICT
                </span>
                <div style={{ fontSize: '0.90rem', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                  {newsData.market_news_sentiment}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.78rem' }}>
              <span style={{ color: '#34d399', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <TrendingUp size={14} />
                {newsData.bullish_count} Bullish Catalysts
              </span>
              <span style={{ color: '#f87171', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <TrendingDown size={14} />
                {newsData.bearish_count} Bearish Headwinds
              </span>
              <span style={{ color: '#fbbf24', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Flame size={14} />
                {newsData.high_impact_count} High Impact News
              </span>
            </div>
          </div>
        )}

        {/* SECTION 1: TOP MARKET-MOVING NEWS (PINNED AT THE TOP) */}
        <section style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                }}
              >
                <Flame size={16} />
              </div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.01em', margin: 0 }}>
                TOP MARKET-MOVING NEWS (HIGH IMPACT ON STOCKS & BENCHMARKS)
              </h2>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Pinned at top • Evaluated for highest potential price volatility
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
              gap: '16px',
            }}
          >
            {topMarketMoving.map((item) => {
              const isBull = item.sentiment === 'BULLISH';
              const isBear = item.sentiment === 'BEARISH';
              const badgeBg = isBull ? 'rgba(16, 185, 129, 0.15)' : isBear ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)';
              const badgeColor = isBull ? '#34d399' : isBear ? '#f87171' : '#fbbf24';
              const borderColor = isBull ? 'rgba(16, 185, 129, 0.4)' : isBear ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)';

              return (
                <div
                  key={item.id}
                  className="glass-panel"
                  style={{
                    padding: '20px',
                    borderRadius: 'var(--radius-lg)',
                    border: `1px solid ${borderColor}`,
                    background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: `0 8px 30px ${isBull ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}`,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Top Header Row: Company Info & Impact Score */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {item.company_symbol !== 'BROAD_MARKET' ? (
                          <span
                            style={{
                              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                              color: '#ffffff',
                              fontWeight: 900,
                              fontSize: '0.75rem',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {item.company_symbol}
                          </span>
                        ) : (
                          <span
                            style={{
                              background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                              color: '#ffffff',
                              fontWeight: 900,
                              fontSize: '0.75rem',
                              padding: '3px 8px',
                              borderRadius: '6px',
                            }}
                          >
                            NIFTY 50
                          </span>
                        )}
                        <span style={{ fontSize: '0.80rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                          {item.company_name}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          className="badge"
                          style={{
                            background: badgeBg,
                            color: badgeColor,
                            border: `1px solid ${borderColor}`,
                            fontWeight: 800,
                            fontSize: '0.68rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {isBull ? <TrendingUp size={12} /> : isBear ? <TrendingDown size={12} /> : <Activity size={12} />}
                          {item.sentiment} ({item.impact_score}/10)
                        </span>
                      </div>
                    </div>

                    {/* Headline */}
                    <h3
                      style={{
                        fontSize: '1.02rem',
                        fontWeight: 800,
                        color: '#ffffff',
                        lineHeight: 1.45,
                        margin: '0 0 12px 0',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {item.headline}
                    </h3>

                    {/* Potential Stock & Market Impact Details */}
                    <div
                      style={{
                        background: 'rgba(0, 0, 0, 0.45)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        marginBottom: '14px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: badgeColor,
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          marginBottom: '4px',
                        }}
                      >
                        <Zap size={13} />
                        POTENTIAL STOCK & MARKET IMPACT:
                      </div>
                      <p
                        style={{
                          fontSize: '0.80rem',
                          color: 'var(--text-primary)',
                          lineHeight: 1.5,
                          margin: 0,
                        }}
                      >
                        {item.impact_analysis}
                      </p>
                    </div>
                  </div>

                  {/* Footer Row: Source, Time, Tags & Reference Link */}
                  <div
                    style={{
                      borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                      paddingTop: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Source: {item.source}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} />
                        {item.published_time}
                      </span>
                    </div>

                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{
                        padding: '5px 12px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: '#38bdf8',
                        borderColor: 'rgba(56, 189, 248, 0.3)',
                        background: 'rgba(56, 189, 248, 0.08)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        textDecoration: 'none',
                      }}
                      title="Read original source article / official regulatory filing"
                    >
                      <span>Reference Link</span>
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SECTION 2: SEARCH & FILTER CONTROLS */}
        <section
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
            }}
          >
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1 1 300px', minWidth: '240px' }}>
              <Search
                size={16}
                color="var(--text-muted)"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                placeholder="Search news by company (e.g. Reliance, TCS), keyword or topic..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 'var(--radius-md)',
                  padding: '9px 12px 9px 38px',
                  color: '#ffffff',
                  fontSize: '0.82rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Company Selector */}
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="ALL">All Companies</option>
                {uniqueCompanies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* Sentiment Filter */}
              <select
                value={selectedSentiment}
                onChange={(e) => setSelectedSentiment(e.target.value)}
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="ALL">All Sentiments</option>
                <option value="BULLISH">Bullish Catalysts (+)</option>
                <option value="BEARISH">Bearish Headwinds (-)</option>
                <option value="VOLATILE">Volatile / Macro (~)</option>
              </select>

              {/* Impact Filter */}
              <select
                value={selectedImpact}
                onChange={(e) => setSelectedImpact(e.target.value)}
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="ALL">All Impact Levels</option>
                <option value="HIGH">High Impact Only</option>
                <option value="MEDIUM">Medium Impact Only</option>
              </select>

              {(selectedCompany !== 'ALL' || selectedSentiment !== 'ALL' || selectedImpact !== 'ALL' || searchTerm) && (
                <button
                  onClick={() => {
                    setSelectedCompany('ALL');
                    setSelectedSentiment('ALL');
                    setSelectedImpact('ALL');
                    setSearchTerm('');
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '7px 12px', fontSize: '0.74rem' }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 3: ALL COMPANY & MARKET NEWS FEED */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Newspaper size={18} color="#6366f1" />
              <span>LIVE COMPANY NEWS & IMPACT DISCLOSURES ({filteredNews.length})</span>
            </h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Showing verified real-time articles with financial impact assessment
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {filteredNews.map((item) => {
              const isBull = item.sentiment === 'BULLISH';
              const isBear = item.sentiment === 'BEARISH';
              const badgeBg = isBull ? 'rgba(16, 185, 129, 0.15)' : isBear ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)';
              const badgeColor = isBull ? '#34d399' : isBear ? '#f87171' : '#fbbf24';

              return (
                <article
                  key={item.id}
                  className="glass-panel"
                  style={{
                    padding: '18px 20px',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: 'rgba(15, 23, 42, 0.65)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Top Metadata Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          background: 'rgba(99, 102, 241, 0.2)',
                          color: '#818cf8',
                          fontWeight: 800,
                          fontSize: '0.72rem',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                        }}
                      >
                        {item.company_symbol}
                      </span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ffffff' }}>
                        {item.company_name}
                      </span>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        &bull; {item.sector}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        className="badge"
                        style={{
                          background: badgeBg,
                          color: badgeColor,
                          fontWeight: 800,
                          fontSize: '0.66rem',
                        }}
                      >
                        {item.impact_rating} &bull; {item.sentiment} ({item.impact_score}/10)
                      </span>
                    </div>
                  </div>

                  {/* Headline */}
                  <h3
                    style={{
                      fontSize: '0.98rem',
                      fontWeight: 700,
                      color: '#ffffff',
                      lineHeight: 1.4,
                      margin: 0,
                    }}
                  >
                    {item.headline}
                  </h3>

                  {/* Impact Analysis Details */}
                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderLeft: `3px solid ${badgeColor}`,
                      padding: '8px 12px',
                      borderRadius: '0 6px 6px 0',
                      fontSize: '0.78rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.45,
                    }}
                  >
                    <strong style={{ color: badgeColor, marginRight: '6px' }}>Potential Price Impact:</strong>
                    {item.impact_analysis}
                  </div>

                  {/* Bottom Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      flexWrap: 'wrap',
                      marginTop: '4px',
                      fontSize: '0.74rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span>Source: <strong style={{ color: 'var(--text-secondary)' }}>{item.source}</strong></span>
                      <span>&bull;</span>
                      <span>{item.published_at}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {item.tags.slice(0, 2).map((tag, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: '0.66rem',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'rgba(255, 255, 255, 0.04)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          #{tag}
                        </span>
                      ))}

                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: '#38bdf8',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          textDecoration: 'none',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: 'rgba(56, 189, 248, 0.1)',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                        }}
                      >
                        <span>Reference Link</span>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
