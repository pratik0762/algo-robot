'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  Search,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  Filter,
  BarChart2,
  RefreshCw,
  Zap,
  Grid,
  Menu,
  Clock,
  CheckCircle2,
  SlidersHorizontal,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  Sliders
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { getApiBase } from '@/config/api';
import IndicesBarometer from '@/components/IndicesBarometer';
import MarketStatusBanner from '@/components/MarketStatusBanner';
import { useLiveStockTicks } from '@/hooks/useLiveStockTicks';

const NavigationDrawer = dynamic(() => import('@/components/NavigationDrawer'), {
  ssr: false,
  loading: () => null
});

export interface HeatmapStock {
  symbol: string;
  company_name: string;
  sector: string;
  industry: string;
  ltp: number;
  change: number;
  percent_change: number;
  market_cap_cr: number;
  index_weight_pct: number;
  signal: string;
  heat_grade: string;
  color: string;
  pe_ratio: number;
  high_52w: number;
  low_52w: number;
  nse_official_url: string;
}

export interface HeatmapSector {
  sector: string;
  average_percent_change: number;
  total_market_cap_cr: number;
  total_index_weight_pct: number;
  stocks_count: number;
  color: string;
  stocks: HeatmapStock[];
}

export interface HeatmapResponse {
  status: string;
  source: string;
  official_url: string;
  timestamp: string;
  breadth: {
    advances: number;
    declines: number;
    unchanged: number;
    advance_decline_ratio: number;
  };
  sectors: HeatmapSector[];
}

// Fallback baseline Nifty 50 stocks for instant client-side rendering
const FALLBACK_SECTORS: HeatmapSector[] = [
  {
    sector: 'Financial Services & Banking',
    average_percent_change: 0.82,
    total_market_cap_cr: 3840000,
    total_index_weight_pct: 35.2,
    stocks_count: 6,
    color: '#059669',
    stocks: [
      {
        symbol: 'HDFCBANK',
        company_name: 'HDFC Bank Limited',
        sector: 'Financial Services',
        industry: 'Private Bank',
        ltp: 810.75,
        change: 12.6,
        percent_change: 1.58,
        market_cap_cr: 1289400,
        index_weight_pct: 11.4,
        signal: 'STRONG BUY',
        heat_grade: 'STRONG_GAIN',
        color: '#059669',
        pe_ratio: 18.2,
        high_52w: 1017.5,
        low_52w: 669.2,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=HDFCBANK'
      },
      {
        symbol: 'ICICIBANK',
        company_name: 'ICICI Bank Limited',
        sector: 'Financial Services',
        industry: 'Private Bank',
        ltp: 1278.6,
        change: 14.2,
        percent_change: 1.12,
        market_cap_cr: 894300,
        index_weight_pct: 8.2,
        signal: 'BUY',
        heat_grade: 'MILD_GAIN',
        color: '#10b981',
        pe_ratio: 17.6,
        high_52w: 1340.0,
        low_52w: 980.5,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=ICICIBANK'
      },
      {
        symbol: 'SBIN',
        company_name: 'State Bank of India',
        sector: 'Financial Services',
        industry: 'Public Bank',
        ltp: 818.4,
        change: 7.8,
        percent_change: 0.96,
        market_cap_cr: 728900,
        index_weight_pct: 6.1,
        signal: 'BUY',
        heat_grade: 'MILD_GAIN',
        color: '#10b981',
        pe_ratio: 11.4,
        high_52w: 912.0,
        low_52w: 590.2,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=SBIN'
      },
      {
        symbol: 'AXISBANK',
        company_name: 'Axis Bank Limited',
        sector: 'Financial Services',
        industry: 'Private Bank',
        ltp: 1184.2,
        change: -4.8,
        percent_change: -0.4,
        market_cap_cr: 365000,
        index_weight_pct: 3.4,
        signal: 'HOLD',
        heat_grade: 'MILD_LOSS',
        color: '#ef4444',
        pe_ratio: 14.8,
        high_52w: 1339.6,
        low_52w: 978.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=AXISBANK'
      },
      {
        symbol: 'KOTAKBANK',
        company_name: 'Kotak Mahindra Bank',
        sector: 'Financial Services',
        industry: 'Private Bank',
        ltp: 1785.4,
        change: 9.2,
        percent_change: 0.52,
        market_cap_cr: 355000,
        index_weight_pct: 3.2,
        signal: 'BUY',
        heat_grade: 'MILD_GAIN',
        color: '#10b981',
        pe_ratio: 19.5,
        high_52w: 1908.0,
        low_52w: 1544.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=KOTAKBANK'
      },
      {
        symbol: 'BAJFINANCE',
        company_name: 'Bajaj Finance Limited',
        sector: 'Financial Services',
        industry: 'NBFC',
        ltp: 6890.5,
        change: 78.4,
        percent_change: 1.15,
        market_cap_cr: 425000,
        index_weight_pct: 2.9,
        signal: 'BUY',
        heat_grade: 'MILD_GAIN',
        color: '#10b981',
        pe_ratio: 28.4,
        high_52w: 7840.0,
        low_52w: 6160.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=BAJFINANCE'
      }
    ]
  },
  {
    sector: 'Information Technology',
    average_percent_change: 1.24,
    total_market_cap_cr: 2650000,
    total_index_weight_pct: 14.8,
    stocks_count: 4,
    color: '#059669',
    stocks: [
      {
        symbol: 'TCS',
        company_name: 'Tata Consultancy Services',
        sector: 'Information Technology',
        industry: 'IT Services',
        ltp: 2460.6,
        change: 32.4,
        percent_change: 1.33,
        market_cap_cr: 1465200,
        index_weight_pct: 4.8,
        signal: 'BUY',
        heat_grade: 'MILD_GAIN',
        color: '#10b981',
        pe_ratio: 28.5,
        high_52w: 3350.0,
        low_52w: 1976.8,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=TCS'
      },
      {
        symbol: 'INFY',
        company_name: 'Infosys Limited',
        sector: 'Information Technology',
        industry: 'IT Services',
        ltp: 1890.3,
        change: 38.6,
        percent_change: 2.08,
        market_cap_cr: 765400,
        index_weight_pct: 5.6,
        signal: 'STRONG BUY',
        heat_grade: 'STRONG_GAIN',
        color: '#059669',
        pe_ratio: 29.2,
        high_52w: 1991.4,
        low_52w: 1358.3,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=INFY'
      },
      {
        symbol: 'HCLTECH',
        company_name: 'HCL Technologies Ltd',
        sector: 'Information Technology',
        industry: 'IT Services',
        ltp: 1780.2,
        change: 21.4,
        percent_change: 1.22,
        market_cap_cr: 482000,
        index_weight_pct: 2.4,
        signal: 'BUY',
        heat_grade: 'MILD_GAIN',
        color: '#10b981',
        pe_ratio: 26.8,
        high_52w: 1898.0,
        low_52w: 1235.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=HCLTECH'
      },
      {
        symbol: 'WIPRO',
        company_name: 'Wipro Limited',
        sector: 'Information Technology',
        industry: 'IT Services',
        ltp: 548.6,
        change: 1.8,
        percent_change: 0.33,
        market_cap_cr: 285000,
        index_weight_pct: 2.0,
        signal: 'HOLD',
        heat_grade: 'MILD_GAIN',
        color: '#10b981',
        pe_ratio: 22.4,
        high_52w: 595.0,
        low_52w: 435.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=WIPRO'
      }
    ]
  },
  {
    sector: 'Energy & Petrochemicals',
    average_percent_change: 0.45,
    total_market_cap_cr: 2540000,
    total_index_weight_pct: 12.6,
    stocks_count: 3,
    color: '#10b981',
    stocks: [
      {
        symbol: 'RELIANCE',
        company_name: 'Reliance Industries Ltd',
        sector: 'Energy',
        industry: 'Oil & Gas / Retail',
        ltp: 1335.6,
        change: 11.2,
        percent_change: 0.85,
        market_cap_cr: 1948500,
        index_weight_pct: 9.8,
        signal: 'BUY',
        heat_grade: 'MILD_GAIN',
        color: '#10b981',
        pe_ratio: 26.4,
        high_52w: 1611.8,
        low_52w: 1152.2,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=RELIANCE'
      },
      {
        symbol: 'ONGC',
        company_name: 'Oil & Natural Gas Corp',
        sector: 'Energy',
        industry: 'Upstream Oil',
        ltp: 268.4,
        change: -1.6,
        percent_change: -0.59,
        market_cap_cr: 337000,
        index_weight_pct: 1.5,
        signal: 'HOLD',
        heat_grade: 'MILD_LOSS',
        color: '#ef4444',
        pe_ratio: 7.8,
        high_52w: 344.0,
        low_52w: 182.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=ONGC'
      },
      {
        symbol: 'BPCL',
        company_name: 'Bharat Petroleum Corp',
        sector: 'Energy',
        industry: 'Refining & Marketing',
        ltp: 312.5,
        change: 3.4,
        percent_change: 1.1,
        market_cap_cr: 135000,
        index_weight_pct: 1.3,
        signal: 'BUY',
        heat_grade: 'MILD_GAIN',
        color: '#10b981',
        pe_ratio: 8.6,
        high_52w: 388.0,
        low_52w: 235.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=BPCL'
      }
    ]
  },
  {
    sector: 'Automobile & Transport',
    average_percent_change: -0.32,
    total_market_cap_cr: 1420000,
    total_index_weight_pct: 7.4,
    stocks_count: 4,
    color: '#ef4444',
    stocks: [
      {
        symbol: 'MARUTI',
        company_name: 'Maruti Suzuki India',
        sector: 'Automobile',
        industry: 'Passenger Cars',
        ltp: 12450.0,
        change: -98.0,
        percent_change: -0.78,
        market_cap_cr: 389200,
        index_weight_pct: 2.2,
        signal: 'SELL',
        heat_grade: 'MILD_LOSS',
        color: '#ef4444',
        pe_ratio: 28.2,
        high_52w: 13680.0,
        low_52w: 9800.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=MARUTI'
      },
      {
        symbol: 'M&M',
        company_name: 'Mahindra & Mahindra',
        sector: 'Automobile',
        industry: 'SUVs & Tractors',
        ltp: 2980.5,
        change: 42.0,
        percent_change: 1.43,
        market_cap_cr: 368000,
        index_weight_pct: 2.4,
        signal: 'BUY',
        heat_grade: 'MILD_GAIN',
        color: '#10b981',
        pe_ratio: 24.6,
        high_52w: 3220.0,
        low_52w: 1530.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=M&M'
      },
      {
        symbol: 'TATAMOTORS',
        company_name: 'Tata Motors Limited',
        sector: 'Automobile',
        industry: 'Commercial & Passenger',
        ltp: 812.4,
        change: -11.2,
        percent_change: -1.36,
        market_cap_cr: 298000,
        index_weight_pct: 1.8,
        signal: 'SELL',
        heat_grade: 'MILD_LOSS',
        color: '#ef4444',
        pe_ratio: 10.2,
        high_52w: 1179.0,
        low_52w: 660.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=TATAMOTORS'
      },
      {
        symbol: 'BAJAJ-AUTO',
        company_name: 'Bajaj Auto Limited',
        sector: 'Automobile',
        industry: '2 & 3 Wheelers',
        ltp: 9420.0,
        change: -54.0,
        percent_change: -0.57,
        market_cap_cr: 264000,
        index_weight_pct: 1.0,
        signal: 'HOLD',
        heat_grade: 'MILD_LOSS',
        color: '#ef4444',
        pe_ratio: 32.5,
        high_52w: 12774.0,
        low_52w: 5200.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=BAJAJ-AUTO'
      }
    ]
  },
  {
    sector: 'Consumer Goods & FMCG',
    average_percent_change: -0.15,
    total_market_cap_cr: 1380000,
    total_index_weight_pct: 8.5,
    stocks_count: 3,
    color: '#ef4444',
    stocks: [
      {
        symbol: 'ITC',
        company_name: 'ITC Limited',
        sector: 'Consumer Goods',
        industry: 'FMCG & Cigarettes',
        ltp: 472.1,
        change: 2.1,
        percent_change: 0.45,
        market_cap_cr: 589200,
        index_weight_pct: 4.1,
        signal: 'BUY',
        heat_grade: 'MILD_GAIN',
        color: '#10b981',
        pe_ratio: 28.2,
        high_52w: 528.5,
        low_52w: 399.3,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=ITC'
      },
      {
        symbol: 'HINDUNILVR',
        company_name: 'Hindustan Unilever Ltd',
        sector: 'Consumer Goods',
        industry: 'Personal & Home Care',
        ltp: 2390.4,
        change: -18.2,
        percent_change: -0.76,
        market_cap_cr: 561000,
        index_weight_pct: 2.8,
        signal: 'SELL',
        heat_grade: 'MILD_LOSS',
        color: '#ef4444',
        pe_ratio: 54.2,
        high_52w: 3034.0,
        low_52w: 2170.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=HINDUNILVR'
      },
      {
        symbol: 'TITAN',
        company_name: 'Titan Company Limited',
        sector: 'Consumer Goods',
        industry: 'Jewellery & Watches',
        ltp: 3480.0,
        change: -6.0,
        percent_change: -0.17,
        market_cap_cr: 312400,
        index_weight_pct: 1.6,
        signal: 'HOLD',
        heat_grade: 'MILD_LOSS',
        color: '#ef4444',
        pe_ratio: 84.5,
        high_52w: 3886.0,
        low_52w: 3055.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=TITAN'
      }
    ]
  },
  {
    sector: 'Healthcare & Pharma',
    average_percent_change: 0.95,
    total_market_cap_cr: 980000,
    total_index_weight_pct: 4.8,
    stocks_count: 3,
    color: '#059669',
    stocks: [
      {
        symbol: 'SUNPHARMA',
        company_name: 'Sun Pharma Industries',
        sector: 'Healthcare & Pharma',
        industry: 'Formulations & API',
        ltp: 1780.5,
        change: 22.4,
        percent_change: 1.27,
        market_cap_cr: 425600,
        index_weight_pct: 2.1,
        signal: 'STRONG BUY',
        heat_grade: 'STRONG_GAIN',
        color: '#059669',
        pe_ratio: 38.4,
        high_52w: 1960.0,
        low_52w: 1195.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=SUNPHARMA'
      },
      {
        symbol: 'DRREDDY',
        company_name: "Dr. Reddy's Laboratories",
        sector: 'Healthcare & Pharma',
        industry: 'Generics & Biosimilars',
        ltp: 1260.4,
        change: 8.6,
        percent_change: 0.69,
        market_cap_cr: 210000,
        index_weight_pct: 1.4,
        signal: 'BUY',
        heat_grade: 'MILD_GAIN',
        color: '#10b981',
        pe_ratio: 18.9,
        high_52w: 1400.0,
        low_52w: 960.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=DRREDDY'
      },
      {
        symbol: 'CIPLA',
        company_name: 'Cipla Limited',
        sector: 'Healthcare & Pharma',
        industry: 'Respiratory & Generics',
        ltp: 1540.2,
        change: 13.5,
        percent_change: 0.88,
        market_cap_cr: 124000,
        index_weight_pct: 1.3,
        signal: 'BUY',
        heat_grade: 'MILD_GAIN',
        color: '#10b981',
        pe_ratio: 28.1,
        high_52w: 1702.0,
        low_52w: 1180.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=CIPLA'
      }
    ]
  },
  {
    sector: 'Metals & Mining',
    average_percent_change: -1.45,
    total_market_cap_cr: 780000,
    total_index_weight_pct: 3.9,
    stocks_count: 2,
    color: '#dc2626',
    stocks: [
      {
        symbol: 'TATASTEEL',
        company_name: 'Tata Steel Limited',
        sector: 'Metals & Mining',
        industry: 'Primary Steel',
        ltp: 148.2,
        change: -2.4,
        percent_change: -1.59,
        market_cap_cr: 185000,
        index_weight_pct: 1.6,
        signal: 'SELL',
        heat_grade: 'STRONG_LOSS',
        color: '#dc2626',
        pe_ratio: 42.0,
        high_52w: 184.6,
        low_52w: 124.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=TATASTEEL'
      },
      {
        symbol: 'JSWSTEEL',
        company_name: 'JSW Steel Limited',
        sector: 'Metals & Mining',
        industry: 'Alloy & Flats',
        ltp: 962.0,
        change: -12.8,
        percent_change: -1.31,
        market_cap_cr: 235000,
        index_weight_pct: 1.5,
        signal: 'SELL',
        heat_grade: 'MILD_LOSS',
        color: '#ef4444',
        pe_ratio: 34.6,
        high_52w: 1060.0,
        low_52w: 780.0,
        nse_official_url: 'https://www.nseindia.com/get-quotes/equity?symbol=JSWSTEEL'
      }
    ]
  }
];

function HeatmapContent() {
  const [heatmapData, setHeatmapData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'pct_desc' | 'pct_asc' | 'weight' | 'alpha'>('pct_desc');
  const [viewMode, setViewMode] = useState<'sectors' | 'unified'>('sectors');
  const [selectedStock, setSelectedStock] = useState<HeatmapStock | null>(FALLBACK_SECTORS[0].stocks[0]);
  const [navDrawerOpen, setNavDrawerOpen] = useState<boolean>(false);
  const [syncCountdown, setSyncCountdown] = useState<number>(20);

  // Live market status hook
  const { isMarketOpen, marketStatusDetail } = useLiveStockTicks();

  // Fetch official NSE heatmap data
  const fetchHeatmap = useCallback(async () => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/heatmap`);
      if (res.ok) {
        const json: HeatmapResponse = await res.json();
        setHeatmapData(json);
        // If no stock is selected, pick the top active stock
        if (!selectedStock && json.sectors?.[0]?.stocks?.[0]) {
          setSelectedStock(json.sectors[0].stocks[0]);
        }
      }
    } catch (e) {
      console.error('Failed to load NSE heatmap data:', e);
    } finally {
      setLoading(false);
      setSyncCountdown(20);
    }
  }, [selectedStock]);

  useEffect(() => {
    fetchHeatmap();
    const interval = setInterval(() => {
      fetchHeatmap();
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchHeatmap]);

  // Countdown timer for next live exchange sync
  useEffect(() => {
    const timer = setInterval(() => {
      setSyncCountdown((prev) => (prev <= 1 ? 20 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Effective sectors source
  const currentSectors: HeatmapSector[] = useMemo(() => {
    if (heatmapData?.sectors && heatmapData.sectors.length > 0) {
      return heatmapData.sectors;
    }
    return FALLBACK_SECTORS;
  }, [heatmapData]);

  // Flat list of all available stocks
  const allStocks: HeatmapStock[] = useMemo(() => {
    return currentSectors.flatMap((s) => s.stocks);
  }, [currentSectors]);

  // Market Breadth computation
  const breadthStats = useMemo(() => {
    if (heatmapData?.breadth) return heatmapData.breadth;
    const adv = allStocks.filter((s) => s.percent_change > 0).length;
    const dec = allStocks.filter((s) => s.percent_change < 0).length;
    const unc = allStocks.filter((s) => s.percent_change === 0).length;
    return {
      advances: adv,
      declines: dec,
      unchanged: unc,
      advance_decline_ratio: dec > 0 ? Math.round((adv / dec) * 100) / 100 : adv
    };
  }, [heatmapData, allStocks]);

  // List of unique sector names for filter pills
  const availableSectorNames = useMemo(() => {
    return ['ALL', ...Array.from(new Set(currentSectors.map((s) => s.sector)))];
  }, [currentSectors]);

  // Filter and sort stocks
  const filterStocks = useCallback(
    (stocks: HeatmapStock[]): HeatmapStock[] => {
      let filtered = stocks.filter((stock) => {
        // Sector Filter
        if (selectedSector !== 'ALL' && stock.sector.toLowerCase() !== selectedSector.toLowerCase()) {
          return false;
        }

        // Grade Filter
        if (selectedGrade === 'GAINERS' && stock.percent_change <= 0) return false;
        if (selectedGrade === 'LOSERS' && stock.percent_change >= 0) return false;
        if (selectedGrade === 'STRONG_GAIN' && stock.percent_change < 1.5) return false;
        if (selectedGrade === 'STRONG_LOSS' && stock.percent_change > -1.5) return false;

        // Search Filter
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const match =
            stock.symbol.toLowerCase().includes(term) ||
            stock.company_name.toLowerCase().includes(term) ||
            stock.sector.toLowerCase().includes(term) ||
            stock.industry.toLowerCase().includes(term);
          if (!match) return false;
        }

        return true;
      });

      // Sort
      filtered.sort((a, b) => {
        if (sortBy === 'pct_desc') return b.percent_change - a.percent_change;
        if (sortBy === 'pct_asc') return a.percent_change - b.percent_change;
        if (sortBy === 'weight') return b.index_weight_pct - a.index_weight_pct;
        if (sortBy === 'alpha') return a.symbol.localeCompare(b.symbol);
        return 0;
      });

      return filtered;
    },
    [selectedSector, selectedGrade, searchTerm, sortBy]
  );

  // Sector-grouped filtered list
  const filteredSectors = useMemo(() => {
    return currentSectors
      .map((sec) => {
        const matchingStocks = filterStocks(sec.stocks);
        return {
          ...sec,
          stocks: matchingStocks
        };
      })
      .filter((sec) => sec.stocks.length > 0);
  }, [currentSectors, filterStocks]);

  // Unified flat filtered list
  const unifiedFilteredStocks = useMemo(() => {
    return filterStocks(allStocks);
  }, [allStocks, filterStocks]);

  // Dynamic Tile Color Resolver based on % change
  const getTileBg = (pct: number): string => {
    if (pct >= 2.5) return 'linear-gradient(135deg, #047857 0%, #059669 100%)';
    if (pct >= 1.0) return 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
    if (pct > 0.0) return 'linear-gradient(135deg, rgba(16, 185, 129, 0.28) 0%, rgba(5, 150, 105, 0.2) 100%)';
    if (pct === 0.0) return 'linear-gradient(135deg, rgba(71, 85, 105, 0.25) 0%, rgba(51, 65, 85, 0.2) 100%)';
    if (pct > -1.0) return 'linear-gradient(135deg, rgba(239, 68, 68, 0.28) 0%, rgba(185, 28, 28, 0.2) 100%)';
    if (pct > -2.5) return 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)';
    return 'linear-gradient(135deg, #991b1b 0%, #b91c1c 100%)';
  };

  const getTileBorder = (pct: number, isSelected: boolean): string => {
    if (isSelected) return '2px solid #38bdf8';
    if (pct > 0) return '1px solid rgba(16, 185, 129, 0.45)';
    if (pct < 0) return '1px solid rgba(239, 68, 68, 0.45)';
    return '1px solid rgba(255, 255, 255, 0.1)';
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Top Barometer Strip */}
      <IndicesBarometer />

      {/* Main Container */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px 80px 20px' }}>
        {/* Market Status Notification (when closed) */}
        {!isMarketOpen && (
          <div style={{ marginBottom: '20px' }}>
            <MarketStatusBanner statusDetail={marketStatusDetail} />
          </div>
        )}

        {/* Header Strip with Drawer, Hub Buttons and Direct Trade Signals Portal Shortcut */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '20px',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.7))',
            padding: '20px 24px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.36)'
          }}
        >
          {/* Left Title & Navigation Buttons */}
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
                fontSize: '0.82rem',
                padding: '8px 14px',
                border: '1px solid rgba(56, 189, 248, 0.45)',
                background: 'rgba(56, 189, 248, 0.12)',
                color: '#38bdf8',
                fontWeight: 700,
                boxShadow: '0 0 15px rgba(56, 189, 248, 0.25)',
                cursor: 'pointer'
              }}
              title="Open Market Hubs Navigator Drawer"
            >
              <Menu size={16} color="#38bdf8" />
              <span>Drawer</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  boxShadow: '0 0 16px rgba(56, 189, 248, 0.4)'
                }}
              >
                <Grid size={20} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', color: '#ffffff' }}>
                  NSE MARKET HEAT MAP
                </h1>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Live Market Breadth &bull; Sector Performance Matrix &bull; Interactive Stock Selection
                </div>
              </div>
            </div>
          </div>

          {/* Right Action Shortcuts */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Live Exchange Sync Indicator */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                fontSize: '0.74rem',
                fontWeight: 700,
                color: '#34d399'
              }}
            >
              <span
                className="pulse-indicator"
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 10px #10b981'
                }}
              />
              <span>LIVE NSE SYNC ({syncCountdown}s)</span>
            </div>

            {/* Direct Link to Trade Signals Portal */}
            <Link
              href="/signals"
              className="btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.82rem',
                padding: '8px 16px',
                background: 'linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)',
                color: '#ffffff',
                fontWeight: 800,
                borderRadius: '8px',
                border: 'none',
                boxShadow: '0 0 16px rgba(239, 68, 68, 0.4)',
                cursor: 'pointer'
              }}
              title="Open Algorithmic Trade Signals with Entry, SL & Targets"
            >
              <Zap size={16} />
              <span>Algorithmic Trade Signals &rarr;</span>
            </Link>

            <button
              onClick={() => fetchHeatmap()}
              className="btn btn-secondary"
              style={{
                fontSize: '0.8rem',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Refresh Heat Map Data"
            >
              <RefreshCw size={14} className={loading ? 'pulse-indicator' : ''} />
              <span>Sync</span>
            </button>
          </div>
        </div>

        {/* Market Breadth & Sector Pulse Barometer Strip */}
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px'
          }}
        >
          {/* Advances vs Declines Visual Ratio Bar */}
          <div style={{ flex: '1 1 360px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                MARKET BREADTH (ADVANCES / DECLINES)
              </div>
              <div style={{ fontSize: '0.74rem', fontWeight: 800 }}>
                <span style={{ color: '#34d399' }}>▲ {breadthStats.advances} Adv</span>
                <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>&bull;</span>
                <span style={{ color: '#f87171' }}>▼ {breadthStats.declines} Dec</span>
                <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>&bull;</span>
                <span style={{ color: '#94a3b8' }}>▬ {breadthStats.unchanged} Unch</span>
              </div>
            </div>

            {/* Graphical Progress Bar */}
            <div
              style={{
                width: '100%',
                height: '8px',
                borderRadius: '4px',
                background: 'rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
                display: 'flex'
              }}
            >
              <div
                style={{
                  width: `${(breadthStats.advances / (breadthStats.advances + breadthStats.declines || 1)) * 100}%`,
                  background: '#10b981',
                  transition: 'width 0.4s ease'
                }}
              />
              <div
                style={{
                  width: `${(breadthStats.declines / (breadthStats.advances + breadthStats.declines || 1)) * 100}%`,
                  background: '#ef4444',
                  transition: 'width 0.4s ease'
                }}
              />
            </div>
          </div>

          {/* Color Heat Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>HEAT GRADIENT:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ background: '#047857', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800 }}>
                &gt;+2%
              </span>
              <span style={{ background: '#10b981', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800 }}>
                +1%
              </span>
              <span style={{ background: 'rgba(16, 185, 129, 0.3)', color: '#34d399', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800 }}>
                +0.5%
              </span>
              <span style={{ background: 'rgba(148, 163, 184, 0.2)', color: '#cbd5e1', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800 }}>
                0%
              </span>
              <span style={{ background: 'rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800 }}>
                -0.5%
              </span>
              <span style={{ background: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800 }}>
                -1%
              </span>
              <span style={{ background: '#991b1b', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800 }}>
                &lt;-2%
              </span>
            </div>
          </div>
        </div>

        {/* Selected Stock Quick Inspector (Makes it effortless to interpret & take action on stocks) */}
        {selectedStock && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.85) 100%)',
              border: '1.5px solid #38bdf8',
              borderRadius: 'var(--radius-lg)',
              padding: '20px 24px',
              marginBottom: '20px',
              boxShadow: '0 8px 30px rgba(56, 189, 248, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '20px'
            }}
          >
            {/* Stock Title & Tags */}
            <div style={{ flex: '1 1 320px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em' }}>
                  {selectedStock.symbol}
                </span>
                <span style={{ fontSize: '0.90rem', color: 'var(--text-secondary)' }}>
                  {selectedStock.company_name}
                </span>
                <span
                  style={{
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    color: '#38bdf8',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '6px'
                  }}
                >
                  {selectedStock.sector}
                </span>
                <span
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#cbd5e1',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '6px'
                  }}
                >
                  {selectedStock.industry}
                </span>
              </div>

              {/* Price and Day Change */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginTop: '6px' }}>
                <span style={{ fontSize: '1.65rem', fontWeight: 900, color: '#ffffff' }}>
                  ₹{selectedStock.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span
                  style={{
                    fontSize: '0.92rem',
                    fontWeight: 800,
                    color: selectedStock.percent_change >= 0 ? '#34d399' : '#f87171'
                  }}
                >
                  {selectedStock.percent_change >= 0 ? '+' : ''}
                  {selectedStock.percent_change.toFixed(2)}% ({selectedStock.change >= 0 ? '+' : ''}₹{selectedStock.change.toFixed(2)})
                </span>
              </div>
            </div>

            {/* 52-Week Range Barometer */}
            <div style={{ flex: '1 1 280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                <span>52W Low: <strong>₹{selectedStock.low_52w.toFixed(1)}</strong></span>
                <span style={{ color: '#38bdf8', fontWeight: 800 }}>52-WEEK RANGE</span>
                <span>52W High: <strong>₹{selectedStock.high_52w.toFixed(1)}</strong></span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', position: 'relative' }}>
                {(() => {
                  const range = selectedStock.high_52w - selectedStock.low_52w || 1;
                  const pos = Math.min(100, Math.max(0, ((selectedStock.ltp - selectedStock.low_52w) / range) * 100));
                  return (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${pos}%`,
                        top: '-3px',
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: '#38bdf8',
                        border: '2px solid white',
                        boxShadow: '0 0 8px #38bdf8',
                        transform: 'translateX(-50%)'
                      }}
                    />
                  );
                })()}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.70rem', color: 'var(--text-secondary)' }}>
                <span>Index Weight: <strong style={{ color: '#ffffff' }}>{selectedStock.index_weight_pct}%</strong></span>
                <span>P/E Ratio: <strong style={{ color: '#ffffff' }}>{selectedStock.pe_ratio.toFixed(1)}</strong></span>
                <span>Signal: <strong style={{ color: selectedStock.percent_change >= 0 ? '#34d399' : '#f87171' }}>{selectedStock.signal}</strong></span>
              </div>
            </div>

            {/* 1-Click Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <Link
                href={`/signals?search=${encodeURIComponent(selectedStock.symbol)}`}
                className="btn"
                style={{
                  background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                  color: 'white',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  fontSize: '0.80rem',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 0 15px rgba(99, 102, 241, 0.35)',
                  border: 'none',
                  cursor: 'pointer'
                }}
                title={`View active quantitative buy/sell signals for ${selectedStock.symbol}`}
              >
                <Zap size={15} />
                <span>Trade Signals for {selectedStock.symbol} &rarr;</span>
              </Link>

              <Link
                href={`/52-week?search=${encodeURIComponent(selectedStock.symbol)}`}
                className="btn btn-secondary"
                style={{
                  padding: '9px 14px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Inspect 52-Week High/Low Proximity Radar"
              >
                <TrendingUp size={15} color="#10b981" />
                <span>52W Radar</span>
              </Link>

              <a
                href={selectedStock.nse_official_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{
                  padding: '9px 12px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)'
                }}
                title="View on Official NSE Website"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px',
            marginBottom: '20px'
          }}
        >
          {/* Top Row: Search Input + Sort + Layout Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '14px' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1 1 300px' }}>
              <Search
                size={16}
                color="var(--text-muted)"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                placeholder="Search by Symbol, Company Name, or Sector (e.g. RELIANCE, TCS, Banking)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 38px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#ffffff',
                  fontSize: '0.84rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Sort Options */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 700 }}>SORT:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
                  fontSize: '0.80rem',
                  fontWeight: 700,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="pct_desc" style={{ background: '#0f172a' }}>Top Gainers First (% Change)</option>
                <option value="pct_asc" style={{ background: '#0f172a' }}>Top Losers First (% Change)</option>
                <option value="weight" style={{ background: '#0f172a' }}>Index Weight (Heavyweights)</option>
                <option value="alpha" style={{ background: '#0f172a' }}>Alphabetical (A - Z)</option>
              </select>

              {/* View Layout Switcher */}
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.04)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <button
                  onClick={() => setViewMode('sectors')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: viewMode === 'sectors' ? 800 : 600,
                    background: viewMode === 'sectors' ? '#38bdf8' : 'transparent',
                    color: viewMode === 'sectors' ? '#0f172a' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  By Sector
                </button>
                <button
                  onClick={() => setViewMode('unified')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: viewMode === 'unified' ? 800 : 600,
                    background: viewMode === 'unified' ? '#38bdf8' : 'transparent',
                    color: viewMode === 'unified' ? '#0f172a' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  All 50 Matrix
                </button>
              </div>
            </div>
          </div>

          {/* Sector Filter Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 800, whiteSpace: 'nowrap' }}>
              SECTORS:
            </span>
            {availableSectorNames.map((secName) => {
              const isActive = selectedSector === secName;
              return (
                <button
                  key={secName}
                  onClick={() => setSelectedSector(secName)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '0.76rem',
                    fontWeight: isActive ? 800 : 600,
                    whiteSpace: 'nowrap',
                    background: isActive ? 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)' : 'rgba(255, 255, 255, 0.04)',
                    border: isActive ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                    color: isActive ? '#ffffff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    boxShadow: isActive ? '0 0 12px rgba(56, 189, 248, 0.35)' : 'none'
                  }}
                >
                  {secName === 'ALL' ? 'All Sectors' : secName}
                </button>
              );
            })}
          </div>
        </div>

        {/* Heat Map Main Display */}
        {loading && !currentSectors.length ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={28} className="pulse-indicator" color="#38bdf8" style={{ margin: '0 auto 12px auto' }} />
            <div>Loading live NSE India market map...</div>
          </div>
        ) : viewMode === 'sectors' ? (
          /* SECTOR-GROUPED VIEW */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {filteredSectors.map((sec) => (
              <div
                key={sec.sector}
                style={{
                  background: 'rgba(15, 23, 42, 0.75)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '18px 20px',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
                }}
              >
                {/* Sector Header Strip */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.01em' }}>
                      {sec.sector}
                    </span>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        padding: '3px 10px',
                        borderRadius: '6px',
                        background: sec.average_percent_change >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: sec.average_percent_change >= 0 ? '#34d399' : '#f87171',
                        border: sec.average_percent_change >= 0 ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)'
                      }}
                    >
                      {sec.average_percent_change >= 0 ? '+' : ''}
                      {sec.average_percent_change.toFixed(2)}% Avg
                    </span>
                  </div>

                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Index Weight: <strong style={{ color: '#38bdf8' }}>{sec.total_index_weight_pct}%</strong> &bull; {sec.stocks.length} Constituents
                  </div>
                </div>

                {/* Grid of Stock Tiles in this Sector */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '12px'
                  }}
                >
                  {sec.stocks.map((stock) => {
                    const isSelected = selectedStock?.symbol === stock.symbol;
                    const isGain = stock.percent_change >= 0;
                    return (
                      <div
                        key={stock.symbol}
                        onClick={() => setSelectedStock(stock)}
                        style={{
                          background: getTileBg(stock.percent_change),
                          border: getTileBorder(stock.percent_change, isSelected),
                          borderRadius: '12px',
                          padding: '14px 16px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          color: '#ffffff',
                          transition: 'all 0.15s ease',
                          boxShadow: isSelected
                            ? '0 0 20px rgba(56, 189, 248, 0.5)'
                            : '0 2px 10px rgba(0, 0, 0, 0.25)',
                          transform: isSelected ? 'scale(1.02)' : 'none'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.35)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.25)';
                          }
                        }}
                      >
                        {/* Top Row: Symbol & Signal Pill */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.98rem', fontWeight: 900, letterSpacing: '0.01em' }}>
                            {stock.symbol}
                          </span>
                          <span
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 900,
                              background: 'rgba(0, 0, 0, 0.4)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              letterSpacing: '0.03em'
                            }}
                          >
                            {stock.signal}
                          </span>
                        </div>

                        {/* Middle: Company Name */}
                        <div style={{ fontSize: '0.70rem', color: 'rgba(255, 255, 255, 0.85)', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {stock.company_name}
                        </div>

                        {/* Price & Change */}
                        <div style={{ marginTop: '10px' }}>
                          <div style={{ fontSize: '1.20rem', fontWeight: 900 }}>
                            ₹{stock.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 800, marginTop: '2px' }}>
                            {isGain ? '+' : ''}
                            {stock.percent_change.toFixed(2)}% ({isGain ? '+' : ''}₹{stock.change.toFixed(2)})
                          </div>
                        </div>

                        {/* Bottom Row: Weight & P/E */}
                        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.15)', fontSize: '0.64rem', display: 'flex', justifyContent: 'space-between', opacity: 0.9 }}>
                          <span>Weight: <strong>{stock.index_weight_pct}%</strong></span>
                          <span>P/E: <strong>{stock.pe_ratio.toFixed(1)}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* UNIFIED 50 MATRIX VIEW */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '12px'
            }}
          >
            {unifiedFilteredStocks.map((stock) => {
              const isSelected = selectedStock?.symbol === stock.symbol;
              const isGain = stock.percent_change >= 0;
              return (
                <div
                  key={stock.symbol}
                  onClick={() => setSelectedStock(stock)}
                  style={{
                    background: getTileBg(stock.percent_change),
                    border: getTileBorder(stock.percent_change, isSelected),
                    borderRadius: '12px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    color: '#ffffff',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected
                      ? '0 0 20px rgba(56, 189, 248, 0.5)'
                      : '0 2px 10px rgba(0, 0, 0, 0.25)',
                    transform: isSelected ? 'scale(1.02)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.35)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.25)';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.98rem', fontWeight: 900 }}>{stock.symbol}</span>
                    <span
                      style={{
                        fontSize: '0.62rem',
                        fontWeight: 800,
                        background: 'rgba(0, 0, 0, 0.35)',
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}
                    >
                      {stock.sector}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.70rem', color: 'rgba(255, 255, 255, 0.85)', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {stock.company_name}
                  </div>

                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '1.20rem', fontWeight: 900 }}>
                      ₹{stock.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, marginTop: '2px' }}>
                      {isGain ? '+' : ''}
                      {stock.percent_change.toFixed(2)}% ({isGain ? '+' : ''}₹{stock.change.toFixed(2)})
                    </div>
                  </div>

                  <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.15)', fontSize: '0.64rem', display: 'flex', justifyContent: 'space-between', opacity: 0.9 }}>
                    <span>Weight: <strong>{stock.index_weight_pct}%</strong></span>
                    <span>P/E: <strong>{stock.pe_ratio.toFixed(1)}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Navigation Drawer Component */}
      <NavigationDrawer isOpen={navDrawerOpen} onClose={() => setNavDrawerOpen(false)} />
    </div>
  );
}

export default function ChartingAndHeatmapPage() {
  return (
    <React.Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0d14' }} />}>
      <HeatmapContent />
    </React.Suspense>
  );
}
