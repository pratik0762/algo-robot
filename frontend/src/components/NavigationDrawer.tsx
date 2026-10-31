'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  X,
  Building2,
  TrendingUp,
  Landmark,
  Cpu,
  Car,
  Zap,
  ShieldCheck,
  ChevronRight,
  Globe2,
  ArrowLeftRight,
  Activity,
  Newspaper,
  Layers,
  Boxes
} from 'lucide-react';
import { getApiBase } from '@/config/api';

export interface NavHubItem {
  id: string;
  name: string;
  subtitle: string;
  exchange: string;
  count: number;
  icon: any;
  badge: string;
  color: string;
  gradient: string;
}

export const NAV_HUBS: NavHubItem[] = [
  {
    id: 'nifty50',
    name: 'NIFTY 50 FINANCIAL HUB',
    subtitle: 'National Stock Exchange of India (NSE) Benchmark Index',
    exchange: 'NSE',
    count: 50,
    icon: Building2,
    badge: 'Flagship 50',
    color: '#6366f1',
    gradient: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)'
  },
  {
    id: 'sensex',
    name: 'SENSEX FINANCIAL HUB',
    subtitle: 'Bombay Stock Exchange (BSE) 30 Blue-Chip Giants',
    exchange: 'BSE',
    count: 30,
    icon: Landmark,
    badge: 'Sensex 30',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)'
  },
  {
    id: 'bank',
    name: 'NIFTY BANK FINANCIAL HUB',
    subtitle: 'Top Public & Private Banking Powerhouses',
    exchange: 'NSE',
    count: 12,
    icon: TrendingUp,
    badge: 'Banking Index',
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
  },
  {
    id: 'it',
    name: 'NIFTY IT FINANCIAL HUB',
    subtitle: 'Global Technology, Cloud & AI Leaders',
    exchange: 'NSE',
    count: 10,
    icon: Cpu,
    badge: 'Tech Index',
    color: '#38bdf8',
    gradient: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)'
  },
  {
    id: 'auto',
    name: 'NIFTY AUTO FINANCIAL HUB',
    subtitle: 'Passenger Cars, Commercial Vehicles & 2-Wheelers',
    exchange: 'NSE',
    count: 8,
    icon: Car,
    badge: 'Automotive Index',
    color: '#ec4899',
    gradient: 'linear-gradient(135deg, #db2777 0%, #ec4899 100%)'
  },
  {
    id: 'energy',
    name: 'NIFTY ENERGY FINANCIAL HUB',
    subtitle: 'Hydrocarbons, Gas, Power & Renewable Utilities',
    exchange: 'NSE',
    count: 8,
    icon: Zap,
    badge: 'Energy Index',
    color: '#eab308',
    gradient: 'linear-gradient(135deg, #ca8a04 0%, #eab308 100%)'
  },
  {
    id: 'fmcg',
    name: 'NIFTY FMCG FINANCIAL HUB',
    subtitle: 'Consumer Staples, Foods & Personal Care Giants',
    exchange: 'NSE',
    count: 5,
    icon: Building2,
    badge: 'FMCG Index',
    color: '#a855f7',
    gradient: 'linear-gradient(135deg, #7e22ce 0%, #a855f7 100%)'
  },
  {
    id: 'pharma',
    name: 'NIFTY PHARMA FINANCIAL HUB',
    subtitle: 'Pharmaceuticals, Biotech & Healthcare Leaders',
    exchange: 'NSE',
    count: 4,
    icon: Globe2,
    badge: 'Pharma Index',
    color: '#06b6d4',
    gradient: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)'
  },
  {
    id: 'metal',
    name: 'NIFTY METAL FINANCIAL HUB',
    subtitle: 'Steel, Aluminium, Mining & Non-Ferrous Metals',
    exchange: 'NSE',
    count: 4,
    icon: Landmark,
    badge: 'Metal Index',
    color: '#f97316',
    gradient: 'linear-gradient(135deg, #c2410c 0%, #f97316 100%)'
  },
  {
    id: 'financial',
    name: 'NIFTY FINANCIAL SERVICES (FINNIFTY)',
    subtitle: 'Banks, NBFCs, Insurance & Housing Finance',
    exchange: 'NSE',
    count: 14,
    icon: TrendingUp,
    badge: 'Fin Services',
    color: '#14b8a6',
    gradient: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)'
  }
];

interface NavigationDrawerProps {
  isOpen?: boolean;
  onClose: () => void;
  activeHub?: string;
  onSelectHub?: (hubId: string) => void;
}

export default function NavigationDrawer({
  isOpen = true,
  onClose,
  activeHub = 'nifty50',
  onSelectHub
}: NavigationDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectFinancialHub = () => {
    if (onSelectHub) {
      onSelectHub('nifty50');
    }
    onClose();
    if (pathname !== '/') {
      router.push('/');
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const prefetchFiiDii = () => {
    try {
      fetch(`${getApiBase()}/api/fii-dii`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) {
            try {
              sessionStorage.setItem('fii_dii_cache', JSON.stringify(d));
            } catch (_) {}
          }
        })
        .catch(() => {});
    } catch (_) {}
  };

  const handleSelectFiiDii = () => {
    onClose();
    router.push('/fii-dii');
  };

  const prefetchNews = () => {
    try {
      fetch(`${getApiBase()}/api/news`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) {
            try {
              sessionStorage.setItem('news_cache', JSON.stringify(d));
            } catch (_) {}
          }
        })
        .catch(() => {});
    } catch (_) {}
  };

  const handleSelectNews = () => {
    onClose();
    router.push('/news');
  };

  const prefetchDeals = () => {
    try {
      fetch(`${getApiBase()}/api/deals`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) {
            try {
              sessionStorage.setItem('deals_cache', JSON.stringify(d));
            } catch (_) {}
          }
        })
        .catch(() => {});
    } catch (_) {}
  };

  const handleSelectMarketDeal = () => {
    onClose();
    router.push('/deals');
  };

  return (
    <div
      className="drawer-backdrop"
      style={{ justifyContent: 'flex-start' }}
      onClick={onClose}
    >
      <nav
        className="nav-drawer-panel"
        onClick={(e) => e.stopPropagation()}
        role="navigation"
        aria-label="Platform Hub Navigation"
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '20px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'rgba(15, 21, 35, 0.95)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexShrink: 0,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 15px rgba(99, 102, 241, 0.4)',
                flexShrink: 0,
              }}
            >
              <Globe2 size={18} color="white" />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2
                style={{
                  fontSize: '0.98rem',
                  fontWeight: 800,
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  margin: 0,
                }}
              >
                MARKET HUBS NAVIGATOR
              </h2>
              <p
                style={{
                  fontSize: '0.70rem',
                  color: 'var(--text-secondary)',
                  margin: '2px 0 0 0',
                  lineHeight: 1.3,
                  wordBreak: 'break-word',
                }}
              >
                Switch between Index Portals & Institutional Flows
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            title="Close Drawer (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        {/* Drawer Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '18px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
            Available Market Portals
          </div>

          {/* Option 1: FINANCIAL HUB */}
          <div
            onClick={handleSelectFinancialHub}
            style={{
              background: pathname === '/' ? 'rgba(99, 102, 241, 0.14)' : 'rgba(255, 255, 255, 0.03)',
              border: pathname === '/' ? '1px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              transition: 'all 0.2s ease',
              boxShadow: pathname === '/' ? '0 4px 20px -2px rgba(99, 102, 241, 0.25)' : 'none',
              boxSizing: 'border-box',
              width: '100%',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  flexShrink: 0,
                  boxShadow: '0 0 16px rgba(99, 102, 241, 0.4)',
                }}
              >
                <Building2 size={18} />
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      color: '#ffffff',
                      letterSpacing: '-0.01em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    FINANCIAL HUB
                  </span>
                  {pathname === '/' && (
                    <span className="badge badge-primary" style={{ padding: '2px 6px', fontSize: '0.60rem', whiteSpace: 'nowrap' }}>
                      ACTIVE
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.70rem', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.35, wordBreak: 'break-word' }}>
                  National Stock Exchange of India (NSE) Benchmark Index
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  padding: '3px 7px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  whiteSpace: 'nowrap',
                }}
              >
                50 Stocks
              </span>
              <ChevronRight size={14} color="#818cf8" />
            </div>
          </div>

          {/* Option 2: FII / DII INSTITUTIONAL FLOWS & MARKET IMPACT */}
          <div
            onClick={handleSelectFiiDii}
            onMouseEnter={prefetchFiiDii}
            style={{
              background: pathname === '/fii-dii'
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.18) 0%, rgba(99, 102, 241, 0.18) 100%)'
                : 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)',
              border: pathname === '/fii-dii' ? '1px solid #10b981' : '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 20px -2px rgba(16, 185, 129, 0.2)',
              boxSizing: 'border-box',
              width: '100%',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  flexShrink: 0,
                  boxShadow: '0 0 16px rgba(16, 185, 129, 0.4)',
                }}
              >
                <ArrowLeftRight size={18} />
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      color: '#ffffff',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    FII / DII INSTITUTIONAL DATA
                  </span>
                  <span
                    style={{
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: '#34d399',
                      fontSize: '0.60rem',
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: '6px',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    MARKET IMPACT
                  </span>
                </div>
                <div style={{ fontSize: '0.70rem', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.35, wordBreak: 'break-word' }}>
                  NSE Official FII/DII Net Flow & Quantitative Sentiment Engine
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: '#34d399',
                  padding: '3px 7px',
                  borderRadius: '6px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  whiteSpace: 'nowrap',
                }}
              >
                Live Feed
              </span>
              <ChevronRight size={14} color="#34d399" />
            </div>
          </div>

          {/* Option 3: MARKET & COMPANY NEWS INTELLIGENCE */}
          <div
            onClick={handleSelectNews}
            onMouseEnter={prefetchNews}
            style={{
              background: pathname === '/news'
                ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(236, 72, 153, 0.18) 100%)'
                : 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(236, 72, 153, 0.08) 100%)',
              border: pathname === '/news' ? '1px solid #f59e0b' : '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 20px -2px rgba(245, 158, 11, 0.2)',
              boxSizing: 'border-box',
              width: '100%',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  flexShrink: 0,
                  boxShadow: '0 0 16px rgba(245, 158, 11, 0.4)',
                }}
              >
                <Newspaper size={18} />
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      color: '#ffffff',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    MARKET & COMPANY NEWS
                  </span>
                  <span
                    style={{
                      background: 'rgba(245, 158, 11, 0.2)',
                      color: '#fbbf24',
                      fontSize: '0.60rem',
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: '6px',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    HIGH IMPACT
                  </span>
                </div>
                <div style={{ fontSize: '0.70rem', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.35, wordBreak: 'break-word' }}>
                  Official NSE India Corporate Disclosures & Stock Impact Analysis
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: '#fbbf24',
                  padding: '3px 7px',
                  borderRadius: '6px',
                  background: 'rgba(245, 158, 11, 0.1)',
                  whiteSpace: 'nowrap',
                }}
              >
                Live Feed
              </span>
              <ChevronRight size={14} color="#fbbf24" />
            </div>
          </div>

          {/* Option 4: MARKET DEAL (Bulk Deals, Block Deals & Short Selling) */}
          <div
            onClick={handleSelectMarketDeal}
            onMouseEnter={prefetchDeals}
            style={{
              background: pathname === '/deals'
                ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.18) 0%, rgba(168, 85, 247, 0.18) 100%)'
                : 'linear-gradient(135deg, rgba(6, 182, 212, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)',
              border: pathname === '/deals' ? '1px solid #06b6d4' : '1px solid rgba(6, 182, 212, 0.4)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              transition: 'all 0.2s ease',
              boxShadow: pathname === '/deals' ? '0 4px 20px -2px rgba(6, 182, 212, 0.25)' : 'none',
              boxSizing: 'border-box',
              width: '100%',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #0891b2 0%, #a855f7 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  flexShrink: 0,
                  boxShadow: '0 0 16px rgba(6, 182, 212, 0.4)',
                }}
              >
                <Layers size={18} />
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      color: '#ffffff',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    MARKET DEAL
                  </span>
                  <span
                    style={{
                      background: 'rgba(6, 182, 212, 0.2)',
                      color: '#22d3ee',
                      fontSize: '0.60rem',
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: '6px',
                      border: '1px solid rgba(6, 182, 212, 0.3)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    BULK &bull; BLOCK &bull; SHORT SELLING
                  </span>
                </div>
                <div style={{ fontSize: '0.70rem', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.35, wordBreak: 'break-word' }}>
                  SEBI Disclosures, Large Institutional Transactions, Short Selling Data &amp; Date Filters
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: '#22d3ee',
                  padding: '3px 7px',
                  borderRadius: '6px',
                  background: 'rgba(6, 182, 212, 0.1)',
                  whiteSpace: 'nowrap',
                }}
              >
                Live Disclosures
              </span>
              <ChevronRight size={14} color="#22d3ee" />
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div
          style={{
            padding: '14px 18px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'rgba(10, 14, 24, 0.9)',
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            boxSizing: 'border-box',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexShrink: 1, overflow: 'hidden' }}>
            <ShieldCheck size={14} color="#10b981" style={{ flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Verified SEBI Reg 33 Filings</span>
          </div>
          <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>Algo Robot Platform</span>
        </div>
      </nav>
    </div>
  );
}
