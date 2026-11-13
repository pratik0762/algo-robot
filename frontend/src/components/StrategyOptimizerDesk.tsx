'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  TrendingUp,
  Award,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Flame,
  BarChart2,
  Sliders,
  Sparkles
} from 'lucide-react';
import { getApiBase } from '@/config/api';

interface OptimizationResultRow {
  rank: number;
  params: Record<string, any>;
  score: number;
  net_profit: number;
  win_rate_pct: number;
  total_trades: number;
  profit_factor: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
}

interface HeatmapData {
  x_param: string;
  y_param: string;
  matrix: {
    y_value: any;
    row: { x: any; y: any; value: number }[];
  }[];
}

interface OptimizerResponse {
  status: string;
  strategy_id: string;
  symbol: string;
  timeframe: string;
  objective: string;
  total_evaluated: number;
  best_params: Record<string, any>;
  best_score: number;
  top_results: OptimizationResultRow[];
  heatmap: HeatmapData;
}

export default function StrategyOptimizerDesk() {
  const [strategyId, setStrategyId] = useState<string>('ema_cross');
  const [symbol, setSymbol] = useState<string>('RELIANCE');
  const [timeframe, setTimeframe] = useState<string>('5m');
  const [objective, setObjective] = useState<string>('sharpe_ratio');

  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<OptimizerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runOptimization = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/api/strategies/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy_id: strategyId,
          symbol,
          timeframe,
          objective
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Optimization sweep failed');
      setResults(data);
    } catch (err: any) {
      setError(err.message || 'Error executing parameter sweep');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runOptimization();
  }, [strategyId, symbol, timeframe, objective]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Configuration Card */}
      <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={20} color="#10b981" />
              Strategy Parameter Grid Optimizer
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.80rem', color: 'var(--text-muted)' }}>
              Cartesian grid search evaluating multi-dimensional indicator permutations to find robust statistical parameters.
            </p>
          </div>
          <button
            onClick={runOptimization}
            disabled={loading}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '0.80rem', fontWeight: 700 }}
          >
            <Play size={15} />
            {loading ? 'Evaluating Permutations...' : 'Run Parameter Sweep'}
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Target Strategy</label>
            <select
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              className="select-field"
              style={{ width: '100%', marginTop: '4px', padding: '8px 10px', fontSize: '0.82rem' }}
            >
              <option value="ema_cross">Dual EMA Cross (Fast / Slow / SL)</option>
              <option value="supertrend">Supertrend (ATR Period / Multiplier / SL)</option>
              <option value="rsi_momentum">RSI Momentum (Period / OB / OS)</option>
              <option value="vwap_breakout">VWAP Breakout (Vol Multiplier / RR)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Historical Universe</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="select-field"
              style={{ width: '100%', marginTop: '4px', padding: '8px 10px', fontSize: '0.82rem' }}
            >
              <option value="RELIANCE">RELIANCE (Nifty Heavyweight)</option>
              <option value="TCS">TCS (IT Sector Leader)</option>
              <option value="HDFCBANK">HDFCBANK (Private Banking)</option>
              <option value="INFY">INFY (IT Sector)</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Resolution / Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="select-field"
              style={{ width: '100%', marginTop: '4px', padding: '8px 10px', fontSize: '0.82rem' }}
            >
              <option value="5m">5-Minute Intraday Bars</option>
              <option value="15m">15-Minute Swing Bars</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Optimization Objective</label>
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="select-field"
              style={{ width: '100%', marginTop: '4px', padding: '8px 10px', fontSize: '0.82rem' }}
            >
              <option value="sharpe_ratio">Sharpe Ratio (Risk-Adjusted Return)</option>
              <option value="net_profit">Net Profit (Absolute Return ₹)</option>
              <option value="win_rate">Win Rate % (High Consistency)</option>
              <option value="profit_factor">Profit Factor (Gross Win / Loss)</option>
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

      {/* Best Optimal Parameter Banner */}
      {results && results.best_params && (
        <div className="card" style={{ padding: '20px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(56, 189, 248, 0.10) 100%)', border: '1px solid #10b981', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge-success" style={{ fontSize: '0.70rem', fontWeight: 800 }}>
                  <Award size={13} style={{ marginRight: '4px' }} />
                  RANK #1 OPTIMAL COMBINATION
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Evaluated {results.total_evaluated} Cartesian Permutations
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                {Object.entries(results.best_params).map(([k, v]) => (
                  <div key={k} style={{ padding: '6px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{k.replace('_', ' ')}: </span>
                    <b style={{ fontSize: '0.90rem', color: '#10b981' }}>{String(v)}</b>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Best {results.objective.toUpperCase()}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10b981' }}>{results.best_score}</div>
            </div>
          </div>
        </div>
      )}

      {/* 2D Heatmap Matrix */}
      {results && results.heatmap && results.heatmap.matrix && results.heatmap.matrix.length > 0 && (
        <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Flame size={16} color="#f59e0b" />
              Parameter Sensitivity Heatmap ({results.heatmap.x_param} vs {results.heatmap.y_param})
            </h4>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Green = Profitable Plateau | Red = Drawdown Valley
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.80rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>{results.heatmap.y_param} \ {results.heatmap.x_param}</th>
                  {results.heatmap.matrix[0].row.map((cell, idx) => (
                    <th key={idx} style={{ padding: '8px' }}>{results.heatmap.x_param}: {cell.x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.heatmap.matrix.map((rowItem, rIdx) => (
                  <tr key={rIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px', fontWeight: 700, textAlign: 'left' }}>
                      {results.heatmap.y_param}: {rowItem.y_value}
                    </td>
                    {rowItem.row.map((cell, cIdx) => {
                      const isProfit = cell.value >= 0;
                      return (
                        <td
                          key={cIdx}
                          style={{
                            padding: '10px 8px',
                            background: isProfit ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: isProfit ? '#10b981' : '#ef4444',
                            fontWeight: 700
                          }}
                        >
                          ₹{cell.value.toLocaleString('en-IN')}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Ranked Combinations Table */}
      {results && results.top_results && (
        <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '0.92rem', fontWeight: 800 }}>
            Top Parameter Permutations (Ranked by {results.objective.toUpperCase()})
          </h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.80rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Rank</th>
                  <th style={{ padding: '8px' }}>Parameters</th>
                  <th style={{ padding: '8px' }}>Net Profit (₹)</th>
                  <th style={{ padding: '8px' }}>Win Rate</th>
                  <th style={{ padding: '8px' }}>Trades</th>
                  <th style={{ padding: '8px' }}>Sharpe</th>
                  <th style={{ padding: '8px' }}>Profit Factor</th>
                  <th style={{ padding: '8px' }}>Max Drawdown</th>
                </tr>
              </thead>
              <tbody>
                {results.top_results.map((r) => (
                  <tr key={r.rank} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px' }}>
                      <span className={`badge ${r.rank === 1 ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: '0.65rem' }}>
                        #{r.rank}
                      </span>
                    </td>
                    <td style={{ padding: '8px', fontWeight: 600 }}>
                      {Object.entries(r.params).map(([k, v]) => `${k}:${v}`).join(' | ')}
                    </td>
                    <td style={{ padding: '8px', fontWeight: 700, color: r.net_profit >= 0 ? '#10b981' : '#ef4444' }}>
                      ₹{r.net_profit.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '8px' }}>{r.win_rate_pct}%</td>
                    <td style={{ padding: '8px' }}>{r.total_trades}</td>
                    <td style={{ padding: '8px' }}>{r.sharpe_ratio}</td>
                    <td style={{ padding: '8px' }}>{r.profit_factor}</td>
                    <td style={{ padding: '8px', color: '#ef4444' }}>{r.max_drawdown_pct}%</td>
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
