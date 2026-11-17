"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { 
  Building2, 
  Search, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  Globe, 
  Database, 
  Layers, 
  ArrowUpDown, 
  ExternalLink, 
  ShoppingCart, 
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  BarChart3
} from "lucide-react";
import PaperOrderModal from "@/components/PaperOrderModal";
import { getApiBase } from "@/config/api";

interface CompanyItem {
  company_id: string;
  legal_name: string;
  primary_isin: string;
  sector: string;
  industry: string;
  market_cap_category: string;
  market_cap_cr: number;
  listing_status: string;
  nse_symbol: string | null;
  bse_code: string | null;
  board_type: string;
  is_fno_eligible: boolean;
  ltp: number;
  change: number;
  percent_change: number;
  volume: number;
  high_52w: number;
  low_52w: number;
  data_status: string;
  last_updated: string | null;
}

interface UniverseMetrics {
  total_listed_companies: number;
  nse_instruments: number;
  bse_instruments: number;
  mainboard_instruments: number;
  sme_instruments: number;
  active_companies: number;
  suspended_companies: number;
}

export default function AllListedCompaniesPage() {
  const [items, setItems] = useState<CompanyItem[]>([]);
  const [metrics, setMetrics] = useState<UniverseMetrics | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedExchange, setSelectedExchange] = useState("ALL");
  const [selectedBoard, setSelectedBoard] = useState("ALL");
  const [selectedCap, setSelectedCap] = useState("ALL");
  const [selectedSector, setSelectedSector] = useState("ALL");
  const [sortBy, setSortBy] = useState("market_cap_cr");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Order modal state
  const [orderModalStock, setOrderModalStock] = useState<{ symbol: string; ltp: number } | null>(null);

  const fetchUniverse = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", limit.toString());
      params.set("sort_by", sortBy);
      params.set("sort_dir", sortDir);

      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      if (selectedExchange !== "ALL") params.set("exchange", selectedExchange);
      if (selectedBoard !== "ALL") params.set("board_type", selectedBoard);
      if (selectedCap !== "ALL") params.set("market_cap", selectedCap);
      if (selectedSector !== "ALL") params.set("sector", selectedSector);

      const res = await fetch(`${getApiBase()}/api/companies/universe?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
        if (data.metrics) setMetrics(data.metrics);
      }
    } catch (e) {
      console.error("Failed to load company universe:", e);
    } finally {
      setLoading(false);
    }
  }, [page, limit, sortBy, sortDir, searchTerm, selectedExchange, selectedBoard, selectedCap, selectedSector]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUniverse();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchUniverse]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "LIVE":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse">● LIVE</span>;
      case "EOD":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">EOD CLOSE</span>;
      case "DELAYED":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">DELAYED</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">CLOSED</span>;
    }
  };

  const getBoardBadge = (board: string) => {
    if (board === "SME") {
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">SME</span>;
    }
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">MAIN</span>;
  };

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col font-sans">
      {/* Top Banner / Breadcrumb */}
      <div className="border-b border-slate-800/80 bg-[#0C1019] px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 uppercase tracking-widest mb-1">
              <Database className="w-3.5 h-3.5" />
              <span>National Securities Master & Listed Equity Universe</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              All Listed Companies
              <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                NSE + BSE | Mainboard + SME
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/data-center"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition"
            >
              <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
              <span>Data Center Telemetry</span>
            </Link>
            <button
              onClick={() => fetchUniverse()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-xs font-semibold text-emerald-300 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh Universe</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 flex-1 flex flex-col gap-6">
        {/* Metric Cards Row */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-[#0F1420] border border-slate-800/80 rounded-xl p-3.5">
              <div className="text-[11px] font-medium text-slate-400">Total Companies</div>
              <div className="text-xl font-bold text-white mt-1">{metrics.total_listed_companies.toLocaleString()}</div>
              <div className="text-[10px] text-emerald-400 mt-0.5">Canonical Entities</div>
            </div>
            <div className="bg-[#0F1420] border border-slate-800/80 rounded-xl p-3.5">
              <div className="text-[11px] font-medium text-slate-400">NSE Instruments</div>
              <div className="text-xl font-bold text-blue-400 mt-1">{metrics.nse_instruments.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Equities Listed</div>
            </div>
            <div className="bg-[#0F1420] border border-slate-800/80 rounded-xl p-3.5">
              <div className="text-[11px] font-medium text-slate-400">BSE Instruments</div>
              <div className="text-xl font-bold text-purple-400 mt-1">{metrics.bse_instruments.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Scrips Listed</div>
            </div>
            <div className="bg-[#0F1420] border border-slate-800/80 rounded-xl p-3.5">
              <div className="text-[11px] font-medium text-slate-400">Mainboard Equities</div>
              <div className="text-xl font-bold text-amber-400 mt-1">{metrics.mainboard_instruments.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">EQ / Series A, B</div>
            </div>
            <div className="bg-[#0F1420] border border-slate-800/80 rounded-xl p-3.5">
              <div className="text-[11px] font-medium text-slate-400">SME Equities</div>
              <div className="text-xl font-bold text-pink-400 mt-1">{metrics.sme_instruments.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">EMERGE / BSE SME</div>
            </div>
            <div className="bg-[#0F1420] border border-slate-800/80 rounded-xl p-3.5">
              <div className="text-[11px] font-medium text-slate-400">Active Trading</div>
              <div className="text-xl font-bold text-emerald-400 mt-1">{metrics.active_companies.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{metrics.suspended_companies} Suspended</div>
            </div>
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="bg-[#0E131E] border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Search by company name, NSE symbol, BSE code, or ISIN..."
              className="w-full bg-[#080B11] border border-slate-700/80 rounded-lg pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Exchange Filter */}
            <select
              value={selectedExchange}
              onChange={(e) => {
                setSelectedExchange(e.target.value);
                setPage(1);
              }}
              className="bg-[#080B11] border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">All Exchanges (NSE + BSE)</option>
              <option value="NSE">NSE Only</option>
              <option value="BSE">BSE Only</option>
              <option value="BOTH">Dual-Listed (Both)</option>
            </select>

            {/* Board Type Filter */}
            <select
              value={selectedBoard}
              onChange={(e) => {
                setSelectedBoard(e.target.value);
                setPage(1);
              }}
              className="bg-[#080B11] border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">All Boards (Mainboard + SME)</option>
              <option value="MAINBOARD">Mainboard Only</option>
              <option value="SME">SME Only</option>
            </select>

            {/* Market Cap Filter */}
            <select
              value={selectedCap}
              onChange={(e) => {
                setSelectedCap(e.target.value);
                setPage(1);
              }}
              className="bg-[#080B11] border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">All Market Caps</option>
              <option value="LARGE_CAP">Large Cap (&gt;₹20k Cr)</option>
              <option value="MID_CAP">Mid Cap (₹5k-20k Cr)</option>
              <option value="SMALL_CAP">Small Cap (₹1k-5k Cr)</option>
              <option value="MICRO_CAP">Micro Cap (&lt;₹1k Cr)</option>
            </select>
          </div>
        </div>

        {/* Companies Table */}
        <div className="bg-[#0D121D] border border-slate-800 rounded-xl overflow-hidden shadow-xl flex-1 flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#121724] border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort("legal_name")}>
                    <div className="flex items-center gap-1.5">
                      <span>Company / Entity</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-500" />
                    </div>
                  </th>
                  <th className="py-3 px-3">Identifiers</th>
                  <th className="py-3 px-3">Board & Sector</th>
                  <th className="py-3 px-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort("market_cap_cr")}>
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Market Cap</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-500" />
                    </div>
                  </th>
                  <th className="py-3 px-3 text-right">LTP (₹)</th>
                  <th className="py-3 px-3 text-right">Change %</th>
                  <th className="py-3 px-3 text-center">Data Feed</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
                      Loading securities from All-India universe...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No securities matching your search criteria.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.company_id} className="hover:bg-slate-800/40 transition">
                      {/* Company Name */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white text-xs hover:text-emerald-400 transition">
                          <Link href={`/company/${item.nse_symbol || item.company_id}`}>
                            {item.legal_name}
                          </Link>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                          <span>ISIN: {item.primary_isin}</span>
                          {item.is_fno_eligible && (
                            <span className="px-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] font-bold">
                              F&O
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Identifiers */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2 font-mono">
                          {item.nse_symbol ? (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-bold text-[11px]">
                              NSE: {item.nse_symbol}
                            </span>
                          ) : (
                            <span className="text-slate-600 text-[10px]">—</span>
                          )}
                          {item.bse_code && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[11px]">
                              BSE: {item.bse_code}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Board & Sector */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          {getBoardBadge(item.board_type)}
                          <span className="text-[11px] text-slate-300 font-medium truncate max-w-[150px]">
                            {item.sector}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[180px]">
                          {item.industry}
                        </div>
                      </td>

                      {/* Market Cap */}
                      <td className="py-3 px-3 text-right">
                        <div className="font-semibold text-white font-mono">
                          {item.market_cap_cr > 0 ? `₹${item.market_cap_cr.toLocaleString("en-IN", { maximumFractionDigits: 1 })} Cr` : "—"}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium">
                          {item.market_cap_category.replace("_", " ")}
                        </div>
                      </td>

                      {/* LTP */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-white">
                        {item.ltp > 0 ? `₹${item.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                      </td>

                      {/* Change % */}
                      <td className="py-3 px-3 text-right font-mono font-semibold">
                        {item.percent_change >= 0 ? (
                          <span className="text-emerald-400 flex items-center justify-end gap-0.5">
                            <TrendingUp className="w-3 h-3" />
                            +{item.percent_change.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-rose-400 flex items-center justify-end gap-0.5">
                            <TrendingDown className="w-3 h-3" />
                            {item.percent_change.toFixed(2)}%
                          </span>
                        )}
                      </td>

                      {/* Data Status */}
                      <td className="py-3 px-3 text-center">
                        {getStatusBadge(item.data_status)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Link
                            href={`/chart?symbol=${item.nse_symbol || item.company_id}`}
                            title="Open TradingView Chart"
                            className="p-1.5 rounded-md hover:bg-slate-700 text-slate-300 hover:text-white transition"
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                          </Link>
                          <Link
                            href={`/company/${item.nse_symbol || item.company_id}`}
                            title="Open Company Dossier"
                            className="p-1.5 rounded-md hover:bg-slate-700 text-slate-300 hover:text-white transition"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                          {item.nse_symbol && (
                            <button
                              onClick={() => setOrderModalStock({ symbol: item.nse_symbol!, ltp: item.ltp || 100.0 })}
                              title="Instant Paper Order"
                              className="p-1.5 rounded-md hover:bg-emerald-600/30 text-emerald-400 transition"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          <div className="bg-[#101420] border-t border-slate-800 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div>
              Showing <span className="text-white font-medium">{Math.min(total, (page - 1) * limit + 1)}</span> to{" "}
              <span className="text-white font-medium">{Math.min(total, page * limit)}</span> of{" "}
              <span className="text-white font-medium">{total.toLocaleString()}</span> securities
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1 || loading}
                className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-medium transition flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>

              <span className="px-3 py-1 font-mono text-slate-300">
                Page {page} of {totalPages}
              </span>

              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages || loading}
                className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-medium transition flex items-center gap-1"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Instant Paper Order Placement Modal */}
      {orderModalStock && (
        <PaperOrderModal
          symbol={orderModalStock.symbol}
          initialPrice={orderModalStock.ltp}
          isOpen={true}
          onClose={() => setOrderModalStock(null)}
          onOrderPlaced={() => {
            fetchUniverse();
            setOrderModalStock(null);
          }}
        />
      )}
    </div>
  );
}
