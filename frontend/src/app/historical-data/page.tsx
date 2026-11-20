"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Database,
  Layers,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  TrendingUp,
  HardDrive,
  UploadCloud,
  FileText,
  Activity,
  ArrowUpRight,
  Filter,
  Search,
  AlertOctagon,
  ChevronRight,
  ExternalLink,
  Play,
  RotateCcw,
  Download,
  Calendar,
  Menu
} from "lucide-react";
import { getApiBase } from "@/config/api";

const NavigationDrawer = dynamic(() => import("@/components/NavigationDrawer"), {
  ssr: false,
  loading: () => null
});

interface DataSourceItem {
  source_code: string;
  name: string;
  exchange: string;
  segment: string;
  base_url: string;
  licensing_tier: string;
  is_subscription_required: boolean;
  is_active: boolean;
  last_sync_at: string | null;
}

interface CoverageItem {
  exchange: string;
  segment: string;
  symbol: string;
  timeframe: string;
  earliest_date: string | null;
  latest_date: string | null;
  total_candles: number;
  completeness_pct: number;
  data_status: string;
}

interface ImportJobItem {
  id: number;
  source_code: string;
  job_type: string;
  exchange: string;
  segment: string;
  status: string;
  records_imported: number;
  records_rejected: number;
  source_file_ref: string | null;
  error_details: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface QualityIssueItem {
  id: number;
  exchange: string;
  symbol: string;
  issue_type: string;
  severity: string;
  description: string;
  status: string;
  detected_at: string | null;
}

export default function HistoricalDataCenterPage() {
  const [activeTab, setActiveTab] = useState<"overview" | "candles" | "coverage" | "backfill" | "jobs" | "quality">("candles");
  const [sources, setSources] = useState<DataSourceItem[]>([]);
  const [coverage, setCoverage] = useState<CoverageItem[]>([]);
  const [jobs, setJobs] = useState<ImportJobItem[]>([]);
  const [issues, setIssues] = useState<QualityIssueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadSource, setUploadSource] = useState("NSE_CM_BHAVCOPY");
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterExchange, setFilterExchange] = useState("ALL");
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);

  // Explicit Date, Time & Timeframe Candle Inspector
  const [inspectSymbol, setInspectSymbol] = useState("RELIANCE");
  const [inspectExchange, setInspectExchange] = useState("NSE");
  const [inspectTimeframe, setInspectTimeframe] = useState("1d");
  const [inspectAdjusted, setInspectAdjusted] = useState(false);
  const [inspectFromDate, setInspectFromDate] = useState("");
  const [inspectToDate, setInspectToDate] = useState("");
  const [inspectCandles, setInspectCandles] = useState<any[]>([]);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const apiBase = getApiBase();

  const fetchCandles = useCallback(async () => {
    try {
      setInspectLoading(true);
      setInspectError(null);
      let url = `${apiBase}/api/market/historical/candles?symbol=${encodeURIComponent(inspectSymbol)}&exchange=${inspectExchange}&timeframe=${inspectTimeframe}&adjusted=${inspectAdjusted}`;
      if (inspectFromDate) url += `&from_date=${inspectFromDate}`;
      if (inspectToDate) url += `&to_date=${inspectToDate}`;

      const res = await fetch(url);
      const data = await res.json();
      if (data.status === "VALID") {
        setInspectCandles(data.candles || []);
      } else {
        setInspectCandles(data.candles || []);
        setInspectError(data.message || `Data Status: ${data.status}`);
      }
    } catch (e: any) {
      setInspectError(e.message || "Failed to load candles");
    } finally {
      setInspectLoading(false);
    }
  }, [apiBase, inspectSymbol, inspectExchange, inspectTimeframe, inspectAdjusted, inspectFromDate, inspectToDate]);

  useEffect(() => {
    fetchCandles();
  }, [fetchCandles]);

  const exportCandlesCSV = () => {
    if (!inspectCandles || inspectCandles.length === 0) return;
    const headers = ["Date", "Time (IST)", "Timeframe", "DateTime", "Open", "High", "Low", "Close", "Volume", "Turnover", "VWAP", "Trades", "Adjusted", "Source"];
    const rows = inspectCandles.map((c) => [
      c.date || c.timestamp?.slice(0, 10) || "",
      c.time || c.timestamp?.slice(11, 19) || "",
      c.timeframe || inspectTimeframe.toUpperCase(),
      c.datetime || `${c.date} ${c.time}`,
      c.open,
      c.high,
      c.low,
      c.close,
      c.volume,
      c.turnover || 0,
      c.vwap || c.close,
      c.trades || 0,
      c.is_adjusted ? "YES" : "NO",
      c.source || "NSE/BSE",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${inspectSymbol}_${inspectTimeframe}_candles.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);
      const [sourcesRes, coverageRes, jobsRes, qualityRes] = await Promise.all([
        fetch(`${apiBase}/api/market/historical/sources`).then((r) => (r.ok ? r.json() : { sources: [] })),
        fetch(`${apiBase}/api/market/historical/coverage`).then((r) => (r.ok ? r.json() : { coverage: [] })),
        fetch(`${apiBase}/api/admin/data/jobs`).then((r) => (r.ok ? r.json() : { jobs: [] })),
        fetch(`${apiBase}/api/admin/data/quality`).then((r) => (r.ok ? r.json() : { issues: [] })),
      ]);

      setSources(sourcesRes.sources || []);
      setCoverage(coverageRes.coverage || []);
      setJobs(jobsRes.jobs || []);
      setIssues(qualityRes.issues || []);
    } catch (err) {
      console.error("Failed to load historical data telemetry:", err);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleTriggerSync = async () => {
    try {
      setSyncing(true);
      const res = await fetch(`${apiBase}/api/admin/data/sync?source_code=${uploadSource}`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchAllData();
      }
    } catch (err) {
      console.error("Sync trigger failed:", err);
    } finally {
      setSyncing(false);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    try {
      setUploadStatus("Uploading & ingesting official exchange Bhavcopy...");
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch(`${apiBase}/api/admin/data/backfill?source_code=${uploadSource}`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.status === "COMPLETED") {
        setUploadStatus(`Success! Imported ${data.imported_candles} candles across ${data.symbols_count} securities.`);
        setSelectedFile(null);
        await fetchAllData();
      } else {
        setUploadStatus(`Ingestion Failed: ${data.error || "Unknown validation error"}`);
      }
    } catch (err: any) {
      setUploadStatus(`Error: ${err.message || "Failed to upload file"}`);
    }
  };

  const filteredCoverage = coverage.filter((c) => {
    const matchesSearch = c.symbol.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesExchange = filterExchange === "ALL" || c.exchange === filterExchange;
    return matchesSearch && matchesExchange;
  });

  const totalCandles = coverage.reduce((acc, curr) => acc + curr.total_candles, 0);

  return (
    <div style={{ minHeight: "100vh", background: "#0b0f19", color: "#f8fafc", padding: "24px 20px 60px" }}>
      {/* Top Header */}
      <div style={{ maxWidth: "1400px", margin: "0 auto 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <Link
              href="/"
              className="btn btn-secondary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.8rem",
                padding: "8px 12px",
              }}
            >
              &larr; Back
            </Link>

            <button
              onClick={() => setNavDrawerOpen(true)}
              className="btn btn-secondary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "0.82rem",
                padding: "8px 14px",
                border: "1px solid rgba(16, 185, 129, 0.4)",
                background: "rgba(16, 185, 129, 0.1)",
                color: "#34d399",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Menu size={16} />
              <span>Drawer</span>
            </button>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  background: "linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 20px rgba(79, 70, 229, 0.4)",
                }}
              >
                <HardDrive size={20} color="#ffffff" />
              </div>
              <h1 style={{ fontSize: "1.6rem", fontWeight: 900, letterSpacing: "-0.02em", margin: 0 }}>
                Historical Data Center
              </h1>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: "6px",
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#34d399",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                }}
              >
                NSE + BSE Official Archives
              </span>
            </div>
            <p style={{ color: "#94a3b8", fontSize: "0.9rem", margin: 0 }}>
              National Equity, Index, Futures & Options Historical Price-Volume Repository & Bhavcopy Ingestion Engine.
            </p>
          </div>
        </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Link
              href="/data-center"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.85rem",
                color: "#94a3b8",
                padding: "8px 14px",
                borderRadius: "8px",
                background: "rgba(255, 255, 255, 0.05)",
                textDecoration: "none",
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <Database size={15} />
              Live Telemetry
            </Link>
            <button
              onClick={fetchAllData}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.85rem",
                fontWeight: 600,
                color: "#ffffff",
                padding: "8px 16px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              {loading ? "Refreshing..." : "Refresh Status"}
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          maxWidth: "1400px",
          margin: "0 auto 28px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "16px",
        }}
      >
        <div style={{ background: "#131b2e", padding: "18px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>Registered Sources</span>
            <Layers size={18} color="#6366f1" />
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>{sources.length}</div>
          <div style={{ fontSize: "0.75rem", color: "#10b981", marginTop: "4px" }}>NSE Capital Market, F&O, Indices & BSE</div>
        </div>

        <div style={{ background: "#131b2e", padding: "18px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>Total Historical Candles</span>
            <TrendingUp size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>{totalCandles.toLocaleString()}</div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "4px" }}>Across Mainboard & SME Securities</div>
        </div>

        <div style={{ background: "#131b2e", padding: "18px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>Ingestion Jobs Logged</span>
            <Activity size={18} color="#06b6d4" />
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>{jobs.length}</div>
          <div style={{ fontSize: "0.75rem", color: "#38bdf8", marginTop: "4px" }}>
            {jobs.filter((j) => j.status === "COMPLETED").length} Completed | {jobs.filter((j) => j.status === "FAILED").length} Failed
          </div>
        </div>

        <div style={{ background: "#131b2e", padding: "18px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>Data Quality Invariants</span>
            <ShieldCheck size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800 }}>
            {issues.length === 0 ? "100% Valid" : `${issues.length} Flagged`}
          </div>
          <div style={{ fontSize: "0.75rem", color: issues.length === 0 ? "#10b981" : "#f59e0b", marginTop: "4px" }}>
            {issues.length === 0 ? "Zero Lookahead / Gap Anomalies" : "Inspect in Quality Tab"}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: "1400px", margin: "0 auto 20px", display: "flex", gap: "8px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "12px", overflowX: "auto" }}>
        {[
          { key: "candles", label: "Date, Time & Timeframe Inspector", icon: Clock },
          { key: "overview", label: "Official Sources & Licensing", icon: Layers },
          { key: "coverage", label: "Data Coverage Explorer", icon: Database },
          { key: "backfill", label: "Backfill & Sync Console", icon: UploadCloud },
          { key: "jobs", label: "Ingestion Jobs Audit", icon: FileText },
          { key: "quality", label: "Quality & Invariants", icon: AlertTriangle },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "0.85rem",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                background: isActive ? "rgba(99, 102, 241, 0.15)" : "transparent",
                color: isActive ? "#818cf8" : "#94a3b8",
                borderBottom: isActive ? "2px solid #6366f1" : "2px solid transparent",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        {/* 0. CANDLES INSPECTOR WITH DATE, TIME & TIMEFRAME */}
        {activeTab === "candles" && (
          <div style={{ background: "#131b2e", padding: "24px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
              <div>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 6px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Clock size={20} color="#38bdf8" />
                  Historical Bar Inspector & Data Exporter
                </h2>
                <p style={{ fontSize: "0.85rem", color: "#94a3b8", margin: 0 }}>
                  High-fidelity candlestick time-series with explicit <strong style={{ color: "#38bdf8" }}>Date</strong> (YYYY-MM-DD), <strong style={{ color: "#38bdf8" }}>Time (IST)</strong> (HH:MM:SS), and <strong style={{ color: "#38bdf8" }}>Timeframe</strong> resolution.
                </p>
              </div>

              <button
                onClick={exportCandlesCSV}
                disabled={inspectCandles.length === 0}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  background: inspectCandles.length > 0 ? "linear-gradient(135deg, #059669 0%, #10b981 100%)" : "rgba(255, 255, 255, 0.05)",
                  color: inspectCandles.length > 0 ? "#ffffff" : "#64748b",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  border: "none",
                  cursor: inspectCandles.length > 0 ? "pointer" : "not-allowed",
                  boxShadow: inspectCandles.length > 0 ? "0 4px 15px rgba(16, 185, 129, 0.3)" : "none",
                }}
              >
                <Download size={16} />
                Export CSV with Date, Time & Timeframe
              </button>
            </div>

            {/* Controls Bar */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", background: "rgba(0, 0, 0, 0.25)", padding: "16px", borderRadius: "10px", marginBottom: "20px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
              {/* Symbol Input */}
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#94a3b8", marginBottom: "6px" }}>Symbol / Contract</label>
                <input
                  type="text"
                  value={inspectSymbol}
                  onChange={(e) => setInspectSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g. RELIANCE, NIFTY 50..."
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    background: "#0b0f19",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#ffffff",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                  }}
                />
              </div>

              {/* Exchange */}
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#94a3b8", marginBottom: "6px" }}>Exchange</label>
                <select
                  value={inspectExchange}
                  onChange={(e) => setInspectExchange(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    background: "#0b0f19",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#ffffff",
                    fontSize: "0.85rem",
                  }}
                >
                  <option value="NSE">NSE (National Stock Exchange)</option>
                  <option value="BSE">BSE (Bombay Stock Exchange)</option>
                </select>
              </div>

              {/* Timeframe */}
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#94a3b8", marginBottom: "6px" }}>Timeframe</label>
                <div style={{ display: "flex", gap: "4px" }}>
                  {["1d", "1h", "30m", "15m", "5m", "1m"].map((tf) => (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setInspectTimeframe(tf)}
                      style={{
                        flex: 1,
                        padding: "7px 4px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        border: inspectTimeframe === tf ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.08)",
                        background: inspectTimeframe === tf ? "#0284c7" : "rgba(255, 255, 255, 0.04)",
                        color: "#ffffff",
                        cursor: "pointer",
                      }}
                    >
                      {tf.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Adjustments */}
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#94a3b8", marginBottom: "6px" }}>Corporate Actions</label>
                <select
                  value={inspectAdjusted ? "true" : "false"}
                  onChange={(e) => setInspectAdjusted(e.target.value === "true")}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    background: "#0b0f19",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    color: "#ffffff",
                    fontSize: "0.85rem",
                  }}
                >
                  <option value="false">Raw Exchange Prices (Unadjusted)</option>
                  <option value="true">Split & Bonus Backwards Adjusted</option>
                </select>
              </div>

              {/* Submit Button */}
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button
                  type="button"
                  onClick={fetchCandles}
                  disabled={inspectLoading}
                  style={{
                    width: "100%",
                    padding: "9px 16px",
                    borderRadius: "6px",
                    background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    border: "none",
                    cursor: inspectLoading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  <RefreshCw size={14} className={inspectLoading ? "animate-spin" : ""} />
                  {inspectLoading ? "Querying..." : "Query Bars"}
                </button>
              </div>
            </div>

            {/* Quick Select Symbols */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
              <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700 }}>Quick Lookup:</span>
              {["RELIANCE", "TCS", "INFY", "HDFCBANK", "NIFTY 50", "NIFTY BANK", "KAYNES"].map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => {
                    setInspectSymbol(sym);
                  }}
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "4px",
                    background: inspectSymbol === sym ? "rgba(56, 189, 248, 0.2)" : "rgba(255, 255, 255, 0.05)",
                    color: inspectSymbol === sym ? "#38bdf8" : "#94a3b8",
                    border: inspectSymbol === sym ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.08)",
                    cursor: "pointer",
                  }}
                >
                  {sym}
                </button>
              ))}
            </div>

            {inspectError && (
              <div style={{ padding: "12px 16px", borderRadius: "8px", background: "rgba(245, 158, 11, 0.15)", border: "1px solid rgba(245, 158, 11, 0.3)", color: "#fbbf24", fontSize: "0.85rem", marginBottom: "16px" }}>
                {inspectError}
              </div>
            )}

            {/* Candle Data Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.12)", color: "#94a3b8" }}>
                    <th style={{ padding: "10px 12px", color: "#38bdf8" }}>DATE</th>
                    <th style={{ padding: "10px 12px", color: "#38bdf8" }}>TIME (IST)</th>
                    <th style={{ padding: "10px 12px", color: "#38bdf8" }}>TIMEFRAME</th>
                    <th style={{ padding: "10px 12px" }}>OPEN (₹)</th>
                    <th style={{ padding: "10px 12px" }}>HIGH (₹)</th>
                    <th style={{ padding: "10px 12px" }}>LOW (₹)</th>
                    <th style={{ padding: "10px 12px" }}>CLOSE (₹)</th>
                    <th style={{ padding: "10px 12px" }}>VOLUME</th>
                    <th style={{ padding: "10px 12px" }}>TURNOVER (₹)</th>
                    <th style={{ padding: "10px 12px" }}>VWAP (₹)</th>
                    <th style={{ padding: "10px 12px" }}>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {inspectCandles.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>
                        No candles returned for {inspectSymbol} ({inspectTimeframe.toUpperCase()}). Click "Query Bars" or import official Bhavcopy archives.
                      </td>
                    </tr>
                  ) : (
                    inspectCandles.map((c, i) => {
                      const dateVal = c.date || (c.timestamp ? c.timestamp.slice(0, 10) : "—");
                      const timeVal = c.time || (c.timestamp && c.timestamp.length > 18 ? c.timestamp.slice(11, 19) : "15:30:00");
                      const tfVal = c.timeframe || inspectTimeframe.toUpperCase();
                      const isUp = c.close >= c.open;

                      return (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                          <td style={{ padding: "10px 12px", fontWeight: 800, color: "#f8fafc" }}>{dateVal}</td>
                          <td style={{ padding: "10px 12px", fontWeight: 700, color: "#38bdf8" }}>{timeVal}</td>
                          <td style={{ padding: "10px 12px" }}>
                            <span style={{ padding: "2px 6px", borderRadius: "4px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", fontSize: "0.75rem", fontWeight: 800 }}>
                              {tfVal}
                            </span>
                          </td>
                          <td style={{ padding: "10px 12px", color: "#cbd5e1" }}>{Number(c.open).toFixed(2)}</td>
                          <td style={{ padding: "10px 12px", color: "#34d399" }}>{Number(c.high).toFixed(2)}</td>
                          <td style={{ padding: "10px 12px", color: "#f87171" }}>{Number(c.low).toFixed(2)}</td>
                          <td style={{ padding: "10px 12px", fontWeight: 800, color: isUp ? "#34d399" : "#f87171" }}>
                            {Number(c.close).toFixed(2)}
                          </td>
                          <td style={{ padding: "10px 12px", color: "#cbd5e1" }}>{c.volume ? Number(c.volume).toLocaleString() : "—"}</td>
                          <td style={{ padding: "10px 12px", color: "#94a3b8" }}>{c.turnover ? Number(c.turnover).toLocaleString() : "—"}</td>
                          <td style={{ padding: "10px 12px", color: "#cbd5e1" }}>{c.vwap ? Number(c.vwap).toFixed(2) : Number(c.close).toFixed(2)}</td>
                          <td style={{ padding: "10px 12px" }}>
                            <span style={{ padding: "2px 6px", borderRadius: "4px", background: "rgba(16, 185, 129, 0.15)", color: "#34d399", fontSize: "0.75rem", fontWeight: 700 }}>
                              VALID
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 1. OVERVIEW & SOURCES */}
        {activeTab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "16px" }}>
            {sources.map((src) => (
              <div
                key={src.source_code}
                style={{
                  background: "#131b2e",
                  padding: "20px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                  <div>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 800,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: src.exchange === "NSE" ? "rgba(79, 70, 229, 0.2)" : "rgba(245, 158, 11, 0.2)",
                        color: src.exchange === "NSE" ? "#818cf8" : "#fbbf24",
                        marginRight: "8px",
                      }}
                    >
                      {src.exchange}
                    </span>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: "rgba(255, 255, 255, 0.08)",
                        color: "#94a3b8",
                      }}
                    >
                      {src.segment}
                    </span>
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 800, margin: "8px 0 4px" }}>{src.name}</h3>
                  </div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "4px 10px",
                      borderRadius: "6px",
                      background: src.is_subscription_required ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                      color: src.is_subscription_required ? "#f87171" : "#34d399",
                      border: `1px solid ${src.is_subscription_required ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
                    }}
                  >
                    {src.licensing_tier}
                  </span>
                </div>

                <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "16px", wordBreak: "break-all" }}>
                  Official Portal: <a href={src.base_url} target="_blank" rel="noreferrer" style={{ color: "#38bdf8", textDecoration: "none" }}>{src.base_url}</a>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "12px" }}>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                    Status: <span style={{ color: src.is_active ? "#34d399" : "#f87171", fontWeight: 700 }}>{src.is_active ? "ACTIVE ADAPTER" : "INACTIVE"}</span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                    Subscription: {src.is_subscription_required ? "API Key Required" : "Public Archive (No Auth)"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 2. DATA COVERAGE EXPLORER */}
        {activeTab === "coverage" && (
          <div style={{ background: "#131b2e", padding: "20px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(0,0,0,0.2)", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                <Search size={16} color="#64748b" />
                <input
                  type="text"
                  placeholder="Filter by symbol (e.g. RELIANCE, NIFTY)..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ background: "transparent", border: "none", color: "#ffffff", outline: "none", fontSize: "0.85rem", width: "240px" }}
                />
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                {["ALL", "NSE", "BSE"].map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setFilterExchange(ex)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "6px",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      background: filterExchange === ex ? "#6366f1" : "rgba(255, 255, 255, 0.03)",
                      color: "#ffffff",
                      cursor: "pointer",
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "#94a3b8" }}>
                    <th style={{ padding: "10px 12px" }}>Exchange</th>
                    <th style={{ padding: "10px 12px" }}>Segment</th>
                    <th style={{ padding: "10px 12px" }}>Symbol</th>
                    <th style={{ padding: "10px 12px" }}>Timeframe</th>
                    <th style={{ padding: "10px 12px" }}>Earliest Date</th>
                    <th style={{ padding: "10px 12px" }}>Latest Date</th>
                    <th style={{ padding: "10px 12px" }}>Total Candles</th>
                    <th style={{ padding: "10px 12px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCoverage.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>
                        No historical coverage records matching filter. Upload an official Bhavcopy in the Backfill console.
                      </td>
                    </tr>
                  ) : (
                    filteredCoverage.map((c, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 700 }}>{c.exchange}</td>
                        <td style={{ padding: "10px 12px", color: "#94a3b8" }}>{c.segment}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 800, color: "#38bdf8" }}>{c.symbol}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ padding: "2px 6px", borderRadius: "4px", background: "rgba(255, 255, 255, 0.08)", fontSize: "0.75rem" }}>
                            {c.timeframe.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", color: "#cbd5e1" }}>{c.earliest_date || "—"}</td>
                        <td style={{ padding: "10px 12px", color: "#cbd5e1" }}>{c.latest_date || "—"}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 700 }}>{c.total_candles.toLocaleString()}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              background: c.data_status === "VALID" ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                              color: c.data_status === "VALID" ? "#34d399" : "#fbbf24",
                            }}
                          >
                            {c.data_status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. BACKFILL & SYNC CONSOLE */}
        {activeTab === "backfill" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(450px, 1fr))", gap: "20px" }}>
            <div style={{ background: "#131b2e", padding: "24px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                <UploadCloud size={20} color="#6366f1" />
                Upload Official Exchange Archive
              </h3>
              <p style={{ fontSize: "0.85rem", color: "#94a3b8", marginBottom: "20px" }}>
                Supports official NSE Capital Market (UDiFF or legacy), NSE F&O contract-wise Bhavcopy, NSE Index reports, and BSE Bhavcopies in CSV or ZIP formats.
              </p>

              <form onSubmit={handleFileUpload}>
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Select Target Source Adapter
                  </label>
                  <select
                    value={uploadSource}
                    onChange={(e) => setUploadSource(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: "#0b0f19",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#ffffff",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="NSE_CM_BHAVCOPY">NSE Capital Market (Equity & SME Bhavcopy)</option>
                    <option value="NSE_FO_BHAVCOPY">NSE F&O (Contract-wise Futures & Options Bhavcopy)</option>
                    <option value="NSE_INDEX_REPORTS">NSE Indices Archive (ind_close_all)</option>
                    <option value="BSE_EQ_BHAVCOPY">BSE Equity Bhavcopy Archive</option>
                  </select>
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                    Choose Archive File (.csv or .zip)
                  </label>
                  <input
                    type="file"
                    accept=".csv,.zip"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      background: "#0b0f19",
                      border: "1px dashed rgba(255, 255, 255, 0.2)",
                      color: "#94a3b8",
                      fontSize: "0.85rem",
                    }}
                  />
                  <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>
                    Protected against Zip Slip attacks & path traversal. Max 100 MB decompressed.
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!selectedFile}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "8px",
                    background: selectedFile ? "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)" : "rgba(255, 255, 255, 0.05)",
                    color: selectedFile ? "#ffffff" : "#64748b",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    border: "none",
                    cursor: selectedFile ? "pointer" : "not-allowed",
                  }}
                >
                  Start Idempotent Ingestion
                </button>

                {uploadStatus && (
                  <div
                    style={{
                      marginTop: "16px",
                      padding: "12px",
                      borderRadius: "8px",
                      background: uploadStatus.includes("Success") ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                      color: uploadStatus.includes("Success") ? "#34d399" : "#f87171",
                      fontSize: "0.85rem",
                    }}
                  >
                    {uploadStatus}
                  </div>
                )}
              </form>
            </div>

            <div style={{ background: "#131b2e", padding: "24px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                <RefreshCw size={20} color="#10b981" />
                Automatic Daily Synchronization
              </h3>
              <p style={{ fontSize: "0.85rem", color: "#94a3b8", marginBottom: "20px" }}>
                Triggers incremental sync with official public exchange Bhavcopy releases published every evening at 18:30 IST.
              </p>

              <div style={{ padding: "16px", borderRadius: "8px", background: "rgba(0,0,0,0.2)", marginBottom: "20px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "4px" }}>Schedule: Daily at 18:45 IST</div>
                <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  Validates file hashes, verifies zero duplicate timestamps, and calculates corporate actions before committing.
                </div>
              </div>

              <button
                onClick={handleTriggerSync}
                disabled={syncing}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  border: "none",
                  cursor: syncing ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <Play size={16} />
                {syncing ? "Checking Exchange Feeds..." : "Trigger Manual Incremental Sync"}
              </button>
            </div>
          </div>
        )}

        {/* 4. INGESTION JOBS AUDIT LOGS */}
        {activeTab === "jobs" && (
          <div style={{ background: "#131b2e", padding: "20px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 800, marginBottom: "16px" }}>Historical Import & Sync Jobs</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "#94a3b8" }}>
                    <th style={{ padding: "10px" }}>Job ID</th>
                    <th style={{ padding: "10px" }}>Source Code</th>
                    <th style={{ padding: "10px" }}>Exchange</th>
                    <th style={{ padding: "10px" }}>Segment</th>
                    <th style={{ padding: "10px" }}>File Reference</th>
                    <th style={{ padding: "10px" }}>Imported</th>
                    <th style={{ padding: "10px" }}>Rejected</th>
                    <th style={{ padding: "10px" }}>Status</th>
                    <th style={{ padding: "10px" }}>Started At</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>
                        No historical jobs executed yet. Trigger a backfill or daily sync to populate.
                      </td>
                    </tr>
                  ) : (
                    jobs.map((j) => (
                      <tr key={j.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                        <td style={{ padding: "10px", fontWeight: 700 }}>#{j.id}</td>
                        <td style={{ padding: "10px", color: "#818cf8" }}>{j.source_code}</td>
                        <td style={{ padding: "10px", fontWeight: 700 }}>{j.exchange}</td>
                        <td style={{ padding: "10px", color: "#94a3b8" }}>{j.segment}</td>
                        <td style={{ padding: "10px", color: "#cbd5e1" }}>{j.source_file_ref || "Direct Stream"}</td>
                        <td style={{ padding: "10px", color: "#34d399", fontWeight: 700 }}>{j.records_imported.toLocaleString()}</td>
                        <td style={{ padding: "10px", color: j.records_rejected > 0 ? "#f87171" : "#64748b" }}>{j.records_rejected}</td>
                        <td style={{ padding: "10px" }}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              background: j.status === "COMPLETED" ? "rgba(16, 185, 129, 0.15)" : (j.status === "FAILED" ? "rgba(239, 68, 68, 0.15)" : "rgba(56, 189, 248, 0.15)"),
                              color: j.status === "COMPLETED" ? "#34d399" : (j.status === "FAILED" ? "#f87171" : "#38bdf8"),
                            }}
                          >
                            {j.status}
                          </span>
                        </td>
                        <td style={{ padding: "10px", color: "#94a3b8" }}>
                          {j.started_at ? new Date(j.started_at).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. QUALITY & INVARIANTS INSPECTOR */}
        {activeTab === "quality" && (
          <div style={{ background: "#131b2e", padding: "20px", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 800, marginBottom: "8px" }}>Data Quality & Invariants Audit</h3>
            <p style={{ fontSize: "0.85rem", color: "#94a3b8", marginBottom: "16px" }}>
              Enforces non-negotiable quantitative invariants: strictly zero negative prices, valid high/low bounds, authentic settlement prices, and session boundary isolation.
            </p>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "#94a3b8" }}>
                    <th style={{ padding: "10px" }}>Issue ID</th>
                    <th style={{ padding: "10px" }}>Exchange</th>
                    <th style={{ padding: "10px" }}>Symbol</th>
                    <th style={{ padding: "10px" }}>Anomaly Type</th>
                    <th style={{ padding: "10px" }}>Severity</th>
                    <th style={{ padding: "10px" }}>Description</th>
                    <th style={{ padding: "10px" }}>Status</th>
                    <th style={{ padding: "10px" }}>Detected At</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: "30px", textAlign: "center", color: "#34d399" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                          <CheckCircle2 size={24} color="#34d399" />
                          <span>All historical datasets conform to exchange invariants. No active anomalies detected.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    issues.map((iss) => (
                      <tr key={iss.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}>
                        <td style={{ padding: "10px", fontWeight: 700 }}>#{iss.id}</td>
                        <td style={{ padding: "10px" }}>{iss.exchange}</td>
                        <td style={{ padding: "10px", fontWeight: 800, color: "#38bdf8" }}>{iss.symbol}</td>
                        <td style={{ padding: "10px", color: "#fbbf24" }}>{iss.issue_type}</td>
                        <td style={{ padding: "10px" }}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              background: iss.severity === "CRITICAL" ? "rgba(239, 68, 68, 0.2)" : "rgba(245, 158, 11, 0.2)",
                              color: iss.severity === "CRITICAL" ? "#f87171" : "#fbbf24",
                            }}
                          >
                            {iss.severity}
                          </span>
                        </td>
                        <td style={{ padding: "10px", color: "#cbd5e1" }}>{iss.description}</td>
                        <td style={{ padding: "10px", color: "#94a3b8" }}>{iss.status}</td>
                        <td style={{ padding: "10px", color: "#64748b" }}>
                          {iss.detected_at ? new Date(iss.detected_at).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Hub Drawer */}
      <NavigationDrawer isOpen={navDrawerOpen} onClose={() => setNavDrawerOpen(false)} />
    </div>
  );
}
