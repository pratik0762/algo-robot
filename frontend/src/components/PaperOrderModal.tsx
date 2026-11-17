'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Percent,
  Clock,
  ArrowRight,
  Info,
  Sliders,
  Layers,
  Zap,
} from 'lucide-react';
import { getApiBase } from '@/config/api';

export interface PaperOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  companyName?: string;
  initialSide?: 'BUY' | 'SELL';
  initialPrice?: number;
  initialStopLoss?: number;
  initialTarget?: number;
  onOrderPlaced?: (order: any) => void;
}

export type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
export type ProductType = 'MIS' | 'CNC' | 'NRML';
export type ExecutionMode = 'PAPER' | 'LIVE';

export default function PaperOrderModal({
  isOpen,
  onClose,
  symbol,
  companyName,
  initialSide = 'BUY',
  initialPrice = 1000.0,
  initialStopLoss,
  initialTarget,
  onOrderPlaced,
}: PaperOrderModalProps) {
  const [side, setSide] = useState<'BUY' | 'SELL'>(initialSide);
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [productType, setProductType] = useState<ProductType>('MIS');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('PAPER');

  const [quantity, setQuantity] = useState<number>(10);
  const [price, setPrice] = useState<number>(initialPrice || 1000.0);
  const [triggerPrice, setTriggerPrice] = useState<number>(initialPrice ? round2(initialPrice * 0.99) : 990.0);
  const [stopLoss, setStopLoss] = useState<number | ''>(initialStopLoss || '');
  const [target, setTarget] = useState<number | ''>(initialTarget || '');

  // Loading & Submission State
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<any | null>(null);

  // Sync initial side and price when modal opens
  useEffect(() => {
    if (isOpen) {
      setSide(initialSide);
      if (initialPrice && initialPrice > 0) {
        setPrice(round2(initialPrice));
        setTriggerPrice(round2(initialSide === 'BUY' ? initialPrice * 0.99 : initialPrice * 1.01));
      }
      if (initialStopLoss) setStopLoss(initialStopLoss);
      if (initialTarget) setTarget(initialTarget);
      setSuccessOrder(null);
      setErrorMsg(null);
    }
  }, [isOpen, initialSide, initialPrice, initialStopLoss, initialTarget]);

  function round2(val: number): number {
    return Math.round(val * 100) / 100;
  }

  // Active Trade Execution Value
  const effectivePrice = orderType === 'MARKET' ? (initialPrice || price) : price;
  const turnover = round2(effectivePrice * quantity);

  // Indian Statutory Friction Breakdown (SEBI / NSE / STT Model)
  const friction = useMemo(() => {
    const isDelivery = productType === 'CNC';
    const isSell = side === 'SELL';

    // 1. STT / CTT
    let stt = 0;
    if (isDelivery) {
      stt = turnover * 0.001; // 0.1% on buy & sell
    } else if (isSell) {
      stt = turnover * 0.00025; // 0.025% on intraday sell
    }

    // 2. Exchange Turnover Charge (NSE: 0.00297%)
    const exchangeCharge = turnover * 0.0000297;

    // 3. SEBI Turnover Fee (₹10 per crore = 0.0001%)
    const sebiCharge = turnover * 0.000001;

    // 4. Brokerage (Zero / ₹20 Flat)
    const brokerage = 0.0;

    // 5. GST (18% on Brokerage + Exchange Charge + SEBI)
    const gst = (brokerage + exchangeCharge + sebiCharge) * 0.18;

    // 6. Stamp Duty (on Buy orders only)
    let stampDuty = 0;
    if (!isSell) {
      stampDuty = isDelivery ? turnover * 0.00015 : turnover * 0.00003;
    }

    const totalFriction = round2(stt + exchangeCharge + sebiCharge + brokerage + gst + stampDuty);
    const breakevenPoints = quantity > 0 ? round2(totalFriction / quantity) : 0;

    return {
      stt: round2(stt),
      exchangeCharge: round2(exchangeCharge),
      sebiCharge: round2(sebiCharge),
      gst: round2(gst),
      stampDuty: round2(stampDuty),
      totalFriction,
      breakevenPoints,
    };
  }, [turnover, side, productType, quantity]);

  // Risk & Reward Projections
  const riskReward = useMemo(() => {
    if (typeof stopLoss !== 'number' || typeof target !== 'number') return null;
    const isBuy = side === 'BUY';
    const riskPerShare = isBuy ? effectivePrice - stopLoss : stopLoss - effectivePrice;
    const rewardPerShare = isBuy ? target - effectivePrice : effectivePrice - target;

    if (riskPerShare <= 0 || rewardPerShare <= 0) return null;

    const rrRatio = round2(rewardPerShare / riskPerShare);
    const totalRisk = round2(riskPerShare * quantity);
    const totalReward = round2(rewardPerShare * quantity);

    return {
      riskPerShare: round2(riskPerShare),
      rewardPerShare: round2(rewardPerShare),
      rrRatio,
      totalRisk,
      totalReward,
    };
  }, [effectivePrice, stopLoss, target, quantity, side]);

  // Place Order API Handler
  const handlePlaceOrder = async () => {
    setSubmitting(true);
    setErrorMsg(null);

    const payload = {
      symbol: symbol.toUpperCase().trim(),
      transaction_type: side,
      order_type: orderType,
      quantity: Number(quantity),
      price: orderType === 'MARKET' ? 0.0 : Number(price),
      trigger_price: orderType === 'SL' || orderType === 'SL-M' ? Number(triggerPrice) : 0.0,
      product_type: productType,
      exchange: 'NSE',
      execution_mode: executionMode,
      broker_name: executionMode === 'PAPER' ? 'PAPER' : 'ZERODHA',
      stop_loss: typeof stopLoss === 'number' ? stopLoss : null,
      target: typeof target === 'number' ? target : null,
      tag: 'WEB_TERMINAL',
    };

    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/orders/place`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.status === 'rejected') {
        const detail = data.detail || (data.order && data.order.rejection_reason) || 'Order rejected by Risk Guardian.';
        setErrorMsg(detail);
      } else {
        setSuccessOrder(data.order);
        if (onOrderPlaced) onOrderPlaced(data.order);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error communicating with OMS execution server.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(2, 6, 23, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#090d16',
          border: '1px solid rgba(51, 65, 85, 0.6)',
          borderRadius: '18px',
          width: '100%',
          maxWidth: '540px',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85)',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(51, 65, 85, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: side === 'BUY' ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: side === 'BUY' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: side === 'BUY' ? '#34d399' : '#f87171',
              }}
            >
              {side === 'BUY' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 900 }}>{symbol}</span>
                <span
                  style={{
                    fontSize: '0.66rem',
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: executionMode === 'PAPER' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: executionMode === 'PAPER' ? '#38bdf8' : '#fbbf24',
                    border: `1px solid ${executionMode === 'PAPER' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                  }}
                >
                  {executionMode} DESK
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                {companyName || 'NSE Blue-Chip'} &bull; LTP: ₹{effectivePrice.toFixed(2)}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Side Toggle: BUY vs SELL */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              onClick={() => setSide('BUY')}
              style={{
                padding: '10px',
                borderRadius: '8px',
                fontSize: '0.88rem',
                fontWeight: 900,
                border: side === 'BUY' ? '2px solid #10b981' : '1px solid rgba(51, 65, 85, 0.4)',
                background: side === 'BUY' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(15, 23, 42, 0.6)',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: side === 'BUY' ? '0 4px 14px rgba(16, 185, 129, 0.3)' : 'none',
              }}
            >
              <TrendingUp size={16} /> BUY / LONG
            </button>
            <button
              onClick={() => setSide('SELL')}
              style={{
                padding: '10px',
                borderRadius: '8px',
                fontSize: '0.88rem',
                fontWeight: 900,
                border: side === 'SELL' ? '2px solid #ef4444' : '1px solid rgba(51, 65, 85, 0.4)',
                background: side === 'SELL' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'rgba(15, 23, 42, 0.6)',
                color: '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: side === 'SELL' ? '0 4px 14px rgba(239, 68, 68, 0.3)' : 'none',
              }}
            >
              <TrendingDown size={16} /> SELL / SHORT
            </button>
          </div>

          {/* Product Type (MIS / CNC / NRML) & Execution Mode */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                Product Type
              </label>
              <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                {(['MIS', 'CNC', 'NRML'] as ProductType[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setProductType(p)}
                    style={{
                      padding: '5px 12px',
                      fontSize: '0.74rem',
                      fontWeight: productType === p ? 800 : 600,
                      borderRadius: '6px',
                      border: `1px solid ${productType === p ? '#38bdf8' : 'rgba(51, 65, 85, 0.5)'}`,
                      background: productType === p ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                      color: productType === p ? '#38bdf8' : '#94a3b8',
                      cursor: 'pointer',
                    }}
                  >
                    {p} {p === 'MIS' ? '(Intraday)' : p === 'CNC' ? '(Delivery)' : '(Deriv)'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                Desk Mode
              </label>
              <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                {(['PAPER', 'LIVE'] as ExecutionMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setExecutionMode(m)}
                    style={{
                      padding: '5px 12px',
                      fontSize: '0.74rem',
                      fontWeight: executionMode === m ? 800 : 600,
                      borderRadius: '6px',
                      border: `1px solid ${executionMode === m ? '#a855f7' : 'rgba(51, 65, 85, 0.5)'}`,
                      background: executionMode === m ? 'rgba(168, 85, 247, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                      color: executionMode === m ? '#c084fc' : '#94a3b8',
                      cursor: 'pointer',
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Order Type Selector */}
          <div>
            <label style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
              Order Type
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '4px' }}>
              {(['MARKET', 'LIMIT', 'SL', 'SL-M'] as OrderType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setOrderType(t)}
                  style={{
                    padding: '8px',
                    fontSize: '0.76rem',
                    fontWeight: orderType === t ? 800 : 600,
                    borderRadius: '6px',
                    border: `1px solid ${orderType === t ? '#2563eb' : 'rgba(51, 65, 85, 0.5)'}`,
                    background: orderType === t ? 'rgba(37, 99, 235, 0.25)' : 'rgba(15, 23, 42, 0.6)',
                    color: orderType === t ? '#60a5fa' : '#94a3b8',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity & Quick Lots */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                Quantity (Shares)
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                {[1, 10, 25, 50, 100].map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuantity(q)}
                    style={{
                      padding: '2px 8px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      borderRadius: '4px',
                      border: '1px solid rgba(51, 65, 85, 0.4)',
                      background: quantity === q ? '#334155' : 'rgba(15, 23, 42, 0.4)',
                      color: quantity === q ? '#f8fafc' : '#94a3b8',
                      cursor: 'pointer',
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="number"
              min="1"
              max="50000"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              style={{
                width: '100%',
                padding: '10px 12px',
                marginTop: '6px',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(51, 65, 85, 0.6)',
                borderRadius: '8px',
                color: '#f8fafc',
                fontSize: '0.92rem',
                fontWeight: 700,
                outline: 'none',
              }}
            />
          </div>

          {/* Price & Trigger Price Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                Price (₹) {orderType === 'MARKET' ? '(At Market)' : ''}
              </label>
              <input
                type="number"
                step="0.05"
                disabled={orderType === 'MARKET'}
                value={orderType === 'MARKET' ? effectivePrice : price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  marginTop: '6px',
                  background: orderType === 'MARKET' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(51, 65, 85, 0.6)',
                  borderRadius: '8px',
                  color: orderType === 'MARKET' ? '#64748b' : '#f8fafc',
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                Trigger Price (₹)
              </label>
              <input
                type="number"
                step="0.05"
                disabled={orderType !== 'SL' && orderType !== 'SL-M'}
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(parseFloat(e.target.value) || 0)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  marginTop: '6px',
                  background: orderType !== 'SL' && orderType !== 'SL-M' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(51, 65, 85, 0.6)',
                  borderRadius: '8px',
                  color: orderType !== 'SL' && orderType !== 'SL-M' ? '#64748b' : '#f8fafc',
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Stop-Loss & Target Optional Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.70rem', color: '#f87171', fontWeight: 700, textTransform: 'uppercase' }}>
                Stop-Loss Price (₹)
              </label>
              <input
                type="number"
                step="0.05"
                placeholder="Optional SL"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value === '' ? '' : parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  marginTop: '6px',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  color: '#f87171',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.70rem', color: '#34d399', fontWeight: 700, textTransform: 'uppercase' }}>
                Target Price (₹)
              </label>
              <input
                type="number"
                step="0.05"
                placeholder="Optional Target"
                value={target}
                onChange={(e) => setTarget(e.target.value === '' ? '' : parseFloat(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  marginTop: '6px',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '8px',
                  color: '#34d399',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Risk-to-Reward Projection Card */}
          {riskReward && (
            <div
              style={{
                background: 'rgba(30, 41, 59, 0.4)',
                borderRadius: '8px',
                padding: '10px 14px',
                border: '1px solid rgba(51, 65, 85, 0.4)',
                fontSize: '0.76rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                R:R Ratio:{' '}
                <strong style={{ color: riskReward.rrRatio >= 1.5 ? '#34d399' : '#fbbf24' }}>
                  1 : {riskReward.rrRatio}
                </strong>
              </div>
              <div style={{ color: '#f87171' }}>
                Max Loss: -₹{riskReward.totalRisk.toFixed(2)}
              </div>
              <div style={{ color: '#34d399' }}>
                Max Gain: +₹{riskReward.totalReward.toFixed(2)}
              </div>
            </div>
          )}

          {/* Indian Statutory Friction Breakdown */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.5)',
              border: '1px solid rgba(51, 65, 85, 0.3)',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '0.74rem',
              color: '#94a3b8',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#f8fafc', marginBottom: '6px' }}>
              <span>Order Value: ₹{turnover.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              <span>Total Charges: ₹{friction.totalFriction.toFixed(2)}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '0.68rem' }}>
              <span>STT: ₹{friction.stt.toFixed(2)}</span>
              <span>Exch: ₹{friction.exchangeCharge.toFixed(2)}</span>
              <span>GST: ₹{friction.gst.toFixed(2)}</span>
              <span>Stamp: ₹{friction.stampDuty.toFixed(2)}</span>
              <span>SEBI: ₹{friction.sebiCharge.toFixed(2)}</span>
              <span style={{ color: '#38bdf8' }}>Breakeven: +₹{friction.breakevenPoints.toFixed(2)}</span>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#f87171',
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success Banner */}
          {successOrder && (
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '8px',
                padding: '12px 14px',
                color: '#34d399',
                fontSize: '0.78rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
                <CheckCircle2 size={16} />
                <span>Order Executed Successfully! State: {successOrder.state}</span>
              </div>
              <div style={{ marginTop: '6px', fontSize: '0.72rem', color: '#94a3b8' }}>
                Order ID: <strong style={{ color: '#f8fafc' }}>{successOrder.order_id}</strong> &bull; Avg Fill Price:{' '}
                <strong style={{ color: '#34d399' }}>₹{successOrder.average_price?.toFixed(2) || effectivePrice.toFixed(2)}</strong> &bull; Filled: {successOrder.filled_quantity} / {successOrder.quantity}
              </div>
            </div>
          )}

          {/* Place Order CTA Button */}
          <button
            onClick={handlePlaceOrder}
            disabled={submitting}
            style={{
              padding: '14px',
              borderRadius: '10px',
              fontSize: '0.96rem',
              fontWeight: 900,
              border: 'none',
              background: side === 'BUY'
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              color: '#ffffff',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: side === 'BUY'
                ? '0 6px 20px rgba(16, 185, 129, 0.35)'
                : '0 6px 20px rgba(239, 68, 68, 0.35)',
            }}
          >
            {submitting ? (
              <span>Validating Pre-Trade Risk Gates...</span>
            ) : (
              <>
                <span>
                  CONFIRM {side} {quantity} {symbol} ({productType})
                </span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
