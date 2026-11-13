'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  TrendingUp,
  ShieldCheck,
  Activity,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Info,
  DollarSign,
  ArrowRight,
  TrendingDown
} from 'lucide-react';
import { getApiBase } from '@/config/api';

interface OptionLeg {
  name: string;
  action: 'BUY' | 'SELL';
  option_type: 'CE' | 'PE';
  strike: number;
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  total_cost: number;
}

interface PayoffPoint {
  spot_at_expiry: number;
  pnl: number;
  pnl_pct: number;
}

interface SpreadCalculation {
  strategy_key: string;
  strategy_name: string;
  description: string;
  symbol: string;
  spot_price: number;
  atm_strike: number;
  lot_size: number;
  lots: number;
  total_quantity: number;
  days_to_expiry: number;
  spread_type: 'NET_DEBIT' | 'NET_CREDIT';
  net_premium_per_share: number;
  net_premium_total: number;
  max_profit: number | string;
  max_loss: number | string;
  risk_reward_ratio: number | string;
  break_even_points: number[];
  estimated_margin_required: number;
  net_greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
  legs: OptionLeg[];
  payoff_curve: PayoffPoint[];
}

export default function MultiLegOptionsDesk() {
  const [selectedStrategy, setSelectedStrategy] = useState<string>('IRON_CONDOR');
  const [symbol, setSymbol] = useState<string>('NIFTY');
  const [spotPrice, setSpotPrice] = useState<number>(24500);
  const [daysToExpiry, setDaysToExpiry] = useState<number>(7);
  const [lots, setLots] = useState<number>(1);
  const [iv, setIv] = useState<number>(0.15);

  const [loading, setLoading] = useState<boolean>(false);
  const [calculation, setCalculation] = useState<SpreadCalculation | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Backtest state
  const [backtesting, setBacktesting] = useState<boolean>(false);
  const [backtestResult, setBacktestResult] = useState<any | null>(null);

  const calculateSpread = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/api/strategies/multi-leg/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy_key: selectedStrategy,
          symbol,
          spot_price: Number(spotPrice),
          days_to_expiry: Number(daysToExpiry),
          iv: Number(iv),
          lots: Number(lots)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Calculation failed');
      setCalculation(data.spread);
    } catch (err: any) {
      setError(err.message || 'Error calculating spread');
    } finally {
      setLoading(false);
    }
  }, [selectedStrategy, symbol, spotPrice, daysToExpiry, iv, lots]);

  useEffect(() => {
    calculateSpread();
  }, [calculateSpread]);

  const handleRunBacktest = async () => {
    setBacktesting(true);
    try {
      const res = await fetch(`${getApiBase()}/api/strategies/multi-leg/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy_key: selectedStrategy,
          symbol,
          timeframe: '15m',
          lots: Number(lots)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Backtest failed');
      setBacktestResult(data);
    } catch (err: any) {
      alert(`Multi-leg backtest error: ${err.message}`);
    } finally {
      setBacktesting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Configuration Header Card */}
      <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={20} color="#a855f7" />
              Multi-Leg Options Spread Desk
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.80rem', color: 'var(--text-muted)' }}>
              Institutional multi-leg options modeling with Black-Scholes Greeks, defined-risk wings, and payoff curves.
            </p>
          </div>
          <button
            onClick={handleRunBacktest}
            disabled={backtesting}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '0.80rem', fontWeight: 700 }}
          >
            <Play size={15} />
            {backtesting ? 'Simulating Historical Bars...' : 'Backtest This Spread'}
          </button>
        </div>

        {/* Inputs Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Spread Strategy</label>
            <select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              className="select-field"
              style={{ width: '100%', marginTop: '4px', padding: '8px 10px', fontSize: '0.82rem' }}
            >
              <option value="IRON_CONDOR">Iron Condor (4-Leg Neutral)</option>
              <option value="BULL_CALL_SPREAD">Bull Call Spread (Debit)</option>
              <option value="BEAR_PUT_SPREAD">Bear Put Spread (Debit)</option>
              <option value="SHORT_STRADDLE">Short Straddle (ATM Credit)</option>
              <option value="SHORT_STRANGLE">Short Strangle (OTM Credit)</option>
              <option value="LONG_STRADDLE">Long Straddle (Debit Vol)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Underlying Symbol</label>
            <select
              value={symbol}
              onChange={(e) => {
                const s = e.target.value;
                setSymbol(s);
                if (s === 'NIFTY') setSpotPrice(24500);
                else if (s === 'BANKNIFTY') setSpotPrice(52000);
                else if (s === 'RELIANCE') setSpotPrice(1340);
                else if (s === 'TCS') setSpotPrice(2450);
              }}
              className="select-field"
              style={{ width: '100%', marginTop: '4px', padding: '8px 10px', fontSize: '0.82rem' }}
            >
              <option value="NIFTY">NIFTY (Step: 50 | Lot: 25)</option>
              <option value="BANKNIFTY">BANKNIFTY (Step: 100 | Lot: 15)</option>
              <option value="FINNIFTY">FINNIFTY (Step: 50 | Lot: 25)</option>
              <option value="RELIANCE">RELIANCE (Step: 20 | Lot: 250)</option>
              <option value="TCS">TCS (Step: 20 | Lot: 175)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Spot Price (₹)</label>
            <input
              type="number"
              value={spotPrice}
              onChange={(e) => setSpotPrice(Number(e.target.value))}
              className="input-field"
              style={{ width: '100%', marginTop: '4px', padding: '8px 10px', fontSize: '0.82rem' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Days to Expiry</label>
            <input
              type="number"
              min="1"
              max="60"
              value={daysToExpiry}
              onChange={(e) => setDaysToExpiry(Number(e.target.value))}
              className="input-field"
              style={{ width: '100%', marginTop: '4px', padding: '8px 10px', fontSize: '0.82rem' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Lots</label>
            <input
              type="number"
              min="1"
              max="20"
              value={lots}
              onChange={(e) => setLots(Number(e.target.value))}
              className="input-field"
              style={{ width: '100%', marginTop: '4px', padding: '8px 10px', fontSize: '0.82rem' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Implied Volatility (IV)</label>
            <select
              value={iv}
              onChange={(e) => setIv(Number(e.target.value))}
              className="select-field"
              style={{ width: '100%', marginTop: '4px', padding: '8px 10px', fontSize: '0.82rem' }}
            >
              <option value="0.12">12% (Low Volatility)</option>
              <option value="0.15">15% (Typical Nifty)</option>
              <option value="0.20">20% (Elevated Volatility)</option>
              <option value="0.28">28% (High Vol / Event)</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 'var(--radius-md)', color: '#ef4444', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Metrics & Net Payoff Summary */}
      {calculation && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <div className="card" style={{ padding: '16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
            <span style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net Premium</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 900, color: calculation.spread_type === 'NET_CREDIT' ? '#10b981' : '#f59e0b' }}>
                ₹{calculation.net_premium_total.toLocaleString('en-IN')}
              </span>
              <span className={`badge ${calculation.spread_type === 'NET_CREDIT' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.62rem' }}>
                {calculation.spread_type.replace('_', ' ')}
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              ₹{calculation.net_premium_per_share} / share ({calculation.total_quantity} qty)
            </div>
          </div>

          <div className="card" style={{ padding: '16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
            <span style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Max Profit</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>
              {typeof calculation.max_profit === 'number' ? `₹${calculation.max_profit.toLocaleString('en-IN')}` : calculation.max_profit}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Max Loss: {typeof calculation.max_loss === 'number' ? `₹${calculation.max_loss.toLocaleString('en-IN')}` : calculation.max_loss}
            </div>
          </div>

          <div className="card" style={{ padding: '16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
            <span style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>SEBI Margin Benefit</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#38bdf8', marginTop: '4px' }}>
              ₹{calculation.estimated_margin_required.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Multi-leg hedged margin requirement
            </div>
          </div>

          <div className="card" style={{ padding: '16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
            <span style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net Greeks</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px', fontSize: '0.76rem' }}>
              <div>Δ Delta: <b>{calculation.net_greeks.delta}</b></div>
              <div>Γ Gamma: <b>{calculation.net_greeks.gamma}</b></div>
              <div>θ Theta: <b style={{ color: '#10b981' }}>₹{calculation.net_greeks.theta}/day</b></div>
              <div>ν Vega: <b>{calculation.net_greeks.vega}</b></div>
            </div>
          </div>
        </div>
      )}

      {/* Legs Table */}
      {calculation && (
        <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '0.92rem', fontWeight: 800 }}>
            Constructed Option Legs ({calculation.legs.length} Legs)
          </h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.80rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Action</th>
                  <th style={{ padding: '8px' }}>Leg Description</th>
                  <th style={{ padding: '8px' }}>Option</th>
                  <th style={{ padding: '8px' }}>Strike</th>
                  <th style={{ padding: '8px' }}>BS Price (₹)</th>
                  <th style={{ padding: '8px' }}>Total Outlay</th>
                  <th style={{ padding: '8px' }}>Delta</th>
                  <th style={{ padding: '8px' }}>Theta</th>
                </tr>
              </thead>
              <tbody>
                {calculation.legs.map((leg, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px' }}>
                      <span className={`badge ${leg.action === 'BUY' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.65rem' }}>
                        {leg.action}
                      </span>
                    </td>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{leg.name}</td>
                    <td style={{ padding: '8px' }}>{leg.option_type}</td>
                    <td style={{ padding: '8px', fontWeight: 700 }}>₹{leg.strike.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '8px' }}>₹{leg.price.toFixed(2)}</td>
                    <td style={{ padding: '8px', fontWeight: 600 }}>₹{leg.total_cost.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '8px' }}>{leg.delta}</td>
                    <td style={{ padding: '8px', color: '#10b981' }}>{leg.theta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payoff Profile Table */}
      {calculation && calculation.payoff_curve && (
        <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '0.92rem', fontWeight: 800 }}>
            Expiry Payoff Distribution (Spot ±8%)
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
            {calculation.payoff_curve.map((pt, i) => (
              <div
                key={i}
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  background: pt.pnl >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                  border: `1px solid ${pt.pnl >= 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>Spot: ₹{pt.spot_at_expiry}</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, marginTop: '2px', color: pt.pnl >= 0 ? '#10b981' : '#ef4444' }}>
                  {pt.pnl >= 0 ? `+₹${pt.pnl}` : `-₹${Math.abs(pt.pnl)}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backtest Historical Replay Results Modal / Card */}
      {backtestResult && (
        <div className="card" style={{ padding: '20px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid #10b981', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={18} />
              Historical Walkforward Backtest Complete: {backtestResult.strategy} ({backtestResult.symbol})
            </h4>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Total Simulated Trades: <b>{backtestResult.total_trades}</b>
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
            <div style={{ padding: '10px', background: 'var(--card-bg)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>Win Rate</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981' }}>{backtestResult.win_rate_pct}%</div>
            </div>
            <div style={{ padding: '10px', background: 'var(--card-bg)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>Net Realized P&L</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: backtestResult.net_profit >= 0 ? '#10b981' : '#ef4444' }}>
                ₹{backtestResult.net_profit?.toLocaleString('en-IN')}
              </div>
            </div>
            <div style={{ padding: '10px', background: 'var(--card-bg)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>Wins / Losses</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{backtestResult.winning_trades}W / {backtestResult.losing_trades}L</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

