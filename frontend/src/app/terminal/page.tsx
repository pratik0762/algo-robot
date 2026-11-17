'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  TrendingUp,
  TrendingDown,
  Layers,
  Search,
  RefreshCw,
  Zap,
  Activity,
  Sliders,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Menu,
  ChevronDown,
  Clock,
  DollarSign,
  Maximize2,
  Compass,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { getApiBase } from '@/config/api';
import IndicesBarometer from '@/components/IndicesBarometer';
import MarketStatusBanner from '@/components/MarketStatusBanner';
import { useLiveStockTicks } from '@/hooks/useLiveStockTicks';

// Dynamically import client components to prevent SSR canvas mismatch
const TradingViewLightweightChart = dynamic(
  () => import('@/components/TradingViewLightweightChart'),
  { ssr: false, loading: () => <div style={{ height: '520px', background: '#090d16', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Loading Institutional TradingView Canvas...</div> }
);

const PaperOrderModal = dynamic(
  () => import('@/components/PaperOrderModal'),
  { ssr: false }
);

const NavigationDrawer = dynamic(
  () => import('@/components/NavigationDrawer'),
  { ssr: false, loading: () => null }
);

// High-liquidity default Nifty 50 constituents
const SYMBOL_LIST = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd.', sector: 'Energy & Oil' },
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'Information Technology' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd.', sector: 'Banking & Financials' },
  { symbol: 'INFY', name: 'Infosys Ltd.', sector: 'Information Technology' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd.', sector: 'Banking & Financials' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd.', sector: 'Automobile' },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Public Sector Bank' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd.', sector: 'Telecommunications' },
  { symbol: 'ITC', name: 'ITC Ltd.', sector: 'FMCG' },
  { symbol: 'LT', name: 'Larsen & Toubro Ltd.', sector: 'Capital Goods & Infra' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank Ltd.', sector: 'Banking & Financials' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd.', sector: 'FMCG' },
  { symbol: 'AXISBANK', name: 'Axis Bank Ltd.', sector: 'Banking & Financials' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance Ltd.', sector: 'Financial Services' },
  { symbol: 'MARUTI', name: 'Maruti Suzuki India Ltd.', sector: 'Automobile' },
];

export default function TerminalPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState('RELIANCE');
  const [activeTimeframe, setActiveTimeframe] = useState('15m');
  const [symbolSearch, setSymbolSearch] = useState('');

  // Stock details & candles state
  const [stockDetail, setStockDetail] = useState<any | null>(null);
  const [candles, setCandles] = useState<any[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);

  // OMS Desk state (Orders, Positions, Trades, Portfolio)
  const [bottomTab, setBottomTab] = useState<'positions' | 'orders' | 'trades' | 'levels'>('positions');
  const [positions, setPositions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [portfolioSummary, setPortfolioSummary] = useState<any | null>(null);

  // Paper Order Modal state
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderModalSide, setOrderModalSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderModalPrice, setOrderModalPrice] = useState<number>(0);

  // Real-time stock ticks hook
  const { ticks: liveTicks, isConnected: wsConnected } = useLiveStockTicks();

  // Load stock details, Order Blocks, and candles
  const fetchStockData = useCallback(async (sym: string, tf: string) => {
    setLoadingChart(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/order-block/stock/${sym}?timeframe=${tf}`);
      if (res.ok) {
        const data = await res.json();
        setStockDetail(data);
        setCandles(data.candles || []);
      }
    } catch (e) {
      console.warn('Could not fetch stock order block details:', e);
    } finally {
      setLoadingChart(false);
    }
  }, []);

  // Fetch OMS Positions, Orders, and Portfolio
  const fetchOmsData = useCallback(async () => {
    try {
      const apiBase = getApiBase();
      const [posRes, ordRes, trdRes, portRes] = await Promise.all([
        fetch(`${apiBase}/api/positions`),
        fetch(`${apiBase}/api/orders`),
        fetch(`${apiBase}/api/trades`),
        fetch(`${apiBase}/api/oms/portfolio-summary`),
      ]);

      if (posRes.ok) {
        const d = await posRes.json();
        setPositions(d.positions || []);
      }
      if (ordRes.ok) {
        const d = await ordRes.json();
        setOrders(d.orders || []);
      }
      if (trdRes.ok) {
        const d = await trdRes.json();
        setTrades(d.trades || []);
      }
      if (portRes.ok) {
        const d = await portRes.json();
        setPortfolioSummary(d.summary || null);
      }
    } catch (e) {
      console.warn('Could not refresh OMS data:', e);
    }
  }, []);

  // Initial and on-change load
  useEffect(() => {
    fetchStockData(activeSymbol, activeTimeframe);
  }, [activeSymbol, activeTimeframe, fetchStockData]);

  useEffect(() => {
    fetchOmsData();
    const interval = setInterval(fetchOmsData, 5000);
    return () => clearInterval(interval);
  }, [fetchOmsData]);

  // Open order placement modal
  const handleOpenOrder = (sym: string, side: 'BUY' | 'SELL', price?: number) => {
    setActiveSymbol(sym);
    setOrderModalSide(side);
    setOrderModalPrice(price || stockDetail?.current_price || 1000);
    setOrderModalOpen(true);
  };

  // Filtered symbols dropdown
  const filteredSymbols = useMemo(() => {
    if (!symbolSearch.trim()) return SYMBOL_LIST;
    const q = symbolSearch.toLowerCase();
    return SYMBOL_LIST.filter(
      (s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    );
  }, [symbolSearch]);

  const activeLiveTick = liveTicks[activeSymbol];
  const currentPrice = activeLiveTick?.ltp ?? stockDetail?.current_price ?? 0;
  const currentChangePct = activeLiveTick?.percent_change ?? stockDetail?.percent_change ?? 0;

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      {/* 1. Indices Barometer */}
      <IndicesBarometer />

      {/* 2. Market Status Banner */}
      <MarketStatusBanner />

      {/* 3. Terminal Navigation & Symbol Header */}
      <header
        style={{
          padding: '10px 20px',
          background: 'rgba(15, 23, 42, 0.95)',
          borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={() => setDrawerOpen(true)}
            style={{
              padding: '8px',
              borderRadius: '8px',
              background: 'rgba(30, 41, 59, 0.6)',
              border: '1px solid rgba(51, 65, 85, 0.6)',
              color: '#f8fafc',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Menu size={18} />
          </button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.05rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                ALGO ROBOT TERMINAL
              </span>
              <span
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: wsConnected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  color: wsConnected ? '#34d399' : '#fbbf24',
                  border: `1px solid ${wsConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                }}
              >
                {wsConnected ? 'LIVE FEED CONNECTED' : 'CACHED / CONNECTING'}
              </span>
            </div>
            <div style={{ fontSize: '0.70rem', color: '#94a3b8' }}>
              Real-Time Tick Scanning &bull; TradingView Canvas &bull; Multi-Broker OMS
            </div>
          </div>
        </div>

        {/* Symbol Quick Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <select
              value={activeSymbol}
              onChange={(e) => setActiveSymbol(e.target.value)}
              style={{
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid rgba(51, 65, 85, 0.8)',
                borderRadius: '8px',
                color: '#f8fafc',
                padding: '8px 32px 8px 12px',
                fontSize: '0.84rem',
                fontWeight: 800,
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
              }}
            >
              {SYMBOL_LIST.map((s) => (
                <option key={s.symbol} value={s.symbol} style={{ background: '#0f172a', color: '#f8fafc' }}>
                  {s.symbol} — {s.name.slice(0, 24)}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8' }}
            />
          </div>

          <button
            onClick={() => handleOpenOrder(activeSymbol, 'BUY', currentPrice)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              fontSize: '0.82rem',
              fontWeight: 800,
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
            }}
          >
            <TrendingUp size={15} /> BUY ORDER
          </button>
          <button
            onClick={() => handleOpenOrder(activeSymbol, 'SELL', currentPrice)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              fontSize: '0.82rem',
              fontWeight: 800,
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
            }}
          >
            <TrendingDown size={15} /> SELL ORDER
          </button>
        </div>
      </header>

      {/* 4. Main Terminal Layout (70% Chart & Analysis / 30% OMS Desk) */}
      <main
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 340px',
          gap: '16px',
          padding: '16px 20px',
        }}
      >
        {/* Left Column: Charting Canvas & Bottom Ledger Tabs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          {/* Active Four Critical Levels Indicator Pills */}
          {stockDetail?.four_critical_levels && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
                background: 'rgba(15, 23, 42, 0.7)',
                padding: '10px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(51, 65, 85, 0.4)',
              }}
            >
              <div>
                <div style={{ fontSize: '0.66rem', color: '#fbbf24', fontWeight: 800 }}>Z — ORDER BLOCK ZONE</div>
                <div style={{ fontSize: '0.90rem', fontWeight: 900, color: '#f8fafc', marginTop: '2px' }}>
                  {stockDetail.four_critical_levels.Z_order_block_zone.display}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.66rem', color: '#f87171', fontWeight: 800 }}>S1 — SETUP INVALIDATION</div>
                <div style={{ fontSize: '0.90rem', fontWeight: 900, color: '#f8fafc', marginTop: '2px' }}>
                  {stockDetail.four_critical_levels.S1_invalidation.display}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.66rem', color: '#34d399', fontWeight: 800 }}>R1 — LIQUIDITY TARGET 1</div>
                <div style={{ fontSize: '0.90rem', fontWeight: 900, color: '#f8fafc', marginTop: '2px' }}>
                  {stockDetail.four_critical_levels.R1_first_target.display}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.66rem', color: '#38bdf8', fontWeight: 800 }}>R2 — MOMENTUM TARGET 2</div>
                <div style={{ fontSize: '0.90rem', fontWeight: 900, color: '#f8fafc', marginTop: '2px' }}>
                  {stockDetail.four_critical_levels.R2_second_target.display}
                </div>
              </div>
            </div>
          )}

          {/* Institutional TradingView Lightweight Charts Engine */}
          <TradingViewLightweightChart
            symbol={activeSymbol}
            companyName={stockDetail?.company_name}
            currentPrice={currentPrice}
            percentChange={currentChangePct}
            candles={candles}
            orderBlocks={stockDetail?.all_bullish_obs?.concat(stockDetail?.all_bearish_obs || [])}
            criticalLevels={{
              Z: stockDetail?.four_critical_levels?.Z_order_block_zone,
              S1: stockDetail?.four_critical_levels?.S1_invalidation,
              R1: stockDetail?.four_critical_levels?.R1_first_target,
              R2: stockDetail?.four_critical_levels?.R2_second_target,
            }}
            activeSetup={stockDetail?.active_setup}
            timeframe={activeTimeframe}
            onTimeframeChange={setActiveTimeframe}
            onOrderClick={handleOpenOrder}
            height={520}
          />

          {/* Bottom Tabs: Positions, Orders, Trades, SMC Levels */}
          <div
            style={{
              background: '#090d16',
              borderRadius: '16px',
              border: '1px solid rgba(51, 65, 85, 0.4)',
              padding: '16px',
            }}
          >
            {/* Tab Buttons */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(51, 65, 85, 0.4)', paddingBottom: '10px' }}>
              {[
                { id: 'positions', label: `Open Positions (${positions.length})`, count: positions.length },
                { id: 'orders', label: `Working Orders (${orders.length})`, count: orders.length },
                { id: 'trades', label: `Executed Trades (${trades.length})`, count: trades.length },
                { id: 'levels', label: 'SMC Key Levels', count: 4 },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setBottomTab(t.id as any)}
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.80rem',
                    fontWeight: bottomTab === t.id ? 800 : 600,
                    borderRadius: '6px',
                    background: bottomTab === t.id ? 'rgba(37, 99, 235, 0.25)' : 'transparent',
                    color: bottomTab === t.id ? '#60a5fa' : '#94a3b8',
                    border: `1px solid ${bottomTab === t.id ? '#3b82f6' : 'transparent'}`,
                    cursor: 'pointer',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={{ marginTop: '14px', overflowX: 'auto' }}>
              {bottomTab === 'positions' && (
                <div>
                  {positions.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '0.84rem' }}>
                      No active open positions. Place an order using the BUY/SELL buttons above.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.80rem' }}>
                      <thead>
                        <tr style={{ color: '#94a3b8', borderBottom: '1px solid rgba(51, 65, 85, 0.4)', textAlign: 'left' }}>
                          <th style={{ padding: '8px' }}>Symbol</th>
                          <th style={{ padding: '8px' }}>Side</th>
                          <th style={{ padding: '8px' }}>Qty</th>
                          <th style={{ padding: '8px' }}>Avg Price</th>
                          <th style={{ padding: '8px' }}>LTP</th>
                          <th style={{ padding: '8px' }}>MTM PnL</th>
                          <th style={{ padding: '8px' }}>Product</th>
                        </tr>
                      </thead>
                      <tbody>
                        {positions.map((p, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.2)' }}>
                            <td style={{ padding: '8px', fontWeight: 800 }}>{p.symbol}</td>
                            <td style={{ padding: '8px', color: p.side === 'BUY' ? '#34d399' : '#f87171', fontWeight: 800 }}>
                              {p.side}
                            </td>
                            <td style={{ padding: '8px' }}>{p.quantity}</td>
                            <td style={{ padding: '8px' }}>₹{p.average_price?.toFixed(2)}</td>
                            <td style={{ padding: '8px' }}>₹{p.last_price?.toFixed(2)}</td>
                            <td style={{ padding: '8px', fontWeight: 800, color: (p.unrealized_pnl || 0) >= 0 ? '#34d399' : '#f87171' }}>
                              {(p.unrealized_pnl || 0) >= 0 ? '+' : ''}₹{p.unrealized_pnl?.toFixed(2) || '0.00'}
                            </td>
                            <td style={{ padding: '8px', color: '#94a3b8' }}>{p.product_type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {bottomTab === 'orders' && (
                <div>
                  {orders.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '0.84rem' }}>
                      No orders placed in this session.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.80rem' }}>
                      <thead>
                        <tr style={{ color: '#94a3b8', borderBottom: '1px solid rgba(51, 65, 85, 0.4)', textAlign: 'left' }}>
                          <th style={{ padding: '8px' }}>Order ID</th>
                          <th style={{ padding: '8px' }}>Symbol</th>
                          <th style={{ padding: '8px' }}>Side</th>
                          <th style={{ padding: '8px' }}>Type</th>
                          <th style={{ padding: '8px' }}>Qty</th>
                          <th style={{ padding: '8px' }}>Price</th>
                          <th style={{ padding: '8px' }}>State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => (
                          <tr key={o.order_id} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.2)' }}>
                            <td style={{ padding: '8px', fontFamily: 'monospace', color: '#94a3b8' }}>{o.order_id}</td>
                            <td style={{ padding: '8px', fontWeight: 800 }}>{o.symbol}</td>
                            <td style={{ padding: '8px', color: o.transaction_type === 'BUY' ? '#34d399' : '#f87171', fontWeight: 800 }}>
                              {o.transaction_type}
                            </td>
                            <td style={{ padding: '8px' }}>{o.order_type}</td>
                            <td style={{ padding: '8px' }}>{o.filled_quantity} / {o.quantity}</td>
                            <td style={{ padding: '8px' }}>₹{o.average_price > 0 ? o.average_price.toFixed(2) : (o.price > 0 ? o.price.toFixed(2) : 'MKT')}</td>
                            <td style={{ padding: '8px' }}>
                              <span
                                style={{
                                  fontSize: '0.70rem',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontWeight: 800,
                                  background: o.state === 'FILLED' ? 'rgba(16, 185, 129, 0.2)' : o.state === 'REJECTED' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                                  color: o.state === 'FILLED' ? '#34d399' : o.state === 'REJECTED' ? '#f87171' : '#38bdf8',
                                }}
                              >
                                {o.state}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {bottomTab === 'trades' && (
                <div>
                  {trades.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '0.84rem' }}>
                      No executed trades ledger recorded yet.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.80rem' }}>
                      <thead>
                        <tr style={{ color: '#94a3b8', borderBottom: '1px solid rgba(51, 65, 85, 0.4)', textAlign: 'left' }}>
                          <th style={{ padding: '8px' }}>Trade ID</th>
                          <th style={{ padding: '8px' }}>Symbol</th>
                          <th style={{ padding: '8px' }}>Side</th>
                          <th style={{ padding: '8px' }}>Filled Qty</th>
                          <th style={{ padding: '8px' }}>Fill Price</th>
                          <th style={{ padding: '8px' }}>Friction (Fees)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trades.map((t, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.2)' }}>
                            <td style={{ padding: '8px', fontFamily: 'monospace', color: '#94a3b8' }}>{t.trade_id || t.fill_id}</td>
                            <td style={{ padding: '8px', fontWeight: 800 }}>{t.symbol}</td>
                            <td style={{ padding: '8px', color: t.side === 'BUY' ? '#34d399' : '#f87171', fontWeight: 800 }}>{t.side}</td>
                            <td style={{ padding: '8px' }}>{t.quantity}</td>
                            <td style={{ padding: '8px', fontWeight: 800 }}>₹{t.price?.toFixed(2)}</td>
                            <td style={{ padding: '8px', color: '#f87171' }}>-₹{t.friction_breakdown?.total_friction?.toFixed(2) || '0.00'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {bottomTab === 'levels' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                  <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(51, 65, 85, 0.4)' }}>
                    <div style={{ color: '#fbbf24', fontWeight: 800 }}>Bullish Order Blocks Detected</div>
                    <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '6px' }}>
                      {stockDetail?.all_bullish_obs?.length || 0} institutional demand origins.
                    </div>
                  </div>
                  <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(51, 65, 85, 0.4)' }}>
                    <div style={{ color: '#f87171', fontWeight: 800 }}>Bearish Order Blocks Detected</div>
                    <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '6px' }}>
                      {stockDetail?.all_bearish_obs?.length || 0} institutional supply crests.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Execution Desk & Portfolio Risk Summary */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Portfolio Equity & Margin Card */}
          <div
            style={{
              background: '#090d16',
              borderRadius: '16px',
              border: '1px solid rgba(51, 65, 85, 0.4)',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>
              PORTFOLIO DESK EQUITY
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#f8fafc', marginTop: '4px' }}>
              ₹{portfolioSummary?.total_equity ? portfolioSummary.total_equity.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '1,000,000.00'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px', fontSize: '0.74rem' }}>
              <div>
                <span style={{ color: '#94a3b8' }}>Cash Available:</span>
                <div style={{ fontWeight: 800, color: '#38bdf8' }}>
                  ₹{portfolioSummary?.cash_available ? portfolioSummary.cash_available.toLocaleString('en-IN') : '950,000'}
                </div>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>Margin Used:</span>
                <div style={{ fontWeight: 800, color: '#fbbf24' }}>
                  ₹{portfolioSummary?.margin_utilized ? portfolioSummary.margin_utilized.toLocaleString('en-IN') : '50,000'}
                </div>
              </div>
            </div>
          </div>

          {/* Pre-Trade Risk Guardian Status */}
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.08)',
              borderRadius: '14px',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              padding: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 800, fontSize: '0.84rem' }}>
              <ShieldCheck size={18} />
              <span>Risk Guardian: ARMED (8 Gates)</span>
            </div>
            <div style={{ fontSize: '0.70rem', color: '#94a3b8', marginTop: '6px', lineHeight: 1.5 }}>
              All orders verified against Fat-Finger Collar (3%), Exchange Freeze, Max Daily Loss (₹50k), and Capital Risk (5%).
            </div>
          </div>

          {/* Quick Action Order Card */}
          <div
            style={{
              background: '#090d16',
              borderRadius: '16px',
              border: '1px solid rgba(51, 65, 85, 0.4)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>
              FAST ORDER ENTRY
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 900 }}>{activeSymbol}</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 900, color: currentChangePct >= 0 ? '#34d399' : '#f87171' }}>
                ₹{currentPrice.toFixed(2)}
              </span>
            </div>

            <button
              onClick={() => handleOpenOrder(activeSymbol, 'BUY', currentPrice)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                fontWeight: 900,
                fontSize: '0.88rem',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
              }}
            >
              <TrendingUp size={16} /> QUICK BUY
            </button>

            <button
              onClick={() => handleOpenOrder(activeSymbol, 'SELL', currentPrice)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#ffffff',
                fontWeight: 900,
                fontSize: '0.88rem',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
              }}
            >
              <TrendingDown size={16} /> QUICK SELL
            </button>
          </div>
        </aside>
      </main>

      {/* 5. Paper Order Entry Modal */}
      <PaperOrderModal
        isOpen={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        symbol={activeSymbol}
        companyName={stockDetail?.company_name}
        initialSide={orderModalSide}
        initialPrice={orderModalPrice}
        initialStopLoss={stockDetail?.four_critical_levels?.S1_invalidation?.price}
        initialTarget={stockDetail?.four_critical_levels?.R1_first_target?.price}
        onOrderPlaced={() => {
          fetchOmsData();
        }}
      />

      {/* 6. Navigation Drawer */}
      <NavigationDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
