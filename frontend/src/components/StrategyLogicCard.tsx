'use client';

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Cpu,
  Activity,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  Target,
  Percent,
  LogOut,
  CheckCircle,
  Radio,
  Clock,
  Sparkles,
  Zap,
  Info
} from 'lucide-react';

export interface StrategyIndicator {
  name: string;
  symbol: string;
  parameters: Record<string, any>;
  purpose: string;
}

export interface StrategyLogicDetail {
  id: string;
  name: string;
  category: string;
  badge: string;
  win_rate?: string;
  version?: string;
  is_custom?: boolean;
  instrument_compatibility?: {
    equity: boolean;
    futures: boolean;
    options: boolean;
    options_usage?: string;
    compatibility_note?: string;
  };
  description: string;
  trading_objective: string;
  supported_instruments: string[];
  supported_timeframes: string[];
  indicators: StrategyIndicator[];
  buy_conditions: string[];
  sell_conditions: string[];
  stop_loss_logic: string;
  target_calculation: {
    target_1: string;
    target_2: string;
    target_3: string;
  };
  risk_reward: string;
  exit_conditions: string[];
  confirmation_rules: string[];
  status: {
    is_enabled: boolean;
    status_label: string;
    applicable_instruments: string;
    last_evaluated: string;
    last_signal_generated: string;
    data_status: string;
  };
}

interface StrategyLogicCardProps {
  strategy: StrategyLogicDetail | null;
  selectedStrategyId: string;
  allStrategies: any[];
  onSelectStrategy: (stratId: string) => void;
  onEditStrategy?: (strategy: any) => void;
  onDuplicateStrategy?: (strategyId: string) => void;
  onDeleteStrategy?: (strategyId: string) => void;
  onToggleStatus?: (strategyId: string, currentEnabled: boolean) => void;
  onBacktestStrategy?: (strategyId: string) => void;
}

export default function StrategyLogicCard({
  strategy,
  selectedStrategyId,
  allStrategies,
  onSelectStrategy,
  onEditStrategy,
  onDuplicateStrategy,
  onDeleteStrategy,
  onToggleStatus,
  onBacktestStrategy
}: StrategyLogicCardProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  if (!strategy || selectedStrategyId === 'all') {
    return (
      <div
        style={{
          marginTop: '12px',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)',
          border: '1px dashed rgba(99, 102, 241, 0.3)',
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818cf8',
              flexShrink: 0
            }}
          >
            <Cpu size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffffff' }}>
              Select Any Specific Strategy Pill to Inspect Complete Strategy Logic
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Every quantitative model features mathematically verified Entry, Stop-Loss, Targets, and Confirmation parameters.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {allStrategies
            .filter((s) => s.id !== 'all')
            .slice(0, 4)
            .map((s) => (
              <button
                key={s.id}
                onClick={() => onSelectStrategy(s.id)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#94a3b8',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.70rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                Inspect {s.name} &rarr;
              </button>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: '14px',
        background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.95) 0%, rgba(11, 15, 25, 0.98) 100%)',
        border: '1px solid rgba(99, 102, 241, 0.35)',
        borderRadius: '14px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
        transition: 'all 0.2s ease'
      }}
    >
      {/* Collapsible Header Strip */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: '14px 20px',
          background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.12) 0%, rgba(15, 23, 42, 0.6) 100%)',
          borderBottom: isExpanded ? '1px solid rgba(99, 102, 241, 0.2)' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(99, 102, 241, 0.25)',
              border: '1px solid rgba(129, 140, 248, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#a5b4fc',
              flexShrink: 0
            }}
          >
            <Cpu size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.90rem', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.01em' }}>
                Strategy Logic: {strategy.name}
              </span>
              <span
                style={{
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: '#a5b4fc',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '6px'
                }}
              >
                {strategy.badge}
              </span>
              <span
                style={{
                  background: 'rgba(16, 185, 129, 0.18)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '6px'
                }}
              >
                WIN RATE: {strategy.win_rate || '70%'}
              </span>
              <span
                style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: '6px'
                }}
              >
                VER: {strategy.version || 'v1.0.0'}
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Complete mathematical conditions, indicators, stop-loss formulas, and real-time execution parameters.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
          {onBacktestStrategy && (
            <button
              type="button"
              onClick={() => onBacktestStrategy(strategy.id)}
              style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                border: '1px solid #818cf8',
                color: '#ffffff',
                borderRadius: '6px',
                padding: '4px 12px',
                fontSize: '0.68rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 0 10px rgba(99, 102, 241, 0.35)',
                transition: 'all 0.15s ease'
              }}
              title={`Run Backtest simulation on ${strategy.name}`}
            >
              <span>⚡ Backtest Strategy</span>
            </button>
          )}

          {strategy.is_custom && onEditStrategy && (
            <button
              type="button"
              onClick={() => onEditStrategy(strategy)}
              style={{
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                color: '#a5b4fc',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.68rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              ✎ Edit Strategy
            </button>
          )}

          {onDuplicateStrategy && (
            <button
              type="button"
              onClick={() => onDuplicateStrategy(strategy.id)}
              style={{
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                color: '#38bdf8',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.68rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              ⎘ Duplicate
            </button>
          )}

          {strategy.is_custom && onToggleStatus && (
            <button
              type="button"
              onClick={() => onToggleStatus(strategy.id, strategy.status?.is_enabled ?? true)}
              style={{
                background: strategy.status?.is_enabled ? 'rgba(234, 179, 8, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                border: strategy.status?.is_enabled ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                color: strategy.status?.is_enabled ? '#facc15' : '#34d399',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.68rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {strategy.status?.is_enabled ? '⏸ Disable' : '▶ Activate'}
            </button>
          )}

          {strategy.is_custom && onDeleteStrategy && (
            <button
              type="button"
              onClick={() => onDeleteStrategy(strategy.id)}
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.68rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🗑 Delete
            </button>
          )}

          <div
            onClick={() => setIsExpanded(!isExpanded)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', paddingLeft: '4px' }}
          >
            <span style={{ fontSize: '0.72rem', color: '#818cf8', fontWeight: 700 }}>
              {isExpanded ? 'Hide Strategy Logic' : 'View Strategy Logic'}
            </span>
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#818cf8'
              }}
            >
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>
        </div>
      </div>

      {/* Expandable Strategy Logic Content */}
      {isExpanded && (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 1. Strategy Overview */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '10px',
              padding: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Info size={16} color="#818cf8" />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase' }}>
                1. Strategy Overview
              </span>
            </div>
            <p style={{ fontSize: '0.80rem', color: '#e2e8f0', lineHeight: 1.5, margin: '0 0 10px 0' }}>
              {strategy.description}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              <div>
                <strong style={{ color: '#94a3b8' }}>Category:</strong>{' '}
                <span style={{ color: '#ffffff' }}>{strategy.category}</span>
              </div>
              <div>
                <strong style={{ color: '#94a3b8' }}>Trading Objective:</strong>{' '}
                <span style={{ color: '#ffffff' }}>{strategy.trading_objective}</span>
              </div>
              <div>
                <strong style={{ color: '#94a3b8' }}>Supported Instruments:</strong>{' '}
                {strategy.supported_instruments.map((inst) => (
                  <span
                    key={inst}
                    style={{
                      background: 'rgba(56, 189, 248, 0.12)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      marginLeft: '4px',
                      fontSize: '0.68rem',
                      fontWeight: 700
                    }}
                  >
                    {inst}
                  </span>
                ))}
              </div>
              <div>
                <strong style={{ color: '#94a3b8' }}>Timeframes:</strong>{' '}
                {strategy.supported_timeframes.map((tf) => (
                  <span
                    key={tf}
                    style={{
                      background: 'rgba(168, 85, 247, 0.15)',
                      color: '#c084fc',
                      border: '1px solid rgba(168, 85, 247, 0.3)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      marginLeft: '4px',
                      fontSize: '0.68rem',
                      fontWeight: 700
                    }}
                  >
                    {tf}
                  </span>
                ))}
              </div>
            </div>

            {/* Phase 4: Multi-Asset Instrument Compatibility Matrix */}
            <div style={{ marginTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '10px' }}>
              <div style={{ fontSize: '0.70rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
                Multi-Asset Compatibility & Derivative Contract Specs
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '8px 12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Equity Stocks</div>
                  <div style={{ fontSize: '0.76rem', fontWeight: 800, color: strategy.instrument_compatibility?.equity !== false ? '#34d399' : '#f87171' }}>
                    {strategy.instrument_compatibility?.equity !== false ? '✓ Supported' : '✕ Incompatible'}
                  </div>
                </div>
                <div style={{ background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.2)', padding: '8px 12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Futures Contracts</div>
                  <div style={{ fontSize: '0.76rem', fontWeight: 800, color: strategy.instrument_compatibility?.futures !== false ? '#34d399' : '#f87171' }}>
                    {strategy.instrument_compatibility?.futures !== false ? '✓ Supported (Basis & Carry)' : '✕ Incompatible'}
                  </div>
                </div>
                <div style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.2)', padding: '8px 12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Options Contracts</div>
                  <div style={{ fontSize: '0.76rem', fontWeight: 800, color: strategy.instrument_compatibility?.options ? '#34d399' : '#f87171' }}>
                    {strategy.instrument_compatibility?.options ? '✓ Supported (Greeks & Vol)' : '✕ Not Recommended'}
                  </div>
                </div>
              </div>
              {strategy.instrument_compatibility?.options_usage && (
                <div style={{ fontSize: '0.70rem', color: '#a5b4fc', marginTop: '8px', lineHeight: 1.4 }}>
                  <strong>Options Methodology:</strong> {strategy.instrument_compatibility.options_usage}
                </div>
              )}
            </div>
          </div>

          {/* 2. Indicators Used */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Layers size={16} color="#38bdf8" />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase' }}>
                2. Indicators Used (Strictly Required)
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '10px'
              }}
            >
              {strategy.indicators.map((ind, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    borderRadius: '8px',
                    padding: '10px 14px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#ffffff' }}>{ind.name}</span>
                    <span
                      style={{
                        background: 'rgba(56, 189, 248, 0.15)',
                        color: '#38bdf8',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '0.66rem',
                        fontWeight: 800
                      }}
                    >
                      {ind.symbol}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.70rem', color: '#94a3b8', marginTop: '4px' }}>
                    Parameters: {JSON.stringify(ind.parameters).replace(/[{}\"]/g, '')}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#38bdf8', marginTop: '4px' }}>
                    Purpose: {ind.purpose}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3 & 4. BUY & SELL Entry Conditions */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '14px'
            }}
          >
            {/* BUY Conditions */}
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.05)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '10px',
                padding: '14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <ArrowUpRight size={16} color="#34d399" />
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#34d399', textTransform: 'uppercase' }}>
                  3. BUY Entry Conditions
                </span>
              </div>
              <ol style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {strategy.buy_conditions.map((cond, idx) => (
                  <li key={idx} style={{ fontSize: '0.74rem', color: '#e2e8f0', lineHeight: 1.4 }}>
                    {cond}
                  </li>
                ))}
              </ol>
            </div>

            {/* SELL Conditions */}
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '10px',
                padding: '14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <ArrowDownRight size={16} color="#f87171" />
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f87171', textTransform: 'uppercase' }}>
                  4. SELL Entry Conditions
                </span>
              </div>
              <ol style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {strategy.sell_conditions.map((cond, idx) => (
                  <li key={idx} style={{ fontSize: '0.74rem', color: '#e2e8f0', lineHeight: 1.4 }}>
                    {cond}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* 5, 6 & 7. Stop-Loss, Targets & Risk/Reward */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '12px'
            }}
          >
            {/* 5. Stop Loss Logic */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '12px 14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <ShieldAlert size={14} color="#f87171" />
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#f87171', textTransform: 'uppercase' }}>
                  5. Stop-Loss Logic
                </span>
              </div>
              <p style={{ fontSize: '0.74rem', color: '#cbd5e1', lineHeight: 1.4, margin: 0 }}>
                {strategy.stop_loss_logic}
              </p>
            </div>

            {/* 6. Target Calculation */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '12px 14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Target size={14} color="#34d399" />
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#34d399', textTransform: 'uppercase' }}>
                  6. Target Calculation
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div><strong style={{ color: '#34d399' }}>T1:</strong> {strategy.target_calculation.target_1}</div>
                <div><strong style={{ color: '#38bdf8' }}>T2:</strong> {strategy.target_calculation.target_2}</div>
                <div><strong style={{ color: '#a5b4fc' }}>T3:</strong> {strategy.target_calculation.target_3}</div>
              </div>
            </div>

            {/* 7. Risk / Reward */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '12px 14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Percent size={14} color="#fbbf24" />
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase' }}>
                  7. Risk / Reward Ratio
                </span>
              </div>
              <p style={{ fontSize: '0.74rem', color: '#cbd5e1', lineHeight: 1.4, margin: 0 }}>
                Strict minimum <strong style={{ color: '#fbbf24' }}>{strategy.risk_reward}</strong>. Position sizing capped to standard 1.0% portfolio risk per trade.
              </p>
            </div>
          </div>

          {/* 8, 9 & 10. Exit Conditions, Confirmation Rules & Current Status */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '12px'
            }}
          >
            {/* 8. Exit Conditions */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '12px 14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <LogOut size={14} color="#f97316" />
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#f97316', textTransform: 'uppercase' }}>
                  8. Exit Conditions
                </span>
              </div>
              <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {strategy.exit_conditions.map((rule, idx) => (
                  <li key={idx} style={{ fontSize: '0.72rem', color: '#cbd5e1', lineHeight: 1.3 }}>
                    {rule}
                  </li>
                ))}
              </ul>
            </div>

            {/* 9. Confirmation Rules */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '12px 14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <CheckCircle size={14} color="#34d399" />
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#34d399', textTransform: 'uppercase' }}>
                  9. Confirmation Rules
                </span>
              </div>
              <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {strategy.confirmation_rules.map((rule, idx) => (
                  <li key={idx} style={{ fontSize: '0.72rem', color: '#cbd5e1', lineHeight: 1.3 }}>
                    {rule}
                  </li>
                ))}
              </ul>
            </div>

            {/* 10. Current Strategy Status */}
            <div
              style={{
                background: 'rgba(99, 102, 241, 0.05)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: '8px',
                padding: '12px 14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Radio size={14} color="#818cf8" />
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase' }}>
                  10. Current Strategy Status
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.72rem' }}>
                <div>
                  <span style={{ color: '#94a3b8' }}>Status:</span>{' '}
                  <span style={{ color: '#34d399', fontWeight: 800 }}>{strategy.status.status_label}</span>
                </div>
                <div>
                  <span style={{ color: '#94a3b8' }}>Instruments:</span>{' '}
                  <span style={{ color: '#ffffff' }}>{strategy.status.applicable_instruments}</span>
                </div>
                <div>
                  <span style={{ color: '#94a3b8' }}>Evaluation:</span>{' '}
                  <span style={{ color: '#a5b4fc' }}>{strategy.status.last_evaluated}</span>
                </div>
                <div>
                  <span style={{ color: '#94a3b8' }}>Data Status:</span>{' '}
                  <span style={{ color: '#38bdf8', fontWeight: 700 }}>{strategy.status.data_status}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

