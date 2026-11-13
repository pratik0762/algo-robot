'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  ExternalLink,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { getApiBase } from '@/config/api';
import NseChartSignalModal from '@/components/NseChartSignalModal';

export interface TradeSignalItem {
  id: string;
  symbol: string;
  company_name: string;
  sector: string;
  market_cap_category: 'LARGE_CAP' | 'MID_CAP' | 'SMALL_CAP';
  market_cap_cr: number;
  type: 'BUY' | 'SELL';
  strength: string;
  strategy_id: string;
  strategy_name: string;
  strategy_badge?: string;
  current_price: number;
  entry_price: number;
  stop_loss: number;
  target_1: number;
  target_2: number;
  risk_reward: string;
  indicator_reason: string;
  execution_advice: string;
  issued_at: string;
  timestamp_ms: number;
  time_elapsed: string;
  timeframe: string;
  confidence_score?: number;
  nse_verified?: boolean;
  status?: 'ACTIVE' | 'TARGET_1_HIT' | 'TARGET_2_HIT' | 'STOP_LOSS_HIT';
  offset_seconds?: number;
}

interface TradeSignalsContextType {
  signals: TradeSignalItem[];
  toastQueue: TradeSignalItem[];
  acknowledgeToast: () => void;
  clearAllToasts: () => void;
  openChartModal: (sig: TradeSignalItem) => void;
  closeChartModal: () => void;
  triggerSimulatedSignal: () => Promise<TradeSignalItem | null>;
  syncCountdown: number;
  refreshSignals: () => Promise<void>;
}

const TradeSignalsContext = createContext<TradeSignalsContextType | null>(null);

export function TradeSignalsProvider({ children }: { children: React.ReactNode }) {
  const [signals, setSignals] = useState<TradeSignalItem[]>([]);
  const [toastQueue, setToastQueue] = useState<TradeSignalItem[]>([]);
  const [selectedChartSignal, setSelectedChartSignal] = useState<TradeSignalItem | null>(null);
  const [isChartModalOpen, setIsChartModalOpen] = useState<boolean>(false);
  const [syncCountdown, setSyncCountdown] = useState<number>(6);
  const seenSignalIds = useRef<Set<string>>(new Set());

  // Web Audio Synth chime when a new signal arrives
  const playAudioChime = useCallback(() => {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch (_) {}
  }, []);

  // Fetch Signals from backend (silent background polling)
  const fetchSignals = useCallback(async () => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/trade-signals`);
      if (res.ok) {
        const data = await res.json();
        const incoming: TradeSignalItem[] = data.signals || [];
        setSignals(incoming);

        // Populate seen IDs on first load
        if (seenSignalIds.current.size === 0) {
          incoming.forEach((s) => seenSignalIds.current.add(s.id));
        } else {
          // Detect brand new incoming signals
          const newSignals = incoming.filter((s) => !seenSignalIds.current.has(s.id));
          if (newSignals.length > 0) {
            newSignals.forEach((s) => seenSignalIds.current.add(s.id));
            setToastQueue((prev) => [...prev, ...newSignals]);
            playAudioChime();
          }
        }
      }
    } catch (err) {
      console.warn('Silent signal poll failed:', err);
    } finally {
      setSyncCountdown(6);
    }
  }, [playAudioChime]);

  // Global background sync loop (runs on EVERY page)
  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 6000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  // Countdown timer for next sync
  useEffect(() => {
    const timer = setInterval(() => {
      setSyncCountdown((prev) => (prev <= 1 ? 6 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Acknowledge single toast
  const acknowledgeToast = useCallback(() => {
    setToastQueue((prev) => prev.slice(1));
  }, []);

  // Clear all queued toasts
  const clearAllToasts = useCallback(() => {
    setToastQueue([]);
  }, []);

  // Open Chart Modal
  const openChartModal = useCallback((sig: TradeSignalItem) => {
    setSelectedChartSignal(sig);
    setIsChartModalOpen(true);
  }, []);

  // Close Chart Modal
  const closeChartModal = useCallback(() => {
    setIsChartModalOpen(false);
  }, []);

  // Manual trigger to simulate a new live signal event
  const triggerSimulatedSignal = useCallback(async (): Promise<TradeSignalItem | null> => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/trade-signals/trigger`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const newSig: TradeSignalItem = data.signal;
        if (newSig) {
          seenSignalIds.current.add(newSig.id);
          setSignals((prev) => [newSig, ...prev]);
          setToastQueue((prev) => [newSig, ...prev]);
          playAudioChime();
          return newSig;
        }
      }
    } catch (err) {
      console.error('Failed to trigger simulated signal:', err);
    }
    return null;
  }, [playAudioChime]);

  return (
    <TradeSignalsContext.Provider
      value={{
        signals,
        toastQueue,
        acknowledgeToast,
        clearAllToasts,
        openChartModal,
        closeChartModal,
        triggerSimulatedSignal,
        syncCountdown,
        refreshSignals: fetchSignals
      }}
    >
      {children}

      {/* ========================================================================= */}
      {/* GLOBAL PERSISTENT TOAST NOTIFICATION (BOTTOM-LEFT CORNER)                 */}
      {/* Visible regardless of what page the user is on!                            */}
      {/* Must remain visible until user explicitly clicks the 'OK' button          */}
      {/* ========================================================================= */}
      {toastQueue.length > 0 && (() => {
        const activeToast = toastQueue[0];
        const pendingCount = toastQueue.length;
        const isBuy = activeToast.type === 'BUY';

        return (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              position: 'fixed',
              bottom: '24px',
              left: '24px',
              zIndex: 999999,
              maxWidth: '460px',
              width: 'calc(100vw - 48px)',
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(10, 15, 29, 0.98) 100%)',
              backdropFilter: 'blur(20px)',
              border: isBuy ? '2px solid #10b981' : '2px solid #ef4444',
              borderRadius: '16px',
              padding: '18px 20px',
              boxShadow: isBuy
                ? '0 16px 50px -4px rgba(16, 185, 129, 0.5), 0 0 30px rgba(16, 185, 129, 0.3)'
                : '0 16px 50px -4px rgba(239, 68, 68, 0.5), 0 0 30px rgba(239, 68, 68, 0.3)',
              animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              boxSizing: 'border-box'
            }}
          >
            {/* Toast Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  className="pulse-indicator"
                  style={{
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    background: isBuy ? '#10b981' : '#ef4444',
                    boxShadow: isBuy ? '0 0 12px #10b981' : '0 0 12px #ef4444'
                  }}
                />
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: isBuy ? '#34d399' : '#f87171'
                  }}
                >
                  NEW TRADE SIGNAL DETECTED
                </span>
                {pendingCount > 1 && (
                  <span style={{ background: 'rgba(255, 255, 255, 0.15)', color: '#ffffff', fontSize: '0.62rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                    1 of {pendingCount} Pending
                  </span>
                )}
              </div>

              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {activeToast.issued_at}
              </span>
            </div>

            {/* Toast Body */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  background: isBuy ? '#10b981' : '#ef4444',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '0.95rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  flexShrink: 0,
                  boxShadow: isBuy ? '0 0 14px rgba(16, 185, 129, 0.4)' : '0 0 14px rgba(239, 68, 68, 0.4)'
                }}
              >
                {isBuy ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                <span>{activeToast.type}</span>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#ffffff' }}>
                  {activeToast.symbol} &bull; ₹{activeToast.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  {activeToast.strategy_name} &bull; {activeToast.market_cap_category.replace('_', '-')} &bull;{' '}
                  <strong style={{ color: '#38bdf8' }}>{activeToast.timeframe.toUpperCase()} TIMEFRAME</strong>
                </div>
              </div>
            </div>

            {/* Strategy Details Strip */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '0.72rem',
                color: '#e2e8f0',
                marginBottom: '14px',
                lineHeight: 1.4,
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              <strong style={{ color: '#38bdf8' }}>{activeToast.indicator_reason}</strong>
              <br />
              Entry: <strong>₹{activeToast.entry_price}</strong> &bull; SL:{' '}
              <span style={{ color: '#f87171' }}>₹{activeToast.stop_loss}</span> &bull; T1:{' '}
              <span style={{ color: '#34d399' }}>₹{activeToast.target_1}</span>
            </div>

            {/* Toast Footer with Chart Icon Button & Prominent 'OK' Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ fontSize: '0.66rem', color: '#cbd5e1', fontWeight: 600 }}>
                📌 Stays until you click OK
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Chart Icon Button (User Requested: opens chart directly with Long/Short indicator) */}
                <button
                  onClick={() => openChartModal(activeToast)}
                  className="btn"
                  style={{
                    background: isBuy ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    border: isBuy ? '1px solid #10b981' : '1px solid #ef4444',
                    color: isBuy ? '#34d399' : '#f87171',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontWeight: 800,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: isBuy ? '0 0 10px rgba(16, 185, 129, 0.25)' : '0 0 10px rgba(239, 68, 68, 0.25)'
                  }}
                  title="Open live NSE chart with Long/Short indicator"
                >
                  <BarChart2 size={15} />
                  <span>NSE Chart</span>
                </button>

                {pendingCount > 1 && (
                  <button
                    onClick={clearAllToasts}
                    className="btn btn-secondary"
                    style={{
                      fontSize: '0.72rem',
                      padding: '6px 10px',
                      color: 'var(--text-muted)',
                      border: '1px solid rgba(255, 255, 255, 0.15)'
                    }}
                    title="Dismiss all queued alerts"
                  >
                    Clear
                  </button>
                )}

                {/* Prominent OK Button */}
                <button
                  onClick={acknowledgeToast}
                  className="btn"
                  style={{
                    background: isBuy
                      ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                      : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 22px',
                    fontWeight: 900,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                    boxShadow: isBuy
                      ? '0 0 16px rgba(16, 185, 129, 0.5)'
                      : '0 0 16px rgba(239, 68, 68, 0.5)',
                    transition: 'transform 0.1s ease'
                  }}
                  title="Acknowledge and dismiss this notification"
                >
                  {pendingCount > 1 ? 'OK (Next)' : 'OK'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Global Interactive NSE Chart with Long/Short Indicator Modal */}
      <NseChartSignalModal
        isOpen={isChartModalOpen}
        onClose={closeChartModal}
        signal={selectedChartSignal}
      />
    </TradeSignalsContext.Provider>
  );
}

export function useTradeSignals() {
  const context = useContext(TradeSignalsContext);
  if (!context) {
    throw new Error('useTradeSignals must be used within a TradeSignalsProvider');
  }
  return context;
}

