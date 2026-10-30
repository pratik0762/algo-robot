'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  FileText,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  Scale,
  RefreshCw
} from 'lucide-react';
import { getApiBase } from '@/config/api';

function CompanyDetailInner() {
  const params = useParams();
  const symbol = params?.symbol as string;
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'quarterly' | 'annual' | 'balance' | 'filings'>('quarterly');

  useEffect(() => {
    if (symbol) {
      const apiBase = getApiBase();
      fetch(`${apiBase}/api/companies/${symbol}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          setCompany(data);
          setLoading(false);
        })
        .catch((err) => {
          console.error('Failed to load company detail:', err);
          setLoading(false);
        });
    }
  }, [symbol]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <RefreshCw size={32} className="pulse-indicator" color="#6366f1" />
      </div>
    );
  }

  if (!company) {
    return (
      <div style={{ padding: '64px', textAlign: 'center' }}>
        <h2>Company not found in Nifty 50.</h2>
        <Link href="/" className="btn btn-primary" style={{ marginTop: '16px' }}>
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <main style={{ minHeight: '100vh', padding: '32px 24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Link href="/" className="btn btn-secondary" style={{ marginBottom: '24px', display: 'inline-flex' }}>
        <ArrowLeft size={16} />
        Back to All 50 Companies
      </Link>

      <div className="glass-panel" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#818cf8' }}>{company.symbol}</h1>
              <span className="badge badge-primary">NSE NIFTY 50</span>
              <span className="badge badge-success">ISIN: {company.isin}</span>
              <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.4)' }}>Tickertape Verified</span>
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '4px' }}>{company.company_name}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
              {company.sector} • {company.industry} • Listed on NSE: {company.listing_date}
            </p>
            {company.current_price !== undefined && company.current_price !== null && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  gap: '12px',
                  marginTop: '12px',
                  padding: '8px 16px',
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span className="pulse-indicator" style={{ width: '6px', height: '6px', background: (company.price_change ?? 0) >= 0 ? '#10b981' : '#ef4444' }} />
                  LIVE NSE PRICE:
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ffffff' }}>
                  ₹{company.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: (company.price_change ?? 0) >= 0 ? '#34d399' : '#f87171' }}>
                  {(company.price_change ?? 0) >= 0 ? '+' : ''}{(company.price_change ?? 0).toFixed(2)} ({(company.percent_change ?? 0).toFixed(2)}%)
                </div>
                {company.day_high && company.day_low && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    High: ₹{company.day_high.toFixed(2)} • Low: ₹{company.day_low.toFixed(2)}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <span className="badge badge-cyan" style={{ padding: '8px 14px' }}>
              <ShieldCheck size={14} /> Official NSE Verified Filing
            </span>
          </div>
        </div>

        <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {company.about}
          </p>
        </div>

        {/* Tab Headers */}
        <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--border-subtle)', marginTop: '32px', marginBottom: '24px' }}>
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
              gap: '6px'
            }}
          >
            <BarChart3 size={16} /> Quarterly Financial Results
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
              gap: '6px'
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
              gap: '6px'
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
              gap: '6px'
            }}
          >
            <FileText size={16} /> Official NSE Reports & PDFs
          </button>
        </div>

        {activeTab === 'quarterly' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-muted)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>METRIC (₹ Cr)</th>
                  {company.quarterly_results?.map((q: any) => (
                    <th key={q.quarter_name} style={{ padding: '12px 16px' }}>
                      {q.quarter_name} ({q.audited})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600 }}>Operations Revenue</td>
                  {company.quarterly_results?.map((q: any) => (
                    <td key={q.quarter_name} style={{ padding: '12px 16px', color: '#38bdf8', fontWeight: 600 }}>
                      ₹{q.revenue_operations_cr.toLocaleString('en-IN')}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 16px' }}>Total Income</td>
                  {company.quarterly_results?.map((q: any) => (
                    <td key={q.quarter_name} style={{ padding: '12px 16px' }}>
                      ₹{q.total_income_cr.toLocaleString('en-IN')}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(99,102,241,0.06)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700, color: '#a5b4fc' }}>EBITDA</td>
                  {company.quarterly_results?.map((q: any) => (
                    <td key={q.quarter_name} style={{ padding: '12px 16px', fontWeight: 700, color: '#a5b4fc' }}>
                      ₹{q.ebitda_cr.toLocaleString('en-IN')} ({q.operating_margin_pct}%)
                    </td>
                  ))}
                </tr>
                <tr style={{ background: 'rgba(16,185,129,0.1)' }}>
                  <td style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 800, color: '#6ee7b7' }}>NET PROFIT (PAT)</td>
                  {company.quarterly_results?.map((q: any) => (
                    <td key={q.quarter_name} style={{ padding: '14px 16px', fontWeight: 800, color: '#6ee7b7' }}>
                      ₹{q.net_profit_cr.toLocaleString('en-IN')}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'annual' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-muted)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 16px' }}>ANNUAL STATEMENT (₹ Cr)</th>
                  {company.annual_financials?.map((a: any) => (
                    <th key={a.quarter_name} style={{ padding: '12px 16px' }}>{a.quarter_name} (Audited)</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600 }}>Annual Operations Revenue</td>
                  {company.annual_financials?.map((a: any) => (
                    <td key={a.quarter_name} style={{ padding: '12px 16px', color: '#38bdf8', fontWeight: 600 }}>
                      ₹{a.revenue_operations_cr.toLocaleString('en-IN')}
                    </td>
                  ))}
                </tr>
                <tr style={{ background: 'rgba(16,185,129,0.1)' }}>
                  <td style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 800, color: '#6ee7b7' }}>ANNUAL CONSOLIDATED PAT</td>
                  {company.annual_financials?.map((a: any) => (
                    <td key={a.quarter_name} style={{ padding: '14px 16px', fontWeight: 800, color: '#6ee7b7' }}>
                      ₹{a.net_profit_cr.toLocaleString('en-IN')}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'balance' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '14px 18px', fontWeight: 700 }}>Financial Year</th>
                  {company.balance_sheet?.map((b: any) => (
                    <th key={b.financial_year} style={{ padding: '14px 18px', fontWeight: 700, color: '#f8fafc' }}>
                      {b.financial_year}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 18px', color: 'var(--text-secondary)' }}>Current Assets (₹ Cr)</td>
                  {company.balance_sheet?.map((b: any) => (
                    <td key={b.financial_year} style={{ padding: '12px 18px', color: '#e2e8f0', fontWeight: 500 }}>
                      ₹{(b.current_assets_cr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 18px', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.08)', marginRight: '8px', fontSize: '0.75rem', fontWeight: 700 }}>+</span>
                    Non Current Assets (₹ Cr)
                  </td>
                  {company.balance_sheet?.map((b: any) => (
                    <td key={b.financial_year} style={{ padding: '12px 18px', color: '#cbd5e1', fontWeight: 500 }}>
                      ₹{(b.non_current_assets_cr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.3)', background: 'rgba(56, 189, 248, 0.06)' }}>
                  <td style={{ textAlign: 'left', padding: '14px 18px', fontWeight: 800, color: '#38bdf8' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.2)', marginRight: '8px', fontSize: '0.75rem', fontWeight: 800, color: '#38bdf8' }}>=</span>
                    Total Assets (₹ Cr)
                  </td>
                  {company.balance_sheet?.map((b: any) => (
                    <td key={b.financial_year} style={{ padding: '14px 18px', fontWeight: 800, color: '#38bdf8', fontSize: '0.92rem' }}>
                      ₹{b.total_assets_cr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 18px', color: 'var(--text-secondary)' }}>Current Liabilities (₹ Cr)</td>
                  {company.balance_sheet?.map((b: any) => (
                    <td key={b.financial_year} style={{ padding: '12px 18px', color: '#e2e8f0', fontWeight: 500 }}>
                      ₹{(b.current_liabilities_cr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 18px', color: 'var(--text-secondary)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.08)', marginRight: '8px', fontSize: '0.75rem', fontWeight: 700 }}>+</span>
                    Non Current Liabilities (₹ Cr)
                  </td>
                  {company.balance_sheet?.map((b: any) => (
                    <td key={b.financial_year} style={{ padding: '12px 18px', color: '#cbd5e1', fontWeight: 500 }}>
                      ₹{(b.non_current_liabilities_cr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(245, 158, 11, 0.3)', background: 'rgba(245, 158, 11, 0.06)' }}>
                  <td style={{ textAlign: 'left', padding: '14px 18px', fontWeight: 800, color: '#fbbf24' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', marginRight: '8px', fontSize: '0.75rem', fontWeight: 800, color: '#fbbf24' }}>=</span>
                    Total Liabilities (₹ Cr)
                  </td>
                  {company.balance_sheet?.map((b: any) => (
                    <td key={b.financial_year} style={{ padding: '14px 18px', fontWeight: 800, color: '#fbbf24', fontSize: '0.92rem' }}>
                      ₹{(b.total_liabilities_cr ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(74, 222, 128, 0.3)', background: 'rgba(16, 185, 129, 0.08)' }}>
                  <td style={{ textAlign: 'left', padding: '14px 18px', fontWeight: 800, color: '#4ade80' }}>Total Equity (₹ Cr)</td>
                  {company.balance_sheet?.map((b: any) => (
                    <td key={b.financial_year} style={{ padding: '14px 18px', fontWeight: 800, color: '#4ade80', fontSize: '0.95rem' }}>
                      ₹{b.total_equity_cr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(129, 140, 248, 0.3)', background: 'rgba(99, 102, 241, 0.08)' }}>
                  <td style={{ textAlign: 'left', padding: '14px 18px', fontWeight: 800, color: '#a5b4fc' }}>Total Liabilities & Shareholder&apos;s Equity (₹ Cr)</td>
                  {company.balance_sheet?.map((b: any) => (
                    <td key={b.financial_year} style={{ padding: '14px 18px', fontWeight: 800, color: '#a5b4fc', fontSize: '0.92rem' }}>
                      ₹{(b.total_liab_and_equity_cr ?? b.total_assets_cr).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <td style={{ textAlign: 'left', padding: '12px 18px', fontWeight: 600, color: '#cbd5e1' }}>Total Common Shares Outstanding (Cr)</td>
                  {company.balance_sheet?.map((b: any) => (
                    <td key={b.financial_year} style={{ padding: '12px 18px', fontWeight: 700, color: '#f1f5f9' }}>
                      {(b.common_shares_outstanding_cr ?? 0).toFixed(2)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'filings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {company.nse_filings.map((filing: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{filing.title}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Type: {filing.filing_type} • Broadcast: {filing.broadcast_date}
                  </div>
                </div>
                <a href={filing.file_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ fontSize: '0.8rem' }}>
                  <ExternalLink size={14} /> Open NSE PDF
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default function CompanyDetailPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <RefreshCw size={32} className="pulse-indicator" color="#6366f1" />
      </div>
    }>
      <CompanyDetailInner />
    </Suspense>
  );
}
