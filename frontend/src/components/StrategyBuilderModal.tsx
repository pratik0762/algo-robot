'use client';

import React, { useState, useEffect, useMemo } from 'react';

export interface StrategyIndicatorConfig {
  name: string;
  symbol: string;
  parameters: Record<string, any>;
  purpose: string;
}

export interface StrategyConditionRow {
  id: string;
  leftOperand: string;
  operator: string;
  rightOperand: string;
  conjunction: 'AND' | 'OR';
}

export interface CustomStrategyFormData {
  id?: string;
  name: string;
  description: string;
  category: string;
  trading_objective: string;
  supported_instruments: string[];
  supported_timeframes: string[];
  indicators: StrategyIndicatorConfig[];
  buy_conditions: string[];
  sell_conditions: string[];
  buy_condition_rows: StrategyConditionRow[];
  sell_condition_rows: StrategyConditionRow[];
  risk_management: {
    entry_type: string;
    stop_loss_type: string;
    stop_loss_multiplier: number;
    target_1_ratio: number;
    target_2_ratio: number;
    target_3_ratio: number;
    risk_reward_ratio: string;
    max_risk_per_trade_pct: number;
    signal_validity_bars: number;
  };
  advanced_settings: {
    higher_timeframe_confirmation: boolean;
    volume_filter: boolean;
    volume_filter_multiplier: number;
    candle_close_confirmation: boolean;
    trading_session_start: string;
    trading_session_end: string;
    cooldown_bars: number;
    duplicate_signal_prevention: boolean;
  };
  is_enabled: boolean;
  version?: string;
}

const CATEGORIES = [
  'Trend Following',
  'Momentum',
  'Breakout',
  'Mean Reversion',
  'Price Action',
  'Smart Money Concepts',
  'Volume Based',
  'Multi-Timeframe',
  'Options Strategies',
  'Custom Strategy'
];

const INSTRUMENT_OPTIONS = [
  'Equity Stocks',
  'Stock Futures',
  'Stock Options',
  'Index Futures',
  'Index Options',
  'Other supported F&O instruments'
];

const TIMEFRAME_OPTIONS = ['1m', '3m', '5m', '15m', '30m', '1H', '1D'];

const AVAILABLE_INDICATORS = [
  { name: 'EMA (Exponential Moving Average)', symbol: 'EMA', defaultParams: { period: 9, smoothing: 2.0 }, purpose: 'Fast trend direction & momentum filter' },
  { name: 'SMA (Simple Moving Average)', symbol: 'SMA', defaultParams: { period: 20 }, purpose: 'Baseline moving average filter' },
  { name: 'RSI (Relative Strength Index)', symbol: 'RSI', defaultParams: { period: 14, overbought: 70, oversold: 30 }, purpose: 'Momentum oscillator & mean reversion trigger' },
  { name: 'MACD (Moving Average Convergence Divergence)', symbol: 'MACD', defaultParams: { fast: 12, slow: 26, signal: 9 }, purpose: 'Trend acceleration & histogram expansion' },
  { name: 'Supertrend', symbol: 'SUPERTREND', defaultParams: { period: 10, multiplier: 3.0 }, purpose: 'Volatility-adjusted trailing trend breakout' },
  { name: 'VWAP (Volume Weighted Average Price)', symbol: 'VWAP', defaultParams: { anchor: 'Session' }, purpose: 'Institutional fair value benchmark' },
  { name: 'ATR (Average True Range)', symbol: 'ATR', defaultParams: { period: 14 }, purpose: 'Dynamic market volatility stop-loss calculator' },
  { name: 'ADX (Average Directional Index)', symbol: 'ADX', defaultParams: { period: 14, threshold: 25 }, purpose: 'Trend strength & chop filtering' },
  { name: 'Bollinger Bands', symbol: 'BB', defaultParams: { period: 20, stdDev: 2.0 }, purpose: 'Volatility squeeze & breakout envelope' },
  { name: 'Volume SMA', symbol: 'VOL_SMA', defaultParams: { period: 20, surgeMultiplier: 1.5 }, purpose: 'Institutional liquidity expansion verification' }
];

const OPERATORS = [
  { id: 'crosses_above', label: 'Crosses Above' },
  { id: 'crosses_below', label: 'Crosses Below' },
  { id: '>', label: 'Greater Than (>)' },
  { id: '<', label: 'Less Than (<)' },
  { id: '>=', label: 'Greater Than or Equal (>=)' },
  { id: '<=', label: 'Less Than or Equal (<=)' },
  { id: '==', label: 'Equals (==)' }
];

interface StrategyBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (savedStrategy: any) => void;
  initialData?: any | null;
}

export default function StrategyBuilderModal({
  isOpen,
  onClose,
  onSuccess,
  initialData
}: StrategyBuilderModalProps) {
  const [activeTab, setActiveTab] = useState<'basic' | 'indicators' | 'conditions' | 'risk' | 'advanced' | 'preview'>('basic');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<CustomStrategyFormData>({
    name: '',
    description: '',
    category: 'Trend Following',
    trading_objective: 'Capture systematic market inefficiencies with quantitative edge.',
    supported_instruments: ['Equity Stocks', 'Index Futures'],
    supported_timeframes: ['15m', '1H'],
    indicators: [
      { name: 'EMA 9 (Fast Exponential Moving Average)', symbol: 'EMA9', parameters: { period: 9 }, purpose: 'Fast trend direction' },
      { name: 'EMA 21 (Slow Exponential Moving Average)', symbol: 'EMA21', parameters: { period: 21 }, purpose: 'Baseline institutional trend' }
    ],
    buy_conditions: [
      'EMA 9 crosses above EMA 21 on a confirmed closed candle',
      'Price closes above VWAP benchmark',
      'Volume exceeds 1.5x 20-period Volume SMA'
    ],
    sell_conditions: [
      'EMA 9 crosses below EMA 21 on a confirmed closed candle',
      'Price closes below VWAP benchmark',
      'Volume exceeds 1.5x 20-period Volume SMA'
    ],
    buy_condition_rows: [
      { id: '1', leftOperand: 'EMA 9', operator: 'crosses_above', rightOperand: 'EMA 21', conjunction: 'AND' },
      { id: '2', leftOperand: 'Close Price', operator: '>', rightOperand: 'VWAP', conjunction: 'AND' }
    ],
    sell_condition_rows: [
      { id: '1', leftOperand: 'EMA 9', operator: 'crosses_below', rightOperand: 'EMA 21', conjunction: 'AND' },
      { id: '2', leftOperand: 'Close Price', operator: '<', rightOperand: 'VWAP', conjunction: 'AND' }
    ],
    risk_management: {
      entry_type: 'Market on Candle Close',
      stop_loss_type: 'ATR Multiplier (1.5x)',
      stop_loss_multiplier: 1.5,
      target_1_ratio: 1.5,
      target_2_ratio: 2.5,
      target_3_ratio: 4.0,
      risk_reward_ratio: '1 : 2.0',
      max_risk_per_trade_pct: 1.5,
      signal_validity_bars: 3
    },
    advanced_settings: {
      higher_timeframe_confirmation: true,
      volume_filter: true,
      volume_filter_multiplier: 1.5,
      candle_close_confirmation: true,
      trading_session_start: '09:30',
      trading_session_end: '15:15',
      cooldown_bars: 3,
      duplicate_signal_prevention: true
    },
    is_enabled: true
  });

  // Selected indicator in builder
  const [selectedIndType, setSelectedIndType] = useState<string>('EMA (Exponential Moving Average)');
  const [indPeriod, setIndPeriod] = useState<number>(14);

  // Load initial data if editing
  useEffect(() => {
    if (initialData) {
      setFormData({
        id: initialData.id,
        name: initialData.name || '',
        description: initialData.description || '',
        category: initialData.category || 'Custom Strategy',
        trading_objective: initialData.trading_objective || '',
        supported_instruments: initialData.supported_instruments || ['Equity Stocks'],
        supported_timeframes: initialData.supported_timeframes || ['15m'],
        indicators: initialData.indicators || [],
        buy_conditions: initialData.buy_conditions || [],
        sell_conditions: initialData.sell_conditions || [],
        buy_condition_rows: (initialData.buy_conditions || []).map((c: string, idx: number) => ({
          id: String(idx + 1),
          leftOperand: c.split(' ')[0] || 'Indicator',
          operator: '>',
          rightOperand: 'Value',
          conjunction: 'AND'
        })),
        sell_condition_rows: (initialData.sell_conditions || []).map((c: string, idx: number) => ({
          id: String(idx + 1),
          leftOperand: c.split(' ')[0] || 'Indicator',
          operator: '<',
          rightOperand: 'Value',
          conjunction: 'AND'
        })),
        risk_management: {
          entry_type: 'Market on Candle Close',
          stop_loss_type: 'ATR Multiplier (1.5x)',
          stop_loss_multiplier: 1.5,
          target_1_ratio: 1.5,
          target_2_ratio: 2.5,
          target_3_ratio: 4.0,
          risk_reward_ratio: '1 : 2.0',
          max_risk_per_trade_pct: 1.5,
          signal_validity_bars: 3,
          ...(initialData.risk_management || {})
        },
        advanced_settings: {
          higher_timeframe_confirmation: true,
          volume_filter: true,
          volume_filter_multiplier: 1.5,
          candle_close_confirmation: true,
          trading_session_start: '09:30',
          trading_session_end: '15:15',
          cooldown_bars: 3,
          duplicate_signal_prevention: true,
          ...(initialData.advanced_settings || {})
        },
        is_enabled: initialData.status?.is_enabled ?? initialData.is_enabled ?? true,
        version: initialData.version
      });
    }
  }, [initialData]);

  // Real-time validation checks
  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    if (!formData.name || formData.name.trim().length < 3) {
      errs.push('Strategy Name must be at least 3 characters.');
    }
    if (!formData.category) {
      errs.push('Strategy Category is required.');
    }
    if (formData.supported_instruments.length === 0) {
      errs.push('Select at least 1 Applicable Instrument.');
    }
    if (formData.supported_timeframes.length === 0) {
      errs.push('Select at least 1 Supported Timeframe.');
    }
    if (formData.indicators.length === 0) {
      errs.push('Configure at least 1 Technical Indicator.');
    }
    if (formData.buy_conditions.length === 0 && formData.sell_conditions.length === 0) {
      errs.push('Define at least 1 BUY or SELL condition.');
    }
    return errs;
  }, [formData]);

  const isValidForActivation = validationErrors.length === 0;

  // Toggle instrument selection
  const toggleInstrument = (inst: string) => {
    setFormData((prev) => {
      const exists = prev.supported_instruments.includes(inst);
      return {
        ...prev,
        supported_instruments: exists
          ? prev.supported_instruments.filter((i) => i !== inst)
          : [...prev.supported_instruments, inst]
      };
    });
  };

  // Toggle timeframe selection
  const toggleTimeframe = (tf: string) => {
    setFormData((prev) => {
      const exists = prev.supported_timeframes.includes(tf);
      return {
        ...prev,
        supported_timeframes: exists
          ? prev.supported_timeframes.filter((t) => t !== tf)
          : [...prev.supported_timeframes, tf]
      };
    });
  };

  // Add Indicator
  const handleAddIndicator = () => {
    const template = AVAILABLE_INDICATORS.find((i) => i.name === selectedIndType) || AVAILABLE_INDICATORS[0];
    const newInd: StrategyIndicatorConfig = {
      name: `${template.symbol} ${indPeriod}`,
      symbol: `${template.symbol}${indPeriod}`,
      parameters: { ...template.defaultParams, period: indPeriod },
      purpose: template.purpose
    };
    setFormData((prev) => ({
      ...prev,
      indicators: [...prev.indicators, newInd]
    }));
  };

  const handleRemoveIndicator = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      indicators: prev.indicators.filter((_, i) => i !== index)
    }));
  };

  // Condition Management
  const handleAddBuyConditionRow = () => {
    const newRow: StrategyConditionRow = {
      id: String(Date.now()),
      leftOperand: 'EMA 9',
      operator: '>',
      rightOperand: 'EMA 21',
      conjunction: 'AND'
    };
    setFormData((prev) => ({
      ...prev,
      buy_condition_rows: [...prev.buy_condition_rows, newRow],
      buy_conditions: [...prev.buy_conditions, 'EMA 9 > EMA 21']
    }));
  };

  const handleRemoveBuyConditionRow = (id: string, index: number) => {
    setFormData((prev) => ({
      ...prev,
      buy_condition_rows: prev.buy_condition_rows.filter((r) => r.id !== id),
      buy_conditions: prev.buy_conditions.filter((_, i) => i !== index)
    }));
  };

  const handleAddSellConditionRow = () => {
    const newRow: StrategyConditionRow = {
      id: String(Date.now()),
      leftOperand: 'EMA 9',
      operator: '<',
      rightOperand: 'EMA 21',
      conjunction: 'AND'
    };
    setFormData((prev) => ({
      ...prev,
      sell_condition_rows: [...prev.sell_condition_rows, newRow],
      sell_conditions: [...prev.sell_conditions, 'EMA 9 < EMA 21']
    }));
  };

  const handleRemoveSellConditionRow = (id: string, index: number) => {
    setFormData((prev) => ({
      ...prev,
      sell_condition_rows: prev.sell_condition_rows.filter((r) => r.id !== id),
      sell_conditions: prev.sell_conditions.filter((_, i) => i !== index)
    }));
  };

  // Save Strategy
  const handleSave = async (activate: boolean) => {
    setErrorMessage(null);
    if (activate && !isValidForActivation) {
      setErrorMessage(`Cannot activate strategy with pending errors:\n${validationErrors.join('\n')}`);
      setActiveTab('preview');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || `Algorithmic strategy with ${formData.indicators.length} indicators and systematic rules.`,
        category: formData.category,
        trading_objective: formData.trading_objective.trim(),
        supported_instruments: formData.supported_instruments,
        supported_timeframes: formData.supported_timeframes,
        indicators: formData.indicators,
        buy_conditions: formData.buy_conditions,
        sell_conditions: formData.sell_conditions,
        risk_management: formData.risk_management,
        advanced_settings: formData.advanced_settings,
        is_enabled: activate
      };

      const isEdit = Boolean(formData.id);
      const url = isEdit ? `/api/strategies/custom/${formData.id}` : '/api/strategies/custom';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.message || 'Failed to save strategy.');
      }

      onSuccess(data.strategy);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while saving.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 7, 15, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.15s ease-out'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1040px',
          maxHeight: '92vh',
          background: 'linear-gradient(180deg, #0e1322 0%, #090c15 100%)',
          border: '1px solid #1e293b',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 30px rgba(99, 102, 241, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: 900,
                fontSize: '1.1rem',
                boxShadow: '0 0 15px rgba(99, 102, 241, 0.4)'
              }}
            >
              +
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                  {formData.id ? 'Edit Quantitative Strategy' : 'Strategy Builder'}
                </h2>
                <span
                  style={{
                    background: formData.is_enabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                    color: formData.is_enabled ? '#34d399' : '#facc15',
                    border: formData.is_enabled ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(234, 179, 8, 0.3)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    letterSpacing: '0.04em'
                  }}
                >
                  {formData.is_enabled ? 'STATUS: ACTIVE' : 'STATUS: DRAFT'}
                </span>
                {formData.version && (
                  <span
                    style={{
                      background: 'rgba(99, 102, 241, 0.15)',
                      color: '#a5b4fc',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '0.68rem',
                      fontWeight: 800
                    }}
                  >
                    v{formData.version}
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                Design custom systematic trading rules without modifying application source code.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.4rem',
              cursor: 'pointer',
              padding: '6px 10px',
              borderRadius: '8px',
              lineHeight: 1
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 24px',
            borderBottom: '1px solid #1e293b',
            background: 'rgba(15, 23, 42, 0.6)',
            overflowX: 'auto'
          }}
        >
          {[
            { id: 'basic', label: '1. Basic Info & Category' },
            { id: 'indicators', label: `2. Indicators (${formData.indicators.length})` },
            { id: 'conditions', label: `3. BUY / SELL Rules (${formData.buy_conditions.length + formData.sell_conditions.length})` },
            { id: 'risk', label: '4. Risk & Targets' },
            { id: 'advanced', label: '5. Advanced Filters' },
            { id: 'preview', label: '6. Strategy Preview' }
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  fontSize: '0.75rem',
                  fontWeight: isActive ? 800 : 600,
                  background: isActive ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                  color: isActive ? '#c7d2fe' : '#64748b',
                  border: isActive ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Error Alert Bar */}
        {errorMessage && (
          <div
            style={{
              padding: '10px 24px',
              background: 'rgba(239, 68, 68, 0.15)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: '0.78rem',
              fontWeight: 600,
              whiteSpace: 'pre-line'
            }}
          >
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Tab Body Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* TAB 1: BASIC INFORMATION */}
          {activeTab === 'basic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: '6px' }}>
                    STRATEGY NAME *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Nifty Supertrend 15m Momentum Squeeze"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: '6px' }}>
                    STRATEGY CATEGORY *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      fontSize: '0.85rem'
                    }}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: '6px' }}>
                  DESCRIPTION
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  placeholder="Concise overview of the quantitative thesis and market conditions where this strategy thrives."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '0.82rem',
                    resize: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: '6px' }}>
                  TRADING OBJECTIVE
                </label>
                <input
                  type="text"
                  value={formData.trading_objective}
                  onChange={(e) => setFormData({ ...formData, trading_objective: e.target.value })}
                  placeholder="e.g. Capture intraday directional momentum continuation with tight risk-to-reward."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              {/* Instruments Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: '8px' }}>
                  APPLICABLE INSTRUMENTS (STOCKS & F&O) *
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {INSTRUMENT_OPTIONS.map((inst) => {
                    const isSelected = formData.supported_instruments.includes(inst);
                    return (
                      <button
                        type="button"
                        key={inst}
                        onClick={() => toggleInstrument(inst)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '8px',
                          fontSize: '0.76rem',
                          fontWeight: isSelected ? 800 : 600,
                          background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                          border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                          color: isSelected ? '#38bdf8' : '#94a3b8',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {isSelected ? '✓ ' : '+ '}
                        {inst}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Supported Timeframes */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: '8px' }}>
                  SUPPORTED TIMEFRAMES *
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {TIMEFRAME_OPTIONS.map((tf) => {
                    const isSelected = formData.supported_timeframes.includes(tf);
                    return (
                      <button
                        type="button"
                        key={tf}
                        onClick={() => toggleTimeframe(tf)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '0.76rem',
                          fontWeight: isSelected ? 800 : 600,
                          background: isSelected ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                          border: isSelected ? '1px solid #a855f7' : '1px solid rgba(255, 255, 255, 0.08)',
                          color: isSelected ? '#c084fc' : '#94a3b8',
                          cursor: 'pointer'
                        }}
                      >
                        {isSelected ? '✓ ' : ''}
                        {tf}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: INDICATORS CONFIGURATOR */}
          {activeTab === 'indicators' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.4)',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ flex: '1 1 250px' }}>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', marginBottom: '4px' }}>
                    SELECT TECHNICAL INDICATOR
                  </label>
                  <select
                    value={selectedIndType}
                    onChange={(e) => setSelectedIndType(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      fontSize: '0.8rem'
                    }}
                  >
                    {AVAILABLE_INDICATORS.map((ind) => (
                      <option key={ind.name} value={ind.name}>
                        {ind.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ width: '100px' }}>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', marginBottom: '4px' }}>
                    PERIOD
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={indPeriod}
                    onChange={(e) => setIndPeriod(parseInt(e.target.value) || 14)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      fontSize: '0.8rem'
                    }}
                  />
                </div>

                <div style={{ alignSelf: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleAddIndicator}
                    style={{
                      background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '9px 18px',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 0 12px rgba(99, 102, 241, 0.35)'
                    }}
                  >
                    + Add Indicator
                  </button>
                </div>
              </div>

              {/* Active Indicator List */}
              <div>
                <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: '#94a3b8', margin: '0 0 10px', textTransform: 'uppercase' }}>
                  Active Configured Indicators ({formData.indicators.length})
                </h4>

                {formData.indicators.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '0.8rem', border: '1px dashed #334155', borderRadius: '8px' }}>
                    No indicators configured yet. Add your first indicator above.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {formData.indicators.map((ind, index) => (
                      <div
                        key={index}
                        style={{
                          background: 'rgba(15, 23, 42, 0.7)',
                          border: '1px solid #1e293b',
                          borderRadius: '10px',
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span
                            style={{
                              background: 'rgba(99, 102, 241, 0.2)',
                              color: '#a5b4fc',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 800
                            }}
                          >
                            {ind.symbol}
                          </span>
                          <div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc' }}>
                              {ind.name}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              {ind.purpose}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveIndicator(index)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            color: '#f87171',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: BUY & SELL CONDITIONS BUILDER */}
          {activeTab === 'conditions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* BUY Conditions Section */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399' }} />
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#34d399', margin: 0, textTransform: 'uppercase' }}>
                      BUY Entry Conditions (Long Signals)
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddBuyConditionRow}
                    style={{
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      color: '#34d399',
                      borderRadius: '6px',
                      padding: '4px 12px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    + Add BUY Condition
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {formData.buy_conditions.map((cond, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: 'rgba(6, 78, 59, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                      }}
                    >
                      <span style={{ fontSize: '0.78rem', color: '#e2e8f0', fontFamily: 'monospace' }}>
                        {idx + 1}. {cond}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveBuyConditionRow(String(idx), idx)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#f87171',
                          fontSize: '0.78rem',
                          cursor: 'pointer'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* SELL Conditions Section */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f87171' }} />
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f87171', margin: 0, textTransform: 'uppercase' }}>
                      SELL Entry Conditions (Short Signals)
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddSellConditionRow}
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      color: '#f87171',
                      borderRadius: '6px',
                      padding: '4px 12px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    + Add SELL Condition
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {formData.sell_conditions.map((cond, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: 'rgba(127, 29, 29, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                      }}
                    >
                      <span style={{ fontSize: '0.78rem', color: '#e2e8f0', fontFamily: 'monospace' }}>
                        {idx + 1}. {cond}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSellConditionRow(String(idx), idx)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#f87171',
                          fontSize: '0.78rem',
                          cursor: 'pointer'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: RISK MANAGEMENT & TARGETS */}
          {activeTab === 'risk' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', marginBottom: '6px' }}>
                    ENTRY METHODOLOGY
                  </label>
                  <select
                    value={formData.risk_management.entry_type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        risk_management: { ...formData.risk_management, entry_type: e.target.value }
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      fontSize: '0.8rem'
                    }}
                  >
                    <option value="Market on Candle Close">Market on Candle Close (Confirmed Bar)</option>
                    <option value="Limit at Signal Breakout">Limit at Signal Breakout</option>
                    <option value="Pullback Limit Order">Pullback Limit Order</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', marginBottom: '6px' }}>
                    STOP-LOSS METHODOLOGY
                  </label>
                  <select
                    value={formData.risk_management.stop_loss_type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        risk_management: { ...formData.risk_management, stop_loss_type: e.target.value }
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      fontSize: '0.8rem'
                    }}
                  >
                    <option value="ATR Multiplier (1.5x)">ATR Multiplier (Dynamic Volatility)</option>
                    <option value="Swing Low / High Invalidation">Swing Low / High Invalidation</option>
                    <option value="Supertrend Band Trailing">Supertrend Band Trailing</option>
                    <option value="Fixed Capital Percentage (1.5%)">Fixed Capital Percentage (1.5%)</option>
                  </select>
                </div>
              </div>

              {/* Target Multipliers */}
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px' }}>
                <h4 style={{ fontSize: '0.78rem', fontWeight: 800, color: '#94a3b8', margin: '0 0 12px', textTransform: 'uppercase' }}>
                  Target Multipliers & Risk / Reward
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.70rem', color: '#64748b', marginBottom: '4px' }}>
                      TARGET 1 (R:R)
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      min={0.5}
                      value={formData.risk_management.target_1_ratio}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          risk_management: { ...formData.risk_management, target_1_ratio: parseFloat(e.target.value) || 1.5 }
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '8px',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#34d399',
                        fontWeight: 800
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.70rem', color: '#64748b', marginBottom: '4px' }}>
                      TARGET 2 (R:R)
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      min={1.0}
                      value={formData.risk_management.target_2_ratio}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          risk_management: { ...formData.risk_management, target_2_ratio: parseFloat(e.target.value) || 2.5 }
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '8px',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#38bdf8',
                        fontWeight: 800
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.70rem', color: '#64748b', marginBottom: '4px' }}>
                      TARGET 3 (R:R)
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      min={1.5}
                      value={formData.risk_management.target_3_ratio}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          risk_management: { ...formData.risk_management, target_3_ratio: parseFloat(e.target.value) || 4.0 }
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '8px',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#a855f7',
                        fontWeight: 800
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.70rem', color: '#64748b', marginBottom: '4px' }}>
                      MAX RISK / TRADE (%)
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      min={0.1}
                      max={5.0}
                      value={formData.risk_management.max_risk_per_trade_pct}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          risk_management: { ...formData.risk_management, max_risk_per_trade_pct: parseFloat(e.target.value) || 1.5 }
                        })
                      }
                      style={{
                        width: '100%',
                        padding: '8px',
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#f87171',
                        fontWeight: 800
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: ADVANCED SETTINGS */}
          {activeTab === 'advanced' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <label
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid #1e293b',
                    borderRadius: '10px',
                    padding: '14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.advanced_settings.candle_close_confirmation}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        advanced_settings: { ...formData.advanced_settings, candle_close_confirmation: e.target.checked }
                      })
                    }
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.80rem', fontWeight: 800, color: '#f8fafc' }}>
                      Candle-Close Confirmation
                    </div>
                    <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: '2px' }}>
                      Prevents intra-candle false alarms by strictly requiring bar closure before signal generation.
                    </div>
                  </div>
                </label>

                <label
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid #1e293b',
                    borderRadius: '10px',
                    padding: '14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.advanced_settings.higher_timeframe_confirmation}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        advanced_settings: { ...formData.advanced_settings, higher_timeframe_confirmation: e.target.checked }
                      })
                    }
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.80rem', fontWeight: 800, color: '#f8fafc' }}>
                      Higher-Timeframe Trend Confluence
                    </div>
                    <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: '2px' }}>
                      Requires 1H HTF 21-EMA slope alignment before admitting 15m entry signals.
                    </div>
                  </div>
                </label>

                <label
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid #1e293b',
                    borderRadius: '10px',
                    padding: '14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.advanced_settings.volume_filter}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        advanced_settings: { ...formData.advanced_settings, volume_filter: e.target.checked }
                      })
                    }
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.80rem', fontWeight: 800, color: '#f8fafc' }}>
                      Institutional Volume Surge Filter
                    </div>
                    <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: '2px' }}>
                      Enforces volume threshold &gt;1.5x 20-period Volume SMA to filter low-liquidity spikes.
                    </div>
                  </div>
                </label>

                <label
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid #1e293b',
                    borderRadius: '10px',
                    padding: '14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.advanced_settings.duplicate_signal_prevention}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        advanced_settings: { ...formData.advanced_settings, duplicate_signal_prevention: e.target.checked }
                      })
                    }
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.80rem', fontWeight: 800, color: '#f8fafc' }}>
                      Duplicate Signal Prevention
                    </div>
                    <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: '2px' }}>
                      Enforces a 3-bar cooldown period to avoid duplicate trade signals on the same ticker.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* TAB 6: STRATEGY PREVIEW */}
          {activeTab === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Validation Status Badge */}
              <div
                style={{
                  background: isValidForActivation ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                  border: isValidForActivation ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(234, 179, 8, 0.3)',
                  borderRadius: '10px',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: isValidForActivation ? '#34d399' : '#facc15' }}>
                    {isValidForActivation ? '✓ STRATEGY FULLY OPERATIONAL & READY TO ACTIVATE' : '⚠️ STRATEGY INCOMPLETE — CAN ONLY BE SAVED AS DRAFT'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                    {isValidForActivation
                      ? 'All required parameters, indicators, and execution criteria are verified.'
                      : `Missing: ${validationErrors.join(' • ')}`}
                  </div>
                </div>

                <span
                  style={{
                    background: isValidForActivation ? '#10b981' : '#eab308',
                    color: '#000000',
                    fontSize: '0.70rem',
                    fontWeight: 900,
                    padding: '3px 10px',
                    borderRadius: '20px'
                  }}
                >
                  {isValidForActivation ? 'READY' : 'DRAFT'}
                </span>
              </div>

              {/* Readable Summary Card */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}
              >
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 4px' }}>
                    {formData.name || 'Untitled Strategy'}
                  </h3>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.72rem', color: '#818cf8', fontWeight: 700 }}>
                      Category: {formData.category}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>•</span>
                    <span style={{ fontSize: '0.72rem', color: '#38bdf8' }}>
                      Instruments: {formData.supported_instruments.join(', ') || 'None'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>•</span>
                    <span style={{ fontSize: '0.72rem', color: '#a855f7' }}>
                      Timeframes: {formData.supported_timeframes.join(', ') || 'None'}
                    </span>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #1e293b', paddingTop: '12px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Configured Indicators ({formData.indicators.length})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {formData.indicators.map((ind, i) => (
                      <span key={i} style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#c7d2fe', padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700 }}>
                        {ind.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', borderTop: '1px solid #1e293b', paddingTop: '12px' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#34d399', textTransform: 'uppercase', marginBottom: '4px' }}>
                      BUY Conditions ({formData.buy_conditions.length})
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.75rem', color: '#cbd5e1' }}>
                      {formData.buy_conditions.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#f87171', textTransform: 'uppercase', marginBottom: '4px' }}>
                      SELL Conditions ({formData.sell_conditions.length})
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.75rem', color: '#cbd5e1' }}>
                      {formData.sell_conditions.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #1e293b', paddingTop: '12px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: '0.70rem', color: '#64748b' }}>Stop-Loss: </span>
                    <span style={{ fontSize: '0.75rem', color: '#f8fafc', fontWeight: 700 }}>{formData.risk_management.stop_loss_type}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.70rem', color: '#64748b' }}>Targets: </span>
                    <span style={{ fontSize: '0.75rem', color: '#f8fafc', fontWeight: 700 }}>
                      T1: {formData.risk_management.target_1_ratio}R | T2: {formData.risk_management.target_2_ratio}R | T3: {formData.risk_management.target_3_ratio}R
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.70rem', color: '#64748b' }}>Risk/Trade: </span>
                    <span style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 700 }}>{formData.risk_management.max_risk_per_trade_pct}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: 'transparent',
              border: '1px solid #334155',
              color: '#94a3b8',
              borderRadius: '8px',
              padding: '9px 18px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSave(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#e2e8f0',
                borderRadius: '8px',
                padding: '9px 18px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Save as Draft
            </button>

            <button
              type="button"
              disabled={isSubmitting || !isValidForActivation}
              onClick={() => handleSave(true)}
              style={{
                background: isValidForActivation
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : 'rgba(16, 185, 129, 0.2)',
                border: isValidForActivation ? '1px solid #34d399' : '1px solid rgba(16, 185, 129, 0.3)',
                color: isValidForActivation ? '#ffffff' : '#64748b',
                borderRadius: '8px',
                padding: '9px 22px',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: isValidForActivation ? 'pointer' : 'not-allowed',
                boxShadow: isValidForActivation ? '0 0 16px rgba(16, 185, 129, 0.4)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              {isSubmitting ? 'Saving...' : formData.id ? 'Save & Update Strategy' : 'Save & Activate Strategy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

