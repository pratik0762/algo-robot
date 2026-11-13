'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Play,
  RotateCcw,
  Download,
  TrendingUp,
  TrendingDown,
  Activity,
  ShieldAlert,
  Percent,
  Layers,
  Clock,
  DollarSign,
  Calendar,
  Sparkles,
  BarChart2,
  CheckCircle2,
  AlertTriangle,
  History,
  FileText,
  Trash2
} from 'lucide-react';
import { getApiBase } from '@/config/api';

interface BacktestModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialStrategyId?: string;
}

export default function BacktestModal({ isOpen, onClose, initialStrategyId }: BacktestModalProps) {
  const [strategies, setStrategies] = useState<any[]>([]);
  const [availableSymbols, setAvailableSymbols] = useState<any[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<string>(initialStrategyId || 'ema_cross');
  const [selectedInstrument, setSelectedInstrument] = useState<string>('EQUITY');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('15m');
  const [symbolPreset, setSymbolPreset] = useState<string>('TOP_4');
  const [customSymbols, setCustomSymbols] = useState<string[]>(['RELIANCE', 'TCS', 'HDFCBANK', 'INFY']);
  const [initialCapital, setInitialCapital] = useState<number>(500000);
  const [riskPerTrade, setRiskPerTrade] = useState<number>(1.5);
  const [slippagePct, setSlippagePct] = useState<number>(0.05);

  const [modalTab, setModalTab] = useState<'CONFIG' | 'HISTORY'>('CONFIG');
  const [savedRuns, setSavedRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any | null>(null);

  // Sync initialStrategyId when modal opens
  useEffect(() => {
    if (initialStrategyId) {
      setSelectedStrategy(initialStrategyId);
    }
  }, [initialStrategyId]);

  // Load backtest configuration & history
  const fetchBacktestHistory = useCallback(async () => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/backtest/history`);
      if (res.ok) {
        const data = await res.json();
        setSavedRuns(data.history || []);
      }
    } catch (err) {
      console.error('Failed to fetch backtest history:', err);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const apiBase = getApiBase();
    fetch(`${apiBase}/api/backtest/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.status === 'success') {
          setStrategies(data.strategies || []);
          setAvailableSymbols(data.symbols || []);
        }
      })
      .catch((err) => console.error('Failed to load backtest config:', err));

    fetchBacktestHistory();
  }, [isOpen, fetchBacktestHistory]);

  // Update symbol list based on preset
  useEffect(() => {
    if (symbolPreset === 'TOP_4') {
      setCustomSymbols(['RELIANCE', 'TCS', 'HDFCBANK', 'INFY']);
    } else if (symbolPreset === 'LARGE_CAP') {
      setCustomSymbols(['RELIANCE', 'TCS', 'HDFCBANK', 'BHARTIARTL', 'ICICIBANK', 'INFY', 'SBIN', 'ITC', 'LT', 'MARUTI', 'TITAN', 'SUNPHARMA']);
    } else if (symbolPreset === 'MID_CAP') {
      setCustomSymbols(['TRENT', 'POLYCAB', 'PERSISTENT', 'COFORGE', 'DIXON', 'AUROPHARMA', 'BHEL', 'ESCORTS']);
    } else if (symbolPreset === 'INDICES') {
      setCustomSymbols(['NIFTY', 'BANKNIFTY']);
    }
  }, [symbolPreset]);

  // Run Backtest simulation
  const handleRunBacktest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const apiBase = getApiBase();
      const payload = {
        strategy_id: selectedStrategy,
        symbols: customSymbols.length > 0 ? customSymbols : ['RELIANCE', 'TCS'],
        timeframe: selectedTimeframe,
        instrument_type: selectedInstrument,
        initial_capital: Number(initialCapital),
        risk_per_trade_pct: Number(riskPerTrade),
        slippage_pct: Number(slippagePct) / 100.0
      };

      const res = await fetch(`${apiBase}/api/backtest/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || 'Backtest execution failed');
      }

      const data = await res.json();
      setResults(data);
      fetchBacktestHistory();
    } catch (err: any) {
      console.error('Error running backtest:', err);
      setError(err.message || 'Failed to complete backtest');
    } finally {
      setLoading(false);
    }
  }, [selectedStrategy, customSymbols, selectedTimeframe, selectedInstrument, initialCapital, riskPerTrade, slippagePct, fetchBacktestHistory]);

  // Load a saved past backtest run
  const handleLoadSavedRun = useCallback(async (backtestId: string) => {
    setLoading(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/backtest/history/${backtestId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.backtest) {
          setResults(data.backtest);
          setModalTab('CONFIG');
        }
      }
    } catch (err) {
      console.error('Failed loading saved backtest:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete a saved backtest run
  const handleDeleteSavedRun = useCallback(async (backtestId: string) => {
    if (!window.confirm('Delete this historical backtest run record?')) return;
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/backtest/history/${backtestId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchBacktestHistory();
        if (results && results.backtest_id === backtestId) {
          setResults(null);
        }
      }
    } catch (err) {
      console.error('Failed deleting backtest run:', err);
    }
  }, [fetchBacktestHistory, results]);

  // Export trade log to CSV
  const handleExportCSV = useCallback(() => {
    if (!results || !results.trades || results.trades.length === 0) return;
    const headers = [
      'Trade ID',
      'Symbol',
      'Instrument',
      'Contract',
      'Side',
      'Entry Time',
      'Entry Price',
      'Exit Time',
      'Exit Price',
      'Outcome',
      'Quantity',
      'Gross PnL (INR)',
      'Total Charges (INR)',
      'Net PnL (INR)',
      'Return (%)',
      'MFE (%)',
      'MAE (%)'
    ];
    const rows = results.trades.map((t: any) => [
      t.trade_id,
      t.symbol,
      t.instrument_type,
      t.contract_symbol,
      t.side,
      `"${t.entry_time}"`,
      t.entry_price,
      `"${t.exit_time}"`,
      t.exit_price,
      t.outcome,
      t.quantity,
      t.gross_pnl,
      t.total_charges,
      t.net_pnl,
      t.return_pct,
      t.mfe_pct,
      t.mae_pct
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `backtest_${results.strategy_id || selectedStrategy}_${results.instrument_type || selectedInstrument}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [results, selectedStrategy, selectedInstrument]);

  // Export full backtest data to JSON
  const handleExportJSON = useCallback(() => {
    if (!results) return;
    const jsonStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(results, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', jsonStr);
    link.setAttribute('download', `backtest_${results.strategy_id || selectedStrategy}_${results.instrument_type || selectedInstrument}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [results, selectedStrategy, selectedInstrument]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1280px',
          maxHeight: '94vh',
          background: 'linear-gradient(180deg, #0e1526 0%, #0a0d16 100%)',
          border: '1px solid rgba(99, 102, 241, 0.4)',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 35px rgba(99, 102, 241, 0.25)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.15) 0%, rgba(15, 23, 42, 0.6) 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 0 16px rgba(99, 102, 241, 0.4)'
              }}
            >
              <BarChart2 size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0, color: '#ffffff', letterSpacing: '-0.01em' }}>
                  QUANT STRATEGY BACKTESTING SYSTEM
                </h2>
                <span style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#34d399', fontSize: '0.62rem', fontWeight: 800, padding: '2px 7px', borderRadius: '4px' }}>
                  ZERO LOOKAHEAD BIAS
                </span>
                <span style={{ background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.35)', color: '#38bdf8', fontSize: '0.62rem', fontWeight: 800, padding: '2px 7px', borderRadius: '4px' }}>
                  NSE STATUTORY TAXES ACTIVE
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Historical candle simulation with authentic brokerages, slippage, lot multipliers, and Black-Scholes Greeks.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Tab Switcher: Config vs History */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 255, 255, 0.05)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <button
                onClick={() => setModalTab('CONFIG')}
                style={{
                  background: modalTab === 'CONFIG' ? '#4f46e5' : 'transparent',
                  color: modalTab === 'CONFIG' ? '#ffffff' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Simulation Desk
              </button>
              <button
                onClick={() => setModalTab('HISTORY')}
                style={{
                  background: modalTab === 'HISTORY' ? '#4f46e5' : 'transparent',
                  color: modalTab === 'HISTORY' ? '#ffffff' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <History size={13} />
                <span>Saved History ({savedRuns.length})</span>
              </button>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '6px',
                color: '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab 1: Configuration Bar (Active when modalTab === 'CONFIG') */}
        {modalTab === 'CONFIG' && (
          <div
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              background: 'rgba(15, 23, 42, 0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {/* Strategy Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>
                  STRATEGY
                </label>
                <select
                  value={selectedStrategy}
                  onChange={(e) => setSelectedStrategy(e.target.value)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    padding: '6px 10px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    outline: 'none'
                  }}
                >
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id} style={{ background: '#0f172a', color: '#ffffff' }}>
                      {s.name} {s.is_custom ? '(Custom)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Asset Class Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>
                  ASSET CLASS
                </label>
                <select
                  value={selectedInstrument}
                  onChange={(e) => setSelectedInstrument(e.target.value)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: selectedInstrument === 'EQUITY' ? '#38bdf8' : selectedInstrument === 'FUTURES' ? '#fbbf24' : '#c4b5fd',
                    padding: '6px 10px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    outline: 'none'
                  }}
                >
                  <option value="EQUITY" style={{ background: '#0f172a', color: '#38bdf8' }}>Cash Equities (NSE)</option>
                  <option value="FUTURES" style={{ background: '#0f172a', color: '#fbbf24' }}>Index &amp; Stock Futures (FUT)</option>
                  <option value="OPTIONS" style={{ background: '#0f172a', color: '#c4b5fd' }}>Index &amp; Stock Options (CE/PE)</option>
                </select>
              </div>

              {/* Timeframe Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>
                  TIMEFRAME
                </label>
                <select
                  value={selectedTimeframe}
                  onChange={(e) => setSelectedTimeframe(e.target.value)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    padding: '6px 10px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    outline: 'none'
                  }}
                >
                  <option value="5m" style={{ background: '#0f172a' }}>5 Minutes (5m)</option>
                  <option value="15m" style={{ background: '#0f172a' }}>15 Minutes (15m)</option>
                  <option value="1H" style={{ background: '#0f172a' }}>1 Hour (1H)</option>
                  <option value="1D" style={{ background: '#0f172a' }}>Daily (1D)</option>
                </select>
              </div>

              {/* Symbol Preset Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>
                  UNIVERSE ({customSymbols.length} Stocks)
                </label>
                <select
                  value={symbolPreset}
                  onChange={(e) => setSymbolPreset(e.target.value)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    padding: '6px 10px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    outline: 'none'
                  }}
                >
                  <option value="TOP_4" style={{ background: '#0f172a' }}>Top 4 Bellwethers (RELIANCE, TCS, HDFC, INFY)</option>
                  <option value="LARGE_CAP" style={{ background: '#0f172a' }}>All 12 Large-Cap Equities</option>
                  <option value="MID_CAP" style={{ background: '#0f172a' }}>High-Momentum Mid-Caps (8 Stocks)</option>
                  <option value="INDICES" style={{ background: '#0f172a' }}>Benchmark Indices (NIFTY &amp; BANKNIFTY)</option>
                </select>
              </div>

              {/* Capital & Risk Settings */}
              <div>
                <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>
                  CAPITAL (₹)
                </label>
                <input
                  type="number"
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(Number(e.target.value))}
                  style={{
                    width: '95px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#34d399',
                    padding: '5px 8px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>
                  RISK / TRADE %
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={riskPerTrade}
                  onChange={(e) => setRiskPerTrade(Number(e.target.value))}
                  style={{
                    width: '65px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#fbbf24',
                    padding: '5px 8px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={handleRunBacktest}
                disabled={loading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 20px',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  background: loading ? '#475569' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  border: '1px solid #34d399',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 0 16px rgba(16, 185, 129, 0.4)',
                  transition: 'all 0.15s ease'
                }}
              >
                {loading ? (
                  <>
                    <RotateCcw size={15} className="pulse-indicator" />
                    <span>Simulating...</span>
                  </>
                ) : (
                  <>
                    <Play size={15} fill="#ffffff" />
                    <span>Run Backtest</span>
                  </>
                )}
              </button>

              {results && results.trades && results.trades.length > 0 && (
                <>
                  <button
                    onClick={handleExportCSV}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      fontSize: '0.80rem',
                      fontWeight: 700,
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: '#94a3b8',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      cursor: 'pointer'
                    }}
                    title="Export complete trade audit log to CSV"
                  >
                    <Download size={13} />
                    <span>CSV</span>
                  </button>

                  <button
                    onClick={handleExportJSON}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      fontSize: '0.80rem',
                      fontWeight: 700,
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: '#94a3b8',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      cursor: 'pointer'
                    }}
                    title="Export full backtest run data to JSON"
                  >
                    <FileText size={13} />
                    <span>JSON</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Scrollable Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '10px',
                padding: '12px 16px',
                color: '#f87171',
                fontSize: '0.82rem',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Tab 2: Saved History Table */}
          {modalTab === 'HISTORY' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#ffffff', fontWeight: 800 }}>
                  Historical Backtest Runs ({savedRuns.length} Runs Persisted)
                </h3>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Click any run to view complete analytics, equity curve &amp; trade logs
                </span>
              </div>

              {savedRuns.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  No saved backtest runs found. Execute a simulation from the Simulation Desk to automatically record it.
                </div>
              ) : (
                <div style={{ overflowX: 'auto', background: 'rgba(15, 23, 42, 0.7)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                    <thead>
                      <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 14px' }}>Execution Time</th>
                        <th style={{ padding: '10px 14px' }}>Strategy</th>
                        <th style={{ padding: '10px 14px' }}>Asset Class</th>
                        <th style={{ padding: '10px 14px' }}>Timeframe</th>
                        <th style={{ padding: '10px 14px' }}>Trades</th>
                        <th style={{ padding: '10px 14px' }}>Win Rate</th>
                        <th style={{ padding: '10px 14px' }}>Net P&amp;L</th>
                        <th style={{ padding: '10px 14px' }}>Max DD</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savedRuns.map((r: any) => {
                        const isWin = (r.net_profit || 0) >= 0;
                        return (
                          <tr key={r.backtest_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{r.created_at}</td>
                            <td style={{ padding: '10px 14px', fontWeight: 800, color: '#ffffff' }}>{r.strategy_name}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{
                                background: r.instrument_type === 'EQUITY' ? 'rgba(56, 189, 248, 0.15)' : r.instrument_type === 'FUTURES' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(124, 58, 237, 0.15)',
                                color: r.instrument_type === 'EQUITY' ? '#38bdf8' : r.instrument_type === 'FUTURES' ? '#fbbf24' : '#c4b5fd',
                                padding: '2px 7px',
                                borderRadius: '4px',
                                fontSize: '0.64rem',
                                fontWeight: 800
                              }}>
                                {r.instrument_type}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', color: '#a5b4fc', fontWeight: 700 }}>{r.timeframe}</td>
                            <td style={{ padding: '10px 14px' }}>{r.total_trades}</td>
                            <td style={{ padding: '10px 14px', fontWeight: 800, color: '#34d399' }}>{r.win_rate_pct}%</td>
                            <td style={{ padding: '10px 14px', fontWeight: 900, color: isWin ? '#34d399' : '#f87171' }}>
                              {isWin ? '+' : ''}₹{r.net_profit?.toLocaleString()} ({r.net_return_pct}%)
                            </td>
                            <td style={{ padding: '10px 14px', color: '#f87171' }}>-{r.max_drawdown_pct}%</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <button
                                  onClick={() => handleLoadSavedRun(r.backtest_id)}
                                  style={{
                                    background: 'rgba(99, 102, 241, 0.2)',
                                    border: '1px solid rgba(99, 102, 241, 0.4)',
                                    color: '#a5b4fc',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  View Results
                                </button>
                                <button
                                  onClick={() => handleDeleteSavedRun(r.backtest_id)}
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    color: '#f87171',
                                    borderRadius: '6px',
                                    padding: '4px 6px',
                                    cursor: 'pointer'
                                  }}
                                  title="Delete backtest run"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 1: Content Body */}
          {modalTab === 'CONFIG' && (
            <>
              {!results && !loading && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                  <BarChart2 size={42} color="#6366f1" style={{ margin: '0 auto 16px auto', opacity: 0.8 }} />
                  <h3 style={{ fontSize: '1.05rem', color: '#ffffff', margin: '0 0 8px 0' }}>
                    Ready to Backtest Quantitative Strategy
                  </h3>
                  <p style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto', lineHeight: 1.5 }}>
                    Select your desired Strategy, Asset Class (Equities, Futures, or Options), and Universe, then click <strong>Run Backtest</strong> to simulate chronological execution with zero lookahead bias.
                  </p>
                </div>
              )}

              {loading && (
                <div style={{ textAlign: 'center', padding: '80px 20px', color: '#818cf8' }}>
                  <RotateCcw size={36} className="pulse-indicator" color="#6366f1" style={{ margin: '0 auto 16px auto' }} />
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#ffffff' }}>
                    Simulating Historical Candle Walkforward...
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Evaluating entry conditions, checking stop-loss and target triggers, and calculating Indian statutory charges.
                  </div>
                </div>
              )}

              {results && !loading && (
                <div>
                  {/* Results Header Strip */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#ffffff' }}>
                        Simulation Report: {results.strategy_name} ({results.instrument_type})
                      </span>
                      {results.backtest_id && (
                        <span style={{ fontSize: '0.64rem', color: '#818cf8', background: 'rgba(99, 102, 241, 0.15)', padding: '2px 6px', borderRadius: '4px' }}>
                          ID: {results.backtest_id}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Timeframe: <strong style={{ color: '#ffffff' }}>{results.timeframe}</strong> &bull; Initial Capital: <strong style={{ color: '#ffffff' }}>₹{results.initial_capital?.toLocaleString()}</strong>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '12px',
                      marginBottom: '20px'
                    }}
                  >
                    {/* Net Profit & Return */}
                    <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                        NET P&amp;L (AFTER TAXES)
                      </div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: (results.metrics?.net_profit || 0) >= 0 ? '#34d399' : '#f87171', marginTop: '4px' }}>
                        {(results.metrics?.net_profit || 0) >= 0 ? '+' : ''}₹{results.metrics?.net_profit?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: (results.metrics?.net_profit || 0) >= 0 ? '#34d399' : '#f87171', fontWeight: 800, marginTop: '2px' }}>
                        {(results.metrics?.net_return_pct || 0) >= 0 ? '+' : ''}{results.metrics?.net_return_pct}% on capital
                      </div>
                    </div>

                    {/* Win Rate */}
                    <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                        WIN RATE
                      </div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#a5b4fc', marginTop: '4px' }}>
                        {results.metrics?.win_rate_pct}%
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {results.metrics?.winning_trades} Wins / {results.metrics?.losing_trades} Losses ({results.metrics?.total_trades} Trades)
                      </div>
                    </div>

                    {/* Profit Factor */}
                    <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                        PROFIT FACTOR
                      </div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#fbbf24', marginTop: '4px' }}>
                        {results.metrics?.profit_factor}x
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Gross Win: ₹{results.metrics?.gross_profit?.toLocaleString()} | Loss: ₹{results.metrics?.gross_loss?.toLocaleString()}
                      </div>
                    </div>

                    {/* Max Drawdown */}
                    <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                        MAX DRAWDOWN
                      </div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#f87171', marginTop: '4px' }}>
                        -{results.metrics?.max_drawdown_pct}%
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Peak Drop: -₹{results.metrics?.max_drawdown_amount?.toLocaleString()}
                      </div>
                    </div>

                    {/* Sharpe & Sortino */}
                    <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                        SHARPE / SORTINO
                      </div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#38bdf8', marginTop: '4px' }}>
                        {results.metrics?.sharpe_ratio} / {results.metrics?.sortino_ratio}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Risk-Adjusted Ratios (RBI Rf: 6.5%)
                      </div>
                    </div>

                    {/* Total Charges & Taxes */}
                    <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(148, 163, 184, 0.3)', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                        TOTAL TAXES &amp; BROKERAGE
                      </div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#cbd5e1', marginTop: '4px' }}>
                        ₹{results.metrics?.total_charges?.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        STT, NSE turnover, GST 18%, SEBI
                      </div>
                    </div>
                  </div>

                  {/* Equity Curve Line Chart (SVG) */}
                  {results.equity_curve && results.equity_curve.length > 1 && (
                    <div
                      style={{
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '12px',
                        padding: '18px 20px',
                        marginBottom: '20px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ fontSize: '0.80rem', fontWeight: 800, color: '#ffffff', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                          PORTFOLIO EQUITY CURVE &amp; DRAWDOWN TRAJECTORY
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 800 }}>
                          Final Capital: ₹{results.final_capital?.toLocaleString()}
                        </div>
                      </div>

                      <svg
                        viewBox="0 0 800 160"
                        style={{ width: '100%', height: '160px', overflow: 'visible' }}
                      >
                        <defs>
                          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        {(() => {
                          const pts = results.equity_curve;
                          const equities = pts.map((p: any) => p.equity);
                          const minEq = Math.min(...equities) * 0.995;
                          const maxEq = Math.max(...equities) * 1.005;
                          const range = maxEq - minEq || 1;

                          const coords = pts.map((p: any, idx: number) => {
                            const x = (idx / (pts.length - 1)) * 790 + 5;
                            const y = 150 - ((p.equity - minEq) / range) * 130;
                            return { x, y };
                          });

                          const lineStr = coords.map((c: any) => `${c.x},${c.y}`).join(' ');
                          const areaStr = `${coords[0].x},150 ` + lineStr + ` ${coords[coords.length - 1].x},150`;

                          return (
                            <>
                              <polygon points={areaStr} fill="url(#eqGrad)" />
                              <polyline points={lineStr} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
                              {coords.map((c: any, i: number) => (
                                <circle key={i} cx={c.x} cy={c.y} r="3" fill="#34d399" />
                              ))}
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                  )}

                  {/* Monthly Breakdown Table */}
                  {results.monthly_breakdown && results.monthly_breakdown.length > 0 && (
                    <div
                      style={{
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '12px',
                        padding: '16px 20px',
                        marginBottom: '20px'
                      }}
                    >
                      <div style={{ fontSize: '0.80rem', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', marginBottom: '12px' }}>
                        Monthly Performance Breakdown
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                          <thead>
                            <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'left' }}>
                              <th style={{ padding: '8px' }}>Month</th>
                              <th style={{ padding: '8px' }}>Trades</th>
                              <th style={{ padding: '8px' }}>Wins / Losses</th>
                              <th style={{ padding: '8px' }}>Win Rate</th>
                              <th style={{ padding: '8px' }}>Total Charges</th>
                              <th style={{ padding: '8px', textAlign: 'right' }}>Net P&amp;L</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.monthly_breakdown.map((m: any, idx: number) => (
                              <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                <td style={{ padding: '8px', fontWeight: 700, color: '#ffffff' }}>{m.month}</td>
                                <td style={{ padding: '8px' }}>{m.trades_count}</td>
                                <td style={{ padding: '8px' }}>{m.wins}W / {m.losses}L</td>
                                <td style={{ padding: '8px', color: '#a5b4fc', fontWeight: 800 }}>{m.win_rate_pct}%</td>
                                <td style={{ padding: '8px', color: '#94a3b8' }}>₹{m.charges?.toLocaleString()}</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 900, color: m.net_pnl >= 0 ? '#34d399' : '#f87171' }}>
                                  {m.net_pnl >= 0 ? '+' : ''}₹{m.net_pnl?.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Complete Trade-by-Trade Log */}
                  {results.trades && results.trades.length > 0 && (
                    <div
                      style={{
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '12px',
                        padding: '16px 20px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <div style={{ fontSize: '0.80rem', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase' }}>
                          Chronological Trade Execution Audit Log ({results.trades.length} Trades)
                        </div>
                        <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>
                          MFE: Max Favorable Excursion &bull; MAE: Max Adverse Excursion
                        </div>
                      </div>

                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                          <thead>
                            <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', textAlign: 'left' }}>
                              <th style={{ padding: '6px' }}>Trade</th>
                              <th style={{ padding: '6px' }}>Symbol / Contract</th>
                              <th style={{ padding: '6px' }}>Side</th>
                              <th style={{ padding: '6px' }}>Entry Time &amp; Price</th>
                              <th style={{ padding: '6px' }}>Exit Time &amp; Price</th>
                              <th style={{ padding: '6px' }}>Qty</th>
                              <th style={{ padding: '6px' }}>Outcome</th>
                              <th style={{ padding: '6px' }}>MFE / MAE</th>
                              <th style={{ padding: '6px' }}>Taxes</th>
                              <th style={{ padding: '6px', textAlign: 'right' }}>Net P&amp;L</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.trades.map((t: any) => {
                              const isWin = t.net_pnl > 0;
                              return (
                                <tr key={t.trade_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                                  <td style={{ padding: '6px', color: '#818cf8', fontWeight: 700 }}>{t.trade_id}</td>
                                  <td style={{ padding: '6px', fontWeight: 800, color: '#ffffff' }}>
                                    {t.contract_symbol || t.symbol}
                                  </td>
                                  <td style={{ padding: '6px' }}>
                                    <span
                                      style={{
                                        background: t.side === 'BUY' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                        color: t.side === 'BUY' ? '#34d399' : '#f87171',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontWeight: 800,
                                        fontSize: '0.64rem'
                                      }}
                                    >
                                      {t.side}
                                    </span>
                                  </td>
                                  <td style={{ padding: '6px' }}>
                                    <div>₹{t.entry_price}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{t.entry_time}</div>
                                  </td>
                                  <td style={{ padding: '6px' }}>
                                    <div>₹{t.exit_price}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{t.exit_time}</div>
                                  </td>
                                  <td style={{ padding: '6px', color: '#fbbf24' }}>{t.quantity}</td>
                                  <td style={{ padding: '6px' }}>
                                    <span
                                      style={{
                                        background: isWin ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                        color: isWin ? '#34d399' : '#f87171',
                                        border: isWin ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '0.62rem',
                                        fontWeight: 800
                                      }}
                                    >
                                      {t.outcome}
                                    </span>
                                  </td>
                                  <td style={{ padding: '6px' }}>
                                    <span style={{ color: '#34d399' }}>+{t.mfe_pct}%</span> / <span style={{ color: '#f87171' }}>{t.mae_pct}%</span>
                                  </td>
                                  <td style={{ padding: '6px', color: '#94a3b8' }}>₹{t.total_charges}</td>
                                  <td style={{ padding: '6px', textAlign: 'right', fontWeight: 900, color: isWin ? '#34d399' : '#f87171' }}>
                                    {isWin ? '+' : ''}₹{t.net_pnl?.toLocaleString()} ({t.return_pct}%)
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
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
