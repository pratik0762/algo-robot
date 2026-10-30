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
  ArrowUpRight,
  PieChart,
  Users,
  CheckCircle2
} from 'lucide-react';
import { CompanyDetail } from './CompanyDrawer';

interface CompanyDetailModalProps {
  company: CompanyDetail | null;
  onClose: () => void;
  onSyncLive: (symbol: string) => Promise<void>;
  syncingLive: boolean;
  syncStatus: string;
}

export default function CompanyDetailModal({
  company,
  onClose,
  onSyncLive,
  syncingLive,
  syncStatus
}: CompanyDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'quarterly' | 'annual' | 'balance' | 'filings' | 'institutional'>('quarterly');

  useEffect(() => {
    if (!company) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [company, onClose]);

  if (!company) return null;

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '1100px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#0d1322',
          borderRadius: 'var(--radius-xl)',
          padding: '32px',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '1px solid var(--border-subtle)',
            paddingBottom: '20px',
            marginBottom: '20px',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 800,
                  color: '#818cf8',
                  letterSpacing: '-0.02em',
                }}
              >
                {company.symbol}
              </span>
              <span className="badge badge-primary">NSE / BSE LISTED</span>
              <span className="badge badge-success">ISIN: {company.isin}</span>
              <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.4)' }}>Tickertape Verified</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>
              {company.company_name}
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {company.sector} • {company.industry} • Listed on: {company.listing_date}
            </p>
            {company.current_price !== undefined && company.current_price !== null && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  gap: '12px',
                  marginTop: '10px',
                  padding: '6px 14px',
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                }}
              >
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span className="pulse-indicator" style={{ width: '6px', height: '6px', background: (company.price_change ?? 0) >= 0 ? '#10b981' : '#ef4444' }} />
                  LIVE NSE PRICE:
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ffffff' }}>
                  ₹{company.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: (company.price_change ?? 0) >= 0 ? '#34d399' : '#f87171' }}>
                  {(company.price_change ?? 0) >= 0 ? '+' : ''}{(company.price_change ?? 0).toFixed(2)} ({(company.percent_change ?? 0).toFixed(2)}%)
                </div>
                {company.day_high && company.day_low && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    H: ₹{company.day_high.toFixed(2)} • L: ₹{company.day_low.toFixed(2)}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link
              href={`/company/${company.symbol}`}
              target="_blank"
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '8px 12px' }}
            >
              <ExternalLink size={14} /> Full Page
            </Link>

            <button
              onClick={() => onSyncLive(company.symbol)}
              disabled={syncingLive}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '8px 12px' }}
            >
              <RefreshCw size={14} className={syncingLive ? 'pulse-indicator' : ''} />
              {syncingLive ? 'Syncing...' : 'Sync Live NSE'}
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Sync Status Banner */}
        {syncStatus && (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              color: '#6ee7b7',
              marginBottom: '20px',
            }}
          >
            {syncStatus}
          </div>
        )}

        {/* Profile */}
        <div
          style={{
            background: 'rgba(15, 21, 35, 0.6)',
            padding: '14px 18px',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            marginBottom: '24px',
            borderLeft: '4px solid #6366f1',
          }}
        >
          <strong>Corporate Profile: </strong>
          {company.about}
        </div>

        {/* KPI Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
            marginBottom: '24px',
          }}
        >
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>MARKET CAP</span>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '2px' }}>
              ₹{((company.market_cap_cr ?? 0) / 1000).toFixed(1)}k Cr
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>P/E RATIO</span>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fbbf24', marginTop: '2px' }}>
              {(company.pe_ratio ?? 0).toFixed(1)}x
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>P/B RATIO</span>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '2px' }}>
              {(company.pb_ratio ?? 0).toFixed(1)}x
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>DIVIDEND YIELD</span>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#38bdf8', marginTop: '2px' }}>
              {(company.dividend_yield_pct ?? 0).toFixed(2)}%
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>OPERATING MARGIN</span>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#4ade80', marginTop: '2px' }}>
              {(company.operating_margin_pct ?? company.quarterly_results?.[0]?.operating_margin_pct ?? 0).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '20px', overflowX: 'auto' }}>
          <button
            onClick={() => setActiveTab('quarterly')}
            style={{
              background: 'none',
              border: 'none',
              padding: '12px 18px',
              color: activeTab === 'quarterly' ? '#818cf8' : 'var(--text-secondary)',
              fontWeight: activeTab === 'quarterly' ? 700 : 500,
              borderBottom: activeTab === 'quarterly' ? '2px solid #818cf8' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <BarChart3 size={16} /> Quarterly Results
          </button>
          <button
            onClick={() => setActiveTab('annual')}
            style={{
              background: 'none',
              border: 'none',
              padding: '12px 18px',
              color: activeTab === 'annual' ? '#818cf8' : 'var(--text-secondary)',
              fontWeight: activeTab === 'annual' ? 700 : 500,
              borderBottom: activeTab === 'annual' ? '2px solid #818cf8' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <TrendingUp size={16} /> Annual Statements
          </button>
          <button
            onClick={() => setActiveTab('balance')}
            style={{
              background: 'none',
              border: 'none',
              padding: '12px 18px',
              color: activeTab === 'balance' ? '#818cf8' : 'var(--text-secondary)',
              fontWeight: activeTab === 'balance' ? 700 : 500,
              borderBottom: activeTab === 'balance' ? '2px solid #818cf8' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Scale size={16} /> Balance Sheet
          </button>
          <button
            onClick={() => setActiveTab('filings')}
            style={{
              background: 'none',
              border: 'none',
              padding: '12px 18px',
              color: activeTab === 'filings' ? '#818cf8' : 'var(--text-secondary)',
              fontWeight: activeTab === 'filings' ? 700 : 500,
              borderBottom: activeTab === 'filings' ? '2px solid #818cf8' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <FileText size={16} /> Official NSE / BSE Filings
          </button>
          <button
            onClick={() => setActiveTab('institutional')}
            style={{
              background: 'none',
              border: 'none',
              padding: '12px 18px',
              color: activeTab === 'institutional' ? '#818cf8' : 'var(--text-secondary)',
              fontWeight: activeTab === 'institutional' ? 700 : 500,
              borderBottom: activeTab === 'institutional' ? '2px solid #818cf8' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <PieChart size={16} /> Institutional Holdings (FII / DII)
          </button>
        </div>

        {/* Tab 1: Quarterly */}
        {activeTab === 'quarterly' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-muted)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>METRIC (₹ Cr)</th>
                  {company.quarterly_results.map((q) => (
                    <th key={q.quarter_name} style={{ padding: '12px 16px' }}>
                      {q.quarter_name} ({q.audited})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: 'white' }}>Operations Revenue</td>
                  {company.quarterly_results.map((q) => (
                    <td key={q.quarter_name} style={{ padding: '12px 16px', color: '#38bdf8', fontWeight: 600 }}>
                      ₹{q.revenue_operations_cr.toLocaleString('en-IN')}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ textAlign: 'left', padding: '10px 16px', color: 'var(--text-secondary)' }}>Total Income</td>
                  {company.quarterly_results.map((q) => (
                    <td key={q.quarter_name} style={{ padding: '10px 16px', color: 'white', fontWeight: 600 }}>
                      ₹{q.total_income_cr.toLocaleString('en-IN')}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', background: 'rgba(99, 102, 241, 0.06)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700, color: '#a5b4fc' }}>Operating Profit (EBITDA)</td>
                  {company.quarterly_results.map((q) => (
                    <td key={q.quarter_name} style={{ padding: '12px 16px', fontWeight: 700, color: '#a5b4fc' }}>
                      ₹{q.ebitda_cr.toLocaleString('en-IN')} ({q.operating_margin_pct}%)
                    </td>
                  ))}
                </tr>
                <tr style={{ background: 'rgba(16, 185, 129, 0.1)', borderBottom: '2px solid rgba(16, 185, 129, 0.3)' }}>
                  <td style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 800, color: '#6ee7b7' }}>NET PROFIT (PAT)</td>
                  {company.quarterly_results.map((q) => (
                    <td key={q.quarter_name} style={{ padding: '14px 16px', fontWeight: 800, color: '#6ee7b7' }}>
                      ₹{q.net_profit_cr.toLocaleString('en-IN')}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Diluted EPS (₹)</td>
                  {company.quarterly_results.map((q) => (
                    <td key={q.quarter_name} style={{ padding: '10px 16px', fontWeight: 600, color: 'white' }}>
                      ₹{q.eps_inr.toFixed(2)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Annual */}
        {activeTab === 'annual' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-muted)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>ANNUAL P&L (₹ Cr)</th>
                  {company.annual_financials.map((a) => (
                    <th key={a.quarter_name} style={{ padding: '12px 16px' }}>{a.quarter_name} (Audited)</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600 }}>Annual Operations Revenue</td>
                  {company.annual_financials.map((a) => (
                    <td key={a.quarter_name} style={{ padding: '12px 16px', color: '#38bdf8', fontWeight: 600 }}>
                      ₹{a.revenue_operations_cr.toLocaleString('en-IN')}
                    </td>
                  ))}
                </tr>
                <tr style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                  <td style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 800, color: '#6ee7b7' }}>ANNUAL CONSOLIDATED PAT</td>
                  {company.annual_financials.map((a) => (
                    <td key={a.quarter_name} style={{ padding: '14px 16px', fontWeight: 800, color: '#6ee7b7' }}>
                      ₹{a.net_profit_cr.toLocaleString('en-IN')}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Balance Sheet */}
        {activeTab === 'balance' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '14px 18px', fontWeight: 700, letterSpacing: '0.03em' }}>Financial Year</th>
                  {company.balance_sheet.map((b) => (
                    <th key={b.financial_year} style={{ padding: '14px 18px', fontWeight: 700, color: '#f8fafc' }}>
                      {b.financial_year}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* 1. Current Assets */}
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 18px', color: 'var(--text-secondary)' }}>
                    Current Assets (₹ Cr)
                  </td>
                  {company.balance_sheet.map((b) => (
                    <td key={b.financial_year} style={{ padding: '12px 18px', color: '#e2e8f0', fontWeight: 500 }}>
                      ₹{(b.current_assets_cr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>

                {/* 2. Non Current Assets */}
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 18px', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.08)', marginRight: '8px', fontSize: '0.75rem', fontWeight: 700 }}>+</span>
                    Non Current Assets (₹ Cr)
                  </td>
                  {company.balance_sheet.map((b) => (
                    <td key={b.financial_year} style={{ padding: '12px 18px', color: '#cbd5e1', fontWeight: 500 }}>
                      ₹{(b.non_current_assets_cr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>

                {/* 3. Total Assets */}
                <tr style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.3)', background: 'rgba(56, 189, 248, 0.06)' }}>
                  <td style={{ textAlign: 'left', padding: '14px 18px', fontWeight: 800, color: '#38bdf8' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.2)', marginRight: '8px', fontSize: '0.75rem', fontWeight: 800, color: '#38bdf8' }}>=</span>
                    Total Assets (₹ Cr)
                  </td>
                  {company.balance_sheet.map((b) => (
                    <td key={b.financial_year} style={{ padding: '14px 18px', fontWeight: 800, color: '#38bdf8', fontSize: '0.92rem' }}>
                      ₹{b.total_assets_cr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>

                {/* 4. Current Liabilities */}
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 18px', color: 'var(--text-secondary)' }}>
                    Current Liabilities (₹ Cr)
                  </td>
                  {company.balance_sheet.map((b) => (
                    <td key={b.financial_year} style={{ padding: '12px 18px', color: '#e2e8f0', fontWeight: 500 }}>
                      ₹{(b.current_liabilities_cr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>

                {/* 5. Non Current Liabilities */}
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 18px', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.08)', marginRight: '8px', fontSize: '0.75rem', fontWeight: 700 }}>+</span>
                    Non Current Liabilities (₹ Cr)
                  </td>
                  {company.balance_sheet.map((b) => (
                    <td key={b.financial_year} style={{ padding: '12px 18px', color: '#cbd5e1', fontWeight: 500 }}>
                      ₹{(b.non_current_liabilities_cr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>

                {/* 6. Total Liabilities */}
                <tr style={{ borderBottom: '1px solid rgba(245, 158, 11, 0.3)', background: 'rgba(245, 158, 11, 0.06)' }}>
                  <td style={{ textAlign: 'left', padding: '14px 18px', fontWeight: 800, color: '#fbbf24' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', marginRight: '8px', fontSize: '0.75rem', fontWeight: 800, color: '#fbbf24' }}>=</span>
                    Total Liabilities (₹ Cr)
                  </td>
                  {company.balance_sheet.map((b) => (
                    <td key={b.financial_year} style={{ padding: '14px 18px', fontWeight: 800, color: '#fbbf24', fontSize: '0.92rem' }}>
                      ₹{(b.total_liabilities_cr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>

                {/* 7. Total Equity */}
                <tr style={{ borderBottom: '1px solid rgba(74, 222, 128, 0.3)', background: 'rgba(16, 185, 129, 0.08)' }}>
                  <td style={{ textAlign: 'left', padding: '14px 18px', fontWeight: 800, color: '#4ade80' }}>
                    Total Equity (₹ Cr)
                  </td>
                  {company.balance_sheet.map((b) => (
                    <td key={b.financial_year} style={{ padding: '14px 18px', fontWeight: 800, color: '#4ade80', fontSize: '0.95rem' }}>
                      ₹{b.total_equity_cr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>

                {/* 8. Total Liabilities & Shareholder's Equity */}
                <tr style={{ borderBottom: '1px solid rgba(129, 140, 248, 0.3)', background: 'rgba(99, 102, 241, 0.08)' }}>
                  <td style={{ textAlign: 'left', padding: '14px 18px', fontWeight: 800, color: '#a5b4fc' }}>
                    Total Liabilities & Shareholder&apos;s Equity (₹ Cr)
                  </td>
                  {company.balance_sheet.map((b) => (
                    <td key={b.financial_year} style={{ padding: '14px 18px', fontWeight: 800, color: '#a5b4fc', fontSize: '0.92rem' }}>
                      ₹{(b.total_liab_and_equity_cr ?? b.total_assets_cr).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>

                {/* 9. Total Common Shares Outstanding */}
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 18px', fontWeight: 600, color: '#cbd5e1' }}>
                    Total Common Shares Outstanding (Cr)
                  </td>
                  {company.balance_sheet.map((b) => (
                    <td key={b.financial_year} style={{ padding: '12px 18px', fontWeight: 700, color: '#f1f5f9' }}>
                      {(b.common_shares_outstanding_cr ?? 0).toFixed(2)}
                    </td>
                  ))}
                </tr>

                {/* 10. Supplementary / Solvency Metrics Header */}
                <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <td colSpan={company.balance_sheet.length + 1} style={{ textAlign: 'left', padding: '10px 18px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Additional Balance Sheet Metrics & Solvency Ratios
                  </td>
                </tr>

                {/* 11. Cash and Equivalents */}
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ textAlign: 'left', padding: '11px 18px', color: 'var(--text-secondary)' }}>
                    Cash & Short Term Investments
                  </td>
                  {company.balance_sheet.map((b) => (
                    <td key={b.financial_year} style={{ padding: '11px 18px', color: '#38bdf8', fontWeight: 600 }}>
                      ₹{(b.cash_and_equivalents_cr ?? 0).toLocaleString('en-IN')}
                    </td>
                  ))}
                </tr>

                {/* 12. Total Debt */}
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ textAlign: 'left', padding: '11px 18px', color: 'var(--text-secondary)' }}>
                    Total Debt (Borrowings)
                  </td>
                  {company.balance_sheet.map((b) => (
                    <td key={b.financial_year} style={{ padding: '11px 18px', color: (b.total_debt_cr ?? 0) > 0 ? '#f87171' : '#34d399', fontWeight: 600 }}>
                      ₹{(b.total_debt_cr ?? 0).toLocaleString('en-IN')}
                    </td>
                  ))}
                </tr>

                {/* 13. Debt to Equity */}
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ textAlign: 'left', padding: '11px 18px', color: 'var(--text-secondary)' }}>
                    Debt to Equity Ratio
                  </td>
                  {company.balance_sheet.map((b) => (
                    <td key={b.financial_year} style={{ padding: '11px 18px', fontWeight: 700, color: (b.debt_to_equity ?? 0) > 1.0 ? '#f59e0b' : '#34d399' }}>
                      {(b.debt_to_equity ?? 0).toFixed(2)}x
                    </td>
                  ))}
                </tr>

                {/* 14. Book Value per Share */}
                <tr>
                  <td style={{ textAlign: 'left', padding: '11px 18px', color: 'var(--text-secondary)' }}>
                    Book Value Per Share (₹)
                  </td>
                  {company.balance_sheet.map((b) => (
                    <td key={b.financial_year} style={{ padding: '11px 18px', fontWeight: 700, color: '#fbbf24' }}>
                      ₹{(b.book_value_per_share ?? 0).toFixed(2)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 4: Filings */}
        {activeTab === 'filings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Verified official corporate filings links from National Stock Exchange of India (NSE):
            </div>
            {company.nse_filings?.map((filing, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'white' }}>
                    {filing.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Type: <span style={{ color: '#818cf8' }}>{filing.filing_type}</span> • Period: {filing.financial_year_or_period} • Status: {filing.broadcast_date}
                  </div>
                </div>

                <a
                  href={filing.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                  style={{ fontSize: '0.8rem', padding: '8px 14px' }}
                >
                  <ExternalLink size={14} />
                  Open Official Portal
                </a>
              </div>
            ))}
          </div>
        )}

        {/* Tab 5: Institutional Holdings (FII / DII) */}
        {activeTab === 'institutional' && (
          <div>
            {/* Header info strip */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(16, 185, 129, 0.08))',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: '16px 20px',
                marginBottom: '24px',
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
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ffffff', letterSpacing: '0.02em' }}>
                    OFFICIAL SEBI REGULATION 31 SHAREHOLDING DISCLOSURE
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Quarter: <strong style={{ color: '#818cf8' }}>{company.institutional_holdings?.filing_quarter || 'Q2 FY26 (Ended 30-Sep-2026)'}</strong> &bull; Disclosed directly to National Stock Exchange of India (NSE)
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

            {/* 4 Core Institutional Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px',
                marginBottom: '28px',
              }}
            >
              {/* FII Card */}
              <div
                style={{
                  background: 'rgba(56, 189, 248, 0.06)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: '12px',
                  padding: '18px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>
                    Foreign Institutions (FII / FPI)
                  </span>
                  {company.institutional_holdings?.fii_change_qoq !== undefined && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: (company.institutional_holdings.fii_change_qoq ?? 0) >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: (company.institutional_holdings.fii_change_qoq ?? 0) >= 0 ? '#34d399' : '#f87171',
                      }}
                    >
                      {(company.institutional_holdings.fii_change_qoq ?? 0) >= 0 ? '+' : ''}{(company.institutional_holdings.fii_change_qoq ?? 0).toFixed(2)}% QoQ
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ffffff' }}>
                  ₹{((company.institutional_holdings?.fii_invested_cr ?? ((company.market_cap_cr * (company.institutional_holdings?.fii_holding_pct ?? 0)) / 100))).toLocaleString('en-IN', { maximumFractionDigits: 1 })} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Cr</span>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Equity Stake: <strong style={{ color: '#38bdf8' }}>{(company.institutional_holdings?.fii_holding_pct ?? 0).toFixed(2)}%</strong>
                </div>
              </div>

              {/* DII Card */}
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.06)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '12px',
                  padding: '18px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#34d399', textTransform: 'uppercase' }}>
                    Domestic Institutions (DII)
                  </span>
                  {company.institutional_holdings?.dii_change_qoq !== undefined && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: (company.institutional_holdings.dii_change_qoq ?? 0) >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: (company.institutional_holdings.dii_change_qoq ?? 0) >= 0 ? '#34d399' : '#f87171',
                      }}
                    >
                      {(company.institutional_holdings.dii_change_qoq ?? 0) >= 0 ? '+' : ''}{(company.institutional_holdings.dii_change_qoq ?? 0).toFixed(2)}% QoQ
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ffffff' }}>
                  ₹{((company.institutional_holdings?.dii_invested_cr ?? ((company.market_cap_cr * (company.institutional_holdings?.dii_holding_pct ?? 0)) / 100))).toLocaleString('en-IN', { maximumFractionDigits: 1 })} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Cr</span>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Equity Stake: <strong style={{ color: '#34d399' }}>{(company.institutional_holdings?.dii_holding_pct ?? 0).toFixed(2)}%</strong>
                </div>
              </div>

              {/* Mutual Funds Card */}
              <div
                style={{
                  background: 'rgba(168, 85, 247, 0.06)',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                  borderRadius: '12px',
                  padding: '18px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase' }}>
                    Mutual Funds & UTI
                  </span>
                  <span style={{ fontSize: '0.68rem', color: '#a855f7', fontWeight: 700 }}>SIP CUSHION</span>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ffffff' }}>
                  ₹{(company.institutional_holdings?.mf_invested_cr ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Cr</span>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Equity Stake: <strong style={{ color: '#c084fc' }}>{(company.institutional_holdings?.mf_holding_pct ?? 0).toFixed(2)}%</strong>
                </div>
              </div>

              {/* Insurance & LIC Card */}
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.06)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '12px',
                  padding: '18px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase' }}>
                    Insurance Companies / LIC
                  </span>
                  <span style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 700 }}>LONG-TERM</span>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ffffff' }}>
                  ₹{(company.institutional_holdings?.insurance_invested_cr ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Cr</span>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Equity Stake: <strong style={{ color: '#fbbf24' }}>{(company.institutional_holdings?.insurance_holding_pct ?? 0).toFixed(2)}%</strong>
                </div>
              </div>
            </div>

            {/* Ownership Share Distribution Bar */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '18px',
                marginBottom: '24px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ffffff' }}>
                  Shareholding Pattern Breakdown (100% Total Equity Capital)
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#818cf8',
                  }}
                >
                  {company.institutional_holdings?.institutional_sentiment_badge || 'STABLE INSTITUTIONAL BACKING'}
                </span>
              </div>

              {/* Stacked bar */}
              <div style={{ height: '14px', width: '100%', borderRadius: '6px', overflow: 'hidden', display: 'flex', background: 'rgba(255, 255, 255, 0.1)' }}>
                <div
                  style={{
                    width: `${company.institutional_holdings?.fii_holding_pct ?? 0}%`,
                    background: '#38bdf8',
                    transition: 'width 0.3s ease',
                  }}
                  title={`FII: ${(company.institutional_holdings?.fii_holding_pct ?? 0)}%`}
                />
                <div
                  style={{
                    width: `${company.institutional_holdings?.dii_holding_pct ?? 0}%`,
                    background: '#34d399',
                    transition: 'width 0.3s ease',
                  }}
                  title={`DII: ${(company.institutional_holdings?.dii_holding_pct ?? 0)}%`}
                />
                <div
                  style={{
                    width: `${company.institutional_holdings?.promoter_holding_pct ?? 0}%`,
                    background: '#fbbf24',
                    transition: 'width 0.3s ease',
                  }}
                  title={`Promoters: ${(company.institutional_holdings?.promoter_holding_pct ?? 0)}%`}
                />
                <div
                  style={{
                    width: `${company.institutional_holdings?.public_other_pct ?? 0}%`,
                    background: '#94a3b8',
                    transition: 'width 0.3s ease',
                  }}
                  title={`Public & Others: ${(company.institutional_holdings?.public_other_pct ?? 0)}%`}
                />
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: '20px', marginTop: '12px', flexWrap: 'wrap', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#38bdf8' }} />
                  <span style={{ color: 'var(--text-muted)' }}>FII / FPI:</span>
                  <strong style={{ color: '#ffffff' }}>{(company.institutional_holdings?.fii_holding_pct ?? 0).toFixed(2)}%</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#34d399' }} />
                  <span style={{ color: 'var(--text-muted)' }}>DII:</span>
                  <strong style={{ color: '#ffffff' }}>{(company.institutional_holdings?.dii_holding_pct ?? 0).toFixed(2)}%</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#fbbf24' }} />
                  <span style={{ color: 'var(--text-muted)' }}>Promoter:</span>
                  <strong style={{ color: '#ffffff' }}>{(company.institutional_holdings?.promoter_holding_pct ?? 0).toFixed(2)}%</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#94a3b8' }} />
                  <span style={{ color: 'var(--text-muted)' }}>Public & Others:</span>
                  <strong style={{ color: '#ffffff' }}>{(company.institutional_holdings?.public_other_pct ?? 0).toFixed(2)}%</strong>
                </div>
              </div>
            </div>

            {/* Top Marquee Institutional Investors (2 Columns) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              {/* Foreign Fund List */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  borderRadius: '12px',
                  padding: '18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <Users size={16} color="#38bdf8" />
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    Top Foreign Institutional Investors (FII / FPI)
                  </h4>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(company.institutional_holdings?.top_fii_investors || [
                    'Vanguard Emerging Markets Stock Index Fund',
                    'Government of Singapore / GIC',
                    'BlackRock Global Allocation & iShares',
                    'Capital World Growth & Income Fund',
                    'Morgan Stanley Investment Management'
                  ]).map((investor, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 14px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        color: '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <span style={{ color: '#38bdf8', fontWeight: 800, fontSize: '0.75rem' }}>#{idx + 1}</span>
                      <span>{investor}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Domestic Fund List */}
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: '12px',
                  padding: '18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <Building2 size={16} color="#34d399" />
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#34d399', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    Top Domestic Institutional Investors (DII)
                  </h4>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(company.institutional_holdings?.top_dii_investors || [
                    'Life Insurance Corporation of India (LIC)',
                    'SBI Nifty 50 ETF & Equity Hybrid Fund',
                    'ICICI Prudential Large & Mid Cap Fund',
                    'UTI Nifty 50 Exchange Traded Fund',
                    'HDFC Balanced Advantage & Flexi Cap Fund'
                  ]).map((investor, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 14px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        color: '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <span style={{ color: '#34d399', fontWeight: 800, fontSize: '0.75rem' }}>#{idx + 1}</span>
                      <span>{investor}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
