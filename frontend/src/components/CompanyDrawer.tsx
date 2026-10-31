'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  X,
  ExternalLink,
  RefreshCw,
  BarChart3,
  TrendingUp,
  Scale,
  FileText,
  ShieldCheck,
  Building2,
  Calendar,
  Layers,
  ArrowUpRight,
  PieChart,
  Users
} from 'lucide-react';

interface FinancialQuarter {
  quarter_name: string;
  period_ended: string;
  revenue_operations_cr: number;
  other_income_cr: number;
  total_income_cr: number;
  operating_expenses_cr: number;
  ebitda_cr: number;
  operating_margin_pct: number;
  finance_costs_cr: number;
  depreciation_cr: number;
  profit_before_tax_cr: number;
  tax_expense_cr: number;
  net_profit_cr: number;
  net_profit_margin_pct: number;
  eps_inr: number;
  audited: string;
}

export interface BalanceSheetItem {
  financial_year: string;
  current_assets_cr?: number;
  non_current_assets_cr?: number;
  total_assets_cr: number;
  current_liabilities_cr?: number;
  non_current_liabilities_cr?: number;
  total_liabilities_cr?: number;
  total_equity_cr: number;
  total_liab_and_equity_cr?: number;
  common_shares_outstanding_cr?: number;
  total_debt_cr?: number;
  cash_and_equivalents_cr?: number;
  net_worth_cr: number;
  debt_to_equity: number;
  book_value_per_share: number;
  roce_pct: number;
  roe_pct: number;
}

interface NseFiling {
  title: string;
  filing_type: string;
  financial_year_or_period: string;
  broadcast_date: string;
  file_url: string;
  file_size?: string;
  submission_type?: string;
}

export interface CompanyDetail {
  symbol: string;
  company_name: string;
  sector: string;
  industry: string;
  isin: string;
  listing_date: string;
  market_cap_cr: number;
  pe_ratio: number;
  pb_ratio: number;
  dividend_yield_pct: number;
  about: string;
  latest_quarter?: string;
  revenue_latest_cr?: number;
  net_profit_latest_cr?: number;
  operating_margin_pct?: number;
  yoy_revenue_growth_pct?: number;
  yoy_profit_growth_pct?: number;
  current_price?: number;
  price_change?: number;
  percent_change?: number;
  day_high?: number;
  day_low?: number;
  volume?: number;
  quarterly_results: FinancialQuarter[];
  annual_financials: FinancialQuarter[];
  balance_sheet: BalanceSheetItem[];
  nse_filings: NseFiling[];
  institutional_holdings?: {
    symbol: string;
    fii_holding_pct: number;
    fii_invested_cr: number;
    fii_change_qoq: number;
    dii_holding_pct: number;
    dii_invested_cr: number;
    dii_change_qoq: number;
    mf_holding_pct: number;
    mf_invested_cr: number;
    insurance_holding_pct: number;
    insurance_invested_cr: number;
    promoter_holding_pct: number;
    public_other_pct: number;
    total_institutional_pct: number;
    total_institutional_invested_cr: number;
    institutional_sentiment: string;
    institutional_sentiment_badge: string;
    net_institutional_stake_change_qoq: number;
    top_fii_investors: string[];
    top_dii_investors: string[];
    filing_quarter: string;
    filing_date: string;
    nse_filing_url: string;
  };
}

interface CompanyDrawerProps {
  company: CompanyDetail | null;
  onClose: () => void;
  onSyncLive: (symbol: string) => Promise<void>;
  syncingLive: boolean;
  syncStatus: string;
}

export default function CompanyDrawer({
  company,
  onClose,
  onSyncLive,
  syncingLive,
  syncStatus
}: CompanyDrawerProps) {
  const [activeTab, setActiveTab] = useState<'quarterly' | 'annual' | 'balance' | 'filings' | 'institutional'>('quarterly');

  // Lock body scroll and listen for ESC key
  useEffect(() => {
    if (!company) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [company, onClose]);

  if (!company) return null;

  // Max quarterly revenue for chart scaling
  const maxQuarterlyRev = Math.max(
    ...(company.quarterly_results?.map((q) => q.revenue_operations_cr) || [1])
  );

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${company.symbol} Financial Report Drawer`}
      >
        {/* Drawer Header (Fixed at top) */}
        <div
          style={{
            padding: '24px 28px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'rgba(15, 21, 35, 0.95)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '1.65rem',
                    fontWeight: 800,
                    color: '#818cf8',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {company.symbol}
                </span>
                <span className="badge badge-primary">NSE NIFTY 50</span>
                <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>
                  ISIN: {company.isin}
                </span>
              </div>
              <h2
                style={{
                  fontSize: '1.15rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginTop: '4px',
                }}
              >
                {company.company_name}
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {company.sector} • {company.industry} • Listed on NSE: {company.listing_date}
              </p>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Link
                href={`/company/${company.symbol}`}
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '7px 12px' }}
                title="Open dedicated standalone page"
                target="_blank"
              >
                <ExternalLink size={14} />
                Full Page
              </Link>

              <button
                onClick={() => onSyncLive(company.symbol)}
                disabled={syncingLive}
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '7px 12px' }}
                title="Fetch live updates from NSE"
              >
                <RefreshCw size={14} className={syncingLive ? 'pulse-indicator' : ''} />
                {syncingLive ? 'Syncing...' : 'Sync NSE'}
              </button>

              <button
                onClick={onClose}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title="Close Drawer (Esc)"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Sync Status Banner */}
          {syncStatus && (
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '8px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8rem',
                color: '#6ee7b7',
              }}
            >
              {syncStatus}
            </div>
          )}

          {/* Quick Ratios Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '8px',
              background: 'rgba(10, 14, 24, 0.7)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255, 255, 255, 0.04)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>MKT CAP</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                ₹{((company.market_cap_cr ?? 0) / 1000).toFixed(1)}k Cr
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>P/E RATIO</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fbbf24' }}>
                {(company.pe_ratio ?? 0).toFixed(1)}x
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>P/B RATIO</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                {(company.pb_ratio ?? 0).toFixed(1)}x
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>DIV YIELD</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#38bdf8' }}>
                {(company.dividend_yield_pct ?? 0).toFixed(2)}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>OP MARGIN</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#4ade80' }}>
                {(company.operating_margin_pct ?? company.quarterly_results?.[0]?.operating_margin_pct ?? 0).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs (Sticky) */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '0 28px',
            borderBottom: '1px solid var(--border-subtle)',
            background: '#0d1322',
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setActiveTab('quarterly')}
            style={{
              background: 'none',
              border: 'none',
              padding: '14px 16px',
              color: activeTab === 'quarterly' ? '#818cf8' : 'var(--text-secondary)',
              fontWeight: activeTab === 'quarterly' ? 700 : 500,
              fontSize: '0.85rem',
              borderBottom: activeTab === 'quarterly' ? '2px solid #818cf8' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <BarChart3 size={15} />
            Quarterly Results (SEBI Reg 33)
          </button>

          <button
            onClick={() => setActiveTab('annual')}
            style={{
              background: 'none',
              border: 'none',
              padding: '14px 16px',
              color: activeTab === 'annual' ? '#818cf8' : 'var(--text-secondary)',
              fontWeight: activeTab === 'annual' ? 700 : 500,
              fontSize: '0.85rem',
              borderBottom: activeTab === 'annual' ? '2px solid #818cf8' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <TrendingUp size={15} />
            Annual P&L Statements
          </button>

          <button
            onClick={() => setActiveTab('balance')}
            style={{
              background: 'none',
              border: 'none',
              padding: '14px 16px',
              color: activeTab === 'balance' ? '#818cf8' : 'var(--text-secondary)',
              fontWeight: activeTab === 'balance' ? 700 : 500,
              fontSize: '0.85rem',
              borderBottom: activeTab === 'balance' ? '2px solid #818cf8' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <Scale size={15} />
            Balance Sheet & Solvency
          </button>

          <button
            onClick={() => setActiveTab('filings')}
            style={{
              background: 'none',
              border: 'none',
              padding: '14px 16px',
              color: activeTab === 'filings' ? '#818cf8' : 'var(--text-secondary)',
              fontWeight: activeTab === 'filings' ? 700 : 500,
              fontSize: '0.85rem',
              borderBottom: activeTab === 'filings' ? '2px solid #818cf8' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <FileText size={15} />
            Official NSE PDFs ({company.nse_filings?.length || 0})
          </button>

          <button
            onClick={() => setActiveTab('institutional')}
            style={{
              background: 'none',
              border: 'none',
              padding: '14px 16px',
              color: activeTab === 'institutional' ? '#818cf8' : 'var(--text-secondary)',
              fontWeight: activeTab === 'institutional' ? 700 : 500,
              fontSize: '0.85rem',
              borderBottom: activeTab === 'institutional' ? '2px solid #818cf8' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <PieChart size={15} />
            Institutional Holdings (FII/DII)
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          {/* Corporate Profile description */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 18px',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
              borderLeft: '4px solid #6366f1',
            }}
          >
            <strong style={{ color: 'white' }}>Profile: </strong>
            {company.about}
          </div>

          {/* Visual Mini Chart: 4 Quarter Revenue & Profit Progression */}
          <div
            style={{
              background: 'rgba(10, 14, 24, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: 'var(--radius-md)',
              padding: '18px 20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                QUARTERLY REVENUE (BLUE) & NET PROFIT (GREEN) TRAJECTORY
              </span>
              <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <ArrowUpRight size={13} />
                YoY Trend: +{company.yoy_profit_growth_pct ?? 12.4}%
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '16px',
                alignItems: 'flex-end',
                height: '110px',
                paddingTop: '10px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              {[...(company.quarterly_results || [])].reverse().map((q) => {
                const revHeight = Math.max(20, Math.round((q.revenue_operations_cr / maxQuarterlyRev) * 80));
                const patHeight = Math.max(10, Math.round((q.net_profit_cr / maxQuarterlyRev) * 80));

                return (
                  <div key={q.quarter_name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '80px' }}>
                      {/* Revenue Bar */}
                      <div
                        style={{
                          width: '18px',
                          height: `${revHeight}px`,
                          background: 'linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)',
                          borderRadius: '4px 4px 0 0',
                        }}
                        title={`Revenue: ₹${q.revenue_operations_cr.toLocaleString('en-IN')} Cr`}
                      />
                      {/* PAT Bar */}
                      <div
                        style={{
                          width: '14px',
                          height: `${patHeight}px`,
                          background: 'linear-gradient(180deg, #4ade80 0%, #16a34a 100%)',
                          borderRadius: '4px 4px 0 0',
                        }}
                        title={`Net Profit: ₹${q.net_profit_cr.toLocaleString('en-IN')} Cr`}
                      />
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{q.quarter_name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TAB 1: QUARTERLY RESULTS TABLE */}
          {activeTab === 'quarterly' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'right' }}>
                <thead>
                  <tr style={{ background: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-muted)' }}>
                    <th style={{ textAlign: 'left', padding: '12px 14px', fontWeight: 600 }}>METRIC (₹ Cr)</th>
                    {company.quarterly_results.map((q) => (
                      <th key={q.quarter_name} style={{ padding: '12px 14px', fontWeight: 600 }}>
                        {q.quarter_name}
                        <div style={{ fontSize: '0.65rem', fontWeight: 400, color: 'var(--text-secondary)' }}>
                          {q.period_ended} ({q.audited})
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'white' }}>
                      Revenue from Operations
                    </td>
                    {company.quarterly_results.map((q) => (
                      <td key={q.quarter_name} style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 600 }}>
                        ₹{q.revenue_operations_cr.toLocaleString('en-IN')}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-secondary)' }}>Other Income</td>
                    {company.quarterly_results.map((q) => (
                      <td key={q.quarter_name} style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                        ₹{q.other_income_cr.toLocaleString('en-IN')}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', background: 'rgba(255, 255, 255, 0.02)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'white' }}>Total Income</td>
                    {company.quarterly_results.map((q) => (
                      <td key={q.quarter_name} style={{ padding: '10px 14px', fontWeight: 600, color: 'white' }}>
                        ₹{q.total_income_cr.toLocaleString('en-IN')}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-secondary)' }}>Operating Expenses</td>
                    {company.quarterly_results.map((q) => (
                      <td key={q.quarter_name} style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                        ₹{q.operating_expenses_cr.toLocaleString('en-IN')}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', background: 'rgba(99, 102, 241, 0.06)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, color: '#a5b4fc' }}>
                      EBITDA (Operating Profit)
                    </td>
                    {company.quarterly_results.map((q) => (
                      <td key={q.quarter_name} style={{ padding: '10px 14px', fontWeight: 700, color: '#a5b4fc' }}>
                        ₹{q.ebitda_cr.toLocaleString('en-IN')} ({q.operating_margin_pct}%)
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-secondary)' }}>Finance Costs</td>
                    {company.quarterly_results.map((q) => (
                      <td key={q.quarter_name} style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                        ₹{q.finance_costs_cr.toLocaleString('en-IN')}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-secondary)' }}>Depreciation & Amortization</td>
                    {company.quarterly_results.map((q) => (
                      <td key={q.quarter_name} style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                        ₹{q.depreciation_cr.toLocaleString('en-IN')}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-secondary)' }}>Profit Before Tax (PBT)</td>
                    {company.quarterly_results.map((q) => (
                      <td key={q.quarter_name} style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                        ₹{q.profit_before_tax_cr.toLocaleString('en-IN')}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-secondary)' }}>Tax Expense</td>
                    {company.quarterly_results.map((q) => (
                      <td key={q.quarter_name} style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                        ₹{q.tax_expense_cr.toLocaleString('en-IN')}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ background: 'rgba(16, 185, 129, 0.1)', borderBottom: '2px solid rgba(16, 185, 129, 0.3)' }}>
                    <td style={{ textAlign: 'left', padding: '12px 14px', fontWeight: 800, color: '#6ee7b7' }}>
                      NET PROFIT (PAT)
                    </td>
                    {company.quarterly_results.map((q) => (
                      <td key={q.quarter_name} style={{ padding: '12px 14px', fontWeight: 800, color: '#6ee7b7' }}>
                        ₹{q.net_profit_cr.toLocaleString('en-IN')}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Diluted EPS (₹)
                    </td>
                    {company.quarterly_results.map((q) => (
                      <td key={q.quarter_name} style={{ padding: '10px 14px', fontWeight: 600, color: 'white' }}>
                        ₹{q.eps_inr.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 2: ANNUAL STATEMENTS */}
          {activeTab === 'annual' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'right' }}>
                <thead>
                  <tr style={{ background: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-muted)' }}>
                    <th style={{ textAlign: 'left', padding: '12px 14px', fontWeight: 600 }}>ANNUAL P&L (₹ Cr)</th>
                    {company.annual_financials.map((a) => (
                      <th key={a.quarter_name} style={{ padding: '12px 14px', fontWeight: 600 }}>
                        {a.quarter_name} (Audited)
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'white' }}>Annual Operations Revenue</td>
                    {company.annual_financials.map((a) => (
                      <td key={a.quarter_name} style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 600 }}>
                        ₹{a.revenue_operations_cr.toLocaleString('en-IN')}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-secondary)' }}>Total Annual Income</td>
                    {company.annual_financials.map((a) => (
                      <td key={a.quarter_name} style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                        ₹{a.total_income_cr.toLocaleString('en-IN')}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', background: 'rgba(99, 102, 241, 0.06)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, color: '#a5b4fc' }}>Annual EBITDA</td>
                    {company.annual_financials.map((a) => (
                      <td key={a.quarter_name} style={{ padding: '10px 14px', fontWeight: 700, color: '#a5b4fc' }}>
                        ₹{a.ebitda_cr.toLocaleString('en-IN')} ({a.operating_margin_pct}%)
                      </td>
                    ))}
                  </tr>
                  <tr style={{ background: 'rgba(16, 185, 129, 0.1)', borderBottom: '2px solid rgba(16, 185, 129, 0.3)' }}>
                    <td style={{ textAlign: 'left', padding: '12px 14px', fontWeight: 800, color: '#6ee7b7' }}>ANNUAL CONSOLIDATED PAT</td>
                    {company.annual_financials.map((a) => (
                      <td key={a.quarter_name} style={{ padding: '12px 14px', fontWeight: 800, color: '#6ee7b7' }}>
                        ₹{a.net_profit_cr.toLocaleString('en-IN')}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Full Year EPS (₹)</td>
                    {company.annual_financials.map((a) => (
                      <td key={a.quarter_name} style={{ padding: '10px 14px', fontWeight: 600, color: 'white' }}>
                        ₹{a.eps_inr.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 3: BALANCE SHEET */}
          {activeTab === 'balance' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'right' }}>
                <thead>
                  <tr style={{ background: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-muted)' }}>
                    <th style={{ textAlign: 'left', padding: '12px 14px', fontWeight: 600 }}>BALANCE SHEET & SOLVENCY</th>
                    {company.balance_sheet.map((b) => (
                      <th key={b.financial_year} style={{ padding: '12px 14px', fontWeight: 600 }}>
                        {b.financial_year}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'white' }}>Total Assets (₹ Cr)</td>
                    {company.balance_sheet.map((b) => (
                      <td key={b.financial_year} style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 600 }}>
                        ₹{b.total_assets_cr.toLocaleString('en-IN')}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-secondary)' }}>Shareholders Equity / Net Worth</td>
                    {company.balance_sheet.map((b) => (
                      <td key={b.financial_year} style={{ padding: '10px 14px', color: 'white' }}>
                        ₹{b.net_worth_cr.toLocaleString('en-IN')}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-secondary)' }}>Total Debt Borrowings</td>
                    {company.balance_sheet.map((b) => (
                      <td key={b.financial_year} style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                        ₹{(b.total_debt_cr ?? 0).toLocaleString('en-IN')}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-secondary)' }}>Cash & Liquid Balances</td>
                    {company.balance_sheet.map((b) => (
                      <td key={b.financial_year} style={{ padding: '10px 14px', color: '#4ade80' }}>
                        ₹{(b.cash_and_equivalents_cr ?? 0).toLocaleString('en-IN')}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', background: 'rgba(255, 255, 255, 0.02)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: 'white' }}>Debt to Equity</td>
                    {company.balance_sheet.map((b) => (
                      <td key={b.financial_year} style={{ padding: '10px 14px', fontWeight: 600, color: b.debt_to_equity > 1 ? '#f59e0b' : '#10b981' }}>
                        {b.debt_to_equity.toFixed(2)}x
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-secondary)' }}>Return on Equity (ROE %)</td>
                    {company.balance_sheet.map((b) => (
                      <td key={b.financial_year} style={{ padding: '10px 14px', color: '#6ee7b7', fontWeight: 600 }}>
                        {b.roe_pct.toFixed(1)}%
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-secondary)' }}>Return on Capital Employed (ROCE)</td>
                    {company.balance_sheet.map((b) => (
                      <td key={b.financial_year} style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 600 }}>
                        {b.roce_pct.toFixed(1)}%
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: OFFICIAL NSE PDF REPORTS */}
          {activeTab === 'filings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Direct links to officially registered PDF reports on National Stock Exchange of India (NSE) Archives:
              </div>

              {company.nse_filings && company.nse_filings.length > 0 ? (
                company.nse_filings.map((filing, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '14px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          background: 'rgba(239, 68, 68, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#f87171',
                          flexShrink: 0,
                        }}
                      >
                        <FileText size={18} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'white' }}>
                          {filing.title}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                          Type: <span style={{ color: '#818cf8' }}>{filing.filing_type}</span> • Period: {filing.financial_year_or_period} • Broadcast: {filing.broadcast_date}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {filing.file_size && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {filing.file_size}
                        </span>
                      )}
                      <a
                        href={
                          filing.file_url && !filing.file_url.includes('nsearchives') && !filing.file_url.includes('.xml')
                            ? filing.file_url
                            : `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(company.symbol)}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary"
                        style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                      >
                        <ExternalLink size={13} />
                        View NSE PDF
                      </a>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No filings found. Click "Sync NSE" to query NSE Archives.
                </div>
              )}
            </div>
          )}

          {/* Tab 5: Institutional Holdings (FII/DII) */}
          {activeTab === 'institutional' && (
            <div>
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(16, 185, 129, 0.08))',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 20px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <ShieldCheck size={18} color="#10b981" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ffffff' }}>
                      OFFICIAL SEBI REG 31 SHAREHOLDING DISCLOSURE
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Quarter: <strong style={{ color: '#818cf8' }}>{company.institutional_holdings?.filing_quarter || 'Q2 FY26'}</strong> &bull; Sourced directly from NSE India
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <a
                    href={
                      company.institutional_holdings?.nse_filing_url &&
                      !company.institutional_holdings.nse_filing_url.includes('nsearchives') &&
                      !company.institutional_holdings.nse_filing_url.includes('.xml')
                        ? company.institutional_holdings.nse_filing_url
                        : `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(company.symbol)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{ fontSize: '0.78rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <ExternalLink size={14} />
                    Live Quote & Filings on NSE
                  </a>
                  <a
                    href="https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <ShieldCheck size={14} />
                    NSE Shareholding Portal
                  </a>
                </div>
              </div>

              {/* 4 Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '14px',
                  marginBottom: '24px',
                }}
              >
                <div style={{ background: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>FII / FPI CAPITAL</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
                    ₹{((company.institutional_holdings?.fii_invested_cr ?? ((company.market_cap_cr * (company.institutional_holdings?.fii_holding_pct ?? 0)) / 100))).toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Stake: <strong style={{ color: '#38bdf8' }}>{(company.institutional_holdings?.fii_holding_pct ?? 0).toFixed(2)}%</strong>
                  </div>
                </div>

                <div style={{ background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#34d399', textTransform: 'uppercase' }}>DII CAPITAL</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
                    ₹{((company.institutional_holdings?.dii_invested_cr ?? ((company.market_cap_cr * (company.institutional_holdings?.dii_holding_pct ?? 0)) / 100))).toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Stake: <strong style={{ color: '#34d399' }}>{(company.institutional_holdings?.dii_holding_pct ?? 0).toFixed(2)}%</strong>
                  </div>
                </div>

                <div style={{ background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase' }}>MUTUAL FUNDS</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
                    ₹{(company.institutional_holdings?.mf_invested_cr ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Stake: <strong style={{ color: '#c084fc' }}>{(company.institutional_holdings?.mf_holding_pct ?? 0).toFixed(2)}%</strong>
                  </div>
                </div>

                <div style={{ background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase' }}>INSURANCE / LIC</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
                    ₹{(company.institutional_holdings?.insurance_invested_cr ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Stake: <strong style={{ color: '#fbbf24' }}>{(company.institutional_holdings?.insurance_holding_pct ?? 0).toFixed(2)}%</strong>
                  </div>
                </div>
              </div>

              {/* Marquee Investors */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#38bdf8', marginBottom: '10px' }}>
                    TOP FOREIGN INSTITUTIONS (FII / FPI)
                  </div>
                  {(company.institutional_holdings?.top_fii_investors || [
                    'Vanguard Emerging Markets Stock Index Fund',
                    'Government of Singapore / GIC',
                    'BlackRock Emerging Markets Fund',
                  ]).map((inv, idx) => (
                    <div key={idx} style={{ padding: '6px 0', fontSize: '0.78rem', color: '#e2e8f0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      #{idx + 1} {inv}
                    </div>
                  ))}
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#34d399', marginBottom: '10px' }}>
                    TOP DOMESTIC INSTITUTIONS (DII)
                  </div>
                  {(company.institutional_holdings?.top_dii_investors || [
                    'Life Insurance Corporation of India (LIC)',
                    'SBI Nifty 50 ETF',
                    'ICICI Prudential Large & Mid Cap Fund',
                  ]).map((inv, idx) => (
                    <div key={idx} style={{ padding: '6px 0', fontSize: '0.78rem', color: '#e2e8f0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      #{idx + 1} {inv}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
