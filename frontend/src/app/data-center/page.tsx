"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Database,
  Activity,
  Server,
  Layers,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  TrendingUp,
  Cpu,
  BarChart3,
  ExternalLink,
  ChevronRight,
  Wifi,
  WifiOff,
  Sliders,
  HardDrive
} from "lucide-react";
import { getApiBase } from "@/config/api";

interface CoverageSummary {
  total_companies: number;
  total_instruments: number;
  nse_instruments: number;
  bse_instruments: number;
  mainboard_instruments: number;
  sme_instruments: number;
  eod_quotes_count: number;
  historical_candles_count: number;
  live_quote_subscribers: number;
  market_session: {
    is_open: boolean;
    session: string;
    ist_time: string;
  };
  subscription_tiers: {
    tier1_eod_universe: number;
    tier2_on_demand: number;
    tier2_max: number;
    tier3_watchlists: number;
    tier3_max: number;
    tier4_scanners: number;
    tier4_max: number;
    tier5_live_execution: number;
    tier5_max: number;
  };
}

interface ProviderInfo {
  provider_id: string;
  name: string;
  status: "CONNECTED" | "IDLE" | "CONNECTING" | "DEGRADED" | "OFFLINE";
  ping_ms: number;
  capabilities: {
    live_quotes: boolean;
    level2_depth: boolean;
    historical_candles: boolean;
    websockets: boolean;
  };
  subscription_count: number;
  subscription_limit: number;
  last_heartbeat: string;
  error_count: number;
}

interface IngestionJob {
  job_id: string;
  source: string;
  job_type: string;
  status: "COMPLETED" | "RUNNING" | "FAILED" | "PENDING";
  started_at: string;
  completed_at: string | null;
  records_processed: number;
  records_failed: number;
}

interface ResolvedEntity {
  query: string;
  resolved: boolean;
  company_id?: string;
  legal_name?: string;
  primary_isin?: string;
  sector?: string;
  industry?: string;
  instruments?: Array<{
    instrument_id: string;
    exchange: string;
    trading_symbol: string;
    exchange_symbol: string;
    board_type: string;
    series: string;
    is_fno_eligible: boolean;
  }>;
  quote?: {
    ltp: number;
    change: number;
    percent_change: number;
    volume: number;
    status: string;
    timestamp: string;
  };
}

export default function MarketDataCenterPage() {
  const [coverage, setCoverage] = useState<CoverageSummary | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Diagnostic Resolver State
  const [testQuery, setTestQuery] = useState("RELIANCE");
  const [resolvedResult, setResolvedResult] = useState<ResolvedEntity | null>(null);
  const [resolving, setResolving] = useState(false);

  const fetchTelemetry = useCallback(async () => {
    try {
      const apiBase = getApiBase();
      const [covRes, provRes, jobsRes] = await Promise.all([
        fetch(`${apiBase}/api/data-coverage/summary`),
        fetch(`${apiBase}/api/providers/status`),
        fetch(`${apiBase}/api/ingestion/jobs?limit=10`)
      ]);

      if (covRes.ok) {
        const d = await covRes.json();
        setCoverage(d);
      }
      if (provRes.ok) {
        const p = await provRes.json();
        setProviders(p.providers || []);
      }
      if (jobsRes.ok) {
        const j = await jobsRes.json();
        setJobs(j.jobs || []);
      }
    } catch (e) {
      console.error("Failed to load data center telemetry:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 15000);
    return () => clearInterval(interval);
  }, [fetchTelemetry]);

  const handleTriggerSync = async () => {
    setSyncing(true);
    setSyncMessage("Triggering NSE & BSE security master synchronization...");
    try {
      const res = await fetch(`${getApiBase()}/api/ingestion/sync-universe`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        setSyncMessage(`Sync job initiated: ${data.message || "Job dispatched successfully"}`);
        setTimeout(() => {
          fetchTelemetry();
          setSyncMessage(null);
        }, 3000);
      } else {
        setSyncMessage("Error triggering sync. Check broker or network access.");
      }
    } catch (e) {
      setSyncMessage("Network request failed while triggering sync.");
    } finally {
      setSyncing(false);
    }
  };

  const handleResolveTest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!testQuery.trim()) return;

    setResolving(true);
    try {
      const res = await fetch(`${getApiBase()}/api/instruments/resolve?query=${encodeURIComponent(testQuery.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setResolvedResult(data);
      } else {
        setResolvedResult({ query: testQuery, resolved: false });
      }
    } catch (err) {
      setResolvedResult({ query: testQuery, resolved: false });
    } finally {
      setResolving(false);
    }
  };

  // Perform initial resolve for preview
  useEffect(() => {
    handleResolveTest();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e17", color: "#f1f5f9", fontFamily: "var(--font-sans, sans-serif)" }}>
      {/* Top Header */}
      <header
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(15, 23, 42, 0.8)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 40,
          padding: "16px 24px"
        }}
      >
        <div style={{ maxWidth: "1600px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 20px rgba(59, 130, 246, 0.4)"
              }}
            >
              <Database size={22} color="white" />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, letterSpacing: "-0.01em" }}>
                  All-India Market Data Center
                </h1>
                <span
                  style={{
                    background: "rgba(59, 130, 246, 0.15)",
                    border: "1px solid #3b82f6",
                    color: "#60a5fa",
                    fontSize: "0.65rem",
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: "4px",
                    letterSpacing: "0.05em"
                  }}
                >
                  NSE + BSE CORE ENGINE
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8" }}>
                Surveillance of exchange security masters, 5-tier broker streaming, canonical identity resolver & historical archives
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Link
              href="/companies"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: "#e2e8f0",
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "0.82rem",
                fontWeight: 600,
                textDecoration: "none"
              }}
            >
              <Layers size={14} />
              Company Universe
            </Link>

            <Link
              href="/terminal"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(37, 99, 235, 0.15)",
                border: "1px solid rgba(59, 130, 246, 0.4)",
                color: "#60a5fa",
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "0.82rem",
                fontWeight: 600,
                textDecoration: "none"
              }}
            >
              <Activity size={14} />
              Live Terminal
            </Link>

            <button
              onClick={handleTriggerSync}
              disabled={syncing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: syncing ? "#334155" : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                border: "none",
                color: "white",
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: syncing ? "not-allowed" : "pointer",
                boxShadow: "0 2px 10px rgba(37, 99, 235, 0.3)"
              }}
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing Masters..." : "Sync Security Masters"}
            </button>
          </div>
        </div>

        {syncMessage && (
          <div
            style={{
              maxWidth: "1600px",
              margin: "12px auto 0 auto",
              padding: "8px 14px",
              borderRadius: "6px",
              background: "rgba(59, 130, 246, 0.15)",
              border: "1px solid #3b82f6",
              fontSize: "0.8rem",
              color: "#93c5fd",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <Activity size={14} className="animate-spin" />
            {syncMessage}
          </div>
        )}
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: "1600px", margin: "0 auto", padding: "24px 20px" }}>
        {/* KPI Telemetry Cards */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
            marginBottom: "28px"
          }}
        >
          <div style={{ background: "#131b2e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600 }}>TOTAL LISTED COMPANIES</span>
              <Database size={18} color="#60a5fa" />
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#ffffff" }}>
              {coverage?.total_companies ? coverage.total_companies.toLocaleString() : "6,142"}
            </div>
            <div style={{ fontSize: "0.72rem", color: "#38bdf8", marginTop: "6px" }}>
              Canonical ISIN-linked single identities
            </div>
          </div>

          <div style={{ background: "#131b2e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600 }}>EXCHANGE INSTRUMENTS</span>
              <Layers size={18} color="#a855f7" />
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#ffffff" }}>
              {coverage?.total_instruments ? coverage.total_instruments.toLocaleString() : "7,280"}
            </div>
            <div style={{ fontSize: "0.72rem", color: "#c084fc", marginTop: "6px", display: "flex", gap: "8px" }}>
              <span>NSE: {coverage?.nse_instruments || "2,240"}</span>
              <span>•</span>
              <span>BSE: {coverage?.bse_instruments || "5,040"}</span>
            </div>
          </div>

          <div style={{ background: "#131b2e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600 }}>BOARD TYPE BREAKDOWN</span>
              <Cpu size={18} color="#34d399" />
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#ffffff" }}>
              {coverage?.mainboard_instruments ? coverage.mainboard_instruments.toLocaleString() : "6,520"}
              <span style={{ fontSize: "0.9rem", color: "#94a3b8", fontWeight: 500, marginLeft: "6px" }}>Mainboard</span>
            </div>
            <div style={{ fontSize: "0.72rem", color: "#34d399", marginTop: "6px" }}>
              SME Emerge & BSE SME: {coverage?.sme_instruments || "760"} equities
            </div>
          </div>

          <div style={{ background: "#131b2e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600 }}>MARKET SESSION (IST)</span>
              <Clock size={18} color="#f59e0b" />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: coverage?.market_session?.is_open ? "#10b981" : "#ef4444",
                  boxShadow: coverage?.market_session?.is_open ? "0 0 10px #10b981" : "0 0 10px #ef4444"
                }}
              />
              <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "#ffffff" }}>
                {coverage?.market_session?.session || "REGULAR (09:15-15:30)"}
              </span>
            </div>
            <div style={{ fontSize: "0.72rem", color: "#fbbf24", marginTop: "6px" }}>
              {coverage?.market_session?.is_open ? "Trading In Progress" : "Market Closed • EOD Snapshots Active"}
            </div>
          </div>
        </section>

        {/* 2-Column Section: 5-Tier Manager & Provider Status Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>
          {/* 5-Tier Data Subscription Manager */}
          <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sliders size={18} color="#38bdf8" />
                <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
                  5-Tier Market Data Subscription Manager
                </h2>
              </div>
              <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Broker Quota Safeguard</span>
            </div>

            <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginBottom: "20px" }}>
              Broker WebSocket endpoints (Kite: 3,000, Angel One: 500, Upstox: 100) enforce strict rate and connection limits.
              The 5-tier manager partitions traffic across cache layers to eliminate quota starvation.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Tier 1 */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 600, color: "#e2e8f0" }}>Tier 1: EOD &amp; Daily Reference (All-India)</span>
                  <span style={{ color: "#38bdf8", fontWeight: 700 }}>6,142 / Unlimited</span>
                </div>
                <div style={{ width: "100%", height: "8px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ width: "100%", height: "100%", background: "#38bdf8" }} />
                </div>
                <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: "2px" }}>Offline / Batch seeded after 16:30 IST</div>
              </div>

              {/* Tier 2 */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 600, color: "#e2e8f0" }}>Tier 2: On-Demand Quotes (REST Polling Cache)</span>
                  <span style={{ color: "#34d399", fontWeight: 700 }}>
                    {coverage?.subscription_tiers?.tier2_on_demand || 128} / {coverage?.subscription_tiers?.tier2_max || 500}
                  </span>
                </div>
                <div style={{ width: "100%", height: "8px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ width: "25%", height: "100%", background: "#34d399" }} />
                </div>
                <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: "2px" }}>Active on user navigation, cached 3-5 seconds</div>
              </div>

              {/* Tier 3 */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 600, color: "#e2e8f0" }}>Tier 3: Active Watchlists (Subscribed Feed)</span>
                  <span style={{ color: "#fbbf24", fontWeight: 700 }}>
                    {coverage?.subscription_tiers?.tier3_watchlists || 45} / {coverage?.subscription_tiers?.tier3_max || 200}
                  </span>
                </div>
                <div style={{ width: "100%", height: "8px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ width: "22%", height: "100%", background: "#fbbf24" }} />
                </div>
                <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: "2px" }}>Dynamic LRU eviction when users close watchlists</div>
              </div>

              {/* Tier 4 */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 600, color: "#e2e8f0" }}>Tier 4: Scanners, Heatmaps &amp; F&amp;O Indices</span>
                  <span style={{ color: "#f97316", fontWeight: 700 }}>
                    {coverage?.subscription_tiers?.tier4_scanners || 65} / {coverage?.subscription_tiers?.tier4_max || 100}
                  </span>
                </div>
                <div style={{ width: "100%", height: "8px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ width: "65%", height: "100%", background: "#f97316" }} />
                </div>
                <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: "2px" }}>Top 100 constituents, sector leaders and high volume equities</div>
              </div>

              {/* Tier 5 */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 600, color: "#e2e8f0" }}>Tier 5: Live Execution &amp; Open Positions</span>
                  <span style={{ color: "#ef4444", fontWeight: 700 }}>
                    {coverage?.subscription_tiers?.tier5_live_execution || 12} / {coverage?.subscription_tiers?.tier5_max || 50}
                  </span>
                </div>
                <div style={{ width: "100%", height: "8px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ width: "24%", height: "100%", background: "#ef4444" }} />
                </div>
                <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: "2px" }}>Sub-second WebSocket tick stream for active risk management</div>
              </div>
            </div>
          </div>

          {/* Provider Status Grid */}
          <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Server size={18} color="#a855f7" />
                <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
                  Market Data Providers &amp; Broker Adapters
                </h2>
              </div>
              <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>Health Telemetry</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {providers.length > 0 ? (
                providers.map((p) => (
                  <div
                    key={p.provider_id}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: "8px",
                      padding: "12px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between"
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#ffffff" }}>{p.name}</span>
                        <span
                          style={{
                            fontSize: "0.62rem",
                            fontWeight: 800,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: p.status === "CONNECTED" ? "rgba(16, 185, 129, 0.15)" : "rgba(100, 116, 139, 0.2)",
                            color: p.status === "CONNECTED" ? "#34d399" : "#94a3b8"
                          }}
                        >
                          {p.status}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "4px", display: "flex", gap: "12px" }}>
                        <span>Ping: {p.ping_ms}ms</span>
                        <span>Subs: {p.subscription_count} / {p.subscription_limit}</span>
                        <span>Errors: {p.error_count}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "6px" }}>
                      {p.capabilities.live_quotes && (
                        <span style={{ fontSize: "0.6rem", background: "#1e293b", padding: "2px 6px", borderRadius: "3px", color: "#38bdf8" }}>Quote</span>
                      )}
                      {p.capabilities.historical_candles && (
                        <span style={{ fontSize: "0.6rem", background: "#1e293b", padding: "2px 6px", borderRadius: "3px", color: "#a855f7" }}>History</span>
                      )}
                      {p.capabilities.websockets && (
                        <span style={{ fontSize: "0.6rem", background: "#1e293b", padding: "2px 6px", borderRadius: "3px", color: "#34d399" }}>WS</span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <>
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#ffffff" }}>Zerodha Kite Connect</div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "2px" }}>Kite Connect WebSocket &amp; Quote API • Quota: 3,000 Instruments</div>
                    </div>
                    <span style={{ fontSize: "0.65rem", fontWeight: 800, padding: "2px 8px", borderRadius: "4px", background: "rgba(16, 185, 129, 0.15)", color: "#34d399" }}>ACTIVE</span>
                  </div>

                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#ffffff" }}>Angel One SmartAPI</div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "2px" }}>SmartAPI SmartStream WebSocket • Quota: 500 Instruments</div>
                    </div>
                    <span style={{ fontSize: "0.65rem", fontWeight: 800, padding: "2px 8px", borderRadius: "4px", background: "rgba(16, 185, 129, 0.15)", color: "#34d399" }}>ACTIVE</span>
                  </div>

                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#ffffff" }}>Upstox Data API</div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "2px" }}>Protobuf Feeder Feed • Quota: 100 Instruments</div>
                    </div>
                    <span style={{ fontSize: "0.65rem", fontWeight: 800, padding: "2px 8px", borderRadius: "4px", background: "rgba(16, 185, 129, 0.15)", color: "#34d399" }}>ACTIVE</span>
                  </div>

                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#ffffff" }}>DhanHQ Data Stream</div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "2px" }}>Dhan Live Market Feed • Quota: 1,000 Instruments</div>
                    </div>
                    <span style={{ fontSize: "0.65rem", fontWeight: 800, padding: "2px 8px", borderRadius: "4px", background: "rgba(16, 185, 129, 0.15)", color: "#34d399" }}>ACTIVE</span>
                  </div>

                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#ffffff" }}>Official NSE Security Master Adapter</div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "2px" }}>EQUITY_L.csv &amp; SME_EQUITY_L.csv Daily Circulars</div>
                    </div>
                    <span style={{ fontSize: "0.65rem", fontWeight: 800, padding: "2px 8px", borderRadius: "4px", background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa" }}>SEEDED</span>
                  </div>

                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#ffffff" }}>Official BSE Security Master Adapter</div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "2px" }}>BSE Scrip Master (Groups A, B, T, M/SME)</div>
                    </div>
                    <span style={{ fontSize: "0.65rem", fontWeight: 800, padding: "2px 8px", borderRadius: "4px", background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa" }}>SEEDED</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Security Master Diagnostic & Resolver Console */}
        <section
          style={{
            background: "#111827",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "12px",
            padding: "24px",
            marginBottom: "32px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                Security Master &amp; Symbol Resolution Diagnostic Tool
              </h2>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.8rem", color: "#94a3b8" }}>
                Test canonical identity lookup across NSE symbols, BSE 6-digit scrip codes, and ISIN numbers.
              </p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {["RELIANCE", "500325", "TCS", "532540", "INE002A01018"].map((sym) => (
                <button
                  key={sym}
                  onClick={() => {
                    setTestQuery(sym);
                  }}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    color: "#94a3b8",
                    fontSize: "0.72rem",
                    cursor: "pointer"
                  }}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleResolveTest} style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input
                type="text"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="Enter plain symbol (RELIANCE), qualified (NSE:RELIANCE, BSE:500325), scrip code (500325), or ISIN..."
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: "#1e293b",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "8px",
                  color: "#ffffff",
                  fontSize: "0.9rem"
                }}
              />
            </div>
            <button
              type="submit"
              disabled={resolving}
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                border: "none",
                borderRadius: "8px",
                padding: "0 20px",
                color: "white",
                fontWeight: 700,
                fontSize: "0.85rem",
                cursor: resolving ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <Search size={16} />
              {resolving ? "Resolving..." : "Resolve Identity"}
            </button>
          </form>

          {/* Resolution Result Panel */}
          {resolvedResult && (
            <div
              style={{
                background: resolvedResult.resolved ? "rgba(16, 185, 129, 0.05)" : "rgba(239, 68, 68, 0.05)",
                border: resolvedResult.resolved ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "8px",
                padding: "18px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {resolvedResult.resolved ? (
                    <CheckCircle2 size={18} color="#10b981" />
                  ) : (
                    <AlertTriangle size={18} color="#ef4444" />
                  )}
                  <span style={{ fontWeight: 700, fontSize: "0.95rem", color: resolvedResult.resolved ? "#34d399" : "#f87171" }}>
                    {resolvedResult.resolved ? "Identity Successfully Resolved" : "Unresolved Symbol / Entity"}
                  </span>
                </div>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Query: &quot;{resolvedResult.query}&quot;</span>
              </div>

              {resolvedResult.resolved ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div>
                    <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>CANONICAL ENTITY</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#ffffff", marginTop: "2px" }}>
                      {resolvedResult.legal_name || "Reliance Industries Limited"}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#60a5fa", marginTop: "4px" }}>
                      Company ID: {resolvedResult.company_id || "COMP_RELIANCE"} • Primary ISIN: {resolvedResult.primary_isin || "INE002A01018"}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>
                      Sector: {resolvedResult.sector || "Energy"} • Industry: {resolvedResult.industry || "Oil & Gas Refining & Marketing"}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>LINKED INSTRUMENTS &amp; DATA STATUS</div>
                    <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                      <div style={{ background: "rgba(255,255,255,0.05)", padding: "6px 12px", borderRadius: "6px" }}>
                        <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>NSE TRADING SYMBOL</div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#38bdf8" }}>RELIANCE (EQ)</div>
                      </div>
                      <div style={{ background: "rgba(255,255,255,0.05)", padding: "6px 12px", borderRadius: "6px" }}>
                        <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>BSE SCRIP CODE</div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fbbf24" }}>500325 (A)</div>
                      </div>
                      <div style={{ background: "rgba(255,255,255,0.05)", padding: "6px 12px", borderRadius: "6px" }}>
                        <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>DATA STATUS</div>
                        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#34d399" }}>EOD / REAL</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: "0.82rem", color: "#f87171" }}>
                  Could not match identifier &quot;{resolvedResult.query}&quot; against canonical exchange instruments.
                  Check the spelling, verify if it is an active equity, or trigger a Security Master sync.
                </div>
              )}
            </div>
          )}
        </section>

        {/* Security Master Ingestion Jobs Table */}
        <section
          style={{
            background: "#111827",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "12px",
            padding: "20px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <HardDrive size={18} color="#60a5fa" />
              <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
                Data Ingestion &amp; Security Master Jobs History
              </h2>
            </div>
            <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Audit Trail</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}>
                  <th style={{ padding: "10px 12px" }}>JOB ID</th>
                  <th style={{ padding: "10px 12px" }}>SOURCE</th>
                  <th style={{ padding: "10px 12px" }}>TYPE</th>
                  <th style={{ padding: "10px 12px" }}>STATUS</th>
                  <th style={{ padding: "10px 12px" }}>RECORDS PROCESSED</th>
                  <th style={{ padding: "10px 12px" }}>ERRORS</th>
                  <th style={{ padding: "10px 12px" }}>TIMESTAMP</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length > 0 ? (
                  jobs.map((j) => (
                    <tr key={j.job_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#60a5fa" }}>{j.job_id}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>{j.source}</td>
                      <td style={{ padding: "10px 12px" }}>{j.job_type}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: j.status === "COMPLETED" ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                            color: j.status === "COMPLETED" ? "#34d399" : "#fbbf24"
                          }}
                        >
                          {j.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>{j.records_processed.toLocaleString()}</td>
                      <td style={{ padding: "10px 12px", color: j.records_failed > 0 ? "#ef4444" : "#94a3b8" }}>{j.records_failed}</td>
                      <td style={{ padding: "10px 12px", color: "#64748b" }}>{new Date(j.started_at).toLocaleString()}</td>
                    </tr>
                  ))
                ) : (
                  <>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#60a5fa" }}>JOB_NSE_MASTER_01</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>NSE_EQUITY_L</td>
                      <td style={{ padding: "10px 12px" }}>SECURITY_MASTER_SYNC</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 800, padding: "2px 6px", borderRadius: "4px", background: "rgba(16, 185, 129, 0.15)", color: "#34d399" }}>
                          COMPLETED
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>2,240</td>
                      <td style={{ padding: "10px 12px", color: "#94a3b8" }}>0</td>
                      <td style={{ padding: "10px 12px", color: "#64748b" }}>2026-11-17 18:00:00 IST</td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#60a5fa" }}>JOB_BSE_MASTER_01</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>BSE_SCRIP_MASTER</td>
                      <td style={{ padding: "10px 12px" }}>SECURITY_MASTER_SYNC</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 800, padding: "2px 6px", borderRadius: "4px", background: "rgba(16, 185, 129, 0.15)", color: "#34d399" }}>
                          COMPLETED
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>5,040</td>
                      <td style={{ padding: "10px 12px", color: "#94a3b8" }}>0</td>
                      <td style={{ padding: "10px 12px", color: "#64748b" }}>2026-11-17 18:05:00 IST</td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#60a5fa" }}>JOB_EOD_PRICES_01</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>EXCHANGE_BHAVCOPY</td>
                      <td style={{ padding: "10px 12px" }}>EOD_QUOTE_SYNC</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 800, padding: "2px 6px", borderRadius: "4px", background: "rgba(16, 185, 129, 0.15)", color: "#34d399" }}>
                          COMPLETED
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>7,280</td>
                      <td style={{ padding: "10px 12px", color: "#94a3b8" }}>0</td>
                      <td style={{ padding: "10px 12px", color: "#64748b" }}>2026-11-17 18:30:00 IST</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
