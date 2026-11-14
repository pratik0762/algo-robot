"use client";

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
  ChevronUp,
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
  ArrowUpDown,
  Lock,
  Unlock,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  HelpCircle,
  Eye,
  RotateCcw
} from 'lucide-react';
import { getApiBase } from '@/config/api';
import IndicesBarometer from '@/components/IndicesBarometer';

const NavigationDrawer = dynamic(() => import('@/components/NavigationDrawer'), {
  ssr: false,
  loading: () => null
});

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------
export interface Leg {
  id?: string;
  action: 'BUY' | 'SELL';
  option_type: 'CE' | 'PE';
  strike: number;
  offset_steps?: number;
  lots: number;
  lot_size?: number;
  premium: number;
  name?: string;
  disabled?: boolean;
  expiry?: string;
  bid?: number;
  ask?: number;
}

export interface PredefinedTemplate {
  id: string;
  name: string;
  category: string;
  outlook: string;
  description: string;
  legs: Leg[];
}

export interface PayoffPoint {
  spot: number;
  pnl: number;
  pnl_target?: number;
  is_spot?: boolean;
  is_target?: boolean;
}

export interface StrategyAnalysis {
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

export interface OptionStrikeRow {
  strike: number;
  is_atm: boolean;
  call: {
    oi: number;
    change_oi: number;
    pchange_oi?: number;
    volume: number;
    iv: number;
    ltp: number;
    change?: number;
    change_pct: number;
    bid: number;
    bid_qty?: number;
    ask: number;
    ask_qty?: number;
    delta?: number;
    theta?: number;
    gamma?: number;
    vega?: number;
    identifier?: string;
    moneyness: string;
    buildup: string;
  };
  put: {
    oi: number;
    change_oi: number;
    pchange_oi?: number;
    volume: number;
    iv: number;
    ltp: number;
    change?: number;
    change_pct: number;
    bid: number;
    bid_qty?: number;
    ask: number;
    ask_qty?: number;
    delta?: number;
    theta?: number;
    gamma?: number;
    vega?: number;
    identifier?: string;
    moneyness: string;
    buildup: string;
  };
}

export interface OptionChainData {
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
    highest_call_oi_strike: number;
    highest_put_oi_strike: number;
    highest_call_addition_strike?: number;
    highest_put_addition_strike?: number;
  };
  chain: OptionStrikeRow[];
  last_updated?: string;
}

export interface FOInstrument {
  symbol: string;
  name: string;
  type: string;
  lot_size: number;
  strike_interval: number;
}

export interface SavedStrategy {
  id: string;
  name: string;
  symbol: string;
  created_at: string;
  notes?: string;
  legs: Leg[];
}

// ---------------------------------------------------------------------------
// Black-Scholes Formula Helpers (For 60 FPS Target Date & Greek Simulation)
// ---------------------------------------------------------------------------
function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1.0 + sign * y);
}

function bsPrice(s: number, k: number, t: number, r: number, sigma: number, optType: 'CE' | 'PE'): number {
  if (t <= 0.001) {
    return optType === 'CE' ? Math.max(0, s - k) : Math.max(0, k - s);
  }
  const d1 = (Math.log(s / k) + (r + 0.5 * sigma * sigma) * t) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t);
  if (optType === 'CE') {
    return s * normCdf(d1) - k * Math.exp(-r * t) * normCdf(d2);
  } else {
    return k * Math.exp(-r * t) * normCdf(-d2) - s * normCdf(-d1);
  }
}

function bsGreeks(s: number, k: number, t: number, r: number, sigma: number, optType: 'CE' | 'PE') {
  if (t <= 0.001) {
    return { delta: optType === 'CE' ? (s >= k ? 1 : 0) : (s <= k ? -1 : 0), theta: 0, gamma: 0, vega: 0 };
  }
  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(s / k) + (r + 0.5 * sigma * sigma) * t) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const normPdf = (1.0 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1);

  const delta = optType === 'CE' ? normCdf(d1) : normCdf(d1) - 1.0;
  const gamma = normPdf / (s * sigma * sqrtT);
  const vega = (s * normPdf * sqrtT) / 100.0;
  const theta = (-(s * normPdf * sigma) / (2.0 * sqrtT) - (optType === 'CE' ? r * k * Math.exp(-r * t) * normCdf(d2) : -r * k * Math.exp(-r * t) * normCdf(-d2))) / 365.0;

  return { delta, theta, gamma, vega };
}

// ---------------------------------------------------------------------------
// Miniature SVG Payoff Thumbnail Component
// ---------------------------------------------------------------------------
function StrategyMiniThumbnail({ type }: { type: string }) {
  // Generates clean Sensibull-style vector mini payoff curve
  const t = type.toUpperCase();
  let points = "5,35 25,35 45,15 65,15"; // default Bull Call spread
  let stroke = "#10b981"; // green
  let fill = "rgba(16, 185, 129, 0.15)";

  if (t.includes('LONG_CALL') || t.includes('BUY_CALL')) {
    points = "5,35 35,35 65,10";
    stroke = "#10b981";
  } else if (t.includes('LONG_PUT') || t.includes('BUY_PUT')) {
    points = "5,10 35,35 65,35";
    stroke = "#ef4444";
  } else if (t.includes('BULL_CALL') || t.includes('BULL_PUT')) {
    points = "5,35 25,35 45,12 65,12";
    stroke = "#10b981";
  } else if (t.includes('BEAR_PUT') || t.includes('BEAR_CALL')) {
    points = "5,12 25,12 45,35 65,35";
    stroke = "#ef4444";
  } else if (t.includes('STRADDLE_LONG') || t.includes('LONG_STRADDLE') || t.includes('LONG_STRANGLE')) {
    points = "5,10 35,35 65,10";
    stroke = "#38bdf8";
  } else if (t.includes('STRADDLE_SHORT') || t.includes('SHORT_STRADDLE') || t.includes('SHORT_STRANGLE')) {
    points = "5,35 35,10 65,35";
    stroke = "#f59e0b";
  } else if (t.includes('IRON_CONDOR') || t.includes('CONDOR')) {
    points = "5,35 20,15 50,15 65,35";
    stroke = "#818cf8";
  } else if (t.includes('BUTTERFLY')) {
    points = "5,35 35,10 65,35";
    stroke = "#c084fc";
  } else if (t.includes('RATIO')) {
    points = "5,30 25,30 45,38 65,5";
    stroke = "#34d399";
  } else if (t.includes('CALENDAR')) {
    points = "5,30 20,20 35,15 50,20 65,30";
    stroke = "#60a5fa";
  }

  return (
    <svg width="70" height="42" viewBox="0 0 70 42" style={{ display: 'block', margin: '0 auto 6px auto' }}>
      {/* Zero line */}
      <line x1="5" y1="24" x2="65" y2="24" stroke="rgba(255, 255, 255, 0.15)" strokeDasharray="2,2" strokeWidth="1" />
      {/* Payoff line */}
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------
export default function OptionChainPage() {
  const [navDrawerOpen, setNavDrawerOpen] = useState<boolean>(false);

  // View Mode: Sensibull Workstation (Default) vs Smart Strike Selector vs Full 23-Col Table
  const [viewMode, setViewMode] = useState<'workstation' | 'smart_selector' | 'fullchain'>('workstation');
  const [leftTab, setLeftTab] = useState<'chain' | 'templates' | 'saved'>('chain');

  // Smart Strike Selector State
  const [smartSelectorMode, setSmartSelectorMode] = useState<'auto' | 'manual'>('auto');
  const [smartAnalysis, setSmartAnalysis] = useState<any | null>(null);
  const [isLoadingSmartAnalysis, setIsLoadingSmartAnalysis] = useState<boolean>(false);
  const [smartCapital, setSmartCapital] = useState<number>(500000);
  const [smartRiskPct, setSmartRiskPct] = useState<number>(2.0);
  const [smartDirection, setSmartDirection] = useState<'AUTO' | 'BULLISH' | 'BEARISH' | 'NEUTRAL'>('AUTO');
  const [smartDeltaStyle, setSmartDeltaStyle] = useState<'MODERATE' | 'CONSERVATIVE' | 'AGGRESSIVE' | 'PREMIUM_SELLING'>('MODERATE');
  const [smartMinRR, setSmartMinRR] = useState<number>(1.4);
  const [selectedPlanStrategyIdx, setSelectedPlanStrategyIdx] = useState<number>(0);


  // Instruments & Search State
  const [instruments, setInstruments] = useState<FOInstrument[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('NIFTY');
  const [symbolSearchQuery, setSymbolSearchQuery] = useState<string>('');
  const [symbolDropdownOpen, setSymbolDropdownOpen] = useState<boolean>(false);
  const [instrumentCategory, setInstrumentCategory] = useState<'ALL' | 'INDICES' | 'STOCKS'>('ALL');

  // Expiry & Chain View Configuration
  const [expiries, setExpiries] = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');
  const [strikeRange, setStrikeRange] = useState<number>(15);
  const [sideFilter, setSideFilter] = useState<'BOTH' | 'CALLS' | 'PUTS'>('BOTH');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(5); // 0 = off, 5, 10
  const [sortBy, setSortBy] = useState<string>('strike');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Live Data & Loading
  const [chainData, setChainData] = useState<OptionChainData | null>(null);
  const [isLoadingChain, setIsLoadingChain] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [chainError, setChainError] = useState<string | null>(null);

  // Active Strategy Builder State
  const [builderLegs, setBuilderLegs] = useState<Leg[]>([
    {
      id: 'leg_init_1',
      action: 'BUY',
      option_type: 'CE',
      strike: 25150,
      lots: 1,
      lot_size: 25,
      premium: 125.5,
      name: 'BUY 25150 CE'
    },
    {
      id: 'leg_init_2',
      action: 'SELL',
      option_type: 'CE',
      strike: 25300,
      lots: 1,
      lot_size: 25,
      premium: 58.2,
      name: 'SELL 25300 CE'
    }
  ]);
  const [templates, setTemplates] = useState<PredefinedTemplate[]>([]);
  const [selectedTemplateCategory, setSelectedTemplateCategory] = useState<string>('All');
  const [analysis, setAnalysis] = useState<StrategyAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Interactive Target Price & Date Simulation Sliders
  const [targetPrice, setTargetPrice] = useState<number>(25150);
  const [targetDteOffset, setTargetDteOffset] = useState<number>(0); // 0 = today, max = days_to_expiry
  const [ivOffset, setIvOffset] = useState<number>(0); // -5% to +5%
  const [multiplier, setMultiplier] = useState<number>(1);

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

      // Initialize target price if not set or symbol changed
      if (data.spot_price && (targetPrice === 25150 || Math.abs(targetPrice - data.spot_price) > data.spot_price * 0.4)) {
        setTargetPrice(data.spot_price);
      }
    } catch (err: any) {
      setChainError(err.message || 'Error loading option chain data');
    } finally {
      setIsLoadingChain(false);
      setIsRefreshing(false);
    }
  }, [selectedSymbol, selectedExpiry, strikeRange]);

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

  // Fetch Smart Strike Selector Analysis
  const fetchSmartStrikeAnalysis = useCallback(async (isManual = false) => {
    setIsLoadingSmartAnalysis(true);
    try {
      console.log('[SMART_SELECTOR] Starting fetch, isManual:', isManual, 'symbol:', selectedSymbol, 'expiry:', selectedExpiry);
      if (!isManual && smartSelectorMode === 'auto') {
        const url = `${getApiBase()}/api/options/smart-selector/analyze?symbol=${encodeURIComponent(selectedSymbol)}&expiry=${encodeURIComponent(selectedExpiry)}&mode=auto`;
        console.log('[SMART_SELECTOR] GET URL:', url);
        const res = await fetch(url);
        console.log('[SMART_SELECTOR] Response status:', res.status, res.ok);
        if (res.ok) {
          const json = await res.json();
          console.log('[SMART_SELECTOR] Received JSON status:', json?.status);
          setSmartAnalysis(json);
          setSelectedPlanStrategyIdx(0);
        }
      } else {
        const url = `${getApiBase()}/api/options/smart-selector/recommend`;
        console.log('[SMART_SELECTOR] POST URL:', url);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: selectedSymbol,
            expiry: selectedExpiry,
            mode: 'manual',
            direction: smartDirection === 'AUTO' ? undefined : smartDirection,
            delta_preference: smartDeltaStyle,
            capital: smartCapital,
            risk_per_trade_pct: smartRiskPct,
            min_reward_risk: smartMinRR
          })
        });
        console.log('[SMART_SELECTOR] POST Response status:', res.status, res.ok);
        if (res.ok) {
          const json = await res.json();
          console.log('[SMART_SELECTOR] Received POST JSON status:', json?.status);
          setSmartAnalysis(json);
          setSelectedPlanStrategyIdx(0);
        }
      }
    } catch (err) {
      console.error('Error running Smart Strike Selector:', err);
    } finally {
      setIsLoadingSmartAnalysis(false);
    }
  }, [selectedSymbol, selectedExpiry, smartSelectorMode, smartDirection, smartDeltaStyle, smartCapital, smartRiskPct, smartMinRR]);

  // Load Smart Analysis when viewMode switches to smart_selector
  useEffect(() => {
    if (viewMode === 'smart_selector' && !smartAnalysis) {
      fetchSmartStrikeAnalysis(false);
    }
  }, [viewMode, smartAnalysis, fetchSmartStrikeAnalysis]);

  // 5. Analyze Active Builder Strategy Legs
  const triggerAnalysis = useCallback(async (legsToAnalyze: Leg[]) => {
    const activeLegs = legsToAnalyze.filter(l => !l.disabled);
    if (!activeLegs || activeLegs.length === 0) {
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
          legs: activeLegs.map(l => ({
            ...l,
            lots: l.lots * multiplier
          })),
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
  }, [selectedSymbol, selectedExpiry, multiplier]);

  useEffect(() => {
    triggerAnalysis(builderLegs);
  }, [builderLegs, triggerAnalysis]);

  // Quick Action: Add / Toggle Leg from Left Option Chain Table
  const handleAddLegFromChain = (strike: number, optionType: 'CE' | 'PE', action: 'BUY' | 'SELL', ltp: number, bid?: number, ask?: number) => {
    const lotSize = chainData?.lot_size || 25;
    // Check if leg already exists
    const existingIdx = builderLegs.findIndex(l => l.strike === strike && l.option_type === optionType && l.action === action);
    if (existingIdx >= 0) {
      // Toggle or increment
      const updated = [...builderLegs];
      updated[existingIdx].lots += 1;
      setBuilderLegs(updated);
      return;
    }

    const newLeg: Leg = {
      id: `leg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      action,
      option_type: optionType,
      strike,
      lots: 1,
      lot_size: lotSize,
      premium: ltp || (action === 'BUY' ? (ask || 10.0) : (bid || 10.0)),
      name: `${action} ${strike} ${optionType}`,
      disabled: false,
      expiry: selectedExpiry,
      bid,
      ask
    };
    setBuilderLegs(prev => [...prev, newLeg]);
  };

  // Modify Leg
  const handleUpdateLeg = (index: number, updates: Partial<Leg>) => {
    setBuilderLegs(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      return copy;
    });
  };

  // Remove Leg
  const handleRemoveLeg = (index: number) => {
    setBuilderLegs(prev => prev.filter((_, i) => i !== index));
  };

  // Clear all legs
  const handleClearAllLegs = () => {
    setBuilderLegs([]);
    setAnalysis(null);
  };

  // Shift all strikes up or down
  const handleShiftStrikes = (direction: 'UP' | 'DOWN') => {
    const interval = chainData?.interval || 50;
    const delta = direction === 'UP' ? interval : -interval;
    setBuilderLegs(prev =>
      prev.map(l => ({
        ...l,
        strike: Math.round(l.strike + delta)
      }))
    );
  };

  // Adjust spread width
  const handleAdjustWidth = (direction: 'WIDER' | 'NARROWER') => {
    if (builderLegs.length < 2) return;
    const interval = chainData?.interval || 50;
    const delta = direction === 'WIDER' ? interval : -interval;
    setBuilderLegs(prev => {
      const sorted = [...prev].sort((a, b) => a.strike - b.strike);
      if (sorted.length >= 2) {
        sorted[sorted.length - 1].strike += delta;
      }
      return sorted;
    });
  };

  // Load Predefined Strategy
  const handleSelectTemplate = (templateId: string) => {
    const tpl = templates.find(t => t.id === templateId);
    if (tpl && tpl.legs) {
      const mapped = tpl.legs.map((l, idx) => ({
        ...l,
        id: `leg_tpl_${Date.now()}_${idx}`,
        disabled: false,
        expiry: selectedExpiry
      }));
      setBuilderLegs(mapped);
    }
  };

  // Save Strategy to backend
  const handleSaveStrategy = async () => {
    if (!newStrategyName.trim() || builderLegs.length === 0) return;
    try {
      const res = await fetch(`${getApiBase()}/api/options/saved-strategies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStrategyName,
          symbol: selectedSymbol,
          legs: builderLegs,
          notes: newStrategyNotes,
          analysis
        })
      });
      if (res.ok) {
        setSaveSuccessMsg('Strategy saved successfully!');
        setNewStrategyName('');
        setNewStrategyNotes('');
        fetchSavedStrategies();
        setTimeout(() => {
          setSaveSuccessMsg(null);
          setSaveModalOpen(false);
        }, 1200);
      }
    } catch (err) {
      console.error('Error saving strategy:', err);
    }
  };

  // Delete saved strategy
  const handleDeleteSavedStrategy = async (id: string) => {
    try {
      const res = await fetch(`${getApiBase()}/api/options/saved-strategies/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchSavedStrategies();
      }
    } catch (err) {
      console.error('Error deleting saved strategy:', err);
    }
  };

  // Filtered Instruments
  const filteredInstruments = useMemo(() => {
    return instruments.filter(inst => {
      if (instrumentCategory === 'INDICES' && inst.type !== 'INDEX') return false;
      if (instrumentCategory === 'STOCKS' && inst.type === 'INDEX') return false;
      if (!symbolSearchQuery) return true;
      const q = symbolSearchQuery.toLowerCase();
      return inst.symbol.toLowerCase().includes(q) || inst.name.toLowerCase().includes(q);
    });
  }, [instruments, instrumentCategory, symbolSearchQuery]);

  // Filtered templates by category
  const filteredTemplates = useMemo(() => {
    if (selectedTemplateCategory === 'All') return templates;
    return templates.filter(t => t.category.toLowerCase() === selectedTemplateCategory.toLowerCase());
  }, [templates, selectedTemplateCategory]);

  // Sorted Chain Rows
  const sortedChainRows = useMemo(() => {
    if (!chainData?.chain) return [];
    const rows = [...chainData.chain];
    return rows.sort((a, b) => {
      let aVal = a.strike;
      let bVal = b.strike;
      if (sortBy === 'call_oi') { aVal = a.call.oi; bVal = b.call.oi; }
      if (sortBy === 'put_oi') { aVal = a.put.oi; bVal = b.put.oi; }
      if (sortBy === 'call_vol') { aVal = a.call.volume; bVal = b.call.volume; }
      if (sortBy === 'put_vol') { aVal = a.put.volume; bVal = b.put.volume; }
      if (sortBy === 'call_ltp') { aVal = a.call.ltp; bVal = b.call.ltp; }
      if (sortBy === 'put_ltp') { aVal = a.put.ltp; bVal = b.put.ltp; }
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [chainData, sortBy, sortOrder]);

  // Compute 60-FPS Dual Payoff Curves (Expiry Curve + Target Date Curve)
  const spot = chainData?.spot_price || 25000;
  const lotSize = chainData?.lot_size || 25;
  const dteTotal = chainData?.days_to_expiry || 5;

  const dualPayoffData = useMemo(() => {
    const activeLegs = builderLegs.filter(l => !l.disabled);
    if (activeLegs.length === 0) return { points: [], minPnl: -5000, maxPnl: 5000, targetPnlAtTarget: 0 };

    const minSpot = Math.round(spot * 0.88);
    const maxSpot = Math.round(spot * 1.12);
    const steps = 70;
    const stepSize = (maxSpot - minSpot) / steps;

    const r = 0.065;
    const sigma = Math.max(0.08, 0.16 + (ivOffset / 100.0));
    // Remaining time to target date in years
    const remainingDaysAtTarget = Math.max(0.05, dteTotal - targetDteOffset);
    const tauTarget = remainingDaysAtTarget / 365.0;

    const points: PayoffPoint[] = [];
    let minPnl = 999999;
    let maxPnl = -999999;
    let targetPnlAtTarget = 0;

    for (let i = 0; i <= steps; i++) {
      const s = minSpot + i * stepSize;
      let pnlExpiry = 0;
      let pnlTarget = 0;

      for (const leg of activeLegs) {
        const qty = leg.lots * multiplier * lotSize;
        const k = leg.strike;
        const prem = leg.premium;

        // 1. Expiry payoff
        const expVal = leg.option_type === 'CE' ? Math.max(0, s - k) : Math.max(0, k - s);
        const legExpPnl = leg.action === 'BUY' ? (expVal - prem) * qty : (prem - expVal) * qty;
        pnlExpiry += legExpPnl;

        // 2. Target Date payoff via Black-Scholes
        const targetTheoPrice = bsPrice(s, k, tauTarget, r, sigma, leg.option_type);
        const legTargetPnl = leg.action === 'BUY' ? (targetTheoPrice - prem) * qty : (prem - targetTheoPrice) * qty;
        pnlTarget += legTargetPnl;
      }

      minPnl = Math.min(minPnl, pnlExpiry, pnlTarget);
      maxPnl = Math.max(maxPnl, pnlExpiry, pnlTarget);

      const isCurrentSpot = Math.abs(s - spot) < stepSize * 0.6;
      const isTargetSpot = Math.abs(s - targetPrice) < stepSize * 0.6;

      if (isTargetSpot) {
        targetPnlAtTarget = pnlTarget;
      }

      points.push({
        spot: Math.round(s),
        pnl: Math.round(pnlExpiry),
        pnl_target: Math.round(pnlTarget),
        is_spot: isCurrentSpot,
        is_target: isTargetSpot
      });
    }

    // Safety buffer on Y-axis
    const pnlRange = Math.max(5000, maxPnl - minPnl);
    return {
      points,
      minPnl: Math.min(-1000, minPnl - pnlRange * 0.08),
      maxPnl: Math.max(1000, maxPnl + pnlRange * 0.08),
      targetPnlAtTarget: Math.round(targetPnlAtTarget)
    };
  }, [builderLegs, spot, lotSize, dteTotal, targetDteOffset, ivOffset, multiplier, targetPrice]);

  // Portfolio Greeks Summation
  const portfolioGreeks = useMemo(() => {
    const activeLegs = builderLegs.filter(l => !l.disabled);
    let totalDelta = 0;
    let totalTheta = 0;
    let totalGamma = 0;
    let totalVega = 0;

    const r = 0.065;
    const sigma = Math.max(0.08, 0.16 + (ivOffset / 100.0));
    const tau = Math.max(0.05, dteTotal - targetDteOffset) / 365.0;

    for (const leg of activeLegs) {
      const g = bsGreeks(spot, leg.strike, tau, r, sigma, leg.option_type);
      const sign = leg.action === 'BUY' ? 1 : -1;
      const qty = leg.lots * multiplier * lotSize;

      totalDelta += sign * g.delta * qty;
      totalTheta += sign * g.theta * qty;
      totalGamma += sign * g.gamma * qty;
      totalVega += sign * g.vega * qty;
    }

    return {
      delta: roundTo(totalDelta / lotSize, 3), // in lots
      theta: Math.round(totalTheta),
      gamma: roundTo(totalGamma, 5),
      vega: Math.round(totalVega)
    };
  }, [builderLegs, spot, lotSize, dteTotal, targetDteOffset, ivOffset, multiplier]);

  // Standard Deviation Bands (1 SD = 68%, 2 SD = 95%)
  const standardDeviations = useMemo(() => {
    const sigma = Math.max(0.08, 0.16 + (ivOffset / 100.0));
    const t = Math.max(0.5, dteTotal) / 365.0;
    const oneSdPoints = Math.round(spot * sigma * Math.sqrt(t));
    const twoSdPoints = Math.round(oneSdPoints * 2);

    return {
      oneSd: {
        points: oneSdPoints,
        pct: roundTo((oneSdPoints / spot) * 100, 1),
        low: Math.round(spot - oneSdPoints),
        high: Math.round(spot + oneSdPoints)
      },
      twoSd: {
        points: twoSdPoints,
        pct: roundTo((twoSdPoints / spot) * 100, 1),
        low: Math.round(spot - twoSdPoints),
        high: Math.round(spot + twoSdPoints)
      }
    };
  }, [spot, dteTotal, ivOffset]);

  function roundTo(num: number, dec: number) {
    const f = Math.pow(10, dec);
    return Math.round(num * f) / f;
  }

  // Active strategy title
  const activeStrategyTitle = useMemo(() => {
    const active = builderLegs.filter(l => !l.disabled);
    if (active.length === 0) return 'No Legs Selected';
    if (active.length === 1) return `${active[0].action} ${active[0].strike} ${active[0].option_type}`;
    if (active.length === 2) {
      if (active[0].option_type === 'CE' && active[1].option_type === 'CE') {
        return active[0].action === 'BUY' ? 'Bull Call Spread' : 'Bear Call Spread';
      }
      if (active[0].option_type === 'PE' && active[1].option_type === 'PE') {
        return active[0].action === 'BUY' ? 'Bear Put Spread' : 'Bull Put Spread';
      }
      if (active[0].strike === active[1].strike) return 'Straddle';
      return 'Strangle';
    }
    if (active.length === 4) return 'Iron Condor';
    return `${active.length}-Leg Custom Strategy`;
  }, [builderLegs]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main, #050811)', color: 'var(--text-primary, #ffffff)', paddingBottom: '60px' }}>
      <NavigationDrawer isOpen={navDrawerOpen} onClose={() => setNavDrawerOpen(false)} />

      {/* Top Barometer */}
      <div style={{ borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', background: 'rgba(5, 8, 17, 0.95)', position: 'sticky', top: 0, zIndex: 40 }}>
        <IndicesBarometer />
      </div>

      <div style={{ maxWidth: '1800px', margin: '0 auto', padding: '16px 20px' }}>

        {/* ============================================================== */}
        {/* HEADER CONTROLS BAR: SEARCH, SPOT, EXPIRY & WORKSTATION TOGGLE */}
        {/* ============================================================== */}
        <div style={{
          background: 'var(--bg-card, #0d131f)',
          border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '12px 18px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px'
        }}>
          {/* Left: Searchable Symbol Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setSymbolDropdownOpen(!symbolDropdownOpen)}
                style={{
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  borderRadius: '8px',
                  padding: '7px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                <Search size={15} color="#818cf8" />
                <span>{selectedSymbol}</span>
                <span style={{ fontSize: '0.74rem', color: '#34d399', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 6px', borderRadius: '4px' }}>
                  ₹{(chainData?.spot_price || spot).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span style={{ fontSize: '0.72rem', color: (chainData?.change_pct || 0) >= 0 ? '#10b981' : '#ef4444' }}>
                  {(chainData?.change_pct || 0) >= 0 ? '+' : ''}{(chainData?.change_pct || 0).toFixed(2)}%
                </span>
                <ChevronDown size={14} color="#818cf8" />
              </button>

              {/* Autocomplete Dropdown */}
              {symbolDropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: '110%',
                  left: 0,
                  width: '320px',
                  background: '#0a0f1d',
                  border: '1px solid rgba(99, 102, 241, 0.35)',
                  borderRadius: '10px',
                  boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6)',
                  zIndex: 100,
                  padding: '8px'
                }}>
                  <input
                    type="text"
                    placeholder="Search 224+ F&O stocks & indices..."
                    value={symbolSearchQuery}
                    onChange={e => setSymbolSearchQuery(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      color: '#ffffff',
                      fontSize: '0.8rem',
                      outline: 'none',
                      marginBottom: '8px'
                    }}
                  />
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                    {(['ALL', 'INDICES', 'STOCKS'] as const).map(cat => (
                      <button
                        key={cat}
                        onClick={() => setInstrumentCategory(cat)}
                        style={{
                          flex: 1,
                          padding: '4px',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          borderRadius: '4px',
                          background: instrumentCategory === cat ? '#6366f1' : 'rgba(255, 255, 255, 0.05)',
                          border: 'none',
                          color: '#ffffff',
                          cursor: 'pointer'
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                    {filteredInstruments.slice(0, 50).map(inst => (
                      <div
                        key={inst.symbol}
                        onClick={() => {
                          setSelectedSymbol(inst.symbol);
                          setSelectedExpiry('');
                          setSymbolDropdownOpen(false);
                          setSymbolSearchQuery('');
                        }}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer',
                          background: selectedSymbol === inst.symbol ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                          fontSize: '0.78rem'
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.background = selectedSymbol === inst.symbol ? 'rgba(99, 102, 241, 0.2)' : 'transparent')}
                      >
                        <div>
                          <strong style={{ color: '#ffffff' }}>{inst.symbol}</strong>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '6px' }}>{inst.name}</span>
                        </div>
                        <span style={{ fontSize: '0.65rem', color: '#a5b4fc', background: 'rgba(99, 102, 241, 0.15)', padding: '2px 5px', borderRadius: '4px' }}>
                          Lot: {inst.lot_size}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Expiry Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Expiry:</span>
              <select
                value={selectedExpiry}
                onChange={e => setSelectedExpiry(e.target.value)}
                style={{
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  color: '#ffffff',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                {expiries.map(exp => (
                  <option key={exp} value={exp}>{exp}</option>
                ))}
              </select>
              {chainData?.days_to_expiry !== undefined && (
                <span style={{ fontSize: '0.72rem', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>
                  {chainData.days_to_expiry} DTE
                </span>
              )}
            </div>
          </div>

          {/* Right: View Mode Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'inline-flex', background: 'rgba(15, 23, 42, 0.9)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setViewMode('workstation')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: viewMode === 'workstation' ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'transparent',
                  color: viewMode === 'workstation' ? '#ffffff' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Sliders size={13} />
                Workstation (Sensibull Style)
              </button>
              <button
                onClick={() => {
                  setViewMode('smart_selector');
                  fetchSmartStrikeAnalysis(false);
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: viewMode === 'smart_selector' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'transparent',
                  color: viewMode === 'smart_selector' ? '#ffffff' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: viewMode === 'smart_selector' ? '0 2px 10px rgba(16, 185, 129, 0.4)' : 'none'
                }}
              >
                <Zap size={13} color={viewMode === 'smart_selector' ? '#ffffff' : '#34d399'} />
                Smart Strike Selector & Trading Plan
              </button>
              <button
                onClick={() => setViewMode('fullchain')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  background: viewMode === 'fullchain' ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'transparent',
                  color: viewMode === 'fullchain' ? '#ffffff' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Layers size={13} />
                Full Option Chain (23 Cols)
              </button>
            </div>

            <button
              onClick={() => fetchOptionChain(false)}
              disabled={isRefreshing}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '6px 10px',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
              title="Refresh Market Data"
            >
              <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* MODE 1: SENSIBULL-STYLE WORKSTATION (SPLIT VIEW)               */}
        {/* ============================================================== */}
        {viewMode === 'workstation' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(460px, 44%) 1fr',
            gap: '16px',
            alignItems: 'start'
          }}>

            {/* ------------------------------------------------------------ */}
            {/* LEFT COLUMN: ACTIVE STRATEGY LEGS + MULTI-TOOL TABS          */}
            {/* ------------------------------------------------------------ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* CARD 1: ACTIVE STRATEGY LEGS TABLE */}
              <div style={{
                background: 'var(--bg-card, #0d131f)',
                border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                borderRadius: '12px',
                padding: '16px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
              }}>
                {/* Legs Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sliders size={16} color="#818cf8" />
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#ffffff' }}>
                      {builderLegs.filter(l => !l.disabled).length} Selected - {activeStrategyTitle}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      // Reset prices to current LTP
                      const updated = builderLegs.map(l => {
                        const row = chainData?.chain.find(r => r.strike === l.strike);
                        const freshLtp = l.option_type === 'CE' ? row?.call.ltp : row?.put.ltp;
                        return { ...l, premium: freshLtp || l.premium };
                      });
                      setBuilderLegs(updated);
                    }}
                    style={{ background: 'transparent', border: 'none', color: '#818cf8', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <RotateCcw size={12} />
                    Reset Prices
                  </button>
                </div>

                {/* Strategy Legs Rows */}
                {builderLegs.length === 0 ? (
                  <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    No legs selected. Click <strong>+ B</strong> or <strong>+ S</strong> in the Option Chain below, or select a Ready-Made template.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {builderLegs.map((leg, idx) => (
                      <div
                        key={leg.id || idx}
                        style={{
                          background: leg.disabled ? 'rgba(255, 255, 255, 0.02)' : 'rgba(15, 23, 42, 0.75)',
                          border: `1px solid ${leg.disabled ? 'rgba(255, 255, 255, 0.04)' : 'rgba(99, 102, 241, 0.25)'}`,
                          borderRadius: '8px',
                          padding: '8px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          opacity: leg.disabled ? 0.5 : 1
                        }}
                      >
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={!leg.disabled}
                          onChange={e => handleUpdateLeg(idx, { disabled: !e.target.checked })}
                          style={{ cursor: 'pointer' }}
                        />

                        {/* Buy / Sell Toggle Pill */}
                        <button
                          onClick={() => handleUpdateLeg(idx, { action: leg.action === 'BUY' ? 'SELL' : 'BUY' })}
                          style={{
                            background: leg.action === 'BUY' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                            border: `1px solid ${leg.action === 'BUY' ? '#10b981' : '#ef4444'}`,
                            color: leg.action === 'BUY' ? '#10b981' : '#ef4444',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            minWidth: '28px'
                          }}
                        >
                          {leg.action === 'BUY' ? 'B' : 'S'}
                        </button>

                        {/* Expiry Pill */}
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: '46px' }}>
                          {leg.expiry ? leg.expiry.split('-').slice(0, 2).join(' ') : (selectedExpiry.split('-').slice(0, 2).join(' '))}
                        </span>

                        {/* Strike Price Stepper */}
                        <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(0, 0, 0, 0.4)', borderRadius: '6px', border: '1px solid var(--border-subtle)', padding: '1px 3px' }}>
                          <button
                            onClick={() => handleUpdateLeg(idx, { strike: leg.strike - (chainData?.interval || 50) })}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0 4px', fontWeight: 800, fontSize: '0.75rem' }}
                          >
                            -
                          </button>
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#ffffff', minWidth: '48px', textAlign: 'center' }}>
                            {leg.strike}
                          </span>
                          <button
                            onClick={() => handleUpdateLeg(idx, { strike: leg.strike + (chainData?.interval || 50) })}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0 4px', fontWeight: 800, fontSize: '0.75rem' }}
                          >
                            +
                          </button>
                        </div>

                        {/* Option Type CE/PE */}
                        <button
                          onClick={() => handleUpdateLeg(idx, { option_type: leg.option_type === 'CE' ? 'PE' : 'CE' })}
                          style={{
                            background: leg.option_type === 'CE' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            border: `1px solid ${leg.option_type === 'CE' ? '#6366f1' : '#f59e0b'}`,
                            color: leg.option_type === 'CE' ? '#818cf8' : '#fbbf24',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          {leg.option_type}
                        </button>

                        {/* Lots Stepper */}
                        <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(0, 0, 0, 0.4)', borderRadius: '6px', border: '1px solid var(--border-subtle)', padding: '1px 3px' }}>
                          <button
                            onClick={() => handleUpdateLeg(idx, { lots: Math.max(1, leg.lots - 1) })}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0 3px', fontWeight: 800 }}
                          >
                            -
                          </button>
                          <span style={{ fontSize: '0.74rem', fontWeight: 700, minWidth: '16px', textAlign: 'center' }}>
                            {leg.lots}
                          </span>
                          <button
                            onClick={() => handleUpdateLeg(idx, { lots: leg.lots + 1 })}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0 3px', fontWeight: 800 }}
                          >
                            +
                          </button>
                        </div>

                        {/* Premium Input */}
                        <input
                          type="number"
                          step="0.5"
                          value={leg.premium}
                          onChange={e => handleUpdateLeg(idx, { premium: Number(e.target.value) })}
                          style={{
                            background: 'rgba(0, 0, 0, 0.4)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '4px',
                            padding: '3px 6px',
                            color: '#ffffff',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            width: '64px',
                            textAlign: 'right'
                          }}
                        />

                        {/* Delete Trash */}
                        <button
                          onClick={() => handleRemoveLeg(idx)}
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                          title="Remove leg"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick Shift & Width Adjustments Toolbar */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  marginTop: '12px',
                  paddingTop: '10px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  flexWrap: 'wrap'
                }}>
                  {/* Shift Strikes */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Shift:</span>
                    <button
                      onClick={() => handleShiftStrikes('DOWN')}
                      style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', color: '#ffffff', borderRadius: '4px', padding: '2px 8px', fontSize: '0.74rem', cursor: 'pointer' }}
                    >
                      -
                    </button>
                    <button
                      onClick={() => handleShiftStrikes('UP')}
                      style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', color: '#ffffff', borderRadius: '4px', padding: '2px 8px', fontSize: '0.74rem', cursor: 'pointer' }}
                    >
                      +
                    </button>
                  </div>

                  {/* Spread Width */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Width:</span>
                    <button
                      onClick={() => handleAdjustWidth('NARROWER')}
                      style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', color: '#ffffff', borderRadius: '4px', padding: '2px 8px', fontSize: '0.74rem', cursor: 'pointer' }}
                    >
                      -
                    </button>
                    <button
                      onClick={() => handleAdjustWidth('WIDER')}
                      style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', color: '#ffffff', borderRadius: '4px', padding: '2px 8px', fontSize: '0.74rem', cursor: 'pointer' }}
                    >
                      +
                    </button>
                  </div>

                  {/* Lots Multiplier */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Multiplier:</span>
                    <select
                      value={multiplier}
                      onChange={e => setMultiplier(Number(e.target.value))}
                      style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: '#ffffff', fontSize: '0.72rem', padding: '2px 6px' }}
                    >
                      {[1, 2, 3, 5, 10].map(m => (
                        <option key={m} value={m}>{m}x</option>
                      ))}
                    </select>
                  </div>

                  {/* Net Premium Preview */}
                  <div style={{ fontSize: '0.75rem', fontWeight: 800 }}>
                    <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>Net:</span>
                    <span style={{ color: analysis?.is_credit ? '#10b981' : '#ef4444' }}>
                      {analysis?.is_credit ? '+' : '-'}₹{Math.abs(analysis?.net_premium_total || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button
                    onClick={() => setLeftTab('chain')}
                    style={{
                      flex: 1,
                      background: 'rgba(99, 102, 241, 0.15)',
                      border: '1px solid rgba(99, 102, 241, 0.4)',
                      borderRadius: '6px',
                      padding: '7px 12px',
                      color: '#818cf8',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px'
                    }}
                  >
                    <Plus size={13} />
                    Add / Edit from Chain
                  </button>
                  <button
                    onClick={() => setSaveModalOpen(true)}
                    disabled={builderLegs.length === 0}
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '7px 12px',
                      color: '#ffffff',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      cursor: builderLegs.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: builderLegs.length === 0 ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <Save size={13} />
                    Save / Draft
                  </button>
                  <button
                    onClick={handleClearAllLegs}
                    disabled={builderLegs.length === 0}
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '6px',
                      padding: '7px 10px',
                      color: '#ef4444',
                      fontSize: '0.76rem',
                      cursor: 'pointer'
                    }}
                    title="Clear All Legs"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* CARD 2: LOWER LEFT MULTI-TOOL TABS (OPTION CHAIN / READY-MADE / SAVED) */}
              <div style={{
                background: 'var(--bg-card, #0d131f)',
                border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                borderRadius: '12px',
                padding: '14px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
              }}>
                {/* Sub-tabs header */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', marginBottom: '12px', gap: '4px' }}>
                  <button
                    onClick={() => setLeftTab('chain')}
                    style={{
                      background: leftTab === 'chain' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                      borderBottom: leftTab === 'chain' ? '2px solid #6366f1' : '2px solid transparent',
                      borderTop: 'none',
                      borderLeft: 'none',
                      borderRight: 'none',
                      color: leftTab === 'chain' ? '#ffffff' : 'var(--text-secondary)',
                      padding: '7px 14px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Layers size={13} />
                    Option Chain
                  </button>

                  <button
                    onClick={() => setLeftTab('templates')}
                    style={{
                      background: leftTab === 'templates' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                      borderBottom: leftTab === 'templates' ? '2px solid #6366f1' : '2px solid transparent',
                      borderTop: 'none',
                      borderLeft: 'none',
                      borderRight: 'none',
                      color: leftTab === 'templates' ? '#ffffff' : 'var(--text-secondary)',
                      padding: '7px 14px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Sliders size={13} />
                    Ready-made ({templates.length})
                  </button>

                  <button
                    onClick={() => setLeftTab('saved')}
                    style={{
                      background: leftTab === 'saved' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                      borderBottom: leftTab === 'saved' ? '2px solid #6366f1' : '2px solid transparent',
                      borderTop: 'none',
                      borderLeft: 'none',
                      borderRight: 'none',
                      color: leftTab === 'saved' ? '#ffffff' : 'var(--text-secondary)',
                      padding: '7px 14px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <FolderOpen size={13} />
                    Saved Strategies
                  </button>
                </div>

                {/* TAB CONTENT A: COMPACT LEFT OPTION CHAIN */}
                {leftTab === 'chain' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <span>Select strikes to add legs to the strategy above:</span>
                      <span>ATM Strike: <strong style={{ color: '#c084fc' }}>{chainData?.atm_strike}</strong></span>
                    </div>

                    <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                        <thead>
                          <tr style={{ background: '#090d16', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', position: 'sticky', top: 0, zIndex: 10 }}>
                            <th style={{ padding: '6px 4px', textAlign: 'center', color: '#10b981' }}>+ Call</th>
                            <th style={{ padding: '6px 4px', textAlign: 'right' }}>CE LTP</th>
                            <th style={{ padding: '6px 4px', textAlign: 'right' }}>OI</th>
                            <th style={{ padding: '6px 6px', textAlign: 'center', background: '#0f172a', color: '#c084fc', fontWeight: 800 }}>STRIKE</th>
                            <th style={{ padding: '6px 4px', textAlign: 'left' }}>OI</th>
                            <th style={{ padding: '6px 4px', textAlign: 'left' }}>PE LTP</th>
                            <th style={{ padding: '6px 4px', textAlign: 'center', color: '#f87171' }}>+ Put</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedChainRows.map(row => {
                            const isAtm = row.is_atm;
                            const isCallSelected = builderLegs.some(l => l.strike === row.strike && l.option_type === 'CE');
                            const isPutSelected = builderLegs.some(l => l.strike === row.strike && l.option_type === 'PE');

                            return (
                              <tr
                                key={row.strike}
                                style={{
                                  borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                                  background: isAtm ? 'rgba(168, 85, 247, 0.12)' : 'transparent'
                                }}
                              >
                                {/* Quick Add Call: Buy / Sell */}
                                <td style={{ padding: '4px', textAlign: 'center' }}>
                                  <div style={{ display: 'inline-flex', gap: '3px' }}>
                                    <button
                                      onClick={() => handleAddLegFromChain(row.strike, 'CE', 'BUY', row.call.ltp, row.call.bid, row.call.ask)}
                                      style={{
                                        background: isCallSelected ? '#10b981' : 'rgba(16, 185, 129, 0.15)',
                                        border: '1px solid rgba(16, 185, 129, 0.4)',
                                        color: isCallSelected ? '#ffffff' : '#10b981',
                                        borderRadius: '3px',
                                        padding: '1px 5px',
                                        fontSize: '0.64rem',
                                        fontWeight: 800,
                                        cursor: 'pointer'
                                      }}
                                      title="Buy Call"
                                    >
                                      B
                                    </button>
                                    <button
                                      onClick={() => handleAddLegFromChain(row.strike, 'CE', 'SELL', row.call.ltp, row.call.bid, row.call.ask)}
                                      style={{
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        border: '1px solid rgba(239, 68, 68, 0.4)',
                                        color: '#ef4444',
                                        borderRadius: '3px',
                                        padding: '1px 5px',
                                        fontSize: '0.64rem',
                                        fontWeight: 800,
                                        cursor: 'pointer'
                                      }}
                                      title="Sell Call"
                                    >
                                      S
                                    </button>
                                  </div>
                                </td>

                                {/* Call LTP */}
                                <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700, color: '#34d399' }}>
                                  ₹{row.call.ltp.toFixed(1)}
                                </td>

                                {/* Call OI */}
                                <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.68rem' }}>
                                  {(row.call.oi / 1000).toFixed(0)}k
                                </td>

                                {/* Center Strike */}
                                <td style={{
                                  padding: '4px 6px',
                                  textAlign: 'center',
                                  background: isAtm ? '#9333ea' : '#0f172a',
                                  color: '#ffffff',
                                  fontWeight: 800,
                                  fontSize: '0.76rem'
                                }}>
                                  {row.strike}
                                </td>

                                {/* Put OI */}
                                <td style={{ padding: '4px 6px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.68rem' }}>
                                  {(row.put.oi / 1000).toFixed(0)}k
                                </td>

                                {/* Put LTP */}
                                <td style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 700, color: '#f87171' }}>
                                  ₹{row.put.ltp.toFixed(1)}
                                </td>

                                {/* Quick Add Put: Buy / Sell */}
                                <td style={{ padding: '4px', textAlign: 'center' }}>
                                  <div style={{ display: 'inline-flex', gap: '3px' }}>
                                    <button
                                      onClick={() => handleAddLegFromChain(row.strike, 'PE', 'BUY', row.put.ltp, row.put.bid, row.put.ask)}
                                      style={{
                                        background: isPutSelected ? '#10b981' : 'rgba(16, 185, 129, 0.15)',
                                        border: '1px solid rgba(16, 185, 129, 0.4)',
                                        color: isPutSelected ? '#ffffff' : '#10b981',
                                        borderRadius: '3px',
                                        padding: '1px 5px',
                                        fontSize: '0.64rem',
                                        fontWeight: 800,
                                        cursor: 'pointer'
                                      }}
                                      title="Buy Put"
                                    >
                                      B
                                    </button>
                                    <button
                                      onClick={() => handleAddLegFromChain(row.strike, 'PE', 'SELL', row.put.ltp, row.put.bid, row.put.ask)}
                                      style={{
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        border: '1px solid rgba(239, 68, 68, 0.4)',
                                        color: '#ef4444',
                                        borderRadius: '3px',
                                        padding: '1px 5px',
                                        fontSize: '0.64rem',
                                        fontWeight: 800,
                                        cursor: 'pointer'
                                      }}
                                      title="Sell Put"
                                    >
                                      S
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB CONTENT B: READY-MADE STRATEGIES (SENSIBULL STYLE GRID) */}
                {leftTab === 'templates' && (
                  <div>
                    {/* Category Filter Pills */}
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                      {['All', 'Bullish', 'Bearish', 'Neutral'].map(cat => (
                        <button
                          key={cat}
                          onClick={() => setSelectedTemplateCategory(cat)}
                          style={{
                            background: selectedTemplateCategory === cat ? '#6366f1' : 'rgba(255, 255, 255, 0.05)',
                            border: `1px solid ${selectedTemplateCategory === cat ? '#6366f1' : 'var(--border-subtle)'}`,
                            color: selectedTemplateCategory === cat ? '#ffffff' : 'var(--text-secondary)',
                            borderRadius: '6px',
                            padding: '3px 10px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    {/* Cards Grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                      gap: '8px',
                      maxHeight: '400px',
                      overflowY: 'auto'
                    }}>
                      {filteredTemplates.map(t => (
                        <div
                          key={t.id}
                          onClick={() => handleSelectTemplate(t.id)}
                          style={{
                            background: 'rgba(15, 23, 42, 0.6)',
                            border: '1px solid rgba(99, 102, 241, 0.25)',
                            borderRadius: '8px',
                            padding: '8px 6px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.borderColor = '#818cf8';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.25)';
                            e.currentTarget.style.transform = 'translateY(0)';
                          }}
                        >
                          <StrategyMiniThumbnail type={t.id} />
                          <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.2 }}>
                            {t.name}
                          </div>
                          <span style={{
                            display: 'inline-block',
                            marginTop: '4px',
                            fontSize: '0.62rem',
                            color: t.category === 'Bullish' ? '#34d399' : t.category === 'Bearish' ? '#f87171' : '#38bdf8'
                          }}>
                            {t.outlook}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB CONTENT C: SAVED STRATEGIES */}
                {leftTab === 'saved' && (
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {savedStrategies.length === 0 ? (
                      <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        No saved strategies found. Build a strategy and click <strong>Save / Draft</strong>.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {savedStrategies.map(s => (
                          <div
                            key={s.id}
                            style={{
                              background: 'rgba(15, 23, 42, 0.6)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '8px',
                              padding: '10px 12px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div>
                              <strong style={{ fontSize: '0.82rem', color: '#ffffff' }}>{s.name}</strong>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {s.symbol} • {s.legs.length} Legs • {new Date(s.created_at).toLocaleDateString()}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                onClick={() => {
                                  setSelectedSymbol(s.symbol);
                                  setBuilderLegs(s.legs);
                                }}
                                style={{
                                  background: 'rgba(99, 102, 241, 0.2)',
                                  border: '1px solid #6366f1',
                                  color: '#818cf8',
                                  borderRadius: '4px',
                                  padding: '3px 8px',
                                  fontSize: '0.72rem',
                                  cursor: 'pointer'
                                }}
                              >
                                Load
                              </button>
                              <button
                                onClick={() => handleDeleteSavedStrategy(s.id)}
                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ------------------------------------------------------------ */}
            {/* RIGHT COLUMN: SENSBULL-STYLE PAYOFF GRAPH, KPIS & SIMULATION */}
            {/* ------------------------------------------------------------ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* CARD 1: TOP KPI METRICS STRIP */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '10px'
              }}>
                {/* Max Profit */}
                <div style={{ background: 'var(--bg-card, #0d131f)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#34d399', fontWeight: 700 }}>MAX PROFIT</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                    {analysis?.max_profit_str || 'Unlimited'}
                  </div>
                </div>

                {/* Max Loss */}
                <div style={{ background: 'var(--bg-card, #0d131f)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#f87171', fontWeight: 700 }}>MAX LOSS</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ef4444', marginTop: '2px' }}>
                    {analysis?.max_loss_str || '-₹4,924'}
                  </div>
                </div>

                {/* Risk / Reward & POP */}
                <div style={{ background: 'var(--bg-card, #0d131f)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>REWARD / RISK</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                    {analysis?.risk_reward_ratio || '1 : 1.6'}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#38bdf8', marginTop: '2px' }}>
                    POP: {analysis?.probability_of_profit_pct || 46}%
                  </div>
                </div>

                {/* Breakevens */}
                <div style={{ background: 'var(--bg-card, #0d131f)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>BREAKEVEN(S)</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                    {analysis?.breakevens && analysis.breakevens.length > 0
                      ? analysis.breakevens.map(b => `₹${Math.round(b).toLocaleString()}`).join(', ')
                      : `₹${spot}`}
                  </div>
                </div>

                {/* Margin Required */}
                <div style={{ background: 'var(--bg-card, #0d131f)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>EST. MARGIN</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#a5b4fc', marginTop: '2px' }}>
                    ₹{Math.round(analysis?.estimated_margin_required || 42000).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* CARD 2: INTERACTIVE SVG PAYOFF GRAPH & SIMULATION SLIDERS */}
              <div style={{
                background: 'var(--bg-card, #0d131f)',
                border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                borderRadius: '12px',
                padding: '16px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)'
              }}>
                {/* Graph Legend & Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.74rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '12px', height: '3px', background: '#10b981', display: 'inline-block' }}></span>
                      <span style={{ color: 'var(--text-secondary)' }}>On Expiry</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '12px', height: '3px', background: '#38bdf8', display: 'inline-block' }}></span>
                      <span style={{ color: '#38bdf8' }}>On Target Date (T+{targetDteOffset})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '8px', height: '8px', background: 'rgba(16, 185, 129, 0.4)', display: 'inline-block' }}></span>
                      <span style={{ color: 'var(--text-muted)' }}>Call OI</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '8px', height: '8px', background: 'rgba(239, 68, 68, 0.4)', display: 'inline-block' }}></span>
                      <span style={{ color: 'var(--text-muted)' }}>Put OI</span>
                    </div>
                  </div>

                  {/* Projected P&L indicator badge */}
                  <div style={{
                    background: dualPayoffData.targetPnlAtTarget >= 0 ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.18)',
                    border: `1px solid ${dualPayoffData.targetPnlAtTarget >= 0 ? '#10b981' : '#ef4444'}`,
                    borderRadius: '6px',
                    padding: '3px 10px',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    color: dualPayoffData.targetPnlAtTarget >= 0 ? '#34d399' : '#f87171'
                  }}>
                    Projected P&L: {dualPayoffData.targetPnlAtTarget >= 0 ? '+' : ''}₹{dualPayoffData.targetPnlAtTarget.toLocaleString()}
                  </div>
                </div>

                {/* SVG Payoff Curve Container */}
                <div style={{ width: '100%', height: '340px', position: 'relative', background: '#070a12', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)', overflow: 'hidden' }}>
                  {dualPayoffData.points.length > 0 && (() => {
                    const width = 800;
                    const height = 340;
                    const padX = 50;
                    const padY = 30;
                    const plotW = width - padX * 2;
                    const plotH = height - padY * 2;

                    const pts = dualPayoffData.points;
                    const minSpotVal = pts[0].spot;
                    const maxSpotVal = pts[pts.length - 1].spot;
                    const minPnlVal = dualPayoffData.minPnl;
                    const maxPnlVal = dualPayoffData.maxPnl;

                    const scaleX = (s: number) => padX + ((s - minSpotVal) / (maxSpotVal - minSpotVal)) * plotW;
                    const scaleY = (p: number) => padY + plotH - ((p - minPnlVal) / (maxPnlVal - minPnlVal)) * plotH;

                    const zeroY = scaleY(0);

                    // Polyline paths
                    const pathExpiry = pts.map(p => `${scaleX(p.spot)},${scaleY(p.pnl)}`).join(' ');
                    const pathTarget = pts.map(p => `${scaleX(p.spot)},${scaleY(p.pnl_target || 0)}`).join(' ');

                    // Green & Red Shaded polygon
                    const fillPointsGreen = pts
                      .map(p => `${scaleX(p.spot)},${scaleY(Math.max(0, p.pnl))}`)
                      .concat([`${scaleX(maxSpotVal)},${zeroY}`, `${scaleX(minSpotVal)},${zeroY}`])
                      .join(' ');

                    const fillPointsRed = pts
                      .map(p => `${scaleX(p.spot)},${scaleY(Math.min(0, p.pnl))}`)
                      .concat([`${scaleX(maxSpotVal)},${zeroY}`, `${scaleX(minSpotVal)},${zeroY}`])
                      .join(' ');

                    const currentSpotX = scaleX(spot);
                    const targetSpotX = scaleX(targetPrice);

                    return (
                      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="greenFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                          </linearGradient>
                          <linearGradient id="redFill" x1="0" y1="1" x2="0" y2="0">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        {/* Open Interest Overlay Bars */}
                        {sortedChainRows.slice(0, 20).map(r => {
                          const rx = scaleX(r.strike);
                          if (rx < padX || rx > width - padX) return null;
                          const callH = Math.min(80, (r.call.oi / 50000) * 30);
                          const putH = Math.min(80, (r.put.oi / 50000) * 30);
                          return (
                            <g key={`oi_${r.strike}`} opacity="0.3">
                              <rect x={rx - 4} y={zeroY - callH} width="3" height={callH} fill="#10b981" />
                              <rect x={rx} y={zeroY - putH} width="3" height={putH} fill="#ef4444" />
                            </g>
                          );
                        })}

                        {/* Shaded Area */}
                        <polygon points={fillPointsGreen} fill="url(#greenFill)" />
                        <polygon points={fillPointsRed} fill="url(#redFill)" />

                        {/* Zero P&L horizontal line */}
                        <line x1={padX} y1={zeroY} x2={width - padX} y2={zeroY} stroke="rgba(255, 255, 255, 0.2)" strokeDasharray="3,3" strokeWidth="1" />
                        <text x={padX - 8} y={zeroY + 4} fill="rgba(255, 255, 255, 0.4)" fontSize="10" textAnchor="end">₹0</text>

                        {/* Current Spot Vertical Line */}
                        <line x1={currentSpotX} y1={padY} x2={currentSpotX} y2={height - padY} stroke="#c084fc" strokeDasharray="4,3" strokeWidth="1.5" />
                        <text x={currentSpotX} y={padY - 8} fill="#c084fc" fontSize="10" fontWeight="700" textAnchor="middle">
                          Spot: {spot}
                        </text>

                        {/* Target Price Vertical Line */}
                        <line x1={targetSpotX} y1={padY} x2={targetSpotX} y2={height - padY} stroke="#38bdf8" strokeWidth="2" />
                        <text x={targetSpotX} y={height - padY + 16} fill="#38bdf8" fontSize="10" fontWeight="800" textAnchor="middle">
                          Target: {targetPrice}
                        </text>

                        {/* On Expiry Curve */}
                        <polyline points={pathExpiry} fill="none" stroke="#10b981" strokeWidth="2.5" />

                        {/* On Target Date Curve */}
                        <polyline points={pathTarget} fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4,2" />

                        {/* Active Legs Strike Markers */}
                        {builderLegs.filter(l => !l.disabled).map((leg, idx) => {
                          const lx = scaleX(leg.strike);
                          if (lx < padX || lx > width - padX) return null;
                          return (
                            <circle
                              key={`dot_${idx}`}
                              cx={lx}
                              cy={zeroY}
                              r="4"
                              fill={leg.action === 'BUY' ? '#10b981' : '#ef4444'}
                              stroke="#ffffff"
                              strokeWidth="1.5"
                            />
                          );
                        })}
                      </svg>
                    );
                  })()}
                </div>

                {/* Simulation Sliders (Target Price & Time Decay) */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px',
                  marginTop: '14px',
                  paddingTop: '12px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)'
                }}>
                  {/* Slider 1: Underlying Price Target */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        Underlying Target Price:
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => setTargetPrice(prev => Math.round(prev - (chainData?.interval || 50)))}
                          style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', borderRadius: '3px', color: '#ffffff', padding: '1px 6px', fontSize: '0.7rem', cursor: 'pointer' }}
                        >
                          -
                        </button>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#38bdf8' }}>
                          ₹{targetPrice} ({(((targetPrice - spot) / spot) * 100).toFixed(1)}%)
                        </span>
                        <button
                          onClick={() => setTargetPrice(prev => Math.round(prev + (chainData?.interval || 50)))}
                          style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', borderRadius: '3px', color: '#ffffff', padding: '1px 6px', fontSize: '0.7rem', cursor: 'pointer' }}
                        >
                          +
                        </button>
                        <button
                          onClick={() => setTargetPrice(spot)}
                          style={{ background: 'transparent', border: 'none', color: '#818cf8', fontSize: '0.68rem', cursor: 'pointer' }}
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={Math.round(spot * 0.9)}
                      max={Math.round(spot * 1.1)}
                      step={chainData?.interval || 50}
                      value={targetPrice}
                      onChange={e => setTargetPrice(Number(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer', accentColor: '#38bdf8' }}
                    />
                  </div>

                  {/* Slider 2: Target Date / Theta Decay Simulation */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        Target Date Simulation:
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#c084fc' }}>
                          T+{targetDteOffset} Days ({Math.max(0, dteTotal - targetDteOffset)} DTE)
                        </span>
                        <button
                          onClick={() => setTargetDteOffset(0)}
                          style={{ background: 'transparent', border: 'none', color: '#818cf8', fontSize: '0.68rem', cursor: 'pointer' }}
                        >
                          Today
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, dteTotal)}
                      step={1}
                      value={targetDteOffset}
                      onChange={e => setTargetDteOffset(Number(e.target.value))}
                      style={{ width: '100%', cursor: 'pointer', accentColor: '#c084fc' }}
                    />
                  </div>
                </div>
              </div>

              {/* CARD 3: BOTTOM DEEP ANALYTICS (GREEKS, IVS & STANDARD DEVIATION) */}
              <div style={{
                background: 'var(--bg-card, #0d131f)',
                border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                borderRadius: '12px',
                padding: '16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px'
              }}>
                {/* 1. Strikewise IV & Volatility Offset */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ffffff' }}>Strikewise IVs</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>IV Offset:</span>
                      <button onClick={() => setIvOffset(prev => prev - 1)} style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', color: '#ffffff', borderRadius: '3px', padding: '0 5px', fontSize: '0.68rem' }}>-</button>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: ivOffset >= 0 ? '#10b981' : '#ef4444' }}>{ivOffset >= 0 ? '+' : ''}{ivOffset}%</span>
                      <button onClick={() => setIvOffset(prev => prev + 1)} style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', color: '#ffffff', borderRadius: '3px', padding: '0 5px', fontSize: '0.68rem' }}>+</button>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {builderLegs.filter(l => !l.disabled).slice(0, 3).map((l, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                        <span>{l.strike} {l.option_type}</span>
                        <span style={{ color: '#a5b4fc', fontWeight: 600 }}>IV: {(16.5 + ivOffset).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Portfolio Greeks */}
                <div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ffffff', display: 'block', marginBottom: '8px' }}>Portfolio Greeks</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.74rem' }}>
                    <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '6px 8px', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Delta: </span>
                      <strong style={{ color: portfolioGreeks.delta >= 0 ? '#10b981' : '#ef4444' }}>{portfolioGreeks.delta}</strong>
                    </div>
                    <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '6px 8px', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Theta / Day: </span>
                      <strong style={{ color: portfolioGreeks.theta >= 0 ? '#10b981' : '#ef4444' }}>₹{portfolioGreeks.theta}</strong>
                    </div>
                    <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '6px 8px', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Gamma: </span>
                      <strong style={{ color: '#38bdf8' }}>{portfolioGreeks.gamma}</strong>
                    </div>
                    <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '6px 8px', borderRadius: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Vega: </span>
                      <strong style={{ color: '#c084fc' }}>₹{portfolioGreeks.vega}</strong>
                    </div>
                  </div>
                </div>

                {/* 3. Standard Deviation Target Bands */}
                <div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ffffff', display: 'block', marginBottom: '8px' }}>Standard Deviation (Target Day)</span>
                  <div style={{ fontSize: '0.72rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span style={{ color: '#34d399' }}>1.0 SD (68%):</span>
                      <strong style={{ color: '#ffffff' }}>{standardDeviations.oneSd.low} - {standardDeviations.oneSd.high}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span style={{ color: '#818cf8' }}>2.0 SD (95%):</span>
                      <strong style={{ color: '#ffffff' }}>{standardDeviations.twoSd.low} - {standardDeviations.twoSd.high}</strong>
                    </div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Expected move by {selectedExpiry}: ±{standardDeviations.oneSd.points} pts
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ============================================================== */}
        
        {/* ============================================================== */}
        {/* MODE 3: SMART STRIKE SELECTOR & TRADING PLAN GENERATOR (AI)   */}
        {/* ============================================================== */}
        {viewMode === 'smart_selector' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

            {/* Smart Selector Controls Bar: Auto vs Manual */}
            <div style={{
              background: 'var(--bg-card, #0d131f)',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700 }}>ANALYSIS MODE:</span>
                  <div style={{ display: 'inline-flex', background: 'rgba(15, 23, 42, 0.9)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                    <button
                      onClick={() => {
                        setSmartSelectorMode('auto');
                        fetchSmartStrikeAnalysis(false);
                      }}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: 'none',
                        background: smartSelectorMode === 'auto' ? '#10b981' : 'transparent',
                        color: smartSelectorMode === 'auto' ? '#ffffff' : 'var(--text-secondary)'
                      }}
                    >
                      Mode A: Automatic AI Scan
                    </button>
                    <button
                      onClick={() => setSmartSelectorMode('manual')}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: 'none',
                        background: smartSelectorMode === 'manual' ? '#6366f1' : 'transparent',
                        color: smartSelectorMode === 'manual' ? '#ffffff' : 'var(--text-secondary)'
                      }}
                    >
                      Mode B: Custom / Manual
                    </button>
                  </div>
                </div>

                {/* Manual Mode Parameters */}
                {smartSelectorMode === 'manual' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {/* Direction */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Direction:</span>
                      <select
                        value={smartDirection}
                        onChange={e => setSmartDirection(e.target.value as any)}
                        style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: '#ffffff', fontSize: '0.72rem', padding: '3px 8px' }}
                      >
                        <option value="AUTO">Auto Detect</option>
                        <option value="BULLISH">Bullish</option>
                        <option value="BEARISH">Bearish</option>
                        <option value="NEUTRAL">Neutral / Range</option>
                      </select>
                    </div>

                    {/* Delta Preference */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Delta:</span>
                      <select
                        value={smartDeltaStyle}
                        onChange={e => setSmartDeltaStyle(e.target.value as any)}
                        style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: '#ffffff', fontSize: '0.72rem', padding: '3px 8px' }}
                      >
                        <option value="MODERATE">Moderate (0.45-0.65)</option>
                        <option value="CONSERVATIVE">Conservative (0.65-0.80)</option>
                        <option value="AGGRESSIVE">Aggressive (0.25-0.45)</option>
                        <option value="PREMIUM_SELLING">Premium Selling (0.10-0.30)</option>
                      </select>
                    </div>

                    {/* Capital */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Capital (₹):</span>
                      <input
                        type="number"
                        step="50000"
                        value={smartCapital}
                        onChange={e => setSmartCapital(Number(e.target.value))}
                        style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: '#ffffff', fontSize: '0.72rem', padding: '3px 6px', width: '85px' }}
                      />
                    </div>

                    {/* Risk % */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Risk %:</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        max="10"
                        value={smartRiskPct}
                        onChange={e => setSmartRiskPct(Number(e.target.value))}
                        style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: '#ffffff', fontSize: '0.72rem', padding: '3px 6px', width: '50px' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Run Scan Action */}
              <button
                onClick={() => fetchSmartStrikeAnalysis(smartSelectorMode === 'manual')}
                disabled={isLoadingSmartAnalysis}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '7px 16px',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                }}
              >
                <Zap size={14} className={isLoadingSmartAnalysis ? 'spin' : ''} />
                {isLoadingSmartAnalysis ? 'Analyzing Market & Scanning Strikes...' : 'Run Analysis & Generate Plan'}
              </button>
            </div>

            {/* Smart Strike Selector Content */}
            {isLoadingSmartAnalysis && !smartAnalysis ? (
              <div style={{ textAlign: 'center', padding: '80px 20px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                <RefreshCw size={36} color="#10b981" className="spin" style={{ margin: '0 auto 16px auto', display: 'block' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 6px 0' }}>Scanning Real-Time NSE Option Chain & Greeks...</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Calculating Multi-Timeframe Regime, Statistical Expected Move, Delta Suitability, and Generating 0-100 Ranked Trading Plans.
                </p>
              </div>
            ) : smartAnalysis ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* 1. Market Overview & Multi-Timeframe Regime Card */}
                <div style={{
                  background: 'var(--bg-card, #0d131f)',
                  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '14px'
                }}>
                  {/* Regime Badge */}
                  <div>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em' }}>MARKET REGIME</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      <span style={{
                        background: smartAnalysis.market_analysis?.market_regime?.includes('BULLISH') ? 'rgba(16, 185, 129, 0.2)' : smartAnalysis.market_analysis?.market_regime?.includes('BEARISH') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                        border: `1px solid ${smartAnalysis.market_analysis?.market_regime?.includes('BULLISH') ? '#10b981' : smartAnalysis.market_analysis?.market_regime?.includes('BEARISH') ? '#ef4444' : '#38bdf8'}`,
                        color: smartAnalysis.market_analysis?.market_regime?.includes('BULLISH') ? '#34d399' : smartAnalysis.market_analysis?.market_regime?.includes('BEARISH') ? '#f87171' : '#38bdf8',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.84rem',
                        fontWeight: 800
                      }}>
                        ● {smartAnalysis.market_analysis?.market_regime?.replace('_', ' ')}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Trend Strength: <strong style={{ color: '#ffffff' }}>{smartAnalysis.market_analysis?.trend_strength}%</strong>
                    </div>
                  </div>

                  {/* Spot & VWAP */}
                  <div>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em' }}>SPOT VS VWAP</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                      ₹{smartAnalysis.market_analysis?.spot_price?.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      VWAP: ₹{smartAnalysis.market_analysis?.vwap?.toLocaleString()} | RSI: {smartAnalysis.market_analysis?.rsi}
                    </div>
                  </div>

                  {/* Expected Move */}
                  <div>
                    <span style={{ fontSize: '0.68rem', color: '#c084fc', fontWeight: 700, letterSpacing: '0.04em' }}>STATISTICAL EXPECTED MOVE</span>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#c084fc', marginTop: '2px' }}>
                      ±{smartAnalysis.expected_move?.expected_move_points} pts ({smartAnalysis.expected_move?.expected_move_pct}%)
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      1-SD Range: ₹{smartAnalysis.expected_move?.one_sd_range?.[0]?.toLocaleString()} - ₹{smartAnalysis.expected_move?.one_sd_range?.[1]?.toLocaleString()}
                    </div>
                  </div>

                  {/* Key S/R Zones */}
                  <div>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em' }}>SUPPORT & RESISTANCE</span>
                    <div style={{ fontSize: '0.76rem', color: '#ffffff', marginTop: '4px' }}>
                      Res: <strong style={{ color: '#f87171' }}>₹{smartAnalysis.market_analysis?.resistance_levels?.[0]?.toLocaleString()}</strong>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#ffffff', marginTop: '2px' }}>
                      Sup: <strong style={{ color: '#34d399' }}>₹{smartAnalysis.market_analysis?.support_levels?.[0]?.toLocaleString()}</strong>
                    </div>
                  </div>
                </div>

                {/* 2. Candidate Strikes Grid */}
                <div>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 800, margin: '0 0 10px 0', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Target size={15} color="#818cf8" />
                    Optimal Strike Candidates (Delta & Liquidity Filtered)
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
                    {[
                      { label: 'Best Call (CE)', contract: smartAnalysis.recommended_contracts?.best_call, color: '#10b981' },
                      { label: 'Best Put (PE)', contract: smartAnalysis.recommended_contracts?.best_put, color: '#ef4444' },
                      { label: 'Best ITM Strike', contract: smartAnalysis.recommended_contracts?.best_itm, color: '#38bdf8' },
                      { label: 'Best ATM Strike', contract: smartAnalysis.recommended_contracts?.best_atm, color: '#c084fc' },
                      { label: 'Best OTM Strike', contract: smartAnalysis.recommended_contracts?.best_otm, color: '#f59e0b' }
                    ].map((item, idx) => {
                      const c = item.contract;
                      if (!c) return null;
                      return (
                        <div
                          key={idx}
                          style={{
                            background: 'var(--bg-card, #0d131f)',
                            border: `1px solid ${item.color}40`,
                            borderRadius: '10px',
                            padding: '12px',
                            position: 'relative'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: item.color }}>{item.label}</span>
                            <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.05)', padding: '1px 5px', borderRadius: '3px' }}>
                              {c.moneyness}
                            </span>
                          </div>
                          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>
                            {c.strike} {c.option_type}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#ffffff', marginTop: '2px' }}>
                            LTP: <strong style={{ color: item.color }}>₹{c.ltp?.toFixed(2)}</strong> | Delta: {c.delta}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Spread: {c.spread_pct}% | Breakeven: ₹{c.breakeven?.toLocaleString()}
                          </div>

                          <button
                            onClick={() => {
                              handleAddLegFromChain(c.strike, c.option_type, 'BUY', c.ltp, c.bid, c.ask);
                              setViewMode('workstation');
                            }}
                            style={{
                              marginTop: '8px',
                              width: '100%',
                              background: 'rgba(99, 102, 241, 0.15)',
                              border: '1px solid rgba(99, 102, 241, 0.4)',
                              color: '#818cf8',
                              borderRadius: '4px',
                              padding: '4px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            + Add to Strategy
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Strategy Evaluation & Ranking Matrix (0-100 Framework) */}
                <div style={{
                  background: 'var(--bg-card, #0d131f)',
                  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)'
                }}>
                  <h3 style={{ fontSize: '0.92rem', fontWeight: 800, margin: '0 0 12px 0', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BarChart2 size={16} color="#10b981" />
                    Top Ranked Strategies (Scored 0–100 by Multi-Factor Model)
                  </h3>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
                      <thead>
                        <tr style={{ background: '#090d16', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>Strategy</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center' }}>Outlook</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center' }}>Score</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>Type</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Max Profit</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Max Loss</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Breakeven</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center' }}>Reward/Risk</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center' }}>POP %</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {smartAnalysis.top_strategies?.map((st: any, idx: number) => {
                          const isSelected = selectedPlanStrategyIdx === idx;
                          return (
                            <tr
                              key={idx}
                              style={{
                                borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                                background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'transparent'
                              }}
                            >
                              <td style={{ padding: '8px 10px', fontWeight: 800, color: '#ffffff' }}>
                                {st.strategy_name}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                <span style={{
                                  fontSize: '0.65rem',
                                  padding: '2px 6px',
                                  borderRadius: '3px',
                                  background: st.outlook === 'BULLISH' ? 'rgba(16, 185, 129, 0.15)' : st.outlook === 'BEARISH' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                                  color: st.outlook === 'BULLISH' ? '#34d399' : st.outlook === 'BEARISH' ? '#f87171' : '#38bdf8',
                                  fontWeight: 700
                                }}>
                                  {st.outlook}
                                </span>
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                <span style={{
                                  fontSize: '0.82rem',
                                  fontWeight: 800,
                                  color: st.score >= 80 ? '#10b981' : st.score >= 65 ? '#38bdf8' : '#f59e0b'
                                }}>
                                  {st.score}/100
                                </span>
                              </td>
                              <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>
                                {st.net_debit_credit}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>
                                {st.max_profit}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>
                                {st.max_loss}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', color: '#ffffff' }}>
                                ₹{st.breakeven?.toLocaleString()}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'center', color: '#a5b4fc', fontWeight: 700 }}>
                                {st.risk_reward}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'center', color: '#38bdf8', fontWeight: 800 }}>
                                {st.probability_of_profit_pct}%
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                <button
                                  onClick={() => setSelectedPlanStrategyIdx(idx)}
                                  style={{
                                    background: isSelected ? '#6366f1' : 'rgba(255, 255, 255, 0.05)',
                                    border: `1px solid ${isSelected ? '#6366f1' : 'var(--border-subtle)'}`,
                                    color: '#ffffff',
                                    borderRadius: '4px',
                                    padding: '3px 8px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  {isSelected ? 'Viewing' : 'Select'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 4. Complete Actionable Trading Plan Card */}
                {smartAnalysis.trading_plan && (() => {
                  const currentSelectedStrat = smartAnalysis.top_strategies?.[selectedPlanStrategyIdx] || smartAnalysis.top_strategies?.[0];
                  const plan = smartAnalysis.trading_plan;

                  return (
                    <div style={{
                      background: 'var(--bg-card, #0d131f)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      borderRadius: '12px',
                      padding: '20px',
                      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
                    }}>
                      {/* Decision Status Banner */}
                      <div style={{
                        background: plan.decision_status === 'STRONG_CANDIDATE' ? 'rgba(16, 185, 129, 0.15)' : plan.decision_status === 'CANDIDATE' ? 'rgba(56, 189, 248, 0.15)' : plan.decision_status === 'NO_TRADE' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        border: `1px solid ${plan.decision_status === 'STRONG_CANDIDATE' ? '#10b981' : plan.decision_status === 'CANDIDATE' ? '#38bdf8' : plan.decision_status === 'NO_TRADE' ? '#ef4444' : '#f59e0b'}`,
                        borderRadius: '8px',
                        padding: '12px 16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '16px',
                        flexWrap: 'wrap',
                        gap: '8px'
                      }}>
                        <div>
                          <div style={{
                            fontSize: '0.92rem',
                            fontWeight: 900,
                            color: plan.decision_status === 'STRONG_CANDIDATE' ? '#10b981' : plan.decision_status === 'CANDIDATE' ? '#38bdf8' : plan.decision_status === 'NO_TRADE' ? '#ef4444' : '#f59e0b',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            <CheckCircle2 size={16} />
                            FINAL DECISION: {plan.decision_status.replace(/_/g, ' ')}
                          </div>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                            {plan.decision_reason}
                          </span>
                        </div>

                        {/* One-click Load into Workstation */}
                        <button
                          onClick={() => {
                            if (currentSelectedStrat?.legs) {
                              setBuilderLegs(currentSelectedStrat.legs.map((l: any, i: number) => ({
                                id: `leg_plan_${Date.now()}_${i}`,
                                action: l.action,
                                strike: l.strike,
                                option_type: l.option_type,
                                lots: plan.position_sizing?.recommended_lots || 1,
                                lot_size: lotSize,
                                premium: l.premium,
                                disabled: false,
                                expiry: selectedExpiry
                              })));
                              setViewMode('workstation');
                            }
                          }}
                          style={{
                            background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '8px 16px',
                            color: '#ffffff',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)'
                          }}
                        >
                          <Zap size={14} />
                          Transfer to Strategy Builder & Workstation
                        </button>
                      </div>

                      {/* Complete Trading Plan Sections */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                        {/* A. Entry Conditions */}
                        <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                          <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                            <Compass size={14} />
                            ENTRY CONDITIONS
                          </span>
                          <div style={{ fontSize: '0.74rem', color: '#ffffff', lineHeight: 1.5 }}>
                            <div>• <strong>Ideal Zone:</strong> {plan.entry_conditions?.ideal_entry_zone}</div>
                            <div style={{ marginTop: '4px' }}>• <strong>Technical Trigger:</strong> {plan.entry_conditions?.technical_confirmation}</div>
                            <div style={{ marginTop: '4px' }}>• <strong>Volume:</strong> {plan.entry_conditions?.volume_confirmation}</div>
                            <div style={{ marginTop: '4px', color: '#f87171' }}>• <strong>Invalidation:</strong> {plan.entry_conditions?.invalidation_criteria}</div>
                          </div>
                        </div>

                        {/* B. Stop Loss & Risk Management */}
                        <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                          <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                            <ShieldCheck size={14} />
                            STOP LOSS & RISK BUDGET
                          </span>
                          <div style={{ fontSize: '0.74rem', color: '#ffffff', lineHeight: 1.5 }}>
                            <div>• <strong>Loss Limit:</strong> <span style={{ color: '#ef4444', fontWeight: 700 }}>{plan.stop_loss?.strategy_loss_limit}</span></div>
                            <div style={{ marginTop: '4px' }}>• <strong>Underlying Level:</strong> ₹{plan.stop_loss?.underlying_invalidation_level?.toLocaleString()}</div>
                            <div style={{ marginTop: '4px' }}>• <strong>Position Sizing:</strong> <strong style={{ color: '#10b981' }}>{plan.position_sizing?.recommended_lots} Lots</strong> ({plan.position_sizing?.total_contracts} contracts) based on ₹{plan.position_sizing?.allocated_risk_budget?.toLocaleString()} risk budget.</div>
                            <div style={{ marginTop: '4px' }}>• <strong>Trailing Stop:</strong> {plan.stop_loss?.trailing_stop_rule}</div>
                          </div>
                        </div>

                        {/* C. Target Levels & Partial Booking */}
                        <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                          <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                            <Target size={14} />
                            TARGET LEVELS & EXITS
                          </span>
                          <div style={{ fontSize: '0.74rem', color: '#ffffff', lineHeight: 1.5 }}>
                            <div>• <strong>Target 1:</strong> {plan.target_levels?.target_1?.level_pct} (Spot: ₹{plan.target_levels?.target_1?.underlying_price?.toLocaleString()})</div>
                            <div style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>{plan.target_levels?.target_1?.action}</div>
                            <div style={{ marginTop: '6px' }}>• <strong>Target 2:</strong> {plan.target_levels?.target_2?.level_pct} (Spot: ₹{plan.target_levels?.target_2?.underlying_price?.toLocaleString()})</div>
                            <div style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>{plan.target_levels?.target_2?.action}</div>
                            <div style={{ marginTop: '6px', color: '#f59e0b' }}>• <strong>Precaution:</strong> {plan.trade_management?.expiry_precaution}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* 5. AI Explanation Engine Rationale */}
                {smartAnalysis.ai_explanation && (
                  <div style={{
                    background: 'var(--bg-card, #0d131f)',
                    border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                    borderRadius: '12px',
                    padding: '16px 20px'
                  }}>
                    <h3 style={{ fontSize: '0.88rem', fontWeight: 800, margin: '0 0 10px 0', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <HelpCircle size={15} color="#c084fc" />
                      AI Decision Logic & Plan Explanation
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px 12px', borderRadius: '6px' }}>
                        <strong style={{ color: '#ffffff', display: 'block', marginBottom: '3px' }}>1. Market Structure Analysis</strong>
                        {smartAnalysis.ai_explanation?.market_analysis}
                      </div>

                      <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px 12px', borderRadius: '6px' }}>
                        <strong style={{ color: '#ffffff', display: 'block', marginBottom: '3px' }}>2. Strike Selection Logic</strong>
                        {smartAnalysis.ai_explanation?.strike_selection}
                      </div>

                      <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px 12px', borderRadius: '6px' }}>
                        <strong style={{ color: '#ffffff', display: 'block', marginBottom: '3px' }}>3. Strategy Selection Edge</strong>
                        {smartAnalysis.ai_explanation?.strategy_selection}
                      </div>

                      <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '10px 12px', borderRadius: '6px' }}>
                        <strong style={{ color: '#ffffff', display: 'block', marginBottom: '3px' }}>4. Risk & Capital Sizing</strong>
                        {smartAnalysis.ai_explanation?.risk_assessment}
                      </div>
                    </div>
                  </div>
                )}

              </div>
            ) : null}

          </div>
        )}


        {/* MODE 2: FULL 23-COLUMN OPTION CHAIN TABLE                      */}
        {/* ============================================================== */}
        {viewMode === 'fullchain' && (
          <div style={{
            background: 'var(--bg-card, #0d131f)',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            borderRadius: '12px',
            padding: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                  Full Option Chain ({selectedSymbol})
                </h2>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Spot: ₹{spot.toLocaleString()} | Lot Size: {lotSize} | Interval: {chainData?.interval}
                </span>
              </div>

              {/* Side Filter */}
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['BOTH', 'CALLS', 'PUTS'] as const).map(side => (
                  <button
                    key={side}
                    onClick={() => setSideFilter(side)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: sideFilter === side ? '#6366f1' : 'rgba(255, 255, 255, 0.05)',
                      border: 'none',
                      color: '#ffffff'
                    }}
                  >
                    {side}
                  </button>
                ))}
              </div>
            </div>

            {/* 23-Column Table */}
            <div style={{ overflowX: 'auto', maxHeight: '720px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ background: '#090d16', borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, zIndex: 10 }}>
                    {(sideFilter === 'BOTH' || sideFilter === 'CALLS') && (
                      <th style={{ padding: '10px 8px', color: '#34d399', textAlign: 'center', borderRight: '1px solid var(--border-subtle)' }} colSpan={11}>
                        CALL OPTIONS (CE)
                      </th>
                    )}
                    <th style={{ padding: '10px 14px', color: '#c084fc', textAlign: 'center', background: '#0f172a', borderLeft: '1px solid var(--border-subtle)', borderRight: '1px solid var(--border-subtle)' }}>
                      STRIKE
                    </th>
                    {(sideFilter === 'BOTH' || sideFilter === 'PUTS') && (
                      <th style={{ padding: '10px 8px', color: '#f87171', textAlign: 'center', borderLeft: '1px solid var(--border-subtle)' }} colSpan={11}>
                        PUT OPTIONS (PE)
                      </th>
                    )}
                  </tr>

                  <tr style={{ background: '#0d131f', borderBottom: '2px solid rgba(99, 102, 241, 0.3)', position: 'sticky', top: '37px', zIndex: 9, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {(sideFilter === 'BOTH' || sideFilter === 'CALLS') && (
                      <>
                        <th style={{ padding: '8px 6px', textAlign: 'center' }}>+ Leg</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right' }}>OI</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right' }}>Chg OI</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right' }}>Volume</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right' }}>IV %</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right' }}>LTP (₹)</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right' }}>Chg %</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right', color: '#10b981' }}>Bid Qty</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right', color: '#34d399' }}>Bid Price</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right', color: '#f87171' }}>Ask Price</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right', color: '#ef4444', borderRight: '1px solid var(--border-subtle)' }}>Ask Qty</th>
                      </>
                    )}
                    <th style={{ padding: '8px 12px', textAlign: 'center', background: '#0f172a', color: '#ffffff', fontWeight: 800, borderLeft: '1px solid var(--border-subtle)', borderRight: '1px solid var(--border-subtle)' }}>
                      Strike Price
                    </th>
                    {(sideFilter === 'BOTH' || sideFilter === 'PUTS') && (
                      <>
                        <th style={{ padding: '8px 6px', textAlign: 'left', color: '#10b981', borderLeft: '1px solid var(--border-subtle)' }}>Bid Qty</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', color: '#34d399' }}>Bid Price</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', color: '#f87171' }}>Ask Price</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', color: '#ef4444' }}>Ask Qty</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left' }}>LTP (₹)</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left' }}>Chg %</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left' }}>IV %</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left' }}>Volume</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left' }}>Chg OI</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left' }}>OI</th>
                        <th style={{ padding: '8px 6px', textAlign: 'center' }}>+ Leg</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedChainRows.map(row => {
                    const isAtm = row.is_atm;
                    const callBg = isAtm ? 'rgba(168, 85, 247, 0.15)' : row.strike < spot ? 'rgba(234, 179, 8, 0.04)' : 'transparent';
                    const putBg = isAtm ? 'rgba(168, 85, 247, 0.15)' : row.strike > spot ? 'rgba(6, 182, 212, 0.04)' : 'transparent';

                    return (
                      <tr key={row.strike} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        {(sideFilter === 'BOTH' || sideFilter === 'CALLS') && (
                          <>
                            <td style={{ padding: '5px 4px', textAlign: 'center', background: callBg }}>
                              <div style={{ display: 'inline-flex', gap: '3px' }}>
                                <button onClick={() => handleAddLegFromChain(row.strike, 'CE', 'BUY', row.call.ltp)} style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#10b981', borderRadius: '3px', padding: '1px 5px', fontSize: '0.66rem', fontWeight: 800, cursor: 'pointer' }}>B</button>
                                <button onClick={() => handleAddLegFromChain(row.strike, 'CE', 'SELL', row.call.ltp)} style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#ef4444', borderRadius: '3px', padding: '1px 5px', fontSize: '0.66rem', fontWeight: 800, cursor: 'pointer' }}>S</button>
                              </div>
                            </td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', background: callBg, fontWeight: 600 }}>{row.call.oi.toLocaleString()}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', background: callBg, color: row.call.change_oi >= 0 ? '#10b981' : '#ef4444' }}>{row.call.change_oi > 0 ? `+${row.call.change_oi.toLocaleString()}` : row.call.change_oi.toLocaleString()}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', background: callBg, color: 'var(--text-secondary)' }}>{row.call.volume.toLocaleString()}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', background: callBg, color: 'var(--text-muted)' }}>{row.call.iv}%</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', background: callBg, fontWeight: 700, color: '#ffffff' }}>₹{row.call.ltp.toFixed(2)}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', background: callBg, color: row.call.change_pct >= 0 ? '#10b981' : '#ef4444' }}>{row.call.change_pct >= 0 ? '+' : ''}{row.call.change_pct}%</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', background: callBg, color: '#a7f3d0', fontFamily: 'monospace' }}>{(row.call.bid_qty || 0).toLocaleString()}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', background: callBg, color: '#34d399', fontWeight: 600 }}>₹{(row.call.bid || 0).toFixed(2)}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', background: callBg, color: '#f87171', fontWeight: 600 }}>₹{(row.call.ask || 0).toFixed(2)}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', background: callBg, color: '#fca5a5', fontFamily: 'monospace', borderRight: '1px solid var(--border-subtle)' }}>{(row.call.ask_qty || 0).toLocaleString()}</td>
                          </>
                        )}
                        <td style={{ padding: '5px 12px', textAlign: 'center', background: isAtm ? '#9333ea' : '#0f172a', fontWeight: 800, color: '#ffffff', borderLeft: '1px solid var(--border-subtle)', borderRight: '1px solid var(--border-subtle)' }}>
                          {row.strike}
                        </td>
                        {(sideFilter === 'BOTH' || sideFilter === 'PUTS') && (
                          <>
                            <td style={{ padding: '5px 8px', textAlign: 'left', background: putBg, color: '#a7f3d0', fontFamily: 'monospace', borderLeft: '1px solid var(--border-subtle)' }}>{(row.put.bid_qty || 0).toLocaleString()}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'left', background: putBg, color: '#34d399', fontWeight: 600 }}>₹{(row.put.bid || 0).toFixed(2)}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'left', background: putBg, color: '#f87171', fontWeight: 600 }}>₹{(row.put.ask || 0).toFixed(2)}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'left', background: putBg, color: '#fca5a5', fontFamily: 'monospace' }}>{(row.put.ask_qty || 0).toLocaleString()}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'left', background: putBg, fontWeight: 700, color: '#ffffff' }}>₹{row.put.ltp.toFixed(2)}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'left', background: putBg, color: row.put.change_pct >= 0 ? '#10b981' : '#ef4444' }}>{row.put.change_pct >= 0 ? '+' : ''}{row.put.change_pct}%</td>
                            <td style={{ padding: '5px 8px', textAlign: 'left', background: putBg, color: 'var(--text-muted)' }}>{row.put.iv}%</td>
                            <td style={{ padding: '5px 8px', textAlign: 'left', background: putBg, color: 'var(--text-secondary)' }}>{row.put.volume.toLocaleString()}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'left', background: putBg, color: row.put.change_oi >= 0 ? '#10b981' : '#ef4444' }}>{row.put.change_oi > 0 ? `+${row.put.change_oi.toLocaleString()}` : row.put.change_oi.toLocaleString()}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'left', background: putBg, fontWeight: 600 }}>{row.put.oi.toLocaleString()}</td>
                            <td style={{ padding: '5px 4px', textAlign: 'center', background: putBg }}>
                              <div style={{ display: 'inline-flex', gap: '3px' }}>
                                <button onClick={() => handleAddLegFromChain(row.strike, 'PE', 'BUY', row.put.ltp)} style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#10b981', borderRadius: '3px', padding: '1px 5px', fontSize: '0.66rem', fontWeight: 800, cursor: 'pointer' }}>B</button>
                                <button onClick={() => handleAddLegFromChain(row.strike, 'PE', 'SELL', row.put.ltp)} style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#ef4444', borderRadius: '3px', padding: '1px 5px', fontSize: '0.66rem', fontWeight: 800, cursor: 'pointer' }}>S</button>
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
          </div>
        )}

        {/* Modal: Save Strategy */}
        {saveModalOpen && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px'
          }}>
            <div style={{
              background: '#0d131f',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '460px',
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.8)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#ffffff' }}>Save Multi-Leg Strategy</h3>
                <button onClick={() => setSaveModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={16} />
                </button>
              </div>

              {saveSuccessMsg && (
                <div style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '10px', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '14px' }}>
                  {saveSuccessMsg}
                </div>
              )}

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Strategy Name:
                </label>
                <input
                  type="text"
                  placeholder="e.g. NIFTY Weekly Bull Call Spread"
                  value={newStrategyName}
                  onChange={e => setNewStrategyName(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Notes (Optional):
                </label>
                <textarea
                  placeholder="Enter strategy thesis, target price or risk rules..."
                  value={newStrategyNotes}
                  onChange={e => setNewStrategyNotes(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    outline: 'none',
                    resize: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  onClick={() => setSaveModalOpen(false)}
                  style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: '6px', padding: '6px 14px', fontSize: '0.78rem', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveStrategy}
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', color: '#ffffff', borderRadius: '6px', padding: '6px 16px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  Confirm & Save
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
