'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  DollarSign,
  TrendingUp,
  TrendingDown,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Send,
  XCircle,
  Clock,
  Shield,
  Layers
} from 'lucide-react';
import { getApiBase } from '@/config/api';

interface OpenPosition {
  position_id: string;
  symbol: string;
  instrument_type: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entry_price: number;
  current_price: number;
  unrealized_pnl: number;
  pnl_pct: number;
  margin_allocated: number;
  stop_loss?: number;
  target?: number;
  strategy_name?: string;
  entry_time: string;
}

interface ClosedTrade {
  position_id: string;
  symbol: string;
  instrument_type: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entry_price: number;
  entry_time: string;
  exit_price: number;
  exit_time: string;
  exit_reason: string;
  gross_pnl: number;
  charges: number;
  net_pnl: number;
  return_pct: number;
  outcome: 'PROFIT' | 'LOSS';
}

interface PortfolioState {
  account_id: string;
  initial_capital: number;
  cash_balance: number;
  used_margin: number;
  unrealized_pnl: number;
  realized_pnl: number;
  net_equity: number;
  total_charges: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate_pct: number;
  open_positions: OpenPosition[];
  closed_trades: ClosedTrade[];
}

export default function PaperTradingDesk() {
  const [portfolio, setPortfolio] = useState<PortfolioState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Order Ticket Form
  const [symbol, setSymbol] = useState<string>('RELIANCE');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState<number>(25);
  const [instrumentType, setInstrumentType] = useState<string>('EQUITY');
  const [orderType, setOrderType] = useState<string>('MARKET');
  const [stopLoss, setStopLoss] = useState<string>('');
  const [target, setTarget] = useState<string>('');

  const fetchPortfolio = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/paper-trading/portfolio`);
      const data = await res.json();
      if (res.ok) {
        setPortfolio(data);
      }
    } catch (err: any) {
      console.error('Portfolio fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 4000); // Poll every 4 seconds for live MTM updates
    return () => clearInterval(interval);
  }, [fetchPortfolio]);

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/api/paper-trading/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          side,
          quantity: Number(quantity),
          instrument_type: instrumentType,
          order_type: orderType,
          stop_loss: stopLoss ? Number(stopLoss) : undefined,
          target: target ? Number(target) : undefined,
          strategy_name: 'Paper Trading Desk'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Order execution failed');
      fetchPortfolio();
    } catch (err: any) {
      setError(err.message || 'Error submitting order');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClosePosition = async (positionId: string) => {
    if (!confirm(`Are you sure you want to close position ${positionId}?`)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/paper-trading/close/${positionId}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to square off position');
      fetchPortfolio();
    } catch (err: any) {
      alert(`Error closing position: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetAccount = async () => {
    if (!confirm('Reset virtual paper trading portfolio back to ₹10,00,000 cash balance?')) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/paper-trading/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initial_capital: 1000000 })
      });
      if (res.ok) fetchPortfolio();
    } catch (err: any) {
      alert(`Reset error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Portfolio Financial Summary Bar */}
      {portfolio && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px' }}>
          <div className="card" style={{ padding: '16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
            <span style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Virtual Cash Balance</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#38bdf8', marginTop: '4px' }}>
              ₹{portfolio.cash_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Used Margin: ₹{portfolio.used_margin.toLocaleString('en-IN')}
            </div>
          </div>

          <div className="card" style={{ padding: '16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
            <span style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Live Unrealized MTM</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 900, color: portfolio.unrealized_pnl >= 0 ? '#10b981' : '#ef4444' }}>
                {portfolio.unrealized_pnl >= 0 ? `+₹${portfolio.unrealized_pnl.toLocaleString('en-IN')}` : `-₹${Math.abs(portfolio.unrealized_pnl).toLocaleString('en-IN')}`}
              </span>
              <span className={`badge ${portfolio.unrealized_pnl >= 0 ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.62rem' }}>
                LIVE MTM
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Realized P&L: ₹{portfolio.realized_pnl.toLocaleString('en-IN')}
            </div>
          </div>

          <div className="card" style={{ padding: '16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
            <span style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Net Equity</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: portfolio.net_equity >= portfolio.initial_capital ? '#10b981' : '#ef4444', marginTop: '4px' }}>
              ₹{portfolio.net_equity.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Return: {((portfolio.net_equity - portfolio.initial_capital) / portfolio.initial_capital * 100).toFixed(2)}%
            </div>
          </div>

          <div className="card" style={{ padding: '16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
            <span style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Win Rate & Stats</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>
              {portfolio.win_rate_pct}%
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {portfolio.winning_trades} Wins / {portfolio.losing_trades} Losses ({portfolio.total_trades} closed)
            </div>
          </div>
        </div>
      )}

      {/* Main Execution Split: Order Form + Open Positions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Virtual Order Ticket */}
        <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Send size={18} color="#38bdf8" />
              Virtual Order Ticket
            </h3>
            <button
              onClick={handleResetAccount}
              disabled={actionLoading}
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.70rem' }}
            >
              Reset Account
            </button>
          </div>

          {error && (
            <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 'var(--radius-md)', color: '#ef4444', fontSize: '0.78rem', marginBottom: '12px' }}>
              {error}
            </div>
          )}

          <form onSubmit={handlePlaceOrder} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Side Selector */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setSide('BUY')}
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  border: side === 'BUY' ? '2px solid #10b981' : '1px solid var(--border-color)',
                  background: side === 'BUY' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                  color: side === 'BUY' ? '#10b981' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                BUY (LONG)
              </button>
              <button
                type="button"
                onClick={() => setSide('SELL')}
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  border: side === 'SELL' ? '2px solid #ef4444' : '1px solid var(--border-color)',
                  background: side === 'SELL' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                  color: side === 'SELL' ? '#ef4444' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                SELL (SHORT)
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)' }}>SYMBOL</label>
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="select-field"
                  style={{ width: '100%', marginTop: '4px', padding: '8px' }}
                >
                  <option value="RELIANCE">RELIANCE</option>
                  <option value="TCS">TCS</option>
                  <option value="HDFCBANK">HDFCBANK</option>
                  <option value="INFY">INFY</option>
                  <option value="NIFTY">NIFTY</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)' }}>QUANTITY</label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="input-field"
                  style={{ width: '100%', marginTop: '4px', padding: '8px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)' }}>INSTRUMENT</label>
                <select
                  value={instrumentType}
                  onChange={(e) => setInstrumentType(e.target.value)}
                  className="select-field"
                  style={{ width: '100%', marginTop: '4px', padding: '8px' }}
                >
                  <option value="EQUITY">Cash Equity (NSE)</option>
                  <option value="FUTURES">Futures Contract</option>
                  <option value="OPTIONS">Options Contract</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)' }}>ORDER TYPE</label>
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value)}
                  className="select-field"
                  style={{ width: '100%', marginTop: '4px', padding: '8px' }}
                >
                  <option value="MARKET">Market Order</option>
                  <option value="LIMIT">Limit Order</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)' }}>STOP LOSS (₹)</label>
                <input
                  type="number"
                  placeholder="Optional"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', marginTop: '4px', padding: '8px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)' }}>TARGET (₹)</label>
                <input
                  type="number"
                  placeholder="Optional"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', marginTop: '4px', padding: '8px' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={actionLoading}
              className={`btn ${side === 'BUY' ? 'btn-primary' : 'btn-danger'}`}
              style={{
                width: '100%',
                marginTop: '8px',
                padding: '10px',
                fontWeight: 800,
                fontSize: '0.85rem',
                background: side === 'BUY' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
              }}
            >
              {actionLoading ? 'Executing Order...' : `Execute Virtual ${side} Order`}
            </button>
          </form>
        </div>

        {/* Live Open Positions */}
        <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} color="#10b981" />
              Open Virtual Positions ({portfolio?.open_positions?.length || 0})
            </h3>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
              Live Tick MTM Active
            </span>
          </div>

          {portfolio?.open_positions && portfolio.open_positions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {portfolio.open_positions.map((pos) => (
                <div
                  key={pos.position_id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <b style={{ fontSize: '0.92rem' }}>{pos.symbol}</b>
                      <span className={`badge ${pos.side === 'BUY' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.62rem' }}>
                        {pos.side}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{pos.quantity} Qty</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Entry: ₹{pos.entry_price} | LTP: ₹{pos.current_price}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: pos.unrealized_pnl >= 0 ? '#10b981' : '#ef4444' }}>
                        {pos.unrealized_pnl >= 0 ? `+₹${pos.unrealized_pnl.toFixed(2)}` : `-₹${Math.abs(pos.unrealized_pnl).toFixed(2)}`}
                      </div>
                      <div style={{ fontSize: '0.70rem', color: pos.pnl_pct >= 0 ? '#10b981' : '#ef4444' }}>
                        {pos.pnl_pct >= 0 ? `+${pos.pnl_pct}%` : `${pos.pnl_pct}%`}
                      </div>
                    </div>

                    <button
                      onClick={() => handleClosePosition(pos.position_id)}
                      disabled={actionLoading}
                      className="btn btn-secondary"
                      style={{ padding: '6px 10px', fontSize: '0.72rem', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                    >
                      Square Off
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No active open paper positions. Submit an order to trade virtually in live simulated markets.
            </div>
          )}
        </div>
      </div>

      {/* Closed Trades History */}
      {portfolio?.closed_trades && portfolio.closed_trades.length > 0 && (
        <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '0.92rem', fontWeight: 800 }}>
            Closed Virtual Trades ({portfolio.closed_trades.length})
          </h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.80rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Symbol</th>
                  <th style={{ padding: '8px' }}>Side</th>
                  <th style={{ padding: '8px' }}>Qty</th>
                  <th style={{ padding: '8px' }}>Entry Price</th>
                  <th style={{ padding: '8px' }}>Exit Price</th>
                  <th style={{ padding: '8px' }}>Gross P&L</th>
                  <th style={{ padding: '8px' }}>Charges</th>
                  <th style={{ padding: '8px' }}>Net Realized P&L</th>
                  <th style={{ padding: '8px' }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.closed_trades.slice().reverse().map((tr, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{tr.symbol}</td>
                    <td style={{ padding: '8px' }}>
                      <span className={`badge ${tr.side === 'BUY' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.62rem' }}>
                        {tr.side}
                      </span>
                    </td>
                    <td style={{ padding: '8px' }}>{tr.quantity}</td>
                    <td style={{ padding: '8px' }}>₹{tr.entry_price}</td>
                    <td style={{ padding: '8px' }}>₹{tr.exit_price}</td>
                    <td style={{ padding: '8px', color: tr.gross_pnl >= 0 ? '#10b981' : '#ef4444' }}>₹{tr.gross_pnl}</td>
                    <td style={{ padding: '8px', color: 'var(--text-muted)' }}>₹{tr.charges}</td>
                    <td style={{ padding: '8px', fontWeight: 800, color: tr.net_pnl >= 0 ? '#10b981' : '#ef4444' }}>
                      {tr.net_pnl >= 0 ? `+₹${tr.net_pnl}` : `-₹${Math.abs(tr.net_pnl)}`}
                    </td>
                    <td style={{ padding: '8px' }}>
                      <span className={`badge ${tr.outcome === 'PROFIT' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.62rem' }}>
                        {tr.outcome}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
