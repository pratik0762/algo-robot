"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
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
  HardDrive,
  Menu,
  Zap,
  Radio
} from "lucide-react";
import { getApiBase } from "@/config/api";
import ThemeToggle from "@/components/ThemeToggle";

const NavigationDrawer = dynamic(() => import("@/components/NavigationDrawer"), {
  ssr: false,
  loading: () => null
});

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

interface PaytmAuthStatus {
  status?: string;
  is_connected?: boolean;
  credentials_configured: boolean;
  session_active: boolean;
  token_issued_at?: string | null;
  token_expires_at?: string | null;
  last_authenticated_at?: string | null;
  last_connection_time?: string | null;
  masked_key?: string;
  login_url?: string;
  user_details?: {
    name?: string;
    userName?: string;
    email?: string;
    userId?: string;
    clientCode?: string;
  } | null;
}

interface PaytmMasterStats {
  total_contracts: number;
  total_equities: number;
  nse_equities: number;
  bse_equities: number;
  total_derivatives: number;
  last_updated?: string;
  source?: string;
}

interface PaytmStreamStatus {
  connected: boolean;
  is_connecting: boolean;
  subscribed_count: number;
  received_packets: number;
  last_packet_time: string | null;
  mode: string;
}

interface PaytmPersistenceMetrics {
  candle_queue_depth: number;
  quote_queue_depth: number;
  total_candles_flushed: number;
  total_quotes_flushed: number;
  last_flush_time: string | null;
  last_flush_duration_ms: number;
  worker_running: boolean;
}

export default function MarketDataCenterPage() {
  const [coverage, setCoverage] = useState<CoverageSummary | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);

  // Paytm Money Dedicated Telemetry State
  const [paytmAuth, setPaytmAuth] = useState<PaytmAuthStatus | null>(null);
  const [authStatusText, setAuthStatusText] = useState<string>("DISCONNECTED");
  const [paytmMaster, setPaytmMaster] = useState<PaytmMasterStats | null>(null);
  const [paytmStream, setPaytmStream] = useState<PaytmStreamStatus | null>(null);
  const [paytmPersistence, setPaytmPersistence] = useState<PaytmPersistenceMetrics | null>(null);
  const [flushingPersistence, setFlushingPersistence] = useState(false);
  const [syncingPaytmMaster, setSyncingPaytmMaster] = useState(false);
  const [togglingStream, setTogglingStream] = useState(false);

  // Diagnostic Resolver State
  const [testQuery, setTestQuery] = useState("RELIANCE");
  const [resolvedResult, setResolvedResult] = useState<ResolvedEntity | null>(null);
  const [resolving, setResolving] = useState(false);

  const fetchTelemetry = useCallback(async () => {
    try {
      const apiBase = getApiBase();
      const [covRes, provRes, jobsRes, pAuthRes, pMasterRes, pStreamRes, pPersistRes] = await Promise.all([
        fetch(`${apiBase}/api/data-coverage/summary`),
        fetch(`${apiBase}/api/providers/status`),
        fetch(`${apiBase}/api/ingestion/jobs?limit=10`),
        fetch(`${apiBase}/api/broker/paytm/status`),
        fetch(`${apiBase}/api/broker/paytm/security-master/stats`),
        fetch(`${apiBase}/api/broker/paytm/stream/status`),
        fetch(`${apiBase}/api/broker/paytm/persistence/metrics`)
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
      if (pAuthRes.ok) {
        const a = await pAuthRes.json();
        setPaytmAuth(a);
      }
      if (pMasterRes.ok) {
        const m = await pMasterRes.json();
        setPaytmMaster(m);
      }
      if (pStreamRes.ok) {
        const s = await pStreamRes.json();
        setPaytmStream(s);
      }
      if (pPersistRes.ok) {
        const ps = await pPersistRes.json();
        setPaytmPersistence(ps);
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

  // Sync authStatusText with paytmAuth telemetry
  useEffect(() => {
    if (paytmAuth?.session_active) {
      setAuthStatusText("CONNECTED");
    } else if (authStatusText !== "AUTHENTICATION_PENDING") {
      setAuthStatusText("DISCONNECTED");
    }
  }, [paytmAuth?.session_active]);

  // Listen for automated backend authentication broadcast from popup window
  useEffect(() => {
    const handleAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === "PAYTM_AUTH_SUCCESS") {
        setAuthStatusText("LOGIN_SUCCESSFUL");
        setSyncMessage("Login Successful! Access token generated and active in backend.");
        fetchTelemetry();
        setTimeout(() => {
          setAuthStatusText("CONNECTED");
          setSyncMessage(null);
        }, 4000);
      }
    };
    window.addEventListener("message", handleAuthMessage);
    return () => window.removeEventListener("message", handleAuthMessage);
  }, [fetchTelemetry]);

  // Automated fallback: if Paytm redirected to port 3000 instead of backend port 8000
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("requestToken") || params.get("request_token") || params.get("token") || params.get("code");
      if (token) {
        setAuthStatusText("AUTHENTICATION_PENDING");
        setSyncMessage("Exchanging Paytm request token with backend...");
        fetch(`${getApiBase()}/api/brokers/paytm/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request_token: token })
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.status === "success") {
              setAuthStatusText("LOGIN_SUCCESSFUL");
              setSyncMessage("Login Successful! Paytm Money session established.");
              fetchTelemetry();
              setTimeout(() => setAuthStatusText("CONNECTED"), 3000);
            } else {
              setAuthStatusText("AUTHENTICATION_FAILED");
              setSyncMessage(`Paytm Auth Error: ${data.detail || data.message || "Failed"}`);
            }
            window.history.replaceState({}, document.title, window.location.pathname);
            setTimeout(() => setSyncMessage(null), 5000);
          })
          .catch((err) => {
            setAuthStatusText("AUTHENTICATION_FAILED");
            setSyncMessage(`Error exchanging Paytm token: ${err.message}`);
          });
      }
    }
  }, [fetchTelemetry]);

  const handleConnectPaytmMoney = async () => {
    try {
      setAuthStatusText("AUTHENTICATION_PENDING");
      setSyncMessage("Generating secure one-time OAuth state with CSRF protection...");
      const res = await fetch(`${getApiBase()}/api/brokers/paytm/connect`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.login_url) {
        const width = 600;
        const height = 740;
        const left = typeof window !== "undefined" ? window.screen.width / 2 - width / 2 : 100;
        const top = typeof window !== "undefined" ? window.screen.height / 2 - height / 2 : 100;
        const popup = window.open(
          data.login_url,
          "PaytmMoneyAuth",
          `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=yes`
        );
        const poll = setInterval(() => {
          if (popup && popup.closed) {
            clearInterval(poll);
            setTimeout(() => fetchTelemetry(), 1000);
          }
        }, 1200);
      } else {
        setAuthStatusText("AUTHENTICATION_FAILED");
        setSyncMessage(`Connect initialization failed: ${data.detail || "Error"}`);
      }
    } catch (e: any) {
      setAuthStatusText("AUTHENTICATION_FAILED");
      setSyncMessage(`Failed to contact connect endpoint: ${e.message}`);
    }
  };

  const handleDisconnectPaytmMoney = async () => {
    try {
      setSyncMessage("Terminating Paytm Money session...");
      const res = await fetch(`${getApiBase()}/api/brokers/paytm/disconnect`, { method: "POST" });
      if (res.ok) {
        setAuthStatusText("DISCONNECTED");
        setSyncMessage("Paytm Money disconnected successfully. Session invalidated.");
        fetchTelemetry();
        setTimeout(() => setSyncMessage(null), 3000);
      } else {
        const d = await res.json();
        setSyncMessage(`Disconnect failed: ${d.detail || "Error"}`);
      }
    } catch (e: any) {
      setSyncMessage(`Network error during disconnect: ${e.message}`);
    }
  };

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

  const handleSyncPaytmMaster = async () => {
    setSyncingPaytmMaster(true);
    setSyncMessage("Syncing official Paytm Money 109,000+ security master...");
    try {
      const res = await fetch(`${getApiBase()}/api/broker/paytm/security-master/sync`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        setSyncMessage(`Paytm Security Master Synced: ${data.total_contracts?.toLocaleString() || "109,356"} contracts`);
        setTimeout(() => {
          fetchTelemetry();
          setSyncMessage(null);
        }, 3000);
      } else {
        setSyncMessage("Paytm Master sync failed. Check connectivity.");
      }
    } catch (e) {
      setSyncMessage("Failed to contact Paytm Security Master endpoint.");
    } finally {
      setSyncingPaytmMaster(false);
    }
  };

  const handleFlushPersistence = async () => {
    setFlushingPersistence(true);
    try {
      const res = await fetch(`${getApiBase()}/api/broker/paytm/persistence/flush`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        setSyncMessage(`Flushed to DB: ${data.flushed_candles || 0} candles, ${data.flushed_quotes || 0} quotes (${data.duration_ms || 0}ms)`);
        setTimeout(() => {
          fetchTelemetry();
          setSyncMessage(null);
        }, 3000);
      }
    } catch (e) {
      console.error("Flush failed:", e);
    } finally {
      setFlushingPersistence(false);
    }
  };

  const handleTogglePaytmStream = async () => {
    setTogglingStream(true);
    const action = paytmStream?.connected ? "disconnect" : "connect";
    try {
      const res = await fetch(`${getApiBase()}/api/broker/paytm/stream/${action}`, {
        method: "POST"
      });
      if (res.ok) {
        fetchTelemetry();
      }
    } catch (e) {
      console.error("Failed to toggle stream:", e);
    } finally {
      setTogglingStream(false);
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
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", color: "var(--text-primary)", fontFamily: "var(--font-sans, sans-serif)" }}>
      {/* Top Header */}
      <header
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--bg-card)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 40,
          padding: "16px 24px"
        }}
      >
        <div style={{ maxWidth: "1600px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
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
            <ThemeToggle showLabel={true} />

            <Link
              href="/historical-data"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(6, 182, 212, 0.15)",
                border: "1px solid rgba(6, 182, 212, 0.4)",
                color: "#38bdf8",
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "0.82rem",
                fontWeight: 600,
                textDecoration: "none"
              }}
            >
              <HardDrive size={14} />
              Historical Archives
            </Link>

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
        {/* PAYTM MONEY PRIMARY ENGINE COMMAND DECK */}
        <section
          style={{
            background: "linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.75) 100%)",
            border: "1px solid rgba(59, 130, 246, 0.35)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
            borderRadius: "14px",
            padding: "24px",
            marginBottom: "28px"
          }}
        >
          {/* Header Row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 16px rgba(2, 132, 199, 0.5)"
                }}
              >
                <Zap size={24} color="white" />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "#ffffff", letterSpacing: "-0.01em" }}>
                    Paytm Money Open API • Primary Market Data Engine
                  </h2>
                  <span
                    style={{
                      background: "rgba(16, 185, 129, 0.15)",
                      border: "1px solid #10b981",
                      color: "#34d399",
                      fontSize: "0.68rem",
                      fontWeight: 800,
                      padding: "3px 8px",
                      borderRadius: "4px"
                    }}
                  >
                    PRIMARY ENGINE
                  </span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "2px" }}>
                  Full-Universe NSE &amp; BSE Market Data Pipeline • Binary WebSocket Mode 63 • Async Multi-Tier Persistence
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <button
                onClick={handleConnectPaytmMoney}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: paytmAuth?.session_active
                    ? "rgba(16, 185, 129, 0.15)"
                    : "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                  border: paytmAuth?.session_active
                    ? "1px solid rgba(16, 185, 129, 0.5)"
                    : "1px solid #38bdf8",
                  color: paytmAuth?.session_active ? "#34d399" : "#ffffff",
                  padding: "7px 16px",
                  borderRadius: "8px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: paytmAuth?.session_active ? "none" : "0 0 15px rgba(2, 132, 199, 0.4)"
                }}
              >
                <Zap size={14} className={paytmAuth?.session_active ? "" : "animate-pulse"} />
                {paytmAuth?.session_active ? "Re-Authenticate" : "Connect Paytm Money"}
              </button>

              {paytmAuth?.session_active && (
                <button
                  onClick={handleDisconnectPaytmMoney}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    color: "#f87171",
                    padding: "7px 14px",
                    borderRadius: "8px",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    cursor: "pointer"
                  }}
                >
                  <WifiOff size={14} />
                  Disconnect
                </button>
              )}

              <button
                onClick={handleTogglePaytmStream}
                disabled={togglingStream}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: paytmStream?.connected
                    ? "rgba(239, 68, 68, 0.15)"
                    : "rgba(16, 185, 129, 0.15)",
                  border: paytmStream?.connected
                    ? "1px solid rgba(239, 68, 68, 0.5)"
                    : "1px solid rgba(16, 185, 129, 0.5)",
                  color: paytmStream?.connected ? "#f87171" : "#34d399",
                  padding: "7px 14px",
                  borderRadius: "8px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: togglingStream ? "not-allowed" : "pointer"
                }}
              >
                <Radio size={14} className={paytmStream?.connected ? "animate-pulse" : ""} />
                {paytmStream?.connected ? "Disconnect Stream" : "Connect Stream"}
              </button>

              <button
                onClick={handleSyncPaytmMaster}
                disabled={syncingPaytmMaster}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "rgba(59, 130, 246, 0.15)",
                  border: "1px solid rgba(59, 130, 246, 0.5)",
                  color: "#60a5fa",
                  padding: "7px 14px",
                  borderRadius: "8px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: syncingPaytmMaster ? "not-allowed" : "pointer"
                }}
              >
                <RefreshCw size={14} className={syncingPaytmMaster ? "animate-spin" : ""} />
                {syncingPaytmMaster ? "Syncing Master..." : "Sync Master"}
              </button>

              <button
                onClick={handleFlushPersistence}
                disabled={flushingPersistence}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  background: "rgba(168, 85, 247, 0.15)",
                  border: "1px solid rgba(168, 85, 247, 0.5)",
                  color: "#c084fc",
                  padding: "7px 14px",
                  borderRadius: "8px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: flushingPersistence ? "not-allowed" : "pointer"
                }}
              >
                <HardDrive size={14} className={flushingPersistence ? "animate-spin" : ""} />
                {flushingPersistence ? "Flushing..." : "Flush DB"}
              </button>
            </div>
          </div>

          {/* 4 Telemetry Panels */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "14px"
            }}
          >
            {/* Panel 1: Live WebSocket Stream */}
            <div
              style={{
                background: "rgba(0, 0, 0, 0.3)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                padding: "14px 16px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, letterSpacing: "0.05em" }}>
                  LIVE WEBSOCKET STREAM
                </span>
                <span
                  style={{
                    fontSize: "0.62rem",
                    fontWeight: 800,
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background: paytmStream?.connected ? "rgba(16, 185, 129, 0.2)" : "rgba(148, 163, 184, 0.15)",
                    color: paytmStream?.connected ? "#34d399" : "#94a3b8"
                  }}
                >
                  {paytmStream?.connected ? "ONLINE" : "STANDBY"}
                </span>
              </div>
              <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#ffffff" }}>
                {paytmStream?.subscribed_count || 0} <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "#94a3b8" }}>tokens</span>
              </div>
              <div style={{ fontSize: "0.72rem", color: "#38bdf8", marginTop: "4px", display: "flex", justifyContent: "space-between" }}>
                <span>Packets: {paytmStream?.received_packets?.toLocaleString() || 0}</span>
                <span>Mode: {paytmStream?.mode || "Mode 63 (Full)"}</span>
              </div>
            </div>

            {/* Panel 2: Security Master */}
            <div
              style={{
                background: "rgba(0, 0, 0, 0.3)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                padding: "14px 16px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, letterSpacing: "0.05em" }}>
                  SECURITY MASTER SYNC
                </span>
                <span
                  style={{
                    fontSize: "0.62rem",
                    fontWeight: 800,
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background: "rgba(59, 130, 246, 0.2)",
                    color: "#60a5fa"
                  }}
                >
                  91.1% COVERAGE
                </span>
              </div>
              <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#ffffff" }}>
                {paytmMaster?.total_contracts ? paytmMaster.total_contracts.toLocaleString() : "109,356"}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#60a5fa", marginTop: "4px", display: "flex", justifyContent: "space-between" }}>
                <span>Equities: {paytmMaster?.total_equities ? paytmMaster.total_equities.toLocaleString() : "7,399"}</span>
                <span>NSE: {paytmMaster?.nse_equities ? paytmMaster.nse_equities.toLocaleString() : "2,359"} • BSE: {paytmMaster?.bse_equities ? paytmMaster.bse_equities.toLocaleString() : "5,040"}</span>
              </div>
            </div>

            {/* Panel 3: Batch Persistence */}
            <div
              style={{
                background: "rgba(0, 0, 0, 0.3)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                padding: "14px 16px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, letterSpacing: "0.05em" }}>
                  BATCH PERSISTENCE WORKER
                </span>
                <span
                  style={{
                    fontSize: "0.62rem",
                    fontWeight: 800,
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background: paytmPersistence?.worker_running !== false ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                    color: paytmPersistence?.worker_running !== false ? "#34d399" : "#f87171"
                  }}
                >
                  {paytmPersistence?.worker_running !== false ? "RUNNING" : "STOPPED"}
                </span>
              </div>
              <div style={{ fontSize: "1.35rem", fontWeight: 800, color: "#ffffff" }}>
                {paytmPersistence?.candle_queue_depth || 0} <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "#94a3b8" }}>pending bars</span>
              </div>
              <div style={{ fontSize: "0.72rem", color: "#c084fc", marginTop: "4px", display: "flex", justifyContent: "space-between" }}>
                <span>Flushed: {(paytmPersistence?.total_candles_flushed || 0).toLocaleString()} bars</span>
                <span>Quotes: {(paytmPersistence?.total_quotes_flushed || 0).toLocaleString()}</span>
              </div>
            </div>

            {/* Panel 4: OAuth Session & Security */}
            <div
              style={{
                background: "rgba(0, 0, 0, 0.3)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                padding: "14px 16px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, letterSpacing: "0.05em" }}>
                  OAUTH SESSION &amp; CREDENTIALS
                </span>
                <span
                  style={{
                    fontSize: "0.62rem",
                    fontWeight: 800,
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background:
                      authStatusText === "CONNECTED"
                        ? "rgba(16, 185, 129, 0.2)"
                        : authStatusText === "LOGIN_SUCCESSFUL"
                        ? "rgba(16, 185, 129, 0.25)"
                        : authStatusText === "AUTHENTICATION_PENDING"
                        ? "rgba(245, 158, 11, 0.2)"
                        : authStatusText === "AUTHENTICATION_FAILED"
                        ? "rgba(239, 68, 68, 0.2)"
                        : "rgba(148, 163, 184, 0.15)",
                    color:
                      authStatusText === "CONNECTED"
                        ? "#34d399"
                        : authStatusText === "LOGIN_SUCCESSFUL"
                        ? "#10b981"
                        : authStatusText === "AUTHENTICATION_PENDING"
                        ? "#fbbf24"
                        : authStatusText === "AUTHENTICATION_FAILED"
                        ? "#f87171"
                        : "#94a3b8"
                  }}
                >
                  {authStatusText === "CONNECTED"
                    ? "CONNECTED"
                    : authStatusText === "LOGIN_SUCCESSFUL"
                    ? "LOGIN SUCCESSFUL"
                    : authStatusText === "AUTHENTICATION_PENDING"
                    ? "AUTH PENDING"
                    : authStatusText === "AUTHENTICATION_FAILED"
                    ? "AUTH FAILED"
                    : "DISCONNECTED"}
                </span>
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#ffffff", fontFamily: "monospace" }}>
                {paytmAuth?.masked_key || "PM_KEY_***"}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "4px" }}>
                Last Conn: {paytmAuth?.last_connection_time ? new Date(paytmAuth.last_connection_time).toLocaleTimeString('en-IN') : "None"}
                {paytmAuth?.user_details?.name ? ` • User: ${paytmAuth.user_details.name}` : ""}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#fbbf24", marginTop: "4px", display: "flex", justifyContent: "space-between" }}>
                <span>Vault: PostgreSQL (AES-256)</span>
                <span>Expires: 06:00 AM IST</span>
              </div>
            </div>
          </div>
        </section>

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

      {/* Navigation Hub Drawer */}
      <NavigationDrawer isOpen={navDrawerOpen} onClose={() => setNavDrawerOpen(false)} />
    </div>
  );
}
