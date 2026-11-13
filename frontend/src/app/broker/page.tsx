'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ShieldCheck,
  Menu,
  ChevronRight,
  Zap,
  Activity,
  Layers,
  CheckCircle2,
  Lock,
  ArrowRight
} from 'lucide-react';
import IndicesBarometer from '@/components/IndicesBarometer';
import LiveBrokerDesk from '@/components/LiveBrokerDesk';

const NavigationDrawer = dynamic(() => import('@/components/NavigationDrawer'), {
  ssr: false,
  loading: () => null
});

function BrokerContent() {
  const [navDrawerOpen, setNavDrawerOpen] = useState<boolean>(false);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--text-primary)' }}>
      {/* Top Benchmark Indices Barometer */}
      <IndicesBarometer />

      {/* Main Container */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px 80px 20px' }}>
        {/* Breadcrumb Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          <button
            onClick={() => setNavDrawerOpen(true)}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '4px 8px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.74rem'
            }}
          >
            <Menu size={13} />
            <span>Navigation Hub</span>
          </button>
          <ChevronRight size={14} />
          <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
            Algo Robot
          </Link>
          <ChevronRight size={14} />
          <span style={{ color: '#10b981', fontWeight: 700 }}>Broker API Integration</span>
        </div>

        {/* Page Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '24px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)'
              }}
            >
              <ShieldCheck size={26} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 900, margin: 0, color: '#ffffff', letterSpacing: '-0.02em' }}>
                  Broker
                </h1>
                <span
                  style={{
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    color: '#ffffff',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.66rem',
                    fontWeight: 800,
                    letterSpacing: '0.04em'
                  }}
                >
                  LIVE OMS / RMS
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
                Connect, manage, and monitor your trading broker accounts from one place.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link
              href="/strategy"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.82rem',
                fontWeight: 700,
                padding: '9px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                color: '#818cf8',
                textDecoration: 'none'
              }}
            >
              <Layers size={15} />
              <span>Strategy Lab</span>
            </Link>

            <Link
              href="/signals"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.82rem',
                fontWeight: 700,
                padding: '9px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#f87171',
                textDecoration: 'none'
              }}
            >
              <Zap size={15} />
              <span>Trade Signals</span>
            </Link>
          </div>
        </div>

        {/* Live Broker Desk Component */}
        <LiveBrokerDesk />

        {/* Navigation Hub Drawer */}
        <NavigationDrawer isOpen={navDrawerOpen} onClose={() => setNavDrawerOpen(false)} />
      </div>
    </div>
  );
}

export default function BrokerPage() {
  return (
    <React.Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0d14' }} />}>
      <BrokerContent />
    </React.Suspense>
  );
}
