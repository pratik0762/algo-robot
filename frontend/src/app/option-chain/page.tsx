'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  Layers,
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ShieldCheck,
  Menu,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Sliders,
  BarChart2,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  Zap,
  Save,
  Download,
  FolderOpen,
  X,
  Target,
  Percent,
  Compass,
  ArrowUpDown
} from 'lucide-react';
import { getApiBase } from '@/config/api';
import IndicesBarometer from '@/components/IndicesBarometer';

const NavigationDrawer = dynamic(() => import('@/components/NavigationDrawer'), {
  ssr: false,
  loading: () => null
});

// Types & Interfaces
interface Leg {
  id?: string;
  action: 'BUY' | 'SELL';
  option_type: 'CE' | 'PE';
  strike: number;
  offset_steps?: number;
  lots: number;
  lot_size?: number;
  premium: number;
  name?: string;
}

interface PredefinedTemplate {
  id: string;
  name: string;
  category: string;
  outlook: string;
  description: string;
  legs: Leg[];
}

interface PayoffPoint {
  spot: number;
  pnl: number;
  is_spot?: boolean;
}

interface StrategyAnalysis {
  status: string;
  symbol: string;
  spot_price: number;
  lot_size: number;
  legs: Leg[];
  net_premium_total: number;
  premium_type: string;
  is_credit: boolean;
  max_profit: number | null;
  max_profit_str: string;
  max_loss: number | null;
  max_loss_str: string;
  breakevens: number[];
  risk_reward_ratio: string;
  probability_of_profit_pct: number;
  estimated_margin_required: number;
  total_investment: number;
  payoff_curve: PayoffPoint[];
}

interface OptionStrikeRow {
  strike: number;
  is_atm: boolean;
  call: {
    oi: number;
    change_oi: number;
    volume: number;
    iv: number;
    ltp: number;
    change_pct: number;
    bid: number;
    ask: number;
    delta: number;
    theta: number;
    gamma: number;
    vega: number;
    moneyness: string;
    buildup: string;
  };
  put: {
    oi: number;
    change_oi: number;
    volume: number;
    iv: number;
    ltp: number;
    change_pct: number;
    bid: number;
    ask: number;
    delta: number;
    theta: number;
    gamma: number;
    vega: number;
    moneyness: string;
    buildup: string;
  };
}

interface OptionChainData {
  status: string;
  symbol: string;
  name: string;
  instrument_type: string;
  lot_size: number;
  interval: number;
  spot_price: number;
  change_pct: number;
  atm_strike: number;
  selected_expiry: string;
  expiries: string[];
  days_to_expiry: number;
  summary: {
    pcr: number;
    pcr_sentiment: string;
    max_pain: number;
    total_call_oi: number;
    total_put_oi: number;
    total_call_volume: number;
    total_put_volume: number;
    highest_call_oi_strike: number;
    highest_put_oi_strike: number;
  };
  chain: OptionStrikeRow[];
  last_updated: string;
}

interface FOInstrument {
  symbol: string;
  name: string;
  type: string;
  lot_size: number;
  interval: number;
  base_price: number;
}

interface SavedStrategy {
  id: string;
  name: string;
  symbol: string;
  created_at: string;
  notes?: string;
  legs: Leg[];
}

export default function OptionChainPage() {
  const [navDrawerOpen, setNavDrawerOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'chain' | 'builder' | 'saved'>('chain');

  // Instruments & Search State
  const [instruments, setInstruments] = useState<FOInstrument[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('NIFTY');
  const [symbolSearchQuery, setSymbolSearchQuery] = useState<string>('');
  const [symbolDropdownOpen, setSymbolDropdownOpen] = useState<boolean>(false);

  // Expiry & Chain View Configuration
  const [expiries, setExpiries] = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [strikeRange, setStrikeRange] = useState<number>(15);
  const [sideFilter, setSideFilter] = useState<'BOTH' | 'CALLS' | 'PUTS'>('BOTH');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(5); // 0 = off, 2, 5, 10
  const [sortBy, setSortBy] = useState<string>('strike');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Live Data & Loading
  const [chainData, setChainData] = useState<OptionChainData | null>(null);
  const [isLoadingChain, setIsLoadingChain] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [chainError, setChainError] = useState<string | null>(null);

  // Strategy Builder State
  const [builderLegs, setBuilderLegs] = useState<Leg[]>([]);
  const [templates, setTemplates] = useState<PredefinedTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [analysis, setAnalysis] = useState<StrategyAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Saved Strategies State
  const [savedStrategies, setSavedStrategies] = useState<SavedStrategy[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState<boolean>(false);
  const [newStrategyName, setNewStrategyName] = useState<string>('');
  const [newStrategyNotes, setNewStrategyNotes] = useState<string>('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Chart Tooltip Hover State
  const [hoveredPoint, setHoveredPoint] = useState<PayoffPoint | null>(null);

  // 1. Fetch Instruments List on Load
  useEffect(() => {
    async function fetchInstruments() {
      try {
        const res = await fetch(`${getApiBase()}/api/options/instruments`);
        if (res.ok) {
          const json = await res.json();
          if (json.instruments) {
            setInstruments(json.instruments);
          }
        }
      } catch (err) {
        console.error('Error fetching F&O instruments:', err);
      }
    }
    fetchInstruments();
  }, []);

  // 2. Fetch Templates when selected symbol changes
  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch(`${getApiBase()}/api/options/templates?symbol=${selectedSymbol}`);
        if (res.ok) {
          const json = await res.json();
          if (json.templates) {
            setTemplates(json.templates);
          }
        }
      } catch (err) {
        console.error('Error fetching strategy templates:', err);
      }
    }
    fetchTemplates();
  }, [selectedSymbol]);

  // 3. Fetch Saved Strategies
  const fetchSavedStrategies = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/options/saved-strategies`);
      if (res.ok) {
        const json = await res.json();
        if (json.strategies) {
          setSavedStrategies(json.strategies);
        }
      }
    } catch (err) {
      console.error('Error fetching saved strategies:', err);
    }
  }, []);

  useEffect(() => {
    fetchSavedStrategies();
  }, [fetchSavedStrategies]);

  // 4. Fetch Option Chain Data
  const fetchOptionChain = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoadingChain(true);
    setIsRefreshing(true);
    setChainError(null);

    try {
      let url = `${getApiBase()}/api/options/chain?symbol=${encodeURIComponent(selectedSymbol)}&strike_range=${strikeRange}`;
      if (selectedExpiry) {
        url += `&expiry=${encodeURIComponent(selectedExpiry)}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch option chain: ${res.statusText}`);
      }
      const data: OptionChainData = await res.json();
      setChainData(data);
      if (data.expiries && data.expiries.length > 0 && !selectedExpiry) {
        setSelectedExpiry(data.selected_expiry || data.expiries[0]);
      }
      setExpiries(data.expiries || []);
    } catch (err: any) {
      setChainError(err.message || 'Error loading option chain data');
    } finally {
      setIsLoadingChain(false);
      setIsRefreshing(false);
    }
  }, [selectedSymbol, selectedExpiry, strikeRange]);

  // Initial and reactive trigger
  useEffect(() => {
    fetchOptionChain(false);
  }, [fetchOptionChain]);

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => {
      fetchOptionChain(true);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshInterval, fetchOptionChain]);

  // 5. Analyze Active Builder Strategy Legs
  const triggerAnalysis = useCallback(async (legsToAnalyze: Leg[]) => {
    if (!legsToAnalyze || legsToAnalyze.length === 0) {
      setAnalysis(null);
      return;
    }
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${getApiBase()}/api/options/strategy/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol,
          legs: legsToAnalyze,
          expiry: selectedExpiry
        })
      });
      if (res.ok) {
        const json = await res.json();
        setAnalysis(json);
      }
    } catch (err) {
      console.error('Error analyzing strategy payoff:', err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedSymbol, selectedExpiry]);

  // Trigger analysis whenever builderLegs change
  useEffect(() => {
    triggerAnalysis(builderLegs);
  }, [builderLegs, triggerAnalysis]);

  // Quick Action: Add Leg from Option Chain Table
  const handleAddLegFromChain = (strike: number, optionType: 'CE' | 'PE', action: 'BUY' | 'SELL', ltp: number) => {
    const lotSize = chainData?.lot_size || 25;
    const newLeg: Leg = {
      id: `leg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action,
      option_type: optionType,
      strike,
      lots: 1,
      lot_size: lotSize,
      premium: ltp || 10.0,
      name: `${action} ${strike} ${optionType}`
    };
    setBuilderLegs(prev => [...prev, newLeg]);
    setActiveTab('builder');
  };

  // Template Selection handler
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const tpl = templates.find(t => t.id === templateId);
    if (tpl && tpl.legs) {
      const mapped = tpl.legs.map((l, idx) => ({
        ...l,
        id: `leg_tpl_${Date.now()}_${idx}`
      }));
      setBuilderLegs(mapped);
    }
  };

  // Modify leg property
  const handleUpdateLeg = (index: number, updates: Partial<Leg>) => {
    setBuilderLegs(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      return copy;
    });
  };

  // Remove single leg
  const handleRemoveLeg = (index: number) => {
    setBuilderLegs(prev => prev.filter((_, i) => i !== index));
  };

  // Clear all legs
  const handleClearAllLegs = () => {
    setBuilderLegs([]);
    setSelectedTemplateId('');
    setAnalysis(null);
  };

  // Save Strategy Handler
  const handleSaveStrategy = async () => {
    if (!newStrategyName.trim() || builderLegs.length === 0) return;
    try {
      const payload = {
        name: newStrategyName.trim(),
        symbol: selectedSymbol,
        notes: newStrategyNotes.trim(),
        legs: builderLegs
      };
      const res = await fetch(`${getApiBase()}/api/options/saved-strategies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setSaveSuccessMsg('Strategy saved successfully to your repository!');
        fetchSavedStrategies();
        setTimeout(() => {
          setSaveSuccessMsg(null);
          setSaveModalOpen(false);
          setNewStrategyName('');
          setNewStrategyNotes('');
        }, 1200);
      }
    } catch (err) {
      console.error('Error saving strategy:', err);
    }
  };

  // Delete Saved Strategy
  const handleDeleteSavedStrategy = async (id: string) => {
    if (!confirm('Are you sure you want to delete this saved strategy?')) return;
    try {
      const res = await fetch(`${getApiBase()}/api/options/saved-strategies/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchSavedStrategies();
      }
    } catch (err) {
      console.error('Error deleting strategy:', err);
    }
  };

  // Load Saved Strategy into Builder
  const handleLoadSavedStrategy = (saved: SavedStrategy) => {
    setSelectedSymbol(saved.symbol);
    setBuilderLegs(saved.legs);
    setActiveTab('builder');
  };

  // Export Strategy as JSON
  const handleExportJSON = () => {
    if (!analysis) return;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(analysis, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${selectedSymbol}_Option_Strategy_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Filtered Instruments for Search
  const filteredInstruments = useMemo(() => {
    const q = symbolSearchQuery.trim().toUpperCase();
    if (!q) return instruments;
    return instruments.filter(inst =>
      inst.symbol.toUpperCase().includes(q) || inst.name.toUpperCase().includes(q)
    );
  }, [instruments, symbolSearchQuery]);

  // Sorted Option Chain Table Rows
  const sortedChainRows = useMemo(() => {
    if (!chainData?.chain) return [];
    const rows = [...chainData.chain];
    if (sortBy === 'strike') {
      return sortOrder === 'asc' ? rows : rows.reverse();
    }
    return rows.sort((a, b) => {
      let valA = 0;
      let valB = 0;
      if (sortBy === 'call_oi') { valA = a.call.oi; valB = b.call.oi; }
      else if (sortBy === 'put_oi') { valA = a.put.oi; valB = b.put.oi; }
      else if (sortBy === 'call_vol') { valA = a.call.volume; valB = b.call.volume; }
      else if (sortBy === 'put_vol') { valA = a.put.volume; valB = b.put.volume; }
      else if (sortBy === 'call_ltp') { valA = a.call.ltp; valB = b.call.ltp; }
      else if (sortBy === 'put_ltp') { valA = a.put.ltp; valB = b.put.ltp; }
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
  }, [chainData, sortBy, sortOrder]);

  const toggleSort = (colKey: string) => {
    if (sortBy === colKey) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(colKey);
      setSortOrder('desc');
    }
  };

  // Predefined Template Categories
  const categorizedTemplates = useMemo(() => {
    const groups: { [cat: string]: PredefinedTemplate[] } = {
      'Bullish': [],
      'Bearish': [],
      'Neutral': [],
      'Advanced': []
    };
    templates.forEach(t => {
      const cat = t.category || 'Advanced';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    });
    return groups;
  }, [templates]);

  // Interactive Payoff Chart Scaling
  const chartBounds = useMemo(() => {
    if (!analysis || !analysis.payoff_curve || analysis.payoff_curve.length === 0) {
      return null;
    }
    const points = analysis.payoff_curve;
    const pnls = points.map(p => p.pnl);
    const spots = points.map(p => p.spot);

    const minPnl = Math.min(0, ...pnls);
    const maxPnl = Math.max(0, ...pnls);
    const pnlRange = Math.max(100, maxPnl - minPnl);

    const minSpot = Math.min(...spots);
    const maxSpot = Math.max(...spots);
    const spotRange = Math.max(1, maxSpot - minSpot);

    return { minPnl, maxPnl, pnlRange, minSpot, maxSpot, spotRange, points };
  }, [analysis]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}>
      {/* Top Benchmark Indices Barometer */}
      <IndicesBarometer />

      {/* Main Container */}
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '20px 24px 80px 24px' }}>
        {/* Navigation Breadcrumbs & Drawer Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <button
              onClick={() => setNavDrawerOpen(true)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '6px 10px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 500,
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
              }}
            >
              <Menu size={14} color="#818cf8" />
              <span>Menu</span>
            </button>
            <ChevronRight size={14} color="var(--border-subtle)" />
            <Link href="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Dashboard</Link>
            <ChevronRight size={14} color="var(--border-subtle)" />
            <span style={{ color: 'var(--text-muted)' }}>Derivatives</span>
            <ChevronRight size={14} color="var(--border-subtle)" />
            <span style={{ color: '#818cf8', fontWeight: 600 }}>Option Chain & Strategy Builder</span>
          </div>

          {/* Real-time Status Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '0.74rem',
              color: '#10b981',
              fontWeight: 600
            }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
              NSE F&O LIVE FEED
            </div>
            {chainData?.last_updated && (
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Updated: {chainData.last_updated.split(' ')[1] || chainData.last_updated}
              </span>
            )}
          </div>
        </div>

        {/* Page Title & Main Bar */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '16px',
          padding: '20px 24px',
          marginBottom: '20px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(99, 102, 241, 0.35)'
              }}>
                <Layers size={24} color="#ffffff" />
              </div>
              <div>
                <h1 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  Option Chain & Strategy Builder
                  <span style={{
                    fontSize: '0.68rem',
                    background: 'rgba(99, 102, 241, 0.2)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    color: '#a5b4fc',
                    borderRadius: '6px',
                    padding: '2px 8px',
                    fontWeight: 600
                  }}>
                    SEBI MULTI-LEG HEDGED
                  </span>
                </h1>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Real-time Call/Put Open Interest, Greeks, Max Pain, PCR, Buildup tags, and professional multi-leg strategy payoff analysis.
                </p>
              </div>
            </div>

            {/* View Mode Switcher Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(15, 23, 42, 0.8)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setActiveTab('chain')}
                style={{
                  background: activeTab === 'chain' ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'transparent',
                  color: activeTab === 'chain' ? '#ffffff' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                  boxShadow: activeTab === 'chain' ? '0 2px 10px rgba(99, 102, 241, 0.35)' : 'none'
                }}
              >
                <Layers size={15} />
                Option Chain Table
              </button>

              <button
                onClick={() => setActiveTab('builder')}
                style={{
                  background: activeTab === 'builder' ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'transparent',
                  color: activeTab === 'builder' ? '#ffffff' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                  boxShadow: activeTab === 'builder' ? '0 2px 10px rgba(99, 102, 241, 0.35)' : 'none'
                }}
              >
                <Sliders size={15} />
                Strategy Builder & Payoff
                {builderLegs.length > 0 && (
                  <span style={{
                    background: '#10b981',
                    color: '#ffffff',
                    fontSize: '0.68rem',
                    borderRadius: '10px',
                    padding: '1px 6px',
                    fontWeight: 700
                  }}>
                    {builderLegs.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('saved')}
                style={{
                  background: activeTab === 'saved' ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'transparent',
                  color: activeTab === 'saved' ? '#ffffff' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                  boxShadow: activeTab === 'saved' ? '0 2px 10px rgba(99, 102, 241, 0.35)' : 'none'
                }}
              >
                <FolderOpen size={15} />
                Saved Strategies
                {savedStrategies.length > 0 && (
                  <span style={{
                    background: 'rgba(255, 255, 255, 0.15)',
                    color: '#e2e8f0',
                    fontSize: '0.68rem',
                    borderRadius: '10px',
                    padding: '1px 6px',
                    fontWeight: 600
                  }}>
                    {savedStrategies.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Quick Instrument & Expiry Control Toolbar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
            gap: '14px'
          }}>
            {/* Instrument Searchable Picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setSymbolDropdownOpen(prev => !prev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    color: '#ffffff',
                    fontSize: '0.86rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    minWidth: '180px',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Target size={15} color="#818cf8" />
                    <span>{selectedSymbol}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                      ({chainData?.name || selectedSymbol})
                    </span>
                  </div>
                  <ChevronDown size={14} color="var(--text-muted)" />
                </button>

                {/* Dropdown Menu */}
                {symbolDropdownOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '6px',
                    width: '320px',
                    maxHeight: '380px',
                    background: '#0f172a',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    borderRadius: '12px',
                    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6)',
                    zIndex: 999,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <div style={{ padding: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '6px',
                        padding: '6px 10px'
                      }}>
                        <Search size={14} color="var(--text-muted)" />
                        <input
                          type="text"
                          placeholder="Search NIFTY, RELIANCE, TCS..."
                          value={symbolSearchQuery}
                          onChange={e => setSymbolSearchQuery(e.target.value)}
                          autoFocus
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#ffffff',
                            fontSize: '0.82rem',
                            outline: 'none',
                            width: '100%'
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ overflowY: 'auto', maxHeight: '310px', padding: '6px' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', padding: '4px 8px', fontWeight: 700, letterSpacing: '0.05em' }}>
                        POPULAR INDICES & F&O EQUITIES ({filteredInstruments.length})
                      </div>
                      {filteredInstruments.map(inst => (
                        <div
                          key={inst.symbol}
                          onClick={() => {
                            setSelectedSymbol(inst.symbol);
                            setSelectedExpiry('');
                            setSymbolDropdownOpen(false);
                            setSymbolSearchQuery('');
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: selectedSymbol === inst.symbol ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                            color: selectedSymbol === inst.symbol ? '#818cf8' : 'var(--text-primary)',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            transition: 'background 0.15s'
                          }}
                          onMouseEnter={e => {
                            if (selectedSymbol !== inst.symbol) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                          }}
                          onMouseLeave={e => {
                            if (selectedSymbol !== inst.symbol) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 700 }}>{inst.symbol}</span>
                            <span style={{ marginLeft: '6px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {inst.name}
                            </span>
                          </div>
                          <span style={{
                            fontSize: '0.68rem',
                            background: inst.type === 'INDEX' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                            color: inst.type === 'INDEX' ? '#34d399' : '#a5b4fc',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            Lot: {inst.lot_size}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Popular Instrument Pills */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK'].map(sym => (
                  <button
                    key={sym}
                    onClick={() => {
                      if (selectedSymbol !== sym) {
                        setSelectedSymbol(sym);
                        setSelectedExpiry('');
                      }
                    }}
                    style={{
                      background: selectedSymbol === sym ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                      border: `1px solid ${selectedSymbol === sym ? '#6366f1' : 'var(--border-subtle)'}`,
                      borderRadius: '6px',
                      padding: '4px 10px',
                      color: selectedSymbol === sym ? '#ffffff' : 'var(--text-secondary)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            </div>

            {/* Expiry Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>EXPIRY:</span>
              <select
                value={selectedExpiry}
                onChange={e => setSelectedExpiry(e.target.value)}
                style={{
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  color: '#ffffff',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                {expiries.map(exp => (
                  <option key={exp} value={exp} style={{ background: '#0f172a', color: '#ffffff' }}>
                    {exp} {exp === expiries[0] ? '(Nearest / Current)' : ''}
                  </option>
                ))}
              </select>

              {chainData?.days_to_expiry !== undefined && (
                <span style={{
                  fontSize: '0.72rem',
                  background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  color: '#a5b4fc',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontWeight: 600
                }}>
                  {chainData.days_to_expiry} DTE
                </span>
              )}
            </div>

            {/* Controls: Range, CE/PE Filter, Auto-refresh & Manual Refresh */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Range Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>STRIKES:</span>
                <select
                  value={strikeRange}
                  onChange={e => setStrikeRange(Number(e.target.value))}
                  style={{
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '5px 8px',
                    color: 'var(--text-secondary)',
                    fontSize: '0.76rem',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value={10}>ATM ± 10</option>
                  <option value={15}>ATM ± 15</option>
                  <option value={20}>ATM ± 20</option>
                  <option value={30}>ATM ± 30</option>
                </select>
              </div>

              {/* CE/PE Filter */}
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '6px', padding: '2px' }}>
                <button
                  onClick={() => setSideFilter('BOTH')}
                  style={{
                    background: sideFilter === 'BOTH' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                    color: sideFilter === 'BOTH' ? '#ffffff' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Both
                </button>
                <button
                  onClick={() => setSideFilter('CALLS')}
                  style={{
                    background: sideFilter === 'CALLS' ? 'rgba(16, 185, 129, 0.3)' : 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                    color: sideFilter === 'CALLS' ? '#10b981' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Calls
                </button>
                <button
                  onClick={() => setSideFilter('PUTS')}
                  style={{
                    background: sideFilter === 'PUTS' ? 'rgba(239, 68, 68, 0.3)' : 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                    color: sideFilter === 'PUTS' ? '#ef4444' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Puts
                </button>
              </div>

              {/* Refresh Interval Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <select
                  value={autoRefreshInterval}
                  onChange={e => setAutoRefreshInterval(Number(e.target.value))}
                  style={{
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '5px 8px',
                    color: 'var(--text-secondary)',
                    fontSize: '0.76rem',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value={0}>Refresh: Off</option>
                  <option value={2}>Refresh: 2s</option>
                  <option value={5}>Refresh: 5s</option>
                  <option value={10}>Refresh: 10s</option>
                </select>

                <button
                  onClick={() => fetchOptionChain(false)}
                  disabled={isRefreshing}
                  style={{
                    background: 'rgba(99, 102, 241, 0.15)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    color: '#818cf8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.76rem',
                    fontWeight: 600
                  }}
                  title="Manual refresh option chain data"
                >
                  <RefreshCw size={13} className={isRefreshing ? 'spin' : ''} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Derivative Pulse Barometer (Key Summary Metrics) */}
        {chainData && chainData.summary && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            marginBottom: '20px'
          }}>
            {/* Spot Price Card */}
            <div style={{
              background: 'rgba(18, 24, 38, 0.75)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '14px 16px'
            }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>
                UNDERLYING SPOT
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
                <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff' }}>
                  ₹{chainData.spot_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span style={{
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: chainData.change_pct >= 0 ? '#10b981' : '#ef4444',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  {chainData.change_pct >= 0 ? '+' : ''}{chainData.change_pct}%
                </span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Lot: {chainData.lot_size} | Interval: {chainData.interval}
              </div>
            </div>

            {/* ATM Strike Card */}
            <div style={{
              background: 'rgba(18, 24, 38, 0.75)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: '12px',
              padding: '14px 16px'
            }}>
              <div style={{ fontSize: '0.72rem', color: '#c084fc', fontWeight: 600, letterSpacing: '0.04em' }}>
                ATM STRIKE
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff', marginTop: '4px' }}>
                {chainData.atm_strike}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Nearest at-the-money
              </div>
            </div>

            {/* PCR Card */}
            <div style={{
              background: 'rgba(18, 24, 38, 0.75)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '14px 16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>
                  PUT-CALL RATIO (PCR)
                </span>
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  borderRadius: '4px',
                  padding: '1px 6px',
                  background: chainData.summary.pcr_sentiment === 'BULLISH' ? 'rgba(16, 185, 129, 0.2)' : chainData.summary.pcr_sentiment === 'BEARISH' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  color: chainData.summary.pcr_sentiment === 'BULLISH' ? '#10b981' : chainData.summary.pcr_sentiment === 'BEARISH' ? '#ef4444' : '#f59e0b'
                }}>
                  {chainData.summary.pcr_sentiment}
                </span>
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff', marginTop: '4px' }}>
                {chainData.summary.pcr}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Total Put OI / Call OI
              </div>
            </div>

            {/* Max Pain Strike Card */}
            <div style={{
              background: 'rgba(18, 24, 38, 0.75)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '12px',
              padding: '14px 16px'
            }}>
              <div style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600, letterSpacing: '0.04em' }}>
                MAX PAIN STRIKE
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff', marginTop: '4px' }}>
                {chainData.summary.max_pain}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Min Option Writer Loss
              </div>
            </div>

            {/* Highest Call OI (Major Resistance) */}
            <div style={{
              background: 'rgba(18, 24, 38, 0.75)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '12px',
              padding: '14px 16px'
            }}>
              <div style={{ fontSize: '0.72rem', color: '#f87171', fontWeight: 600, letterSpacing: '0.04em' }}>
                MAJOR RESISTANCE (CALL OI)
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff', marginTop: '4px' }}>
                {chainData.summary.highest_call_oi_strike}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Highest Call OI accumulation
              </div>
            </div>

            {/* Highest Put OI (Major Support) */}
            <div style={{
              background: 'rgba(18, 24, 38, 0.75)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '12px',
              padding: '14px 16px'
            }}>
              <div style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 600, letterSpacing: '0.04em' }}>
                MAJOR SUPPORT (PUT OI)
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff', marginTop: '4px' }}>
                {chainData.summary.highest_put_oi_strike}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Highest Put OI accumulation
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: OPTION CHAIN TABLE VIEW */}
        {activeTab === 'chain' && (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            {/* Table Header Bar */}
            <div style={{
              padding: '14px 20px',
              background: 'rgba(15, 23, 42, 0.95)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#ffffff' }}>
                  {selectedSymbol} Option Chain Matrix ({selectedExpiry})
                </span>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Total Call OI: <strong style={{ color: '#f87171' }}>{chainData?.summary.total_call_oi.toLocaleString()}</strong> |
                  Total Put OI: <strong style={{ color: '#34d399' }}>{chainData?.summary.total_put_oi.toLocaleString()}</strong>
                </span>
              </div>

              {/* Table Legends */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '10px', height: '10px', background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.4)', borderRadius: '2px' }} />
                  <span>Call ITM</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '10px', height: '10px', background: 'rgba(6, 182, 212, 0.15)', border: '1px solid rgba(6, 182, 212, 0.4)', borderRadius: '2px' }} />
                  <span>Put ITM</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '10px', height: '10px', background: 'rgba(168, 85, 247, 0.35)', border: '1px solid #a855f7', borderRadius: '2px' }} />
                  <span>ATM</span>
                </div>
              </div>
            </div>

            {/* Error or Loading Banner */}
            {chainError && (
              <div style={{ padding: '20px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', textAlign: 'center', fontSize: '0.85rem' }}>
                {chainError}
              </div>
            )}

            {isLoadingChain && !chainData ? (
              <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px auto', display: 'block', color: '#818cf8' }} />
                <span>Loading real-time NSE Option Chain data...</span>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: '720px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ background: '#090d16', borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, zIndex: 10 }}>
                      {/* CALL SIDE HEADER */}
                      {(sideFilter === 'BOTH' || sideFilter === 'CALLS') && (
                        <>
                          <th style={{ padding: '10px 8px', color: '#34d399', textAlign: 'center', borderRight: '1px solid var(--border-subtle)' }} colSpan={8}>
                            CALL OPTIONS (CE)
                          </th>
                        </>
                      )}

                      {/* CENTER STRIKE HEADER */}
                      <th style={{ padding: '10px 14px', color: '#c084fc', textAlign: 'center', background: '#0f172a', borderLeft: '1px solid var(--border-subtle)', borderRight: '1px solid var(--border-subtle)' }}>
                        STRIKE
                      </th>

                      {/* PUT SIDE HEADER */}
                      {(sideFilter === 'BOTH' || sideFilter === 'PUTS') && (
                        <>
                          <th style={{ padding: '10px 8px', color: '#f87171', textAlign: 'center', borderLeft: '1px solid var(--border-subtle)' }} colSpan={8}>
                            PUT OPTIONS (PE)
                          </th>
                        </>
                      )}
                    </tr>

                    {/* SUB-HEADERS */}
                    <tr style={{ background: '#0d131f', borderBottom: '2px solid rgba(99, 102, 241, 0.3)', position: 'sticky', top: '37px', zIndex: 9, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {/* CALL SUBHEADERS */}
                      {(sideFilter === 'BOTH' || sideFilter === 'CALLS') && (
                        <>
                          <th style={{ padding: '8px 6px', textAlign: 'center' }}>+ Leg</th>
                          <th style={{ padding: '8px 6px', textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('call_oi')}>
                            OI <ArrowUpDown size={10} style={{ display: 'inline' }} />
                          </th>
                          <th style={{ padding: '8px 6px', textAlign: 'right' }}>Chg OI</th>
                          <th style={{ padding: '8px 6px', textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('call_vol')}>
                            Volume
                          </th>
                          <th style={{ padding: '8px 6px', textAlign: 'right' }}>IV %</th>
                          <th style={{ padding: '8px 6px', textAlign: 'right', cursor: 'pointer' }} onClick={() => toggleSort('call_ltp')}>
                            LTP (₹)
                          </th>
                          <th style={{ padding: '8px 6px', textAlign: 'right' }}>Chg %</th>
                          <th style={{ padding: '8px 6px', textAlign: 'right', borderRight: '1px solid var(--border-subtle)' }}>Bid / Ask</th>
                        </>
                      )}

                      {/* CENTER STRIKE */}
                      <th style={{ padding: '8px 12px', textAlign: 'center', background: '#0f172a', color: '#ffffff', fontWeight: 700, borderLeft: '1px solid var(--border-subtle)', borderRight: '1px solid var(--border-subtle)' }}>
                        Strike Price
                      </th>

                      {/* PUT SUBHEADERS */}
                      {(sideFilter === 'BOTH' || sideFilter === 'PUTS') && (
                        <>
                          <th style={{ padding: '8px 6px', textAlign: 'left', borderLeft: '1px solid var(--border-subtle)' }}>Bid / Ask</th>
                          <th style={{ padding: '8px 6px', textAlign: 'left' }}>Chg %</th>
                          <th style={{ padding: '8px 6px', textAlign: 'left', cursor: 'pointer' }} onClick={() => toggleSort('put_ltp')}>
                            LTP (₹)
                          </th>
                          <th style={{ padding: '8px 6px', textAlign: 'left' }}>IV %</th>
                          <th style={{ padding: '8px 6px', textAlign: 'left', cursor: 'pointer' }} onClick={() => toggleSort('put_vol')}>
                            Volume
                          </th>
                          <th style={{ padding: '8px 6px', textAlign: 'left' }}>Chg OI</th>
                          <th style={{ padding: '8px 6px', textAlign: 'left', cursor: 'pointer' }} onClick={() => toggleSort('put_oi')}>
                            OI <ArrowUpDown size={10} style={{ display: 'inline' }} />
                          </th>
                          <th style={{ padding: '8px 6px', textAlign: 'center' }}>+ Leg</th>
                        </>
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {sortedChainRows.map(row => {
                      const isAtm = row.is_atm;
                      const callItm = row.strike < (chainData?.spot_price || 0);
                      const putItm = row.strike > (chainData?.spot_price || 0);

                      // Call background tint
                      const callBg = isAtm
                        ? 'rgba(168, 85, 247, 0.18)'
                        : callItm
                        ? 'rgba(234, 179, 8, 0.05)'
                        : 'transparent';

                      // Put background tint
                      const putBg = isAtm
                        ? 'rgba(168, 85, 247, 0.18)'
                        : putItm
                        ? 'rgba(6, 182, 212, 0.05)'
                        : 'transparent';

                      // OI Buildup pill colors
                      const getBuildupColor = (tag: string) => {
                        if (tag === 'Long Buildup') return '#10b981';
                        if (tag === 'Short Buildup') return '#ef4444';
                        if (tag === 'Short Covering') return '#06b6d4';
                        return '#f59e0b'; // Long Unwinding
                      };

                      return (
                        <tr
                          key={row.strike}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                            transition: 'background 0.12s ease'
                          }}
                        >
                          {/* CALL SIDE CELLS */}
                          {(sideFilter === 'BOTH' || sideFilter === 'CALLS') && (
                            <>
                              {/* Quick Add Call Leg Button */}
                              <td style={{ padding: '6px 4px', textAlign: 'center', background: callBg }}>
                                <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                                  <button
                                    onClick={() => handleAddLegFromChain(row.strike, 'CE', 'BUY', row.call.ltp)}
                                    style={{
                                      background: 'rgba(16, 185, 129, 0.15)',
                                      border: '1px solid rgba(16, 185, 129, 0.4)',
                                      color: '#10b981',
                                      borderRadius: '4px',
                                      padding: '2px 5px',
                                      fontSize: '0.66rem',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                    title={`Buy ${row.strike} CE`}
                                  >
                                    B
                                  </button>
                                  <button
                                    onClick={() => handleAddLegFromChain(row.strike, 'CE', 'SELL', row.call.ltp)}
                                    style={{
                                      background: 'rgba(239, 68, 68, 0.15)',
                                      border: '1px solid rgba(239, 68, 68, 0.4)',
                                      color: '#ef4444',
                                      borderRadius: '4px',
                                      padding: '2px 5px',
                                      fontSize: '0.66rem',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                    title={`Sell ${row.strike} CE`}
                                  >
                                    S
                                  </button>
                                </div>
                              </td>

                              {/* Call OI */}
                              <td style={{ padding: '6px 8px', textAlign: 'right', background: callBg, fontWeight: 600 }}>
                                {row.call.oi.toLocaleString()}
                                {row.strike === chainData?.summary.highest_call_oi_strike && (
                                  <span style={{ marginLeft: '4px', fontSize: '0.62rem', color: '#f87171', background: 'rgba(239, 68, 68, 0.2)', padding: '1px 4px', borderRadius: '3px' }}>
                                    MAX
                                  </span>
                                )}
                              </td>

                              {/* Call Change in OI */}
                              <td style={{
                                padding: '6px 8px',
                                textAlign: 'right',
                                background: callBg,
                                color: row.call.change_oi >= 0 ? '#10b981' : '#ef4444'
                              }}>
                                {row.call.change_oi > 0 ? `+${row.call.change_oi.toLocaleString()}` : row.call.change_oi.toLocaleString()}
                              </td>

                              {/* Call Volume */}
                              <td style={{ padding: '6px 8px', textAlign: 'right', background: callBg, color: 'var(--text-secondary)' }}>
                                {row.call.volume.toLocaleString()}
                              </td>

                              {/* Call IV */}
                              <td style={{ padding: '6px 8px', textAlign: 'right', background: callBg, color: 'var(--text-muted)' }}>
                                {row.call.iv}%
                              </td>

                              {/* Call LTP */}
                              <td style={{ padding: '6px 8px', textAlign: 'right', background: callBg, fontWeight: 700, color: '#ffffff' }}>
                                ₹{row.call.ltp.toFixed(2)}
                              </td>

                              {/* Call Change % */}
                              <td style={{
                                padding: '6px 8px',
                                textAlign: 'right',
                                background: callBg,
                                color: row.call.change_pct >= 0 ? '#10b981' : '#ef4444',
                                fontWeight: 500
                              }}>
                                {row.call.change_pct >= 0 ? '+' : ''}{row.call.change_pct}%
                              </td>

                              {/* Call Bid / Ask */}
                              <td style={{ padding: '6px 8px', textAlign: 'right', background: callBg, color: 'var(--text-muted)', borderRight: '1px solid var(--border-subtle)', fontSize: '0.72rem' }}>
                                {row.call.bid.toFixed(2)} / {row.call.ask.toFixed(2)}
                              </td>
                            </>
                          )}

                          {/* CENTER STRIKE CELL */}
                          <td style={{
                            padding: '6px 12px',
                            textAlign: 'center',
                            background: isAtm ? 'rgba(168, 85, 247, 0.35)' : '#0f172a',
                            fontWeight: 800,
                            color: isAtm ? '#ffffff' : 'var(--text-primary)',
                            borderLeft: '1px solid var(--border-subtle)',
                            borderRight: '1px solid var(--border-subtle)',
                            position: 'relative'
                          }}>
                            <span>{row.strike}</span>
                            {isAtm && (
                              <span style={{
                                position: 'absolute',
                                right: '4px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                fontSize: '0.6rem',
                                background: '#9333ea',
                                color: '#ffffff',
                                padding: '1px 4px',
                                borderRadius: '3px',
                                fontWeight: 700
                              }}>
                                ATM
                              </span>
                            )}
                          </td>

                          {/* PUT SIDE CELLS */}
                          {(sideFilter === 'BOTH' || sideFilter === 'PUTS') && (
                            <>
                              {/* Put Bid / Ask */}
                              <td style={{ padding: '6px 8px', textAlign: 'left', background: putBg, color: 'var(--text-muted)', borderLeft: '1px solid var(--border-subtle)', fontSize: '0.72rem' }}>
                                {row.put.bid.toFixed(2)} / {row.put.ask.toFixed(2)}
                              </td>

                              {/* Put Change % */}
                              <td style={{
                                padding: '6px 8px',
                                textAlign: 'left',
                                background: putBg,
                                color: row.put.change_pct >= 0 ? '#10b981' : '#ef4444',
                                fontWeight: 500
                              }}>
                                {row.put.change_pct >= 0 ? '+' : ''}{row.put.change_pct}%
                              </td>

                              {/* Put LTP */}
                              <td style={{ padding: '6px 8px', textAlign: 'left', background: putBg, fontWeight: 700, color: '#ffffff' }}>
                                ₹{row.put.ltp.toFixed(2)}
                              </td>

                              {/* Put IV */}
                              <td style={{ padding: '6px 8px', textAlign: 'left', background: putBg, color: 'var(--text-muted)' }}>
                                {row.put.iv}%
                              </td>

                              {/* Put Volume */}
                              <td style={{ padding: '6px 8px', textAlign: 'left', background: putBg, color: 'var(--text-secondary)' }}>
                                {row.put.volume.toLocaleString()}
                              </td>

                              {/* Put Change in OI */}
                              <td style={{
                                padding: '6px 8px',
                                textAlign: 'left',
                                background: putBg,
                                color: row.put.change_oi >= 0 ? '#10b981' : '#ef4444'
                              }}>
                                {row.put.change_oi > 0 ? `+${row.put.change_oi.toLocaleString()}` : row.put.change_oi.toLocaleString()}
                              </td>

                              {/* Put OI */}
                              <td style={{ padding: '6px 8px', textAlign: 'left', background: putBg, fontWeight: 600 }}>
                                {row.put.oi.toLocaleString()}
                                {row.strike === chainData?.summary.highest_put_oi_strike && (
                                  <span style={{ marginLeft: '4px', fontSize: '0.62rem', color: '#34d399', background: 'rgba(16, 185, 129, 0.2)', padding: '1px 4px', borderRadius: '3px' }}>
                                    MAX
                                  </span>
                                )}
                              </td>

                              {/* Quick Add Put Leg Button */}
                              <td style={{ padding: '6px 4px', textAlign: 'center', background: putBg }}>
                                <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                                  <button
                                    onClick={() => handleAddLegFromChain(row.strike, 'PE', 'BUY', row.put.ltp)}
                                    style={{
                                      background: 'rgba(16, 185, 129, 0.15)',
                                      border: '1px solid rgba(16, 185, 129, 0.4)',
                                      color: '#10b981',
                                      borderRadius: '4px',
                                      padding: '2px 5px',
                                      fontSize: '0.66rem',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                    title={`Buy ${row.strike} PE`}
                                  >
                                    B
                                  </button>
                                  <button
                                    onClick={() => handleAddLegFromChain(row.strike, 'PE', 'SELL', row.put.ltp)}
                                    style={{
                                      background: 'rgba(239, 68, 68, 0.15)',
                                      border: '1px solid rgba(239, 68, 68, 0.4)',
                                      color: '#ef4444',
                                      borderRadius: '4px',
                                      padding: '2px 5px',
                                      fontSize: '0.66rem',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                    title={`Sell ${row.strike} PE`}
                                  >
                                    S
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: STRATEGY BUILDER & PAYOFF VIEW */}
        {activeTab === 'builder' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Toolbar: Template Selector & Actions */}
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '16px',
              padding: '18px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  PREDEFINED TEMPLATES:
                </span>
                <select
                  value={selectedTemplateId}
                  onChange={e => handleSelectTemplate(e.target.value)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    color: '#ffffff',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer',
                    minWidth: '220px'
                  }}
                >
                  <option value="">-- Select Strategy Template --</option>
                  {Object.entries(categorizedTemplates).map(([cat, list]) => (
                    <optgroup key={cat} label={`── ${cat} Strategies ──`}>
                      {list.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.outlook})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                {selectedTemplateId && (
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    {templates.find(t => t.id === selectedTemplateId)?.description}
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={() => {
                    const spot = chainData?.spot_price || 24000;
                    const interval = chainData?.interval || 50;
                    const atm = Math.round(spot / interval) * interval;
                    const newLeg: Leg = {
                      id: `leg_${Date.now()}`,
                      action: 'BUY',
                      option_type: 'CE',
                      strike: atm,
                      lots: 1,
                      lot_size: chainData?.lot_size || 25,
                      premium: 100.0,
                      name: `BUY ${atm} CE`
                    };
                    setBuilderLegs(prev => [...prev, newLeg]);
                  }}
                  style={{
                    background: 'rgba(99, 102, 241, 0.15)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    color: '#818cf8',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Plus size={14} />
                  Add Leg
                </button>

                <button
                  onClick={handleClearAllLegs}
                  disabled={builderLegs.length === 0}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    color: '#ef4444',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: builderLegs.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: builderLegs.length === 0 ? 0.5 : 1
                  }}
                >
                  Clear All
                </button>

                <button
                  onClick={() => setSaveModalOpen(true)}
                  disabled={builderLegs.length === 0}
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: builderLegs.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: builderLegs.length === 0 ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  <Save size={14} />
                  Save Strategy
                </button>

                <button
                  onClick={handleExportJSON}
                  disabled={!analysis}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: 'var(--text-secondary)',
                    fontSize: '0.8rem',
                    cursor: !analysis ? 'not-allowed' : 'pointer',
                    opacity: !analysis ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  title="Export strategy analysis as JSON"
                >
                  <Download size={14} />
                  JSON
                </button>
              </div>
            </div>

            {/* Empty Legs State */}
            {builderLegs.length === 0 && (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px dashed var(--border-subtle)',
                borderRadius: '16px',
                padding: '60px 24px',
                textAlign: 'center'
              }}>
                <Sliders size={40} color="#818cf8" style={{ margin: '0 auto 16px auto', display: 'block', opacity: 0.8 }} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px 0' }}>No Active Option Legs Selected</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto 20px auto' }}>
                  Choose a predefined strategy template above (e.g. Bull Call Spread, Iron Condor) or navigate to the Option Chain Table to add custom strike legs.
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button
                    onClick={() => handleSelectTemplate('BULL_CALL_SPREAD')}
                    style={{
                      background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      color: '#ffffff',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Load Bull Call Spread
                  </button>
                  <button
                    onClick={() => handleSelectTemplate('IRON_CONDOR')}
                    style={{
                      background: 'rgba(99, 102, 241, 0.2)',
                      border: '1px solid rgba(99, 102, 241, 0.4)',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      color: '#818cf8',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Load Iron Condor
                  </button>
                </div>
              </div>
            )}

            {/* Active Legs Configurator Table */}
            {builderLegs.length > 0 && (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sliders size={16} color="#818cf8" />
                    Strategy Legs ({builderLegs.length})
                  </h3>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Underlying: <strong>{selectedSymbol}</strong> | Spot: <strong>₹{chainData?.spot_price.toFixed(2)}</strong>
                  </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr style={{ background: '#090d16', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>#</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Action</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Option Type</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Strike Price</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>Lots</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Lot Size</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Premium (₹)</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total Premium</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {builderLegs.map((leg, idx) => {
                        const totalPrem = leg.premium * leg.lots * (leg.lot_size || chainData?.lot_size || 25);
                        return (
                          <tr key={leg.id || idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                            <td style={{ padding: '10px', color: 'var(--text-muted)' }}>{idx + 1}</td>

                            {/* BUY / SELL TOGGLE */}
                            <td style={{ padding: '10px' }}>
                              <button
                                onClick={() => handleUpdateLeg(idx, { action: leg.action === 'BUY' ? 'SELL' : 'BUY' })}
                                style={{
                                  background: leg.action === 'BUY' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                  border: `1px solid ${leg.action === 'BUY' ? '#10b981' : '#ef4444'}`,
                                  color: leg.action === 'BUY' ? '#10b981' : '#ef4444',
                                  borderRadius: '6px',
                                  padding: '4px 10px',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                {leg.action}
                              </button>
                            </td>

                            {/* CE / PE TOGGLE */}
                            <td style={{ padding: '10px' }}>
                              <button
                                onClick={() => handleUpdateLeg(idx, { option_type: leg.option_type === 'CE' ? 'PE' : 'CE' })}
                                style={{
                                  background: leg.option_type === 'CE' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                  border: `1px solid ${leg.option_type === 'CE' ? '#6366f1' : '#f59e0b'}`,
                                  color: leg.option_type === 'CE' ? '#818cf8' : '#fbbf24',
                                  borderRadius: '6px',
                                  padding: '4px 10px',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                {leg.option_type}
                              </button>
                            </td>

                            {/* STRIKE PRICE */}
                            <td style={{ padding: '10px' }}>
                              <input
                                type="number"
                                step={chainData?.interval || 50}
                                value={leg.strike}
                                onChange={e => handleUpdateLeg(idx, { strike: Number(e.target.value) })}
                                style={{
                                  background: 'rgba(15, 23, 42, 0.9)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: '6px',
                                  padding: '5px 8px',
                                  color: '#ffffff',
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  width: '95px'
                                }}
                              />
                            </td>

                            {/* LOTS ADJUSTER */}
                            <td style={{ padding: '10px', textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(15, 23, 42, 0.9)', borderRadius: '6px', padding: '2px 4px', border: '1px solid var(--border-subtle)' }}>
                                <button
                                  onClick={() => handleUpdateLeg(idx, { lots: Math.max(1, leg.lots - 1) })}
                                  style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0 4px', fontWeight: 700 }}
                                >
                                  -
                                </button>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, minWidth: '18px', textAlign: 'center' }}>
                                  {leg.lots}
                                </span>
                                <button
                                  onClick={() => handleUpdateLeg(idx, { lots: leg.lots + 1 })}
                                  style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0 4px', fontWeight: 700 }}
                                >
                                  +
                                </button>
                              </div>
                            </td>

                            {/* LOT SIZE */}
                            <td style={{ padding: '10px', color: 'var(--text-muted)' }}>
                              {leg.lot_size || chainData?.lot_size || 25}
                            </td>

                            {/* PREMIUM INPUT */}
                            <td style={{ padding: '10px' }}>
                              <input
                                type="number"
                                step="0.5"
                                value={leg.premium}
                                onChange={e => handleUpdateLeg(idx, { premium: Number(e.target.value) })}
                                style={{
                                  background: 'rgba(15, 23, 42, 0.9)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: '6px',
                                  padding: '5px 8px',
                                  color: '#ffffff',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  width: '90px'
                                }}
                              />
                            </td>

                            {/* TOTAL PREMIUM (CREDIT / DEBIT) */}
                            <td style={{
                              padding: '10px',
                              textAlign: 'right',
                              fontWeight: 700,
                              color: leg.action === 'BUY' ? '#ef4444' : '#10b981'
                            }}>
                              {leg.action === 'BUY' ? '-' : '+'}₹{Math.round(totalPrem).toLocaleString('en-IN')}
                            </td>

                            {/* DELETE BUTTON */}
                            <td style={{ padding: '10px', textAlign: 'center' }}>
                              <button
                                onClick={() => handleRemoveLeg(idx)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-muted)',
                                  cursor: 'pointer',
                                  padding: '4px'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                                title="Remove leg"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Strategy Analysis Cards & Interactive Payoff Chart */}
            {analysis && (
              <>
                {/* Metrics Strip */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px'
                }}>
                  {/* Max Profit */}
                  <div style={{
                    background: 'rgba(18, 24, 38, 0.85)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '12px',
                    padding: '16px'
                  }}>
                    <div style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 600, letterSpacing: '0.04em' }}>
                      MAX PROFIT
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                      {analysis.max_profit_str}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Theoretical ceiling at expiry
                    </div>
                  </div>

                  {/* Max Loss */}
                  <div style={{
                    background: 'rgba(18, 24, 38, 0.85)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '12px',
                    padding: '16px'
                  }}>
                    <div style={{ fontSize: '0.72rem', color: '#f87171', fontWeight: 600, letterSpacing: '0.04em' }}>
                      MAX LOSS
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#ef4444', marginTop: '4px' }}>
                      {analysis.max_loss_str}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Capped downside risk
                    </div>
                  </div>

                  {/* Breakevens */}
                  <div style={{
                    background: 'rgba(18, 24, 38, 0.85)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    padding: '16px'
                  }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>
                      BREAKEVEN POINT(S)
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginTop: '4px' }}>
                      {analysis.breakevens && analysis.breakevens.length > 0
                        ? analysis.breakevens.map(b => `₹${b.toLocaleString()}`).join(', ')
                        : 'None'}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Zero P&L inflection price
                    </div>
                  </div>

                  {/* Net Premium */}
                  <div style={{
                    background: 'rgba(18, 24, 38, 0.85)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    padding: '16px'
                  }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>
                      NET PREMIUM ({analysis.premium_type})
                    </div>
                    <div style={{
                      fontSize: '1.35rem',
                      fontWeight: 800,
                      color: analysis.is_credit ? '#10b981' : '#ef4444',
                      marginTop: '4px'
                    }}>
                      ₹{Math.abs(analysis.net_premium_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {analysis.is_credit ? 'Net cash credited into account' : 'Net cash paid upfront'}
                    </div>
                  </div>

                  {/* Risk to Reward */}
                  <div style={{
                    background: 'rgba(18, 24, 38, 0.85)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    padding: '16px'
                  }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>
                      RISK-TO-REWARD RATIO
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff', marginTop: '4px' }}>
                      {analysis.risk_reward_ratio}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Payoff efficiency index
                    </div>
                  </div>

                  {/* Probability of Profit (POP) */}
                  <div style={{
                    background: 'rgba(18, 24, 38, 0.85)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    borderRadius: '12px',
                    padding: '16px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', color: '#a5b4fc', fontWeight: 600, letterSpacing: '0.04em' }}>
                        PROBABILITY OF PROFIT
                      </span>
                      <Percent size={14} color="#818cf8" />
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#818cf8', marginTop: '4px' }}>
                      {analysis.probability_of_profit_pct}%
                    </div>
                    <div style={{
                      height: '4px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '2px',
                      marginTop: '8px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, analysis.probability_of_profit_pct)}%`,
                        background: 'linear-gradient(90deg, #6366f1, #10b981)',
                        borderRadius: '2px'
                      }} />
                    </div>
                  </div>

                  {/* Estimated Margin Required */}
                  <div style={{
                    background: 'rgba(18, 24, 38, 0.85)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    padding: '16px'
                  }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>
                      EST. MARGIN (SEBI HEDGED)
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff', marginTop: '4px' }}>
                      ₹{analysis.estimated_margin_required.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#10b981', marginTop: '4px' }}>
                      Multi-leg spread benefit applied
                    </div>
                  </div>
                </div>

                {/* Interactive SVG Payoff Chart */}
                <div style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '16px',
                  padding: '24px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <BarChart2 size={18} color="#818cf8" />
                        Strategy Payoff Profile at Expiry
                      </h3>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        Net P&L across underlying price spectrum at expiration. Shaded zones represent Profit (Green) vs Loss (Red).
                      </p>
                    </div>

                    {/* Chart Legend */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.74rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '12px', height: '2px', background: '#3b82f6', borderTop: '2px dashed #3b82f6' }} />
                        <span style={{ color: 'var(--text-secondary)' }}>Spot: ₹{analysis.spot_price.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '12px', height: '2px', background: '#f59e0b', borderTop: '2px dashed #f59e0b' }} />
                        <span style={{ color: 'var(--text-secondary)' }}>Breakeven</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '10px', height: '10px', background: '#10b981', borderRadius: '2px' }} />
                        <span style={{ color: '#10b981' }}>Profit Zone</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '10px', height: '10px', background: '#ef4444', borderRadius: '2px' }} />
                        <span style={{ color: '#ef4444' }}>Loss Zone</span>
                      </div>
                    </div>
                  </div>

                  {/* SVG Canvas */}
                  {chartBounds && (
                    <div style={{ position: 'relative', width: '100%', height: '340px' }}>
                      <svg
                        viewBox="0 0 900 320"
                        style={{ width: '100%', height: '100%', overflow: 'visible' }}
                        onMouseLeave={() => setHoveredPoint(null)}
                      >
                        <defs>
                          <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                          </linearGradient>
                          <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.02" />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.4" />
                          </linearGradient>
                        </defs>

                        {/* Chart Area Box */}
                        {(() => {
                          const w = 900;
                          const h = 320;
                          const padX = 60;
                          const padY = 30;
                          const chartW = w - padX * 2;
                          const chartH = h - padY * 2;

                          const { minPnl, maxPnl, minSpot, maxSpot, spotRange, pnlRange, points } = chartBounds;

                          const getX = (spotVal: number) => padX + ((spotVal - minSpot) / spotRange) * chartW;
                          const getY = (pnlVal: number) => padY + chartH - ((pnlVal - minPnl) / pnlRange) * chartH;

                          const zeroY = getY(0);

                          // Build SVG Path
                          const pathD = points
                            .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(p.spot).toFixed(1)} ${getY(p.pnl).toFixed(1)}`)
                            .join(' ');

                          return (
                            <>
                              {/* Horizontal Grid lines */}
                              {[-1, 0, 1].map(multiplier => {
                                const val = multiplier === 0 ? 0 : multiplier > 0 ? maxPnl * 0.5 : minPnl * 0.5;
                                const yPos = getY(val);
                                return (
                                  <g key={multiplier}>
                                    <line
                                      x1={padX}
                                      y1={yPos}
                                      x2={padX + chartW}
                                      y2={yPos}
                                      stroke={multiplier === 0 ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.08)'}
                                      strokeWidth={multiplier === 0 ? 1.5 : 1}
                                      strokeDasharray={multiplier === 0 ? 'none' : '4 4'}
                                    />
                                    <text
                                      x={padX - 8}
                                      y={yPos + 4}
                                      fill="var(--text-muted)"
                                      fontSize="11"
                                      textAnchor="end"
                                      fontFamily="monospace"
                                    >
                                      ₹{Math.round(val).toLocaleString()}
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Payoff Curve Line */}
                              <path
                                d={pathD}
                                fill="none"
                                stroke="#818cf8"
                                strokeWidth="3"
                                strokeLinecap="round"
                              />

                              {/* Breakeven Vertical Lines */}
                              {analysis.breakevens.map((be, idx) => {
                                const bx = getX(be);
                                return (
                                  <g key={`be_${idx}`}>
                                    <line
                                      x1={bx}
                                      y1={padY}
                                      x2={bx}
                                      y2={padY + chartH}
                                      stroke="#f59e0b"
                                      strokeWidth="1.5"
                                      strokeDasharray="4 4"
                                    />
                                    <text
                                      x={bx}
                                      y={padY + chartH + 16}
                                      fill="#f59e0b"
                                      fontSize="10"
                                      textAnchor="middle"
                                      fontWeight="bold"
                                    >
                                      BE: ₹{Math.round(be)}
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Spot Price Marker */}
                              {(() => {
                                const sx = getX(analysis.spot_price);
                                return (
                                  <g>
                                    <line
                                      x1={sx}
                                      y1={padY}
                                      x2={sx}
                                      y2={padY + chartH}
                                      stroke="#3b82f6"
                                      strokeWidth="2"
                                    />
                                    <circle
                                      cx={sx}
                                      cy={getY(0)}
                                      r="4"
                                      fill="#3b82f6"
                                    />
                                    <text
                                      x={sx}
                                      y={padY - 8}
                                      fill="#3b82f6"
                                      fontSize="11"
                                      textAnchor="middle"
                                      fontWeight="bold"
                                    >
                                      Spot: ₹{analysis.spot_price.toFixed(1)}
                                    </text>
                                  </g>
                                );
                              })()}

                              {/* Invisible mouse hover listener overlay points */}
                              {points.map((p, idx) => {
                                const cx = getX(p.spot);
                                const cy = getY(p.pnl);
                                return (
                                  <circle
                                    key={idx}
                                    cx={cx}
                                    cy={cy}
                                    r="8"
                                    fill="transparent"
                                    style={{ cursor: 'pointer' }}
                                    onMouseEnter={() => setHoveredPoint(p)}
                                  />
                                );
                              })}

                              {/* Hover Tooltip Marker */}
                              {hoveredPoint && (
                                <g>
                                  <circle
                                    cx={getX(hoveredPoint.spot)}
                                    cy={getY(hoveredPoint.pnl)}
                                    r="6"
                                    fill={hoveredPoint.pnl >= 0 ? '#10b981' : '#ef4444'}
                                    stroke="#ffffff"
                                    strokeWidth="2"
                                  />
                                </g>
                              )}
                            </>
                          );
                        })()}
                      </svg>

                      {/* Tooltip Float Box */}
                      {hoveredPoint && (
                        <div style={{
                          position: 'absolute',
                          top: '12px',
                          right: '20px',
                          background: 'rgba(15, 23, 42, 0.95)',
                          border: `1px solid ${hoveredPoint.pnl >= 0 ? '#10b981' : '#ef4444'}`,
                          borderRadius: '8px',
                          padding: '8px 14px',
                          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                          pointerEvents: 'none'
                        }}>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Underlying at Expiry: <strong style={{ color: '#ffffff' }}>₹{hoveredPoint.spot.toFixed(2)}</strong>
                          </div>
                          <div style={{
                            fontSize: '0.95rem',
                            fontWeight: 800,
                            color: hoveredPoint.pnl >= 0 ? '#10b981' : '#ef4444',
                            marginTop: '2px'
                          }}>
                            P&L: {hoveredPoint.pnl >= 0 ? '+' : ''}₹{Math.round(hoveredPoint.pnl).toLocaleString('en-IN')}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Disclaimer Banner */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              color: 'var(--text-muted)',
              fontSize: '0.75rem'
            }}>
              <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0 }} />
              <div>
                <strong>Theoretical Simulation Disclaimer:</strong> Payoff curves, Greeks, and metrics are computed based on European Black-Scholes pricing and SEBI standardized margin models. Past performance does not guarantee future results. F&O trading involves substantial risk of capital loss.
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SAVED STRATEGIES LIBRARY */}
        {activeTab === 'saved' && (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FolderOpen size={18} color="#818cf8" />
                  Saved Option Strategies Library
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Manage and retrieve your custom multi-leg options combinations across market conditions.
                </p>
              </div>

              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                Total Saved: <strong>{savedStrategies.length}</strong>
              </span>
            </div>

            {savedStrategies.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                <FolderOpen size={36} color="var(--border-subtle)" style={{ margin: '0 auto 12px auto', display: 'block' }} />
                <p style={{ margin: 0, fontSize: '0.88rem' }}>No saved strategies yet.</p>
                <p style={{ margin: '4px 0 16px 0', fontSize: '0.76rem' }}>
                  Build a strategy in the Strategy Builder tab and click &quot;Save Strategy&quot; to archive it here.
                </p>
                <button
                  onClick={() => setActiveTab('builder')}
                  style={{
                    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Go to Strategy Builder
                </button>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: '16px'
              }}>
                {savedStrategies.map(strat => (
                  <div
                    key={strat.id}
                    style={{
                      background: 'rgba(15, 23, 42, 0.85)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '12px',
                      padding: '18px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                            {strat.name}
                          </h4>
                          <span style={{
                            display: 'inline-block',
                            marginTop: '4px',
                            fontSize: '0.68rem',
                            background: 'rgba(99, 102, 241, 0.2)',
                            color: '#a5b4fc',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: 600
                          }}>
                            {strat.symbol}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {strat.created_at ? strat.created_at.split('T')[0] : ''}
                        </span>
                      </div>

                      {strat.notes && (
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '8px 0 12px 0' }}>
                          {strat.notes}
                        </p>
                      )}

                      {/* Legs Badges */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '12px 0' }}>
                        {strat.legs.map((leg, lIdx) => (
                          <span
                            key={lIdx}
                            style={{
                              fontSize: '0.72rem',
                              background: leg.action === 'BUY' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              border: `1px solid ${leg.action === 'BUY' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                              color: leg.action === 'BUY' ? '#10b981' : '#ef4444',
                              borderRadius: '4px',
                              padding: '2px 6px',
                              fontWeight: 600
                            }}
                          >
                            {leg.action} {leg.strike} {leg.option_type} ({leg.lots}L)
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                      <button
                        onClick={() => handleLoadSavedStrategy(strat)}
                        style={{
                          background: 'rgba(99, 102, 241, 0.2)',
                          border: '1px solid rgba(99, 102, 241, 0.4)',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          color: '#818cf8',
                          fontSize: '0.76rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Compass size={13} />
                        Load in Builder
                      </button>

                      <button
                        onClick={() => handleDeleteSavedStrategy(strat.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px'
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                        title="Delete strategy"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SAVE STRATEGY MODAL */}
        {saveModalOpen && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}>
            <div style={{
              background: '#0f172a',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '460px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Save size={18} color="#818cf8" />
                  Save Multi-Leg Strategy
                </h3>
                <button
                  onClick={() => setSaveModalOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              {saveSuccessMsg ? (
                <div style={{
                  padding: '20px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  borderRadius: '8px',
                  color: '#10b981',
                  textAlign: 'center',
                  fontWeight: 600,
                  fontSize: '0.88rem'
                }}>
                  <CheckCircle2 size={24} style={{ margin: '0 auto 8px auto', display: 'block' }} />
                  {saveSuccessMsg}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                      STRATEGY NAME *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. NIFTY Weekly Bull Call Spread"
                      value={newStrategyName}
                      onChange={e => setNewStrategyName(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        color: '#ffffff',
                        fontSize: '0.84rem',
                        outline: 'none'
                      }}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                      NOTES / THESIS (OPTIONAL)
                    </label>
                    <textarea
                      placeholder="Targeting breakout above 24,200 with strictly defined downside risk..."
                      value={newStrategyNotes}
                      onChange={e => setNewStrategyNotes(e.target.value)}
                      rows={3}
                      style={{
                        width: '100%',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        color: '#ffffff',
                        fontSize: '0.82rem',
                        outline: 'none',
                        resize: 'none'
                      }}
                    />
                  </div>

                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Contains {builderLegs.length} leg(s) for <strong>{selectedSymbol}</strong>.
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                    <button
                      onClick={() => setSaveModalOpen(false)}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '8px 16px',
                        color: 'var(--text-secondary)',
                        fontSize: '0.82rem',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveStrategy}
                      disabled={!newStrategyName.trim()}
                      style={{
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px 18px',
                        color: '#ffffff',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: !newStrategyName.trim() ? 'not-allowed' : 'pointer',
                        opacity: !newStrategyName.trim() ? 0.5 : 1
                      }}
                    >
                      Save Strategy
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Global Navigation Drawer */}
      <NavigationDrawer
        isOpen={navDrawerOpen}
        onClose={() => setNavDrawerOpen(false)}
      />

      <style jsx global>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

