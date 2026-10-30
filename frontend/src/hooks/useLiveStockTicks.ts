'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getApiBase, getWsBase } from '@/config/api';

export interface StockTickData {
  symbol: string;
  ltp: number;
  change: number;
  percent_change: number;
  open: number;
  high: number;
  low: number;
  previous_close: number;
  volume: number;
  bid: number;
  ask: number;
  last_tick_direction: 'UP' | 'DOWN' | 'FLAT';
  last_tick_time: string;
}

export interface GiftNiftyLive {
  name: string;
  symbol: string;
  exchange: string;
  contract: string;
  source?: string;
  tv_symbol?: string;
  last_price: number;
  change: number;
  percent_change: number;
  open: number;
  high: number;
  low: number;
  previous_close: number;
  underlying_spot: number;
  basis_premium: number;
  volume_contracts: number;
  session_info: {
    is_open: boolean;
    session: string;
    session_name: string;
    status_label: string;
    trading_hours: string;
    badge: string;
  };
  is_trading_active: boolean;
  trading_session: string;
  badge: string;
  status: string;
  last_tick_direction?: 'UP' | 'DOWN' | 'FLAT';
  last_tick_time?: string;
}

export function useLiveStockTicks() {
  const [ticks, setTicks] = useState<Record<string, StockTickData>>({});
  const [giftNifty, setGiftNifty] = useState<GiftNiftyLive | null>(null);
  const [flashMap, setFlashMap] = useState<Record<string, 'UP' | 'DOWN'>>({});
  const [giftFlash, setGiftFlash] = useState<'UP' | 'DOWN' | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isMarketOpen, setIsMarketOpen] = useState<boolean>(false);
  const [marketStatus, setMarketStatus] = useState<string>('');
  const [tickCount, setTickCount] = useState<number>(0);
  const [lastTickTime, setLastTickTime] = useState<string>('');

  const flashTimeouts = useRef<Record<string, NodeJS.Timeout>>({});
  const giftFlashTimeout = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const handleIncomingTicks = useCallback((updatedList: StockTickData[]) => {
    if (!updatedList || updatedList.length === 0) return;

    const newFlash: Record<string, 'UP' | 'DOWN'> = {};

    setTicks((prev) => {
      const next = { ...prev };
      for (const item of updatedList) {
        const old = prev[item.symbol];
        if (old && old.ltp !== item.ltp) {
          const dir = item.ltp > old.ltp ? 'UP' : 'DOWN';
          newFlash[item.symbol] = dir;
        }
        next[item.symbol] = item;
      }
      return next;
    });

    // Trigger visual tick flash animation
    if (Object.keys(newFlash).length > 0) {
      setFlashMap((prev) => ({ ...prev, ...newFlash }));

      for (const sym of Object.keys(newFlash)) {
        if (flashTimeouts.current[sym]) {
          clearTimeout(flashTimeouts.current[sym]);
        }
        flashTimeouts.current[sym] = setTimeout(() => {
          setFlashMap((prev) => {
            const copy = { ...prev };
            delete copy[sym];
            return copy;
          });
        }, 500);
      }
    }

    setTickCount((prev) => prev + updatedList.length);
    setLastTickTime(new Date().toLocaleTimeString());
  }, []);

  useEffect(() => {
    let sse: EventSource | null = null;
    let pollInterval: NodeJS.Timeout | null = null;

    const apiBase = getApiBase();
    const wsBase = getWsBase();

    // 1. Initial REST snapshot to instantly populate prices with 0ms delay
    fetch(`${apiBase}/api/stocks/live-ticks`)
      .then((res) => res.json())
      .then((data) => {
        if (data.stocks) {
          const initialMap: Record<string, StockTickData> = {};
          data.stocks.forEach((s: StockTickData) => {
            initialMap[s.symbol] = s;
          });
          setTicks(initialMap);
          setIsConnected(true);
          if (data.gift_nifty) {
            setGiftNifty(data.gift_nifty);
          }
          if (data.is_market_open !== undefined) {
            setIsMarketOpen(Boolean(data.is_market_open));
          }
          if (data.market_status) {
            setMarketStatus(data.market_status);
          }
        }
      })
      .catch((err) => console.error('Initial tick snapshot error:', err));

    // 2. Try WebSocket for sub-second bidirectional streaming
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket(`${wsBase}/ws/live-ticks`);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'SNAPSHOT') {
              if (data.stocks) {
                const snapshotMap: Record<string, StockTickData> = {};
                data.stocks.forEach((s: StockTickData) => {
                  snapshotMap[s.symbol] = s;
                });
                setTicks(snapshotMap);
              }
              if (data.gift_nifty) {
                setGiftNifty(data.gift_nifty);
              }
              if (data.is_market_open !== undefined) {
                setIsMarketOpen(Boolean(data.is_market_open));
              }
              if (data.market_status) {
                setMarketStatus(data.market_status);
              }
            } else if (data.type === 'TICK' && data.ticks) {
              handleIncomingTicks(data.ticks);
            } else if (data.type === 'GIFT_NIFTY_TICK' && data.gift_nifty) {
              const g = data.gift_nifty;
              setGiftNifty((prev) => {
                if (prev && prev.last_price !== g.last_price) {
                  const dir = g.last_price > prev.last_price ? 'UP' : 'DOWN';
                  setGiftFlash(dir);
                  if (giftFlashTimeout.current) clearTimeout(giftFlashTimeout.current);
                  giftFlashTimeout.current = setTimeout(() => setGiftFlash(null), 600);
                }
                return g;
              });
            }
          } catch (e) {
            console.error('Error parsing tick message:', e);
          }
        };

        ws.onerror = () => {
          fallbackToSSE();
        };

        ws.onclose = () => {
          setIsConnected(false);
          // Try SSE on close
          fallbackToSSE();
        };
      } catch (e) {
        fallbackToSSE();
      }
    };

    // 3. Fallback to Server-Sent Events (SSE) if WebSocket is unavailable
    const fallbackToSSE = () => {
      if (sse) return;
      try {
        sse = new EventSource(`${apiBase}/api/ticks/stream`);
        sse.onopen = () => setIsConnected(true);
        sse.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'SNAPSHOT') {
              if (data.stocks) {
                const snapshotMap: Record<string, StockTickData> = {};
                data.stocks.forEach((s: StockTickData) => {
                  snapshotMap[s.symbol] = s;
                });
                setTicks(snapshotMap);
              }
              if (data.gift_nifty) {
                setGiftNifty(data.gift_nifty);
              }
              if (data.is_market_open !== undefined) {
                setIsMarketOpen(Boolean(data.is_market_open));
              }
              if (data.market_status) {
                setMarketStatus(data.market_status);
              }
            } else if (data.type === 'TICK' && data.ticks) {
              handleIncomingTicks(data.ticks);
            } else if (data.type === 'GIFT_NIFTY_TICK' && data.gift_nifty) {
              const g = data.gift_nifty;
              setGiftNifty((prev) => {
                if (prev && prev.last_price !== g.last_price) {
                  const dir = g.last_price > prev.last_price ? 'UP' : 'DOWN';
                  setGiftFlash(dir);
                  if (giftFlashTimeout.current) clearTimeout(giftFlashTimeout.current);
                  giftFlashTimeout.current = setTimeout(() => setGiftFlash(null), 600);
                }
                return g;
              });
            }
          } catch (e) {}
        };
        sse.onerror = () => {
          setIsConnected(false);
          fallbackToPolling();
        };
      } catch (e) {
        fallbackToPolling();
      }
    };

    // 4. Fallback to polling
    const fallbackToPolling = () => {
      if (pollInterval) return;
      pollInterval = setInterval(async () => {
        try {
          const res = await fetch(`${apiBase}/api/stocks/live-ticks`);
          if (res.ok) {
            const data = await res.json();
            handleIncomingTicks(data.stocks || []);
            if (data.gift_nifty) {
              setGiftNifty(data.gift_nifty);
            }
            setIsConnected(true);
            if (data.is_market_open !== undefined) {
              setIsMarketOpen(Boolean(data.is_market_open));
            }
          }
        } catch (e) {}
      }, 1000);
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (sse) sse.close();
      if (pollInterval) clearInterval(pollInterval);
      if (giftFlashTimeout.current) clearTimeout(giftFlashTimeout.current);
      Object.values(flashTimeouts.current).forEach(clearTimeout);
    };
  }, [handleIncomingTicks]);

  return {
    ticks,
    giftNifty,
    giftFlash,
    flashMap,
    isConnected,
    isMarketOpen,
    marketStatus,
    tickCount,
    lastTickTime,
  };
}
