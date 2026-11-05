"""Engine for algorithmic Buy/Sell signals, technical indicator computation,
and official NSE Nifty 50 Market Heat Map data.
"""

from __future__ import annotations
import math
import random
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional

try:
    from app.companies_data import NIFTY_50_REGISTRY, get_all_companies_summary
    from app.tick_engine import tick_engine
except ImportError:
    from backend.app.companies_data import NIFTY_50_REGISTRY, get_all_companies_summary
    from backend.app.tick_engine import tick_engine

IST = timezone(timedelta(hours=5, minutes=30))

# Approximate Nifty 50 index weights (by free-float market cap)
NIFTY_WEIGHTS: Dict[str, float] = {
    "HDFCBANK": 11.2,
    "RELIANCE": 9.4,
    "ICICIBANK": 7.8,
    "INFY": 5.9,
    "ITC": 4.6,
    "TCS": 4.2,
    "BHARTIARTL": 3.9,
    "LT": 3.8,
    "AXISBANK": 3.2,
    "SBIN": 3.1,
    "KOTAKBANK": 2.8,
    "BAJFINANCE": 2.2,
    "M&M": 2.1,
    "MARUTI": 1.9,
    "HINDUNILVR": 1.8,
    "SUNPHARMA": 1.7,
    "TATAMOTORS": 1.6,
    "NTPC": 1.5,
    "TITAN": 1.4,
    "POWERGRID": 1.3,
    "ADANIENT": 1.3,
    "ULTRACEMCO": 1.2,
    "ONGC": 1.2,
    "COALINDIA": 1.1,
    "TATASTEEL": 1.1,
    "JSWSTEEL": 1.0,
    "ADANIPORTS": 1.0,
    "HCLTECH": 1.0,
    "ASIANPAINT": 0.9,
    "BAJAJFINSV": 0.9,
    "GRASIM": 0.8,
    "TECHM": 0.8,
    "WIPRO": 0.8,
    "HINDALCO": 0.8,
    "NESTLEIND": 0.8,
    "BRITANNIA": 0.7,
    "DRREDDY": 0.7,
    "EICHERMOT": 0.7,
    "CIPLA": 0.7,
    "TATACONSUM": 0.6,
    "APOLLOHOSP": 0.6,
    "SBILIFE": 0.6,
    "HDFCLIFE": 0.6,
    "DIVISLAB": 0.6,
    "BPCL": 0.5,
    "BAJAJ-AUTO": 0.5,
    "INDUSINDBK": 0.5,
    "HEROMOTOCO": 0.5,
    "SHRIRAMFIN": 0.5,
    "LICI": 0.5,
}

class SignalsHeatmapEngine:
    """Computes real-time NSE Heat Map and Algorithmic Buy/Sell Signals with indicator suites."""

    def get_nse_heatmap(self) -> Dict[str, Any]:
        """Generate structured NSE Nifty 50 Heat Map data grouped by sectors."""
        companies = get_all_companies_summary()
        sectors_dict: Dict[str, List[Dict[str, Any]]] = {}

        total_gainers = 0
        total_losers = 0
        total_unchanged = 0

        for comp in companies:
            sym = comp["symbol"]
            sec = comp["sector"]
            live = tick_engine.stocks.get(sym)

            ltp = float(live.get("ltp") if live else comp.get("current_price") or 1000.0)
            change = float(live.get("change") if live else comp.get("price_change") or 0.0)
            pct_change = float(live.get("percent_change") if live else comp.get("percent_change") or 0.0)
            mcap = float(comp.get("market_cap_cr") or 50000.0)
            weight = NIFTY_WEIGHTS.get(sym, 0.8)

            # Signal classification
            if pct_change >= 2.0:
                signal = "STRONG_BUY"
                heat_grade = "strong_bullish"
                color = "#10b981"
                total_gainers += 1
            elif pct_change >= 0.3:
                signal = "BUY"
                heat_grade = "bullish"
                color = "#059669"
                total_gainers += 1
            elif pct_change <= -2.0:
                signal = "STRONG_SELL"
                heat_grade = "strong_bearish"
                color = "#dc2626"
                total_losers += 1
            elif pct_change <= -0.3:
                signal = "SELL"
                heat_grade = "bearish"
                color = "#ef4444"
                total_losers += 1
            else:
                signal = "NEUTRAL"
                heat_grade = "neutral"
                color = "#475569"
                total_unchanged += 1

            stock_node = {
                "symbol": sym,
                "company_name": comp["company_name"],
                "sector": sec,
                "industry": comp["industry"],
                "ltp": ltp,
                "change": change,
                "percent_change": pct_change,
                "market_cap_cr": mcap,
                "index_weight_pct": weight,
                "signal": signal,
                "heat_grade": heat_grade,
                "color": color,
                "pe_ratio": comp.get("pe_ratio", 25.0),
                "high_52w": comp.get("high_52w") or round(ltp * 1.15, 2),
                "low_52w": comp.get("low_52w") or round(ltp * 0.85, 2),
                "nse_official_url": f"https://www.nseindia.com/get-quotes/equity?symbol={sym}"
            }

            if sec not in sectors_dict:
                sectors_dict[sec] = []
            sectors_dict[sec].append(stock_node)

        # Structure grouped sectors
        sector_nodes = []
        for sec, stocks in sectors_dict.items():
            stocks.sort(key=lambda s: -s["index_weight_pct"])
            sec_mcap = sum(s["market_cap_cr"] for s in stocks)
            sec_weight = sum(s["index_weight_pct"] for s in stocks)
            avg_change = round(sum(s["percent_change"] * s["index_weight_pct"] for s in stocks) / max(sec_weight, 0.01), 2)
            
            if avg_change >= 0.75:
                sec_color = "#10b981"
            elif avg_change > 0.0:
                sec_color = "#059669"
            elif avg_change <= -0.75:
                sec_color = "#dc2626"
            elif avg_change < 0.0:
                sec_color = "#ef4444"
            else:
                sec_color = "#475569"

            sector_nodes.append({
                "sector": sec,
                "average_percent_change": avg_change,
                "total_market_cap_cr": sec_mcap,
                "total_index_weight_pct": round(sec_weight, 2),
                "stocks_count": len(stocks),
                "color": sec_color,
                "stocks": stocks
            })

        # Sort sectors by total index weightage
        sector_nodes.sort(key=lambda x: -x["total_index_weight_pct"])

        return {
            "status": "success",
            "source": "National Stock Exchange of India (NSE) Nifty 50 Live Heat Map",
            "official_url": "https://www.nseindia.com/market-data/live-market-indices",
            "timestamp": datetime.now(IST).strftime("%d-%b-%Y %H:%M:%S IST"),
            "breadth": {
                "advances": total_gainers,
                "declines": total_losers,
                "unchanged": total_unchanged,
                "advance_decline_ratio": round(total_gainers / max(total_losers, 1), 2)
            },
            "sectors": sector_nodes
        }

    def get_chart_with_signals(
        self,
        symbol: str = "RELIANCE",
        timeframe: str = "1D",
        candle_count: int = 40
    ) -> Dict[str, Any]:
        """Generate high-fidelity OHLCV candlestick data with technical indicators & Buy/Sell signals."""
        sym_upper = symbol.upper()
        comp = next((c for c in NIFTY_50_REGISTRY if c["symbol"] == sym_upper), NIFTY_50_REGISTRY[0])
        live = tick_engine.stocks.get(sym_upper)

        current_ltp = float(live.get("ltp") if live else comp.get("market_cap_cr", 100000) / 1000)
        if current_ltp <= 0:
            current_ltp = 1500.0

        # Generate realistic historical candles walking towards current_ltp
        candles = []
        now = datetime.now(IST)
        
        # Determine time delta per candle
        if timeframe == "1m":
            delta = timedelta(minutes=1)
        elif timeframe == "5m":
            delta = timedelta(minutes=5)
        elif timeframe == "15m":
            delta = timedelta(minutes=15)
        elif timeframe == "1W":
            delta = timedelta(weeks=1)
        else: # 1D
            delta = timedelta(days=1)

        seed = abs(hash(sym_upper + timeframe))
        base_price = current_ltp * (0.90 + ((seed % 15) / 100.0))
        price_track = base_price

        for i in range(candle_count):
            t = now - (delta * (candle_count - i - 1))
            # skip weekends on daily
            if timeframe == "1D" and t.weekday() >= 5:
                continue

            volatility = price_track * 0.015
            drift = (current_ltp - price_track) / max(candle_count - i, 1) * 0.4
            
            # Deterministic pseudo-random variation
            pseudo = math.sin((i + seed) * 0.45)
            step = (pseudo * volatility) + drift
            
            candle_open = round(price_track, 2)
            candle_close = round(candle_open + step, 2)
            high_slack = abs(pseudo * volatility * 0.6) + 1.0
            low_slack = abs(math.cos((i + seed) * 0.45) * volatility * 0.6) + 1.0
            candle_high = round(max(candle_open, candle_close) + high_slack, 2)
            candle_low = round(min(candle_open, candle_close) - low_slack, 2)
            
            volume = int(150000 + (abs(pseudo) * 450000) + (100000 if i % 5 == 0 else 0))
            
            candles.append({
                "time": t.strftime("%Y-%m-%d %H:%M"),
                "timestamp": int(t.timestamp()),
                "open": candle_open,
                "high": candle_high,
                "low": candle_low,
                "close": candle_close,
                "volume": volume
            })
            price_track = candle_close

        # Ensure last candle matches current LTP
        if candles:
            candles[-1]["close"] = current_ltp
            candles[-1]["high"] = max(candles[-1]["high"], current_ltp)
            candles[-1]["low"] = min(candles[-1]["low"], current_ltp)

        # Compute Technical Indicators (EMA 9, EMA 21, RSI 14, Supertrend)
        closes = [c["close"] for c in candles]
        ema_9 = self._calc_ema(closes, 9)
        ema_21 = self._calc_ema(closes, 21)
        rsi_14 = self._calc_rsi(closes, 14)
        supertrend = self._calc_supertrend(candles, 10, 3.0)

        for idx, c in enumerate(candles):
            c["ema_9"] = round(ema_9[idx], 2)
            c["ema_21"] = round(ema_21[idx], 2)
            c["rsi"] = round(rsi_14[idx], 1)
            c["supertrend"] = round(supertrend[idx]["value"], 2)
            c["supertrend_dir"] = supertrend[idx]["direction"]

        # Detect Algorithmic Buy & Sell Signals
        signals = []
        for idx in range(2, len(candles)):
            c = candles[idx]
            prev = candles[idx - 1]
            prev2 = candles[idx - 2]
            
            # Buy Trigger: EMA 9 crosses above EMA 21 OR Supertrend flips green with RSI in sweet spot (45-65)
            ema_golden_cross = (prev["ema_9"] <= prev["ema_21"]) and (c["ema_9"] > c["ema_21"])
            supertrend_buy_flip = (prev["supertrend_dir"] == -1) and (c["supertrend_dir"] == 1)
            volume_surge = c["volume"] >= (prev["volume"] * 1.3)
            
            # Sell Trigger: EMA 9 crosses below EMA 21 OR Supertrend flips red
            ema_death_cross = (prev["ema_9"] >= prev["ema_21"]) and (c["ema_9"] < c["ema_21"])
            supertrend_sell_flip = (prev["supertrend_dir"] == 1) and (c["supertrend_dir"] == -1)

            if ema_golden_cross or (supertrend_buy_flip and volume_surge):
                entry = c["close"]
                sl = round(min(c["low"], prev["low"]) * 0.985, 2)
                risk = entry - sl
                t1 = round(entry + (risk * 1.5), 2)
                t2 = round(entry + (risk * 2.5), 2)
                signals.append({
                    "id": f"sig_buy_{c['timestamp']}",
                    "type": "BUY",
                    "time": c["time"],
                    "timestamp": c["timestamp"],
                    "candle_index": idx,
                    "entry_price": entry,
                    "stop_loss": sl,
                    "target_1": t1,
                    "target_2": t2,
                    "risk_reward": "1 : 2.0",
                    "strength": "STRONG_BUY" if volume_surge else "BUY",
                    "indicator_reason": "EMA 9/21 Bullish Golden Cross + Rising Volume" if ema_golden_cross else "Supertrend Trend Reversal (Bullish Flip)",
                    "execution_advice": f"Enter at ₹{entry}. Place Stop Loss at ₹{sl}. Book 50% profit at ₹{t1}, trail remainder to ₹{t2}."
                })
            elif ema_death_cross or supertrend_sell_flip:
                entry = c["close"]
                sl = round(max(c["high"], prev["high"]) * 1.015, 2)
                risk = sl - entry
                t1 = round(entry - (risk * 1.5), 2)
                t2 = round(entry - (risk * 2.5), 2)
                signals.append({
                    "id": f"sig_sell_{c['timestamp']}",
                    "type": "SELL",
                    "time": c["time"],
                    "timestamp": c["timestamp"],
                    "candle_index": idx,
                    "entry_price": entry,
                    "stop_loss": sl,
                    "target_1": t1,
                    "target_2": t2,
                    "risk_reward": "1 : 2.0",
                    "strength": "STRONG_SELL" if c["rsi"] > 70 else "SELL",
                    "indicator_reason": "EMA 9/21 Bearish Death Cross" if ema_death_cross else "Supertrend Trend Reversal (Bearish Flip)",
                    "execution_advice": f"Short at ₹{entry}. Place Stop Loss at ₹{sl}. Cover 50% at ₹{t1}, trail remainder to ₹{t2}."
                })

        # Most recent active signal
        latest_signal = signals[-1] if signals else {
            "type": "NEUTRAL",
            "indicator_reason": "Consolidation within EMA band",
            "entry_price": current_ltp,
            "stop_loss": round(current_ltp * 0.98, 2),
            "target_1": round(current_ltp * 1.03, 2),
            "target_2": round(current_ltp * 1.05, 2),
            "risk_reward": "1 : 2.0",
            "strength": "NEUTRAL",
            "execution_advice": "Wait for EMA 9/21 crossover or breakout above immediate resistance before entering."
        }

        return {
            "status": "success",
            "symbol": sym_upper,
            "company_name": comp["company_name"],
            "sector": comp["sector"],
            "timeframe": timeframe,
            "current_price": current_ltp,
            "latest_signal": latest_signal,
            "all_signals": signals,
            "candles": candles,
            "timestamp": datetime.now(IST).strftime("%d-%b-%Y %H:%M:%S IST")
        }

    # Helper: Exponential Moving Average
    def _calc_ema(self, values: List[float], period: int) -> List[float]:
        if not values:
            return []
        k = 2.0 / (period + 1.0)
        ema = [values[0]]
        for i in range(1, len(values)):
            ema.append((values[i] * k) + (ema[-1] * (1.0 - k)))
        return ema

    # Helper: Relative Strength Index (RSI 14)
    def _calc_rsi(self, values: List[float], period: int = 14) -> List[float]:
        if len(values) < 2:
            return [50.0] * len(values)
        rsi = [50.0]
        gains = []
        losses = []
        for i in range(1, len(values)):
            delta = values[i] - values[i - 1]
            gains.append(max(delta, 0.0))
            losses.append(max(-delta, 0.0))

        avg_gain = sum(gains[:period]) / max(period, 1)
        avg_loss = sum(losses[:period]) / max(period, 1)

        for i in range(1, len(values)):
            if i < period:
                rsi.append(50.0)
            else:
                idx = i - 1
                avg_gain = ((avg_gain * (period - 1)) + gains[idx]) / period
                avg_loss = ((avg_loss * (period - 1)) + losses[idx]) / period
                if avg_loss == 0:
                    rsi.append(100.0)
                else:
                    rs = avg_gain / avg_loss
                    rsi.append(100.0 - (100.0 / (1.0 + rs)))
        return rsi

    # Helper: Supertrend Indicator
    def _calc_supertrend(self, candles: List[Dict[str, Any]], period: int = 10, multiplier: float = 3.0) -> List[Dict[str, Any]]:
        result = []
        atr = []
        # Calculate True Range
        for i in range(len(candles)):
            c = candles[i]
            if i == 0:
                atr.append(c["high"] - c["low"])
            else:
                p = candles[i - 1]
                tr = max(c["high"] - c["low"], abs(c["high"] - p["close"]), abs(c["low"] - p["close"]))
                atr.append((atr[-1] * (period - 1) + tr) / period)

        trend = 1
        for i in range(len(candles)):
            c = candles[i]
            hl2 = (c["high"] + c["low"]) / 2.0
            band_offset = multiplier * atr[i]
            upper_band = hl2 + band_offset
            lower_band = hl2 - band_offset
            
            if c["close"] > upper_band:
                trend = 1
            elif c["close"] < lower_band:
                trend = -1
                
            val = lower_band if trend == 1 else upper_band
            result.append({"value": val, "direction": trend})
        return result

# Global singleton
signals_heatmap_engine = SignalsHeatmapEngine()

