'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Activity,
  DollarSign,
  Lock,
  ArrowRight,
  RefreshCw,
  Sliders,
  Send
} from 'lucide-react';
import { getApiBase } from '@/config/api';

interface BrokerProfile {
  broker: string;
  client_id: string;
  user_name: string;
  email: string;
  broker_status: string;
  exchanges: string[];
  products: string[];
}

interface BrokerFunds {
  available_cash: number;
  collateral: number;
  used_margin: number;
  total_balance: number;
  equity_margin: number;
}

interface BrokerCard {
  id: string;
  name: string;
  client_id: string;
  is_active: boolean;
  is_connected: boolean;
  funds: BrokerFunds;
  profile: BrokerProfile;
  last_auth: string | null;
}

export default function LiveBrokerDesk() {
  const [activeBroker, setActiveBroker] = useState<string>('PAPER_TRADING');
  const [brokers, setBrokers] = useState<BrokerCard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [switching, setSwitching] = useState<boolean>(false);
  const [positions, setPositions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  // Selected broker for credentials modal/form
  const [selectedBrokerForAuth, setSelectedBrokerForAuth] = useState<string>('ZERODHA');
  const [apiKey, setApiKey] = useState<string>('');
  const [apiSecret, setApiSecret] = useState<string>('');
  const [clientId, setClientId] = useState<string>('');
  const [totpSecret, setTotpSecret] = useState<string>('');
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  const fetchBrokersStatus = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/brokers/status`);
      const data = await res.json();
      if (res.ok) {
        setActiveBroker(data.active_broker);
        setBrokers(data.brokers || []);
      }
    } catch (e) {
      console.error('Failed to load broker status:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchActivePositionsAndOrders = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/brokers/positions-and-orders`);
      const data = await res.json();
      if (res.ok) {
        setPositions(data.positions || []);
        setOrders(data.orders || []);
      }
    } catch (e) {
      console.error('Failed to load positions:', e);
    }
  }, []);

  useEffect(() => {
    fetchBrokersStatus();
    fetchActivePositionsAndOrders();
  }, [fetchBrokersStatus, fetchActivePositionsAndOrders]);

  const handleSwitchActiveBroker = async (brokerId: string) => {
    setSwitching(true);
    try {
      const res = await fetch(`${getApiBase()}/api/brokers/active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker_id: brokerId })
      });
      const data = await res.json();
      if (res.ok) {
        setActiveBroker(brokerId);
        fetchBrokersStatus();
        fetchActivePositionsAndOrders();
      }
    } catch (e: any) {
      alert(`Failed to switch broker: ${e.message}`);
    } finally {
      setSwitching(false);
    }
  };

  const handleAuthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMsg(null);
    try {
      const res = await fetch(`${getApiBase()}/api/brokers/authenticate/${selectedBrokerForAuth}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          api_secret: apiSecret,
          client_id: clientId,
          totp_secret: totpSecret
        })
      });
      const data = await res.json();
      if (res.ok) {
        setAuthMsg(`Success: ${data.message}`);
        fetchBrokersStatus();
      } else {
        setAuthMsg(`Error: ${data.detail || 'Authentication failed'}`);
      }
    } catch (err: any) {
      setAuthMsg(`Error: ${err.message}`);
    }
  };

  const currentBrokerMeta = brokers.find((b) => b.id === activeBroker) || brokers[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Active Broker Switcher Banner */}
      <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={20} color="#10b981" />
              Live Broker API Integration Hub
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.80rem', color: 'var(--text-muted)' }}>
              Unified OMS/RMS order routing bridge supporting Zerodha Kite, Angel One, Dhan, and Upstox with TOTP automation.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>ACTIVE EXECUTION DESTINATION:</span>
            <span className={`badge ${activeBroker === 'PAPER_TRADING' ? 'badge-primary' : 'badge-danger'}`} style={{ padding: '6px 12px', fontSize: '0.72rem', fontWeight: 800 }}>
              {activeBroker === 'PAPER_TRADING' ? 'SIMULATED PAPER TRADING' : `LIVE BROKER: ${activeBroker}`}
            </span>
          </div>
        </div>

        {/* Broker Destination Selector Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
          {/* Paper Trading Option */}
          <div
            onClick={() => handleSwitchActiveBroker('PAPER_TRADING')}
            style={{
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              border: activeBroker === 'PAPER_TRADING' ? '2px solid #6366f1' : '1px solid var(--border-color)',
              background: activeBroker === 'PAPER_TRADING' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.02)',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <b style={{ fontSize: '0.90rem' }}>Virtual Paper Desk</b>
              {activeBroker === 'PAPER_TRADING' && <CheckCircle2 size={16} color="#6366f1" />}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Zero real financial risk. Trades filled in simulated real-time market.
            </div>
          </div>

          {/* Connected Real Brokers */}
          {brokers.map((b) => (
            <div
              key={b.id}
              onClick={() => handleSwitchActiveBroker(b.id)}
              style={{
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                border: activeBroker === b.id ? '2px solid #10b981' : '1px solid var(--border-color)',
                background: activeBroker === b.id ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.02)',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <b style={{ fontSize: '0.90rem' }}>{b.name}</b>
                {activeBroker === b.id && <CheckCircle2 size={16} color="#10b981" />}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>ID: {b.client_id}</span>
                <span className="badge badge-success" style={{ fontSize: '0.60rem' }}>READY</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active Broker Funds & Limits */}
      {currentBrokerMeta && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <div className="card" style={{ padding: '16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
            <span style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Available Cash Margin</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#38bdf8', marginTop: '4px' }}>
              ₹{currentBrokerMeta.funds.available_cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {currentBrokerMeta.name} Demat Pool
            </div>
          </div>

          <div className="card" style={{ padding: '16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
            <span style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Collateral Margin</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>
              ₹{currentBrokerMeta.funds.collateral.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Pledged Shares &amp; Liquid ETFs
            </div>
          </div>

          <div className="card" style={{ padding: '16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
            <span style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Used Margin</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f59e0b', marginTop: '4px' }}>
              ₹{currentBrokerMeta.funds.used_margin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Allocated across active orders
            </div>
          </div>

          <div className="card" style={{ padding: '16px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
            <span style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Portfolio Net Worth</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#ffffff', marginTop: '4px' }}>
              ₹{currentBrokerMeta.funds.total_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Cash + Collateral Equity
            </div>
          </div>
        </div>
      )}

      {/* Main Split: Broker Live Order Book & Credentials Setup */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Open Positions from Active Broker */}
        <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={16} color="#10b981" />
              Active Broker Open Positions ({positions.length})
            </h4>
            <button onClick={fetchActivePositionsAndOrders} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.70rem' }}>
              <RefreshCw size={12} />
            </button>
          </div>

          {positions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {positions.map((pos, idx) => (
                <div key={idx} style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <b>{pos.symbol}</b>
                      <span className="badge badge-primary" style={{ fontSize: '0.60rem' }}>{pos.product || 'MIS'}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{pos.quantity} Qty</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Buy: ₹{pos.buy_price} | LTP: ₹{pos.last_price}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: (pos.pnl || pos.m2m || 0) >= 0 ? '#10b981' : '#ef4444' }}>
                      {(pos.pnl || pos.m2m || 0) >= 0 ? '+' : ''}₹{(pos.pnl || pos.m2m || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.80rem' }}>
              No open positions currently reported by {activeBroker}.
            </div>
          )}
        </div>

        {/* Broker Credentials & Auth Form */}
        <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Lock size={16} color="#38bdf8" />
            Connect / Update Broker Credentials
          </h4>

          {authMsg && (
            <div style={{ padding: '8px 12px', background: authMsg.startsWith('Success') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${authMsg.startsWith('Success') ? '#10b981' : '#ef4444'}`, borderRadius: 'var(--radius-md)', color: authMsg.startsWith('Success') ? '#10b981' : '#ef4444', fontSize: '0.78rem', marginBottom: '12px' }}>
              {authMsg}
            </div>
          )}

          <form onSubmit={handleAuthenticate} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)' }}>SELECT BROKER</label>
              <select
                value={selectedBrokerForAuth}
                onChange={(e) => setSelectedBrokerForAuth(e.target.value)}
                className="select-field"
                style={{ width: '100%', marginTop: '4px', padding: '8px' }}
              >
                <option value="ZERODHA">Zerodha Kite Connect v3</option>
                <option value="ANGEL_ONE">Angel One SmartAPI</option>
                <option value="DHAN">Dhan HQ v2</option>
                <option value="UPSTOX">Upstox API v2</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)' }}>CLIENT ID / CODE</label>
                <input
                  type="text"
                  placeholder="e.g. ZR9081"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', marginTop: '4px', padding: '8px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)' }}>API KEY</label>
                <input
                  type="password"
                  placeholder="API Key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', marginTop: '4px', padding: '8px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)' }}>API SECRET / ENCTOKEN</label>
                <input
                  type="password"
                  placeholder="Secret or Enctoken"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', marginTop: '4px', padding: '8px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)' }}>TOTP SECRET (2FA)</label>
                <input
                  type="password"
                  placeholder="Base32 TOTP Key"
                  value={totpSecret}
                  onChange={(e) => setTotpSecret(e.target.value)}
                  className="input-field"
                  style={{ width: '100%', marginTop: '4px', padding: '8px' }}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '6px', padding: '10px', fontSize: '0.82rem', fontWeight: 700 }}
            >
              Verify &amp; Connect {selectedBrokerForAuth}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
