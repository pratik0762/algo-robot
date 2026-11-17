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
  BarChart3,
  Sliders,
  Boxes
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
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "4px",
              fontSize: "0.68rem",
              fontWeight: 800,
              background: "rgba(16, 185, 129, 0.15)",
              color: "#34d399",
              border: "1px solid rgba(16, 185, 129, 0.3)"
            }}
          >
            ● LIVE
          </span>
        );
      case "EOD":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "4px",
              fontSize: "0.68rem",
              fontWeight: 700,
              background: "rgba(59, 130, 246, 0.15)",
              color: "#60a5fa",
              border: "1px solid rgba(59, 130, 246, 0.3)"
            }}
          >
            EOD CLOSE
          </span>
        );
      case "DELAYED":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "4px",
              fontSize: "0.68rem",
              fontWeight: 700,
              background: "rgba(245, 158, 11, 0.15)",
              color: "#fbbf24",
              border: "1px solid rgba(245, 158, 11, 0.3)"
            }}
          >
            DELAYED
          </span>
        );
      default:
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "4px",
              fontSize: "0.68rem",
              fontWeight: 700,
              background: "rgba(100, 116, 139, 0.15)",
              color: "#94a3b8",
              border: "1px solid rgba(100, 116, 139, 0.3)"
            }}
          >
            REAL_CLOSED
          </span>
        );
    }
  };

  const getBoardBadge = (board: string) => {
    if (board === "SME") {
      return (
        <span
          style={{
            padding: "2px 6px",
            borderRadius: "4px",
            fontSize: "0.65rem",
            fontWeight: 800,
            background: "rgba(168, 85, 247, 0.2)",
            color: "#c084fc",
            border: "1px solid rgba(168, 85, 247, 0.4)",
            letterSpacing: "0.04em"
          }}
        >
          SME
        </span>
      );
    }
    return (
      <span
        style={{
          padding: "2px 6px",
          borderRadius: "4px",
          fontSize: "0.65rem",
          fontWeight: 700,
          background: "rgba(255, 255, 255, 0.08)",
          color: "#cbd5e1",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          letterSpacing: "0.04em"
        }}
      >
        MAIN
      </span>
    );
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080b12",
        color: "#f8fafc",
        fontFamily: "var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
        display: "flex",
        flexDirection: "column"
      }}
    >
      {/* Top Header Banner */}
      <header
        style={{
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          background: "rgba(15, 21, 35, 0.85)",
          backdropFilter: "blur(16px)",
          position: "sticky",
          top: 0,
          zIndex: 40,
          padding: "16px 28px"
        }}
      >
        <div
          style={{
            maxWidth: "1600px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 20px rgba(16, 185, 129, 0.35)",
                flexShrink: 0
              }}
            >
              <Boxes size={22} color="white" />
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 800,
                    color: "#34d399",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px"
                  }}
                >
                  <Database size={13} />
                  National Securities Master &amp; Listed Equity Universe
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, letterSpacing: "-0.01em" }}>
                  All Listed Companies
                </h1>
                <span
                  style={{
                    background: "rgba(16, 185, 129, 0.15)",
                    border: "1px solid rgba(16, 185, 129, 0.4)",
                    color: "#34d399",
                    fontSize: "0.72rem",
                    fontWeight: 800,
                    padding: "3px 10px",
                    borderRadius: "20px",
                    letterSpacing: "0.04em"
                  }}
                >
                  NSE + BSE | Mainboard + SME
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Link
              href="/data-center"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#e2e8f0",
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "0.82rem",
                fontWeight: 600,
                textDecoration: "none",
                transition: "all 0.15s ease"
              }}
            >
              <BarChart3 size={15} color="#38bdf8" />
              <span>Data Center Telemetry</span>
            </Link>

            <button
              onClick={() => fetchUniverse()}
              disabled={loading}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                border: "none",
                color: "white",
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 2px 10px rgba(16, 185, 129, 0.35)",
                transition: "all 0.15s ease"
              }}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span>{loading ? "Refreshing..." : "Refresh Universe"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Page Body */}
      <main
        style={{
          maxWidth: "1600px",
          width: "100%",
          margin: "0 auto",
          padding: "24px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          flex: 1
        }}
      >
        {/* Metric Summary Cards */}
        {metrics && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "14px"
            }}
          >
            <div
              style={{
                background: "rgba(18, 24, 38, 0.75)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "12px",
                padding: "16px 18px",
                backdropFilter: "blur(12px)"
              }}
            >
              <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>
                Total Listed Companies
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#ffffff", marginTop: "4px" }}>
                {metrics.total_listed_companies.toLocaleString()}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#34d399", marginTop: "3px" }}>
                Canonical ISIN Entities
              </div>
            </div>

            <div
              style={{
                background: "rgba(18, 24, 38, 0.75)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "12px",
                padding: "16px 18px",
                backdropFilter: "blur(12px)"
              }}
            >
              <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>
                NSE Instruments
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#38bdf8", marginTop: "4px" }}>
                {metrics.nse_instruments.toLocaleString()}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "3px" }}>
                Active Equities Traded
              </div>
            </div>

            <div
              style={{
                background: "rgba(18, 24, 38, 0.75)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "12px",
                padding: "16px 18px",
                backdropFilter: "blur(12px)"
              }}
            >
              <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>
                BSE Instruments
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#c084fc", marginTop: "4px" }}>
                {metrics.bse_instruments.toLocaleString()}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "3px" }}>
                Active Scrips Traded
              </div>
            </div>

            <div
              style={{
                background: "rgba(18, 24, 38, 0.75)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "12px",
                padding: "16px 18px",
                backdropFilter: "blur(12px)"
              }}
            >
              <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>
                Mainboard Equities
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#fbbf24", marginTop: "4px" }}>
                {metrics.mainboard_instruments.toLocaleString()}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "3px" }}>
                NSE EQ / BSE Series A, B
              </div>
            </div>

            <div
              style={{
                background: "rgba(18, 24, 38, 0.75)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "12px",
                padding: "16px 18px",
                backdropFilter: "blur(12px)"
              }}
            >
              <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>
                SME Equities
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f472b6", marginTop: "4px" }}>
                {metrics.sme_instruments.toLocaleString()}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "3px" }}>
                NSE EMERGE / BSE SME
              </div>
            </div>

            <div
              style={{
                background: "rgba(18, 24, 38, 0.75)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "12px",
                padding: "16px 18px",
                backdropFilter: "blur(12px)"
              }}
            >
              <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>
                Active Securities
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#34d399", marginTop: "4px" }}>
                {metrics.active_companies.toLocaleString()}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "3px" }}>
                {metrics.suspended_companies} Suspended
              </div>
            </div>
          </div>
        )}

        {/* Filter & Search Toolbar */}
        <div
          style={{
            background: "rgba(18, 24, 38, 0.8)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "12px",
            padding: "16px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "14px"
          }}
        >
          {/* Search Box */}
          <div style={{ position: "relative", flex: 1, minWidth: "280px" }}>
            <Search
              size={16}
              color="#94a3b8"
              style={{
                position: "absolute",
                left: "14px",
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none"
              }}
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Search by legal name, NSE symbol (RELIANCE), BSE scrip code (500325), or ISIN..."
              style={{
                width: "100%",
                padding: "10px 16px 10px 40px",
                background: "#0b0f19",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "8px",
                color: "#ffffff",
                fontSize: "0.85rem",
                outline: "none"
              }}
            />
          </div>

          {/* Dropdown Filters */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {/* Exchange Filter */}
            <select
              value={selectedExchange}
              onChange={(e) => {
                setSelectedExchange(e.target.value);
                setPage(1);
              }}
              style={{
                background: "#0b0f19",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#f1f5f9",
                fontSize: "0.82rem",
                borderRadius: "8px",
                padding: "9px 12px",
                outline: "none",
                cursor: "pointer"
              }}
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
              style={{
                background: "#0b0f19",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#f1f5f9",
                fontSize: "0.82rem",
                borderRadius: "8px",
                padding: "9px 12px",
                outline: "none",
                cursor: "pointer"
              }}
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
              style={{
                background: "#0b0f19",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#f1f5f9",
                fontSize: "0.82rem",
                borderRadius: "8px",
                padding: "9px 12px",
                outline: "none",
                cursor: "pointer"
              }}
            >
              <option value="ALL">All Market Caps</option>
              <option value="LARGE_CAP">Large Cap (&gt;₹20k Cr)</option>
              <option value="MID_CAP">Mid Cap (₹5k-20k Cr)</option>
              <option value="SMALL_CAP">Small Cap (₹1k-5k Cr)</option>
              <option value="MICRO_CAP">Micro Cap (&lt;₹1k Cr)</option>
            </select>

            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setPage(1);
                }}
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  color: "#cbd5e1",
                  fontSize: "0.8rem",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  cursor: "pointer"
                }}
              >
                Clear Search
              </button>
            )}
          </div>
        </div>

        {/* Company Universe Data Table */}
        <div
          style={{
            background: "rgba(18, 24, 38, 0.75)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "12px",
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
            display: "flex",
            flexDirection: "column"
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", textAlign: "left" }}>
              <thead>
                <tr
                  style={{
                    background: "#0c111d",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    color: "#94a3b8",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em"
                  }}
                >
                  <th
                    style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}
                    onClick={() => handleSort("legal_name")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>Company / Canonical Entity</span>
                      <ArrowUpDown size={13} color="#64748b" />
                    </div>
                  </th>
                  <th style={{ padding: "14px 12px" }}>Exchange Identifiers</th>
                  <th style={{ padding: "14px 12px" }}>Board &amp; Sector</th>
                  <th
                    style={{ padding: "14px 12px", textAlign: "right", cursor: "pointer", userSelect: "none" }}
                    onClick={() => handleSort("market_cap_cr")}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                      <span>Market Cap</span>
                      <ArrowUpDown size={13} color="#64748b" />
                    </div>
                  </th>
                  <th style={{ padding: "14px 12px", textAlign: "right" }}>LTP (₹)</th>
                  <th style={{ padding: "14px 12px", textAlign: "right" }}>Change %</th>
                  <th style={{ padding: "14px 12px", textAlign: "center" }}>Data Feed</th>
                  <th style={{ padding: "14px 16px", textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "60px 20px", textAlign: "center", color: "#94a3b8" }}>
                      <RefreshCw size={26} className="animate-spin" color="#10b981" style={{ margin: "0 auto 10px auto" }} />
                      <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#f1f5f9" }}>
                        Loading securities from All-India universe...
                      </div>
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "60px 20px", textAlign: "center", color: "#94a3b8" }}>
                      <AlertTriangle size={26} color="#fbbf24" style={{ margin: "0 auto 10px auto" }} />
                      <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#f1f5f9" }}>
                        No securities matching your search criteria.
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "4px" }}>
                        Try adjusting your search terms or clearing exchange filters.
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr
                      key={item.company_id}
                      style={{
                        borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                        transition: "background 0.15s ease"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      {/* Legal Name & ISIN */}
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#ffffff" }}>
                          <Link
                            href={`/company/${item.nse_symbol || item.company_id}`}
                            style={{ color: "#ffffff", textDecoration: "none" }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = "#34d399")}
                            onMouseLeave={(e) => (e.currentTarget.style.color = "#ffffff")}
                          >
                            {item.legal_name}
                          </Link>
                        </div>
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: "#94a3b8",
                            fontFamily: "var(--font-mono, monospace)",
                            marginTop: "3px",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px"
                          }}
                        >
                          <span>ISIN: {item.primary_isin}</span>
                          {item.is_fno_eligible && (
                            <span
                              style={{
                                padding: "1px 5px",
                                borderRadius: "3px",
                                background: "rgba(59, 130, 246, 0.15)",
                                color: "#60a5fa",
                                border: "1px solid rgba(59, 130, 246, 0.3)",
                                fontSize: "0.62rem",
                                fontWeight: 800
                              }}
                            >
                              F&amp;O
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Identifiers */}
                      <td style={{ padding: "14px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", fontFamily: "var(--font-mono, monospace)" }}>
                          {item.nse_symbol ? (
                            <span
                              style={{
                                padding: "2px 7px",
                                borderRadius: "4px",
                                background: "rgba(59, 130, 246, 0.12)",
                                color: "#93c5fd",
                                border: "1px solid rgba(59, 130, 246, 0.25)",
                                fontSize: "0.75rem",
                                fontWeight: 700
                              }}
                            >
                              NSE: {item.nse_symbol}
                            </span>
                          ) : (
                            <span style={{ color: "#475569", fontSize: "0.75rem" }}>—</span>
                          )}

                          {item.bse_code ? (
                            <span
                              style={{
                                padding: "2px 7px",
                                borderRadius: "4px",
                                background: "rgba(168, 85, 247, 0.12)",
                                color: "#d8b4fe",
                                border: "1px solid rgba(168, 85, 247, 0.25)",
                                fontSize: "0.75rem",
                                fontWeight: 700
                              }}
                            >
                              BSE: {item.bse_code}
                            </span>
                          ) : (
                            <span style={{ color: "#475569", fontSize: "0.75rem" }}>—</span>
                          )}
                        </div>
                      </td>

                      {/* Board & Sector */}
                      <td style={{ padding: "14px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                          {getBoardBadge(item.board_type)}
                          <span style={{ fontSize: "0.78rem", color: "#e2e8f0", fontWeight: 600 }}>
                            {item.sector}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#64748b" }}>
                          {item.industry}
                        </div>
                      </td>

                      {/* Market Cap */}
                      <td style={{ padding: "14px 12px", textAlign: "right" }}>
                        <div style={{ fontWeight: 700, color: "#ffffff", fontFamily: "var(--font-mono, monospace)" }}>
                          {item.market_cap_cr > 0
                            ? `₹${item.market_cap_cr.toLocaleString("en-IN", { maximumFractionDigits: 1 })} Cr`
                            : "—"}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "2px" }}>
                          {item.market_cap_category.replace("_", " ")}
                        </div>
                      </td>

                      {/* LTP */}
                      <td style={{ padding: "14px 12px", textAlign: "right", fontFamily: "var(--font-mono, monospace)", fontWeight: 800, fontSize: "0.9rem", color: "#ffffff" }}>
                        {item.ltp > 0
                          ? `₹${item.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "—"}
                      </td>

                      {/* Change % */}
                      <td style={{ padding: "14px 12px", textAlign: "right", fontFamily: "var(--font-mono, monospace)", fontWeight: 700 }}>
                        {item.percent_change >= 0 ? (
                          <span style={{ color: "#34d399", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <TrendingUp size={13} />
                            +{item.percent_change.toFixed(2)}%
                          </span>
                        ) : (
                          <span style={{ color: "#f87171", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <TrendingDown size={13} />
                            {item.percent_change.toFixed(2)}%
                          </span>
                        )}
                      </td>

                      {/* Data Feed Status */}
                      <td style={{ padding: "14px 12px", textAlign: "center" }}>
                        {getStatusBadge(item.data_status)}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                          <Link
                            href={`/chart?symbol=${item.nse_symbol || item.company_id}`}
                            title="Open TradingView Chart"
                            style={{
                              padding: "6px 8px",
                              borderRadius: "6px",
                              background: "rgba(255, 255, 255, 0.05)",
                              color: "#38bdf8",
                              display: "inline-flex",
                              alignItems: "center"
                            }}
                          >
                            <BarChart3 size={15} />
                          </Link>

                          <Link
                            href={`/company/${item.nse_symbol || item.company_id}`}
                            title="Open Company Dossier"
                            style={{
                              padding: "6px 8px",
                              borderRadius: "6px",
                              background: "rgba(255, 255, 255, 0.05)",
                              color: "#cbd5e1",
                              display: "inline-flex",
                              alignItems: "center"
                            }}
                          >
                            <ExternalLink size={15} />
                          </Link>

                          {item.nse_symbol && (
                            <button
                              onClick={() => setOrderModalStock({ symbol: item.nse_symbol!, ltp: item.ltp || 100.0 })}
                              title="Instant Paper Order Execution"
                              style={{
                                padding: "6px 8px",
                                borderRadius: "6px",
                                background: "rgba(16, 185, 129, 0.15)",
                                border: "1px solid rgba(16, 185, 129, 0.3)",
                                color: "#34d399",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center"
                              }}
                            >
                              <ShoppingCart size={15} />
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

          {/* Pagination Controls */}
          <div
            style={{
              padding: "14px 18px",
              background: "#0c111d",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
              fontSize: "0.8rem",
              color: "#94a3b8"
            }}
          >
            <div>
              Showing <span style={{ color: "#ffffff", fontWeight: 700 }}>{total === 0 ? 0 : (page - 1) * limit + 1}</span> to{" "}
              <span style={{ color: "#ffffff", fontWeight: 700 }}>{Math.min(total, page * limit)}</span> of{" "}
              <span style={{ color: "#ffffff", fontWeight: 700 }}>{total.toLocaleString()}</span> securities
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1 || loading}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  background: page <= 1 ? "rgba(255, 255, 255, 0.03)" : "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  color: page <= 1 ? "#475569" : "#ffffff",
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                  fontSize: "0.78rem",
                  fontWeight: 600
                }}
              >
                <ChevronLeft size={14} />
                Previous
              </button>

              <span style={{ padding: "0 8px", fontFamily: "var(--font-mono, monospace)", color: "#cbd5e1" }}>
                Page {page} of {totalPages}
              </span>

              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages || loading}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  background: page >= totalPages ? "rgba(255, 255, 255, 0.03)" : "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  color: page >= totalPages ? "#475569" : "#ffffff",
                  cursor: page >= totalPages ? "not-allowed" : "pointer",
                  fontSize: "0.78rem",
                  fontWeight: 600
                }}
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </main>

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
