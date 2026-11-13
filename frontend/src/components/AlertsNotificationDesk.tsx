'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Send,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Radio,
  Clock,
  ShieldAlert,
  Save,
  MessageSquare,
  Play
} from 'lucide-react';
import { getApiBase } from '@/config/api';

interface NotificationLog {
  timestamp: string;
  channel: string;
  status: string;
  recipient: string;
  latency_ms: number;
  preview: string;
}

export default function AlertsNotificationDesk() {
  const [config, setConfig] = useState<any>(null);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Form states
  const [tgToken, setTgToken] = useState<string>('');
  const [tgChatId, setTgChatId] = useState<string>('');
  const [tgEnabled, setTgEnabled] = useState<boolean>(true);

  const [whUrl, setWhUrl] = useState<string>('');
  const [whAuth, setWhAuth] = useState<string>('');
  const [whEnabled, setWhEnabled] = useState<boolean>(true);

  const [ruleNewSignals, setRuleNewSignals] = useState<boolean>(true);
  const [ruleTargetHits, setRuleTargetHits] = useState<boolean>(true);
  const [ruleSlHits, setRuleSlHits] = useState<boolean>(true);

  const fetchConfigAndLogs = useCallback(async () => {
    try {
      const [rCfg, rLogs] = await Promise.all([
        fetch(`${getApiBase()}/api/notifications/config`),
        fetch(`${getApiBase()}/api/notifications/logs`)
      ]);
      const dataCfg = await rCfg.json();
      const dataLogs = await rLogs.json();

      if (rCfg.ok) {
        setConfig(dataCfg);
        setTgToken(dataCfg.telegram?.bot_token || '');
        setTgChatId(dataCfg.telegram?.chat_id || '');
        setTgEnabled(dataCfg.telegram?.is_enabled ?? true);

        setWhUrl(dataCfg.webhook?.webhook_url || '');
        setWhAuth(dataCfg.webhook?.auth_header || '');
        setWhEnabled(dataCfg.webhook?.is_enabled ?? true);

        setRuleNewSignals(dataCfg.rules?.broadcast_new_signals ?? true);
        setRuleTargetHits(dataCfg.rules?.broadcast_target_hits ?? true);
        setRuleSlHits(dataCfg.rules?.broadcast_sl_hits ?? true);
      }
      if (rLogs.ok) {
        setLogs(dataLogs.logs || []);
      }
    } catch (e) {
      console.error('Failed to load alert config:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigAndLogs();
  }, [fetchConfigAndLogs]);

  const handleSaveConfig = async () => {
    setActionMsg(null);
    try {
      const res = await fetch(`${getApiBase()}/api/notifications/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram: {
            is_enabled: tgEnabled,
            bot_token: tgToken,
            chat_id: tgChatId
          },
          webhook: {
            is_enabled: whEnabled,
            webhook_url: whUrl,
            auth_header: whAuth
          },
          rules: {
            broadcast_new_signals: ruleNewSignals,
            broadcast_target_hits: ruleTargetHits,
            broadcast_sl_hits: ruleSlHits
          }
        })
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg('Alert settings saved successfully.');
        fetchConfigAndLogs();
      }
    } catch (e: any) {
      setActionMsg(`Save failed: ${e.message}`);
    }
  };

  const handleTestTelegram = async () => {
    setActionMsg('Sending test Telegram alert...');
    try {
      const res = await fetch(`${getApiBase()}/api/notifications/test-telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_token: tgToken, chat_id: tgChatId })
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Telegram Test: ${data.message} (${data.latency_ms}ms)`);
        fetchConfigAndLogs();
      }
    } catch (e: any) {
      setActionMsg(`Telegram test failed: ${e.message}`);
    }
  };

  const handleTestWebhook = async () => {
    setActionMsg('Dispatching test Webhook...');
    try {
      const res = await fetch(`${getApiBase()}/api/notifications/test-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_url: whUrl })
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Webhook Test: ${data.message} (${data.latency_ms}ms)`);
        fetchConfigAndLogs();
      }
    } catch (e: any) {
      setActionMsg(`Webhook test failed: ${e.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner */}
      <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell size={20} color="#38bdf8" />
              Real-Time Alerts &amp; Notification Engine
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.80rem', color: 'var(--text-muted)' }}>
              Broadcast automated trade signals, entry triggers, stop-loss hits, and target milestones to Telegram channels and universal webhooks.
            </p>
          </div>
          <button
            onClick={handleSaveConfig}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '0.80rem', fontWeight: 700 }}
          >
            <Save size={15} />
            Save Alert Configuration
          </button>
        </div>

        {actionMsg && (
          <div style={{ padding: '8px 12px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid #38bdf8', borderRadius: 'var(--radius-md)', color: '#38bdf8', fontSize: '0.80rem' }}>
            {actionMsg}
          </div>
        )}
      </div>

      {/* Two Column Setup: Telegram & Webhook */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Telegram Channel Card */}
        <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={18} color="#0088cc" />
              Telegram Bot Channel
            </h4>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={tgEnabled} onChange={(e) => setTgEnabled(e.target.checked)} />
              <span>Broadcast Enabled</span>
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)' }}>BOT TOKEN</label>
              <input
                type="password"
                placeholder="e.g. 7891234567:AAHk..."
                value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
                className="input-field"
                style={{ width: '100%', marginTop: '4px', padding: '8px' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)' }}>CHANNEL / CHAT ID</label>
              <input
                type="text"
                placeholder="e.g. @algorobot_signals or -10012345678"
                value={tgChatId}
                onChange={(e) => setTgChatId(e.target.value)}
                className="input-field"
                style={{ width: '100%', marginTop: '4px', padding: '8px' }}
              />
            </div>

            <button
              onClick={handleTestTelegram}
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: '6px', padding: '8px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Send size={14} />
              Send Test Telegram Alert
            </button>
          </div>
        </div>

        {/* Universal Webhook Card */}
        <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Globe size={18} color="#10b981" />
              Universal Webhook Dispatcher
            </h4>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={whEnabled} onChange={(e) => setWhEnabled(e.target.checked)} />
              <span>Broadcast Enabled</span>
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)' }}>WEBHOOK URL</label>
              <input
                type="text"
                placeholder="https://your-domain.com/webhook or Discord/Slack URL"
                value={whUrl}
                onChange={(e) => setWhUrl(e.target.value)}
                className="input-field"
                style={{ width: '100%', marginTop: '4px', padding: '8px' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.70rem', fontWeight: 700, color: 'var(--text-muted)' }}>AUTHORIZATION HEADER (OPTIONAL)</label>
              <input
                type="password"
                placeholder="Bearer your_secret_token"
                value={whAuth}
                onChange={(e) => setWhAuth(e.target.value)}
                className="input-field"
                style={{ width: '100%', marginTop: '4px', padding: '8px' }}
              />
            </div>

            <button
              onClick={handleTestWebhook}
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: '6px', padding: '8px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Send size={14} />
              Send Test Webhook Ping
            </button>
          </div>
        </div>
      </div>

      {/* Alert Rules & Delivery Audit Log */}
      <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 800 }}>
          Notification Trigger Rules
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.80rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={ruleNewSignals} onChange={(e) => setRuleNewSignals(e.target.checked)} />
            <span>Broadcast New Strategy Signals (BUY/SELL)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.80rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={ruleTargetHits} onChange={(e) => setRuleTargetHits(e.target.checked)} />
            <span>Broadcast Target Milestones Hit (T1/T2)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.80rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={ruleSlHits} onChange={(e) => setRuleSlHits(e.target.checked)} />
            <span>Broadcast Stop-Loss Triggers</span>
          </label>
        </div>
      </div>

      {/* Recent Notification Logs */}
      {logs.length > 0 && (
        <div className="card" style={{ padding: '20px', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 800 }}>
            Recent Notification Deliveries ({logs.length})
          </h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Channel</th>
                  <th style={{ padding: '8px' }}>Recipient</th>
                  <th style={{ padding: '8px' }}>Latency</th>
                  <th style={{ padding: '8px' }}>Message Preview</th>
                  <th style={{ padding: '8px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice().reverse().map((lg, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{lg.channel}</td>
                    <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{lg.recipient}</td>
                    <td style={{ padding: '8px' }}>{lg.latency_ms}ms</td>
                    <td style={{ padding: '8px' }}>{lg.preview}</td>
                    <td style={{ padding: '8px' }}>
                      <span className="badge badge-success" style={{ fontSize: '0.62rem' }}>
                        {lg.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

