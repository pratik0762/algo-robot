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
  Boxes,
  BarChart2,
  Grid,
  SlidersHorizontal
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
          if (d && d.summary && typeof d.summary.total_short_selling_value_cr === 'number') {
            try {
              sessionStorage.setItem('deals_cache_v3', JSON.stringify(d));
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

  const prefetch52Week = () => {
    try {
      fetch(`${getApiBase()}/api/52-week`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) {
            try {
              sessionStorage.setItem('week52_cache', JSON.stringify(d));
            } catch (_) {}
          }
        })
        .catch(() => {});
    } catch (_) {}
  };

  const handleSelect52Week = () => {
    onClose();
    router.push('/52-week');
  };

  const prefetchChart = () => {
    try {
      fetch(`${getApiBase()}/api/heatmap`).catch(() => {});
    } catch (_) {}
  };

  const handleSelectChart = () => {
    onClose();
    router.push('/chart');
  };

  const prefetchSignals = () => {
    try {
      fetch(`${getApiBase()}/api/trade-signals`).catch(() => {});
    } catch (_) {}
  };

  const handleSelectSignals = () => {
    onClose();
    router.push('/signals');
  };

  const prefetchStrategy = () => {
    try {
      fetch(`${getApiBase()}/api/trade-signals/strategies`).catch(() => {});
    } catch (_) {}
  };

  const handleSelectStrategy = () => {
    onClose();
    router.push('/strategy');
  };

  const prefetchBroker = () => {
    try {
      fetch(`${getApiBase()}/api/brokers/status`).catch(() => {});
    } catch (_) {}
  };

  const handleSelectBroker = () => {
    onClose();
    router.push('/broker');
  };

  const prefetchOptionChain = () => {
    try {
      fetch(`${getApiBase()}/api/options/instruments`).catch(() => {});
    } catch (_) {}
  };

  const handleSelectOptionChain = () => {
    onClose();
    router.push('/option-chain');
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
            gap: '10px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Available Market Portals
          </div>

          {/* Option 1: FINANCIAL HUB */}
          <div
            onClick={handleSelectFinancialHub}
            style={{
              background: pathname === '/' ? 'rgba(99, 102, 241, 0.16)' : 'rgba(255, 255, 255, 0.03)',
              border: pathname === '/' ? '1px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 16px',
              minHeight: '56px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              transition: 'all 0.2s ease',
              boxShadow: pathname === '/' ? '0 4px 20px -2px rgba(99, 102, 241, 0.25)' : 'none',
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
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

              <span
                style={{
                  fontSize: '0.90rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                }}
              >
                FINANCIAL HUB
              </span>

              {pathname === '/' && (
                <span className="badge badge-primary" style={{ padding: '2px 7px', fontSize: '0.60rem', fontWeight: 800 }}>
                  ACTIVE
                </span>
              )}
            </div>

            <ChevronRight size={16} color="#818cf8" style={{ flexShrink: 0 }} />
          </div>

          {/* Option 2: FII / DII INSTITUTIONAL DATA */}
          <div
            onClick={handleSelectFiiDii}
            onMouseEnter={prefetchFiiDii}
            style={{
              background: pathname === '/fii-dii'
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.18) 0%, rgba(99, 102, 241, 0.18) 100%)'
                : 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)',
              border: pathname === '/fii-dii' ? '1px solid #10b981' : '1px solid rgba(16, 185, 129, 0.35)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 16px',
              minHeight: '56px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              transition: 'all 0.2s ease',
              boxShadow: pathname === '/fii-dii' ? '0 4px 20px -2px rgba(16, 185, 129, 0.25)' : 'none',
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
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

              <span
                style={{
                  fontSize: '0.90rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                }}
              >
                FII / DII INSTITUTIONAL DATA
              </span>

              {pathname === '/fii-dii' && (
                <span className="badge badge-success" style={{ padding: '2px 7px', fontSize: '0.60rem', fontWeight: 800 }}>
                  ACTIVE
                </span>
              )}
            </div>

            <ChevronRight size={16} color="#34d399" style={{ flexShrink: 0 }} />
          </div>

          {/* Option 3: MARKET & COMPANY NEWS */}
          <div
            onClick={handleSelectNews}
            onMouseEnter={prefetchNews}
            style={{
              background: pathname === '/news'
                ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(236, 72, 153, 0.18) 100%)'
                : 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(236, 72, 153, 0.08) 100%)',
              border: pathname === '/news' ? '1px solid #f59e0b' : '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 16px',
              minHeight: '56px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              transition: 'all 0.2s ease',
              boxShadow: pathname === '/news' ? '0 4px 20px -2px rgba(245, 158, 11, 0.25)' : 'none',
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
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

              <span
                style={{
                  fontSize: '0.90rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                }}
              >
                MARKET &amp; COMPANY NEWS
              </span>

              {pathname === '/news' && (
                <span className="badge badge-warning" style={{ padding: '2px 7px', fontSize: '0.60rem', fontWeight: 800 }}>
                  ACTIVE
                </span>
              )}
            </div>

            <ChevronRight size={16} color="#fbbf24" style={{ flexShrink: 0 }} />
          </div>

          {/* Option 4: MARKET DEAL */}
          <div
            onClick={handleSelectMarketDeal}
            onMouseEnter={prefetchDeals}
            style={{
              background: pathname === '/deals'
                ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.18) 0%, rgba(168, 85, 247, 0.18) 100%)'
                : 'linear-gradient(135deg, rgba(6, 182, 212, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)',
              border: pathname === '/deals' ? '1px solid #06b6d4' : '1px solid rgba(6, 182, 212, 0.35)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 16px',
              minHeight: '56px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              transition: 'all 0.2s ease',
              boxShadow: pathname === '/deals' ? '0 4px 20px -2px rgba(6, 182, 212, 0.25)' : 'none',
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
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

              <span
                style={{
                  fontSize: '0.90rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                }}
              >
                MARKET DEAL
              </span>

              {pathname === '/deals' && (
                <span className="badge badge-info" style={{ padding: '2px 7px', fontSize: '0.60rem', fontWeight: 800 }}>
                  ACTIVE
                </span>
              )}
            </div>

            <ChevronRight size={16} color="#22d3ee" style={{ flexShrink: 0 }} />
          </div>

          {/* Option 5: 52-WEEK HIGH & LOW */}
          <div
            onClick={handleSelect52Week}
            onMouseEnter={prefetch52Week}
            style={{
              background: pathname === '/52-week'
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.18) 0%, rgba(6, 182, 212, 0.18) 100%)'
                : 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(6, 182, 212, 0.08) 100%)',
              border: pathname === '/52-week' ? '1px solid #10b981' : '1px solid rgba(16, 185, 129, 0.35)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 16px',
              minHeight: '56px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              transition: 'all 0.2s ease',
              boxShadow: pathname === '/52-week' ? '0 4px 20px -2px rgba(16, 185, 129, 0.25)' : 'none',
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
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
                <TrendingUp size={18} />
              </div>

              <span
                style={{
                  fontSize: '0.90rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                }}
              >
                52-WEEK HIGH &amp; LOW
              </span>

              {pathname === '/52-week' && (
                <span className="badge badge-success" style={{ padding: '2px 7px', fontSize: '0.60rem', fontWeight: 800 }}>
                  ACTIVE
                </span>
              )}
            </div>

            <ChevronRight size={16} color="#34d399" style={{ flexShrink: 0 }} />
          </div>

          {/* Option 6: CHART & HEAT MAP (Buy/Sell Signals & Drawing Tools) */}
          <div
            onClick={handleSelectChart}
            onMouseEnter={prefetchChart}
            style={{
              background: pathname === '/chart'
                ? 'linear-gradient(135deg, rgba(2, 132, 199, 0.22) 0%, rgba(56, 189, 248, 0.15) 100%)'
                : 'linear-gradient(135deg, rgba(2, 132, 199, 0.08) 0%, rgba(56, 189, 248, 0.06) 100%)',
              border: pathname === '/chart' ? '1px solid #38bdf8' : '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 16px',
              minHeight: '56px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              transition: 'all 0.2s ease',
              boxShadow: pathname === '/chart' ? '0 4px 20px -2px rgba(56, 189, 248, 0.25)' : 'none',
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  flexShrink: 0,
                  boxShadow: '0 0 16px rgba(56, 189, 248, 0.4)',
                }}
              >
                <Grid size={18} />
              </div>

              <span
                style={{
                  fontSize: '0.90rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                }}
              >
                NSE MARKET HEAT MAP
              </span>

              {pathname === '/chart' && (
                <span className="badge badge-primary" style={{ padding: '2px 7px', fontSize: '0.60rem', fontWeight: 800 }}>
                  ACTIVE
                </span>
              )}
            </div>

            <ChevronRight size={16} color="#38bdf8" style={{ flexShrink: 0 }} />
          </div>

          {/* Option 7: TRADE SIGNALS */}
          <div
            onClick={handleSelectSignals}
            onMouseEnter={prefetchSignals}
            style={{
              background: pathname === '/signals'
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.22) 0%, rgba(245, 158, 11, 0.18) 100%)'
                : 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(245, 158, 11, 0.06) 100%)',
              border: pathname === '/signals' ? '1px solid #ef4444' : '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 16px',
              minHeight: '56px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              transition: 'all 0.2s ease',
              boxShadow: pathname === '/signals' ? '0 4px 20px -2px rgba(239, 68, 68, 0.25)' : 'none',
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
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
                  flexShrink: 0,
                  boxShadow: '0 0 16px rgba(239, 68, 68, 0.4)',
                }}
              >
                <Zap size={18} />
              </div>

              <span
                style={{
                  fontSize: '0.90rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                }}
              >
                TRADE SIGNALS
              </span>

              {pathname === '/signals' && (
                <span className="badge badge-danger" style={{ padding: '2px 7px', fontSize: '0.60rem', fontWeight: 800 }}>
                  ACTIVE
                </span>
              )}
            </div>

            <ChevronRight size={16} color="#ef4444" style={{ flexShrink: 0 }} />
          </div>

          {/* Option 8: STRATEGY (Create & Backtest Strategies) */}
          <div
            id="nav-strategy"
            data-nav-item="strategy"
            onClick={handleSelectStrategy}
            onMouseEnter={prefetchStrategy}
            style={{
              background: pathname === '/strategy'
                ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.22) 0%, rgba(168, 85, 247, 0.18) 100%)'
                : 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.06) 100%)',
              border: pathname === '/strategy' ? '1px solid #6366f1' : '1px solid rgba(99, 102, 241, 0.35)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 16px',
              minHeight: '56px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              transition: 'all 0.2s ease',
              boxShadow: pathname === '/strategy' ? '0 4px 20px -2px rgba(99, 102, 241, 0.25)' : 'none',
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #a855f7 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  flexShrink: 0,
                  boxShadow: '0 0 16px rgba(99, 102, 241, 0.4)',
                }}
              >
                <SlidersHorizontal size={18} />
              </div>

              <span
                style={{
                  fontSize: '0.90rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                }}
              >
                STRATEGY
              </span>

              {pathname === '/strategy' && (
                <span className="badge badge-primary" style={{ padding: '2px 7px', fontSize: '0.60rem', fontWeight: 800 }}>
                  ACTIVE
                </span>
              )}
            </div>

            <ChevronRight size={16} color="#818cf8" style={{ flexShrink: 0 }} />
          </div>

          {/* Option 9: BROKER (Live Broker Connect & Account OMS) */}
          <div
            id="nav-broker"
            data-nav-item="broker"
            onClick={handleSelectBroker}
            onMouseEnter={prefetchBroker}
            style={{
              background: pathname === '/broker'
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.22) 0%, rgba(5, 150, 105, 0.18) 100%)'
                : 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.06) 100%)',
              border: pathname === '/broker' ? '1px solid #10b981' : '1px solid rgba(16, 185, 129, 0.35)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 16px',
              minHeight: '56px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              transition: 'all 0.2s ease',
              boxShadow: pathname === '/broker' ? '0 4px 20px -2px rgba(16, 185, 129, 0.25)' : 'none',
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
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
                <ShieldCheck size={18} />
              </div>

              <span
                style={{
                  fontSize: '0.90rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                }}
              >
                BROKER
              </span>

              {pathname === '/broker' && (
                <span className="badge badge-success" style={{ padding: '2px 7px', fontSize: '0.60rem', fontWeight: 800 }}>
                  ACTIVE
                </span>
              )}
            </div>

            <ChevronRight size={16} color="#10b981" style={{ flexShrink: 0 }} />
          </div>

          {/* Option 10: OPTION CHAIN (F&O Greeks, PCR, Max Pain & Payoff Strategy Builder) */}
          <div
            id="nav-option-chain"
            data-nav-item="option-chain"
            onClick={handleSelectOptionChain}
            onMouseEnter={prefetchOptionChain}
            style={{
              background: pathname === '/option-chain'
                ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.24) 0%, rgba(99, 102, 241, 0.20) 100%)'
                : 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(99, 102, 241, 0.06) 100%)',
              border: pathname === '/option-chain' ? '1px solid #8b5cf6' : '1px solid rgba(139, 92, 246, 0.35)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 16px',
              minHeight: '56px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              transition: 'all 0.2s ease',
              boxShadow: pathname === '/option-chain' ? '0 4px 20px -2px rgba(139, 92, 246, 0.25)' : 'none',
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  flexShrink: 0,
                  boxShadow: '0 0 16px rgba(139, 92, 246, 0.4)',
                }}
              >
                <Layers size={18} />
              </div>

              <span
                style={{
                  fontSize: '0.90rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '0.01em',
                  whiteSpace: 'nowrap',
                }}
              >
                OPTION CHAIN
              </span>

              {pathname === '/option-chain' && (
                <span className="badge badge-primary" style={{ padding: '2px 7px', fontSize: '0.60rem', fontWeight: 800, background: '#8b5cf6', color: '#ffffff' }}>
                  ACTIVE
                </span>
              )}
            </div>

            <ChevronRight size={16} color="#a855f7" style={{ flexShrink: 0 }} />
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
