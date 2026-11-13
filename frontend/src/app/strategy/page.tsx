'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  SlidersHorizontal,
  PlusCircle,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  Copy,
  Edit3,
  Trash2,
  TrendingUp,
  Cpu,
  Layers,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Activity,
  BarChart2,
  Download,
  History,
  FileText,
  Clock,
  Sparkles,
  ArrowRight,
  Bell
} from 'lucide-react';
import { getApiBase } from '@/config/api';
import IndicesBarometer from '@/components/IndicesBarometer';
import StrategyLogicCard, { StrategyLogicDetail } from '@/components/StrategyLogicCard';
import StrategyBuilderModal from '@/components/StrategyBuilderModal';
import BacktestModal from '@/components/BacktestModal';
import MultiLegOptionsDesk from '@/components/MultiLegOptionsDesk';
import StrategyOptimizerDesk from '@/components/StrategyOptimizerDesk';
import PaperTradingDesk from '@/components/PaperTradingDesk';
import LiveBrokerDesk from '@/components/LiveBrokerDesk';
import AlertsNotificationDesk from '@/components/AlertsNotificationDesk';

const NavigationDrawer = dynamic(() => import('@/components/NavigationDrawer'), {
  ssr: false,
  loading: () => null
});

interface StrategyStats {
  total_strategies: number;
  active_strategies: number;
  custom_strategies: number;
  builtin_strategies: number;
  backtested_runs: number;
  supported_asset_classes: string[];
}

export default function StrategyPage() {
  const router = useRouter();
  const [navDrawerOpen, setNavDrawerOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'REPOSITORY' | 'BUILDER' | 'BACKTEST' | 'MULTILEG' | 'OPTIMIZER' | 'PAPERTRADING' | 'BROKER' | 'NOTIFICATIONS'>('REPOSITORY');

  // Stats & Strategies State
  const [stats, setStats] = useState<StrategyStats>({
    total_strategies: 8,
    active_strategies: 8,
    custom_strategies: 1,
    builtin_strategies: 7,
    backtested_runs: 0,
    supported_asset_classes: ['Cash Equities (NSE)', 'Index Futures', 'Stock Futures', 'Index Options (CE/PE)', 'Stock Options']
  });
  const [strategies, setStrategies] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Active Strategy Logic detail
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('ema_cross');
  const [activeStrategyLogic, setActiveStrategyLogic] = useState<StrategyLogicDetail | null>(null);
  const [logicExpanded, setLogicExpanded] = useState<boolean>(true);

  // Modal triggers
  const [builderModalOpen, setBuilderModalOpen] = useState<boolean>(false);
  const [editingStrategy, setEditingStrategy] = useState<any | null>(null);
  const [backtestModalOpen, setBacktestModalOpen] = useState<boolean>(false);
  const [backtestStrategyId, setBacktestStrategyId] = useState<string>('ema_cross');

  // Inline Builder State
  const [bName, setBName] = useState<string>('');
  const [bCategory, setBCategory] = useState<string>('Momentum');
  const [bDescription, setBDescription] = useState<string>('');
  const [bObjective, setBObjective] = useState<string>('');
  const [bTimeframe, setBTimeframe] = useState<string>('15m');
  const [bInstruments, setBInstruments] = useState<string[]>(['Equity Stocks', 'Index Futures']);
  const [bIndicators, setBIndicators] = useState<string[]>(['EMA 9', 'EMA 21', 'RSI 14']);
  const [bBuyCond, setBBuyCond] = useState<string>('EMA 9 crosses above EMA 21\nPrice closes above VWAP\nRSI(14) > 52');
  const [bSellCond, setBSellCond] = useState<string>('EMA 9 crosses below EMA 21\nPrice closes below VWAP\nRSI(14) < 48');
  const [bSlType, setBSlType] = useState<string>('ATR Multiplier (1.5x)');
  const [bTargetRatio, setBTargetRatio] = useState<number>(2.0);
  const [bMaxRiskPct, setBMaxRiskPct] = useState<number>(1.5);
  const [bHtfConfirm, setBHtfConfirm] = useState<boolean>(true);
  const [bVolumeFilter, setBVolumeFilter] = useState<boolean>(true);
  const [builderSaving, setBuilderSaving] = useState<boolean>(false);
  const [builderSuccess, setBuilderSuccess] = useState<string | null>(null);

  // Inline Backtester State
  const [btStratId, setBtStratId] = useState<string>('ema_cross');
  const [btInstrument, setBtInstrument] = useState<string>('EQUITY');
  const [btTimeframe, setBtTimeframe] = useState<string>('15m');
  const [btCapital, setBtCapital] = useState<number>(500000);
  const [btRiskPct, setBtRiskPct] = useState<number>(1.5);
  const [btSlippage, setBtSlippage] = useState<number>(0.05);
  const [btCustomSymbols, setBtCustomSymbols] = useState<string>('RELIANCE, TCS, HDFCBANK, INFY, ICICIBANK');
  const [btRunning, setBtRunning] = useState<boolean>(false);
  const [btResults, setBtResults] = useState<any | null>(null);
  const [btError, setBtError] = useState<string | null>(null);

  // Fetch all strategies & stats
  const fetchData = useCallback(async () => {
    try {
      const apiBase = getApiBase();
      const [sRes, stRes] = await Promise.all([
        fetch(`${apiBase}/api/trade-signals/strategies`),
        fetch(`${apiBase}/api/strategies/stats`).catch(() => null)
      ]);

      if (sRes.ok) {
        const sData = await sRes.json();
        const strats = (sData.strategies || []).filter((s: any) => s.id !== 'all');
        setStrategies(strats);
        if (strats.length > 0 && !selectedStrategyId) {
          setSelectedStrategyId(strats[0].id);
        }
      }

      if (stRes && stRes.ok) {
        const stData = await stRes.json();
        setStats(stData);
      }
    } catch (err) {
      console.error('Error fetching strategy data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStrategyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load active strategy logic
  const fetchStrategyLogic = useCallback(async (stratId: string) => {
    if (!stratId || stratId === 'all') return;
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/trade-signals/strategies/${stratId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveStrategyLogic(data.strategy);
      }
    } catch (err) {
      console.error('Error fetching strategy logic:', err);
    }
  }, []);

  useEffect(() => {
    fetchStrategyLogic(selectedStrategyId);
  }, [selectedStrategyId, fetchStrategyLogic]);

  // Filter strategies
  const filteredStrategies = useMemo(() => {
    return strategies.filter((s) => {
      if (selectedCategory !== 'ALL' && s.category?.toUpperCase() !== selectedCategory.toUpperCase()) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const match =
          s.name?.toLowerCase().includes(term) ||
          s.id?.toLowerCase().includes(term) ||
          s.category?.toLowerCase().includes(term) ||
          s.description?.toLowerCase().includes(term) ||
          (s.supported_instruments && s.supported_instruments.some((i: string) => i.toLowerCase().includes(term)));
        if (!match) return false;
      }
      return true;
    });
  }, [strategies, selectedCategory, searchTerm]);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    strategies.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set);
  }, [strategies]);

  // Strategy Action: Toggle Status
  const handleToggleStatus = async (stratId: string, currentEnabled: boolean) => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/strategies/custom/${stratId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !currentEnabled })
      });
      if (res.ok) {
        fetchData();
        fetchStrategyLogic(stratId);
      } else {
        const err = await res.json();
        alert(err.detail || 'Failed to toggle strategy status');
      }
    } catch (e: any) {
      alert(`Error updating strategy: ${e.message}`);
    }
  };

  // Strategy Action: Duplicate
  const handleDuplicate = async (stratId: string) => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/strategies/custom/${stratId}/duplicate`, {
        method: 'POST'
      });
      if (res.ok) {
        fetchData();
        alert(`Strategy duplicated successfully.`);
      }
    } catch (e: any) {
      alert(`Error duplicating: ${e.message}`);
    }
  };

  // Strategy Action: Delete
  const handleDelete = async (stratId: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete this custom strategy?`)) {
      return;
    }
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/strategies/custom/${stratId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchData();
        if (selectedStrategyId === stratId && strategies.length > 0) {
          setSelectedStrategyId(strategies[0].id);
        }
      }
    } catch (e: any) {
      alert(`Error deleting strategy: ${e.message}`);
    }
  };

  // Launch Backtest for Strategy
  const handleLaunchBacktest = (stratId: string) => {
    setBtStratId(stratId);
    setBacktestStrategyId(stratId);
    setActiveTab('BACKTEST');
    window.scrollTo({ top: 350, behavior: 'smooth' });
  };

  // Inline Builder Submit
  const handleInlineBuilderSubmit = async (activateImmediately: boolean) => {
    if (!bName.trim()) {
      alert('Strategy Name is required.');
      return;
    }
    setBuilderSaving(true);
    setBuilderSuccess(null);
    try {
      const apiBase = getApiBase();
      const payload = {
        name: bName.trim(),
        description: bDescription.trim() || 'Custom quantitative strategy configured in Strategy Hub.',
        trading_objective: bObjective.trim() || 'Statistical alpha extraction via multi-indicator conditions.',
        category: bCategory,
        is_enabled: activateImmediately,
        supported_instruments: bInstruments,
        supported_timeframes: [bTimeframe],
        indicators: bIndicators.map((ind) => ({
          name: ind,
          symbol: ind.split(' ')[0],
          parameters: { period: parseInt(ind.split(' ')[1] || '14', 10) || 14 },
          purpose: 'Technical indicator filter'
        })),
        buy_conditions: bBuyCond.split('\n').filter((l) => l.trim().length > 0),
        sell_conditions: bSellCond.split('\n').filter((l) => l.trim().length > 0),
        risk_management: {
          entry_type: 'Market on Candle Close',
          stop_loss_type: bSlType,
          stop_loss_multiplier: 1.5,
          target_1_ratio: bTargetRatio * 0.75,
          target_2_ratio: bTargetRatio,
          target_3_ratio: bTargetRatio * 1.5,
          risk_reward_ratio: `1 : ${bTargetRatio.toFixed(1)}`,
          max_risk_per_trade_pct: bMaxRiskPct,
          signal_validity_bars: 3
        },
        advanced_settings: {
          higher_timeframe_confirmation: bHtfConfirm,
          volume_filter: bVolumeFilter,
          volume_filter_multiplier: 1.5,
          candle_close_confirmation: true,
          trading_session_start: '09:30',
          trading_session_end: '15:15',
          cooldown_bars: 3,
          duplicate_signal_prevention: true
        }
      };

      const res = await fetch(`${apiBase}/api/strategies/custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setBuilderSuccess(`Strategy '${data.strategy?.name}' created successfully (v${data.strategy?.version})!`);
        fetchData();
        setBName('');
        setBDescription('');
        setBObjective('');
        setTimeout(() => setActiveTab('REPOSITORY'), 1500);
      } else {
        const err = await res.json();
        alert(err.detail || 'Failed to save strategy.');
      }
    } catch (e: any) {
      alert(`Error saving strategy: ${e.message}`);
    } finally {
      setBuilderSaving(false);
    }
  };

  // Inline Backtester Execute
  const handleExecuteBacktest = async () => {
    setBtRunning(true);
    setBtError(null);
    setBtResults(null);
    try {
      const apiBase = getApiBase();
      const symbolList = btCustomSymbols
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);

      const payload = {
        strategy_id: btStratId,
        symbols: symbolList.length > 0 ? symbolList : ['RELIANCE', 'TCS', 'HDFCBANK'],
        timeframe: btTimeframe,
        instrument_type: btInstrument,
        initial_capital: btCapital,
        risk_per_trade_pct: btRiskPct,
        slippage_pct: btSlippage / 100.0
      };

      const res = await fetch(`${apiBase}/api/backtest/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setBtResults(data);
        fetchData();
      } else {
        const err = await res.json();
        setBtError(err.detail || 'Backtest execution failed.');
      }
    } catch (e: any) {
      setBtError(`Error: ${e.message}`);
    } finally {
      setBtRunning(false);
    }
  };

  // Export Backtest CSV
  const handleExportCSV = () => {
    if (!btResults || !btResults.trades) return;
    const headers = [
      'Trade ID',
      'Symbol',
      'Contract',
      'Side',
      'Entry Time',
      'Entry Price',
      'Exit Time',
      'Exit Price',
      'Quantity',
      'Outcome',
      'MFE (%)',
      'MAE (%)',
      'Taxes & Charges (INR)',
      'Gross PnL (INR)',
      'Net PnL (INR)',
      'Return (%)'
    ];
    const rows = btResults.trades.map((t: any) => [
      t.trade_id,
      t.symbol,
      t.contract_symbol || t.symbol,
      t.side,
      t.entry_time,
      t.entry_price,
      t.exit_time,
      t.exit_price,
      t.quantity,
      t.outcome,
      t.mfe_pct,
      t.mae_pct,
      t.total_charges,
      t.gross_pnl,
      t.net_pnl,
      t.return_pct
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e: any[]) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `backtest_${btResults.strategy_id || btStratId}_${btInstrument}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Top Indices Barometer */}
      <IndicesBarometer />

      {/* Main Container */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px 80px 20px' }}>
        {/* Header Strip with Drawer & Quick Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '24px',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.7))',
            padding: '24px 28px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.36)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <Link
              href="/"
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                padding: '8px 12px',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: 'var(--text-secondary)'
              }}
              title="Return to Financial Hub"
            >
              &larr; Hub
            </Link>

            <button
              onClick={() => setNavDrawerOpen(true)}
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.8rem',
                fontWeight: 700,
                padding: '8px 14px',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                background: 'rgba(99, 102, 241, 0.12)',
                color: '#a5b4fc'
              }}
            >
              <SlidersHorizontal size={15} />
              <span>MARKET HUBS</span>
            </button>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ fontSize: '1.65rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', color: '#ffffff' }}>
                  Strategy
                </h1>
                <span
                  style={{
                    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                    color: '#ffffff',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.66rem',
                    fontWeight: 800,
                    letterSpacing: '0.04em'
                  }}
                >
                  QUANT LAB
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
                Create, configure, manage, and backtest your trading strategies.
              </p>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTab('BUILDER')}
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.82rem',
                fontWeight: 700,
                padding: '9px 16px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                boxShadow: '0 0 16px rgba(99, 102, 241, 0.4)'
              }}
            >
              <PlusCircle size={16} />
              <span>+ Create Strategy</span>
            </button>

            <button
              onClick={() => setActiveTab('BACKTEST')}
              className="btn btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.82rem',
                fontWeight: 700,
                padding: '9px 16px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#34d399'
              }}
            >
              <Play size={15} />
              <span>Backtest Strategy</span>
            </button>
          </div>
        </div>

        {/* Real-Time Statistics Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '14px',
            marginBottom: '24px'
          }}
        >
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px'
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#818cf8'
              }}
            >
              <SlidersHorizontal size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Total Strategies
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ffffff' }}>
                {stats.total_strategies}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#818cf8' }}>
                {stats.builtin_strategies} Built-in | {stats.custom_strategies} Custom
              </div>
            </div>
          </div>

          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px'
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#34d399'
              }}
            >
              <Activity size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Active Operational
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#34d399' }}>
                {stats.active_strategies}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                Scanning every 30s
              </div>
            </div>
          </div>

          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px'
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fbbf24'
              }}
            >
              <History size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Backtested Runs
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fbbf24' }}>
                {stats.backtested_runs}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                Saved in persistent ledger
              </div>
            </div>
          </div>

          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px'
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8'
              }}
            >
              <Layers size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                Asset Class Support
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>
                Stocks &amp; F&amp;O
              </div>
              <div style={{ fontSize: '0.68rem', color: '#38bdf8' }}>
                Cash, Futures &amp; Options
              </div>
            </div>
          </div>
        </div>

        {/* Primary Tab Navigation */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: '24px',
            paddingBottom: '10px',
            overflowX: 'auto',
            scrollbarWidth: 'none'
          }}
        >
          <button
            onClick={() => setActiveTab('REPOSITORY')}
            style={{
              background: activeTab === 'REPOSITORY' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
              border: activeTab === 'REPOSITORY' ? '1px solid #6366f1' : '1px solid transparent',
              color: activeTab === 'REPOSITORY' ? '#ffffff' : 'var(--text-secondary)',
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              whiteSpace: 'nowrap',
              textAlign: 'left',
              lineHeight: 1,
              transition: 'all 0.15s ease'
            }}
          >
            <Layers size={20} style={{ flexShrink: 0 }} color={activeTab === 'REPOSITORY' ? '#818cf8' : undefined} />
            <span>Strategy Repository ({filteredStrategies.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('BUILDER')}
            style={{
              background: activeTab === 'BUILDER' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
              border: activeTab === 'BUILDER' ? '1px solid #6366f1' : '1px solid transparent',
              color: activeTab === 'BUILDER' ? '#ffffff' : 'var(--text-secondary)',
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              whiteSpace: 'nowrap',
              textAlign: 'left',
              lineHeight: 1,
              transition: 'all 0.15s ease'
            }}
          >
            <PlusCircle size={20} style={{ flexShrink: 0 }} color={activeTab === 'BUILDER' ? '#818cf8' : undefined} />
            <span>Create Strategy</span>
          </button>

          <button
            onClick={() => setActiveTab('BACKTEST')}
            style={{
              background: activeTab === 'BACKTEST' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
              border: activeTab === 'BACKTEST' ? '1px solid #10b981' : '1px solid transparent',
              color: activeTab === 'BACKTEST' ? '#ffffff' : 'var(--text-secondary)',
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              whiteSpace: 'nowrap',
              textAlign: 'left',
              lineHeight: 1,
              transition: 'all 0.15s ease'
            }}
          >
            <Play size={20} style={{ flexShrink: 0 }} color={activeTab === 'BACKTEST' ? '#34d399' : undefined} />
            <span>Backtest Strategy</span>
          </button>

          <button
            onClick={() => setActiveTab('MULTILEG')}
            style={{
              background: activeTab === 'MULTILEG' ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
              border: activeTab === 'MULTILEG' ? '1px solid #a855f7' : '1px solid transparent',
              color: activeTab === 'MULTILEG' ? '#ffffff' : 'var(--text-secondary)',
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              whiteSpace: 'nowrap',
              textAlign: 'left',
              lineHeight: 1,
              transition: 'all 0.15s ease'
            }}
          >
            <Layers size={20} style={{ flexShrink: 0 }} color={activeTab === 'MULTILEG' ? '#c084fc' : undefined} />
            <span>Multi-Leg Options Spreads</span>
          </button>

          <button
            onClick={() => setActiveTab('OPTIMIZER')}
            style={{
              background: activeTab === 'OPTIMIZER' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              border: activeTab === 'OPTIMIZER' ? '1px solid #38bdf8' : '1px solid transparent',
              color: activeTab === 'OPTIMIZER' ? '#ffffff' : 'var(--text-secondary)',
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              whiteSpace: 'nowrap',
              textAlign: 'left',
              lineHeight: 1,
              transition: 'all 0.15s ease'
            }}
          >
            <Cpu size={20} style={{ flexShrink: 0 }} color={activeTab === 'OPTIMIZER' ? '#38bdf8' : undefined} />
            <span>Parameter Optimizer</span>
          </button>

          <button
            onClick={() => setActiveTab('PAPERTRADING')}
            style={{
              background: activeTab === 'PAPERTRADING' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
              border: activeTab === 'PAPERTRADING' ? '1px solid #10b981' : '1px solid transparent',
              color: activeTab === 'PAPERTRADING' ? '#ffffff' : 'var(--text-secondary)',
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              whiteSpace: 'nowrap',
              textAlign: 'left',
              lineHeight: 1,
              transition: 'all 0.15s ease'
            }}
          >
            <Activity size={20} style={{ flexShrink: 0 }} color={activeTab === 'PAPERTRADING' ? '#10b981' : undefined} />
            <span>Live Paper Trading Desk</span>
          </button>

          <button
            onClick={() => setActiveTab('BROKER')}
            style={{
              background: activeTab === 'BROKER' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
              border: activeTab === 'BROKER' ? '1px solid #ef4444' : '1px solid transparent',
              color: activeTab === 'BROKER' ? '#ffffff' : 'var(--text-secondary)',
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              whiteSpace: 'nowrap',
              textAlign: 'left',
              lineHeight: 1,
              transition: 'all 0.15s ease'
            }}
          >
            <ShieldCheck size={20} style={{ flexShrink: 0 }} color={activeTab === 'BROKER' ? '#f87171' : undefined} />
            <span>Live Broker Connect</span>
          </button>

          <button
            onClick={() => setActiveTab('NOTIFICATIONS')}
            style={{
              background: activeTab === 'NOTIFICATIONS' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              border: activeTab === 'NOTIFICATIONS' ? '1px solid #38bdf8' : '1px solid transparent',
              color: activeTab === 'NOTIFICATIONS' ? '#ffffff' : 'var(--text-secondary)',
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              whiteSpace: 'nowrap',
              textAlign: 'left',
              lineHeight: 1,
              transition: 'all 0.15s ease'
            }}
          >
            <Bell size={20} style={{ flexShrink: 0 }} color={activeTab === 'NOTIFICATIONS' ? '#38bdf8' : undefined} />
            <span>Real-Time Alerts &amp; Bot</span>
          </button>
        </div>

        {/* ============================================================== */}
        {/* TAB 1: STRATEGY REPOSITORY & MANAGEMENT                        */}
        {/* ============================================================== */}
        {activeTab === 'REPOSITORY' && (
          <div>
            {/* Search and Category Filters */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '20px',
                background: 'rgba(255, 255, 255, 0.02)',
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              {/* Category Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setSelectedCategory('ALL')}
                  style={{
                    background: selectedCategory === 'ALL' ? '#6366f1' : 'rgba(255, 255, 255, 0.04)',
                    color: selectedCategory === 'ALL' ? '#ffffff' : 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  All Categories ({strategies.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    style={{
                      background: selectedCategory === cat ? '#6366f1' : 'rgba(255, 255, 255, 0.04)',
                      color: selectedCategory === cat ? '#ffffff' : 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div style={{ position: 'relative', minWidth: '260px' }}>
                <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '10px' }} />
                <input
                  type="text"
                  placeholder="Search strategies, indicators, rules..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 34px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'rgba(15, 23, 42, 0.6)',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {/* Active Strategy Logic Overview */}
            <div style={{ marginBottom: '24px' }}>
              <StrategyLogicCard
                strategy={activeStrategyLogic}
                selectedStrategyId={selectedStrategyId}
                allStrategies={strategies}
                onSelectStrategy={(id: string) => setSelectedStrategyId(id)}
                onEditStrategy={(strat: any) => {
                  setEditingStrategy(strat);
                  setBuilderModalOpen(true);
                }}
                onDuplicateStrategy={(id: string) => handleDuplicate(id)}
                onDeleteStrategy={(id: string) => handleDelete(id)}
                onToggleStatus={(id: string, enabled: boolean) => handleToggleStatus(id, enabled)}
                onBacktestStrategy={(id: string) => handleLaunchBacktest(id)}
              />
            </div>

            {/* Strategies Grid Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
              {filteredStrategies.map((strat) => {
                const isSelected = selectedStrategyId === strat.id;
                const isCustom = strat.is_custom;
                const isActive = isCustom ? strat.is_enabled : true;

                return (
                  <div
                    key={strat.id}
                    onClick={() => setSelectedStrategyId(strat.id)}
                    style={{
                      background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                      border: isSelected ? '1px solid #6366f1' : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '20px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? '0 8px 30px rgba(99, 102, 241, 0.18)' : 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '14px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span
                          style={{
                            background: 'rgba(99, 102, 241, 0.18)',
                            color: '#a5b4fc',
                            border: '1px solid rgba(99, 102, 241, 0.35)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.64rem',
                            fontWeight: 800
                          }}
                        >
                          {strat.badge || strat.category || 'QUANT STRATEGY'}
                        </span>

                        <span
                          style={{
                            background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: isActive ? '#34d399' : '#f87171',
                            border: isActive ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.62rem',
                            fontWeight: 800
                          }}
                        >
                          {isActive ? '● ACTIVE' : '○ INACTIVE'}
                        </span>
                      </div>

                      <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>
                        {strat.name}
                      </h3>

                      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        {strat.description || 'Institutional quantitative trading strategy model.'}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '12px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#818cf8', fontWeight: 700 }}>
                        {strat.supported_instruments ? strat.supported_instruments.join(', ') : 'Stocks & F&O'}
                      </span>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLaunchBacktest(strat.id);
                        }}
                        style={{
                          background: 'rgba(16, 185, 129, 0.15)',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                          color: '#34d399',
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Play size={12} />
                        <span>Backtest</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: CREATE STRATEGY BUILDER                                 */}
        {/* ============================================================== */}
        {activeTab === 'BUILDER' && (
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '28px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.24)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                  Create New Quantitative Strategy
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Design custom multi-indicator condition rules, risk parameters, and instrument compatibility.
                </p>
              </div>

              <button
                onClick={() => setBuilderModalOpen(true)}
                className="btn btn-secondary"
                style={{ fontSize: '0.78rem', padding: '6px 14px' }}
              >
                Open in Full Dialog
              </button>
            </div>

            {builderSuccess && (
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid #10b981',
                  color: '#34d399',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontWeight: 700,
                  fontSize: '0.86rem'
                }}
              >
                <CheckCircle2 size={18} />
                <span>{builderSuccess}</span>
              </div>
            )}

            {/* Builder Form Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              {/* Left Column: Basic Info & Markets */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    STRATEGY NAME *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Nifty Volatility Breakout & Supertrend"
                    value={bName}
                    onChange={(e) => setBName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      color: '#ffffff',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                      STRATEGY CATEGORY
                    </label>
                    <select
                      value={bCategory}
                      onChange={(e) => setBCategory(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        color: '#ffffff',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="Trend Following">Trend Following</option>
                      <option value="Momentum">Momentum</option>
                      <option value="Breakout">Breakout</option>
                      <option value="Mean Reversion">Mean Reversion</option>
                      <option value="Price Action">Price Action</option>
                      <option value="Smart Money Concepts">Smart Money Concepts</option>
                      <option value="Volume Based">Volume Based</option>
                      <option value="Options Strategies">Options Strategies</option>
                      <option value="Custom Strategy">Custom Strategy</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                      TIMEFRAME
                    </label>
                    <select
                      value={bTimeframe}
                      onChange={(e) => setBTimeframe(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        color: '#ffffff',
                        fontSize: '0.85rem'
                      }}
                    >
                      <option value="5m">5 Minutes (Intraday)</option>
                      <option value="15m">15 Minutes (Swing / Trend)</option>
                      <option value="1H">1 Hour (Institutional)</option>
                      <option value="1D">Daily (Positional)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    DESCRIPTION
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Brief description of the trading edge..."
                    value={bDescription}
                    onChange={(e) => setBDescription(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      color: '#ffffff',
                      fontSize: '0.82rem',
                      outline: 'none',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    SUPPORTED INSTRUMENTS
                  </label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {['Equity Stocks', 'Index Futures', 'Stock Futures', 'Index Options', 'Stock Options'].map((inst) => {
                      const selected = bInstruments.includes(inst);
                      return (
                        <button
                          key={inst}
                          type="button"
                          onClick={() => {
                            if (selected) {
                              if (bInstruments.length > 1) setBInstruments(bInstruments.filter((i) => i !== inst));
                            } else {
                              setBInstruments([...bInstruments, inst]);
                            }
                          }}
                          style={{
                            background: selected ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                            border: selected ? '1px solid #6366f1' : '1px solid var(--border-subtle)',
                            color: selected ? '#ffffff' : 'var(--text-secondary)',
                            padding: '6px 12px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {selected ? '✓ ' : '+ '} {inst}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Conditions & Risk */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#34d399', marginBottom: '6px' }}>
                    BUY ENTRY CONDITIONS (1 RULE PER LINE)
                  </label>
                  <textarea
                    rows={3}
                    value={bBuyCond}
                    onChange={(e) => setBBuyCond(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'rgba(16, 185, 129, 0.05)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: 'var(--radius-md)',
                      color: '#ffffff',
                      fontSize: '0.82rem',
                      outline: 'none',
                      fontFamily: 'monospace'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#f87171', marginBottom: '6px' }}>
                    SELL ENTRY CONDITIONS (1 RULE PER LINE)
                  </label>
                  <textarea
                    rows={3}
                    value={bSellCond}
                    onChange={(e) => setBSellCond(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'rgba(239, 68, 68, 0.05)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: 'var(--radius-md)',
                      color: '#ffffff',
                      fontSize: '0.82rem',
                      outline: 'none',
                      fontFamily: 'monospace'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                      TARGET RATIO (R:R)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="1.0"
                      max="5.0"
                      value={bTargetRatio}
                      onChange={(e) => setBTargetRatio(parseFloat(e.target.value) || 2.0)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        color: '#ffffff',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                      MAX RISK / TRADE (%)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="5.0"
                      value={bMaxRiskPct}
                      onChange={(e) => setBMaxRiskPct(parseFloat(e.target.value) || 1.5)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        color: '#ffffff',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Bar */}
            <div
              style={{
                marginTop: '24px',
                paddingTop: '20px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '12px'
              }}
            >
              <button
                type="button"
                onClick={() => handleInlineBuilderSubmit(false)}
                disabled={builderSaving}
                className="btn btn-secondary"
                style={{ padding: '10px 20px', fontSize: '0.84rem', fontWeight: 700 }}
              >
                Save as Draft
              </button>

              <button
                type="button"
                onClick={() => handleInlineBuilderSubmit(true)}
                disabled={builderSaving}
                className="btn btn-primary"
                style={{
                  padding: '10px 24px',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  boxShadow: '0 0 16px rgba(16, 185, 129, 0.4)'
                }}
              >
                {builderSaving ? 'Saving...' : 'Save & Activate Strategy'}
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: BACKTEST STRATEGY TERMINAL                             */}
        {/* ============================================================== */}
        {activeTab === 'BACKTEST' && (
          <div>
            {/* Backtest Configuration Strip */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: '24px',
                marginBottom: '24px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#ffffff' }}>
                  Backtest Simulation Desk
                </h3>
                <button
                  onClick={() => setBacktestModalOpen(true)}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.76rem', padding: '5px 12px' }}
                >
                  Open Full Backtest Workspace
                </button>
              </div>

              {/* Form Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
                    STRATEGY
                  </label>
                  <select
                    value={btStratId}
                    onChange={(e) => setBtStratId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      color: '#ffffff',
                      fontSize: '0.82rem'
                    }}
                  >
                    {strategies.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.category || 'QUANT'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
                    INSTRUMENT TYPE
                  </label>
                  <select
                    value={btInstrument}
                    onChange={(e) => setBtInstrument(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      color: '#ffffff',
                      fontSize: '0.82rem'
                    }}
                  >
                    <option value="EQUITY">Cash Equities (NSE)</option>
                    <option value="FUTURES">Index &amp; Stock Futures</option>
                    <option value="OPTIONS">Index &amp; Stock Options (CE/PE)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
                    TIMEFRAME
                  </label>
                  <select
                    value={btTimeframe}
                    onChange={(e) => setBtTimeframe(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      color: '#ffffff',
                      fontSize: '0.82rem'
                    }}
                  >
                    <option value="5m">5 Minutes</option>
                    <option value="15m">15 Minutes</option>
                    <option value="1H">1 Hour</option>
                    <option value="1D">Daily</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
                    INITIAL CAPITAL (₹)
                  </label>
                  <input
                    type="number"
                    value={btCapital}
                    onChange={(e) => setBtCapital(parseFloat(e.target.value) || 500000)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      color: '#ffffff',
                      fontSize: '0.82rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
                    SLIPPAGE (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={btSlippage}
                    onChange={(e) => setBtSlippage(parseFloat(e.target.value) || 0.05)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      color: '#ffffff',
                      fontSize: '0.82rem'
                    }}
                  />
                </div>
              </div>

              {/* Symbols Row */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
                  SYMBOLS UNIVERSE (COMMA SEPARATED)
                </label>
                <input
                  type="text"
                  value={btCustomSymbols}
                  onChange={(e) => setBtCustomSymbols(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: '#ffffff',
                    fontSize: '0.82rem'
                  }}
                />
              </div>

              {/* Execute Button */}
              <button
                onClick={handleExecuteBacktest}
                disabled={btRunning}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '12px',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  boxShadow: '0 0 20px rgba(16, 185, 129, 0.35)'
                }}
              >
                {btRunning ? (
                  <>
                    <RotateCcw size={16} className="spin-slow" />
                    <span>Executing Walkforward Simulation (Zero Lookahead)...</span>
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    <span>Run Backtest Simulation</span>
                  </>
                )}
              </button>

              {btError && (
                <div style={{ marginTop: '14px', color: '#f87171', fontSize: '0.8rem', fontWeight: 700 }}>
                  ⚠️ {btError}
                </div>
              )}
            </div>

            {/* Backtest Results View */}
            {btResults && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Performance Metrics Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>NET PROFIT</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: btResults.metrics.net_profit >= 0 ? '#34d399' : '#f87171' }}>
                      {btResults.metrics.net_profit >= 0 ? '+' : ''}₹{btResults.metrics.net_profit?.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{btResults.metrics.net_return_pct}% ROI</div>
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>WIN RATE</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#34d399' }}>
                      {btResults.metrics.win_rate_pct}%
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      {btResults.metrics.winning_trades}W / {btResults.metrics.losing_trades}L
                    </div>
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>PROFIT FACTOR</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fbbf24' }}>
                      {btResults.metrics.profit_factor}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Gross Win/Loss ratio</div>
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>MAX DRAWDOWN</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#f87171' }}>
                      {btResults.metrics.max_drawdown_pct}%
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Peak to trough</div>
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>TOTAL CHARGES</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#94a3b8' }}>
                      ₹{btResults.metrics.total_charges?.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>STT + Turnover + GST</div>
                  </div>
                </div>

                {/* Export Bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                    SIMULATION RUN ID: <span style={{ color: '#818cf8' }}>{btResults.backtest_id || 'LOCAL-SIM'}</span>
                  </div>
                  <button
                    onClick={handleExportCSV}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Download size={14} />
                    <span>Export Trades to CSV</span>
                  </button>
                </div>

                {/* Trade Log Table */}
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '18px',
                    overflowX: 'auto'
                  }}
                >
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '0.92rem', fontWeight: 800 }}>
                    Trade Execution Log ({btResults.trades?.length || 0} Trades)
                  </h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textAlign: 'left' }}>
                        <th style={{ padding: '8px' }}>Trade ID</th>
                        <th style={{ padding: '8px' }}>Symbol</th>
                        <th style={{ padding: '8px' }}>Side</th>
                        <th style={{ padding: '8px' }}>Entry</th>
                        <th style={{ padding: '8px' }}>Exit</th>
                        <th style={{ padding: '8px' }}>Qty</th>
                        <th style={{ padding: '8px' }}>Outcome</th>
                        <th style={{ padding: '8px' }}>MFE / MAE</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Net P&amp;L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(btResults.trades || []).map((t: any) => {
                        const isWin = t.net_pnl > 0;
                        return (
                          <tr key={t.trade_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '8px', color: '#818cf8', fontWeight: 700 }}>{t.trade_id}</td>
                            <td style={{ padding: '8px', fontWeight: 800 }}>{t.contract_symbol || t.symbol}</td>
                            <td style={{ padding: '8px' }}>
                              <span
                                style={{
                                  background: t.side === 'BUY' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                  color: t.side === 'BUY' ? '#34d399' : '#f87171',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontWeight: 800
                                }}
                              >
                                {t.side}
                              </span>
                            </td>
                            <td style={{ padding: '8px' }}>₹{t.entry_price}</td>
                            <td style={{ padding: '8px' }}>₹{t.exit_price}</td>
                            <td style={{ padding: '8px', color: '#fbbf24' }}>{t.quantity}</td>
                            <td style={{ padding: '8px' }}>{t.outcome}</td>
                            <td style={{ padding: '8px' }}>+{t.mfe_pct}% / {t.mae_pct}%</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: isWin ? '#34d399' : '#f87171' }}>
                              {isWin ? '+' : ''}₹{t.net_pnl?.toLocaleString()}
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

        {/* ============================================================== */}
        {/* TAB 4: MULTI-LEG OPTIONS SPREADS                               */}
        {/* ============================================================== */}
        {activeTab === 'MULTILEG' && <MultiLegOptionsDesk />}

        {/* ============================================================== */}
        {/* TAB 5: STRATEGY PARAMETER OPTIMIZER                            */}
        {/* ============================================================== */}
        {activeTab === 'OPTIMIZER' && <StrategyOptimizerDesk />}

        {/* ============================================================== */}
        {/* TAB 6: LIVE PAPER TRADING DESK                                 */}
        {/* ============================================================== */}
        {activeTab === 'PAPERTRADING' && <PaperTradingDesk />}

        {/* ============================================================== */}
        {/* TAB 7: LIVE BROKER INTEGRATION HUB                             */}
        {/* ============================================================== */}
        {activeTab === 'BROKER' && <LiveBrokerDesk />}

        {/* ============================================================== */}
        {/* TAB 8: REAL-TIME ALERTS & NOTIFICATION ENGINE                  */}
        {/* ============================================================== */}
        {activeTab === 'NOTIFICATIONS' && <AlertsNotificationDesk />}
      </div>

      {/* Navigation Drawer */}
      <NavigationDrawer isOpen={navDrawerOpen} onClose={() => setNavDrawerOpen(false)} />

      {/* Reusable Modals */}
      <StrategyBuilderModal
        isOpen={builderModalOpen}
        onClose={() => {
          setBuilderModalOpen(false);
          setEditingStrategy(null);
        }}
        onSuccess={() => fetchData()}
        initialData={editingStrategy}
      />

      <BacktestModal
        isOpen={backtestModalOpen}
        onClose={() => setBacktestModalOpen(false)}
        initialStrategyId={backtestStrategyId}
      />
    </div>
  );
}
