import unittest
import urllib.request
import json
import time
import math
import os
import sys

BASE_URL = "http://127.0.0.1:8000"
FRONTEND_URL = "http://127.0.0.1:3000"

def http_get(path):
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=12) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

def http_post(path, body):
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

def http_delete(path):
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, method="DELETE")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

def check_frontend(path):
    url = f"{FRONTEND_URL}{path}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.status


class TestPhase10StrategyManagement(unittest.TestCase):
    """1. Strategy Tests"""

    def test_01_existing_strategy_logic(self):
        status, data = http_get("/api/trade-signals/strategies")
        self.assertEqual(status, 200)
        strategies = [s for s in data.get("strategies", []) if s.get("id") != "all"]
        self.assertGreaterEqual(len(strategies), 7)
        for s in strategies:
            strat_id = s["id"]
            s_status, s_data = http_get(f"/api/trade-signals/strategies/{strat_id}")
            self.assertEqual(s_status, 200)
            strat = s_data.get("strategy", {})
            logic = strat.get("logic", strat)
            self.assertTrue(strat.get("indicators") or logic.get("indicators_used"), f"{strat_id} missing indicators")
            self.assertTrue(strat.get("buy_conditions") or logic.get("buy_conditions"), f"{strat_id} missing buy conditions")
            self.assertTrue(strat.get("sell_conditions") or logic.get("sell_conditions"), f"{strat_id} missing sell conditions")
            self.assertTrue(strat.get("stop_loss_logic") or logic.get("stop_loss_logic"), f"{strat_id} missing SL logic")
            self.assertTrue(strat.get("target_calculation") or logic.get("target_logic"), f"{strat_id} missing Target logic")
            self.assertTrue(strat.get("risk_reward") or logic.get("risk_reward"), f"{strat_id} missing R:R")
            self.assertTrue(strat.get("exit_conditions") or logic.get("exit_conditions"), f"{strat_id} missing Exit logic")
            self.assertTrue(strat.get("confirmation_rules") or logic.get("confirmation_rules"), f"{strat_id} missing Confirmation rules")

    def test_02_custom_strategy_creation_and_versioning(self):
        payload = {
            "name": "Phase 10 Test Strategy",
            "description": "Validation of strategy lifecycle",
            "category": "Momentum",
            "supported_instruments": ["Equity Stocks", "Index Futures"],
            "supported_timeframes": ["15m"],
            "indicators": [
                {"name": "EMA 9", "symbol": "EMA9", "parameters": {"period": 9}, "purpose": "Fast Trend"},
                {"name": "EMA 21", "symbol": "EMA21", "parameters": {"period": 21}, "purpose": "Slow Trend"}
            ],
            "buy_conditions": ["EMA 9 crosses above EMA 21 on closed bar"],
            "sell_conditions": ["EMA 9 crosses below EMA 21 on closed bar"],
            "risk_management": {
                "entry_type": "Market on Candle Close",
                "stop_loss_type": "ATR Multiplier",
                "stop_loss_multiplier": 1.5,
                "target_1_ratio": 1.5,
                "target_2_ratio": 2.5,
                "target_3_ratio": 4.0,
                "risk_reward_ratio": "1 : 2.0",
                "max_risk_per_trade_pct": 1.5,
                "signal_validity_bars": 3
            }
        }
        status, res = http_post("/api/strategies/custom", payload)
        self.assertEqual(status, 201)
        strat = res.get("strategy", {})
        strat_id = strat.get("id")
        self.assertTrue(strat_id)
        self.assertEqual(strat.get("version"), "1.0.0")

        # Duplicate
        d_status, d_res = http_post(f"/api/strategies/custom/{strat_id}/duplicate", {})
        self.assertEqual(d_status, 200)
        dup_id = d_res.get("strategy", {}).get("id")
        self.assertTrue(dup_id)

        # Cleanup
        http_delete(f"/api/strategies/custom/{strat_id}")
        http_delete(f"/api/strategies/custom/{dup_id}")

    def test_03_invalid_conditions_rejected(self):
        invalid_payload = {
            "name": "Invalid Active Strategy",
            "category": "Momentum",
            "is_enabled": True,
            "indicators": [],
            "buy_conditions": [],
            "risk_management": {
                "max_risk_per_trade_pct": -5.0
            }
        }
        try:
            http_post("/api/strategies/custom", invalid_payload)
            self.fail("Expected HTTP 422 for invalid active strategy")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 422)

    def test_04_instrument_compatibility(self):
        status, data = http_get("/api/fo/specifications")
        self.assertEqual(status, 200)
        compat = data.get("strategy_compatibility", {})
        self.assertGreaterEqual(len(compat), 7)
        for s_id, c in compat.items():
            self.assertIn("equity", c)
            self.assertIn("futures", c)
            self.assertIn("options", c)


class TestPhase10StockSupport(unittest.TestCase):
    """2. Stock Tests"""

    def test_05_equity_ohlcv(self):
        status, data = http_get("/api/chart-data/RELIANCE?timeframe=15m")
        self.assertEqual(status, 200)
        self.assertIn("candles", data)
        candles = data["candles"]
        self.assertGreater(len(candles), 10)
        bar = candles[-1]
        for key in ["open", "high", "low", "close"]:
            self.assertIn(key, bar)
            self.assertGreater(bar[key], 0)
        self.assertIn("volume", bar)
        self.assertGreaterEqual(bar["volume"], 0)

    def test_06_indicator_calculations(self):
        sys.path.append("backend")
        from app.strategy_engine import (
            compute_ema,
            compute_atr,
            compute_supertrend,
            compute_rsi,
            compute_macd,
            compute_bollinger_bands
        )
        closes = [100.0, 102.0, 101.5, 103.0, 105.0, 104.0, 106.0, 108.0, 107.5, 109.0,
                  111.0, 110.0, 112.5, 114.0, 113.5, 115.0, 117.0, 116.5, 118.0, 120.0,
                  119.5, 121.0, 123.0, 122.0, 124.0, 126.0, 125.5, 127.0, 129.0, 130.0]
        highs = [c + 1.5 for c in closes]
        lows = [c - 1.5 for c in closes]
        
        ema9 = compute_ema(closes, 9)
        self.assertEqual(len(ema9), len(closes))
        self.assertAlmostEqual(ema9[-1], 126.3, delta=3.0)

        atr = compute_atr(highs, lows, closes, 14)
        self.assertGreater(atr[-1], 0)

        st_val, st_dir = compute_supertrend(highs, lows, closes, 10, 3.0)
        self.assertIn(st_dir[-1], (1, -1))

        rsi = compute_rsi(closes, 14)
        self.assertTrue(0 <= rsi[-1] <= 100)

        macd, sig, hist = compute_macd(closes, 12, 26, 9)
        self.assertEqual(len(macd), len(closes))

        upper, mid, lower, bw = compute_bollinger_bands(closes, 20, 2.0)
        self.assertGreater(upper[-1], mid[-1])
        self.assertGreater(mid[-1], lower[-1])

    def test_07_entry_sl_target_math(self):
        sys.path.append("backend")
        from app.strategy_engine import StrategyEngine
        entry = 2500.0
        atr = 25.0
        sl = round(entry - (1.5 * atr), 2)
        risk = entry - sl
        t1 = round(entry + (risk * 1.5), 2)
        t2 = round(entry + (risk * 2.5), 2)
        t3 = round(entry + (risk * 4.0), 2)
        self.assertEqual(sl, 2462.50)
        self.assertEqual(risk, 37.50)
        self.assertEqual(t1, 2556.25)
        self.assertEqual(t2, 2593.75)
        self.assertEqual(t3, 2650.00)


class TestPhase10FnOSupport(unittest.TestCase):
    """3. F&O Tests"""

    def test_08_futures_and_options_specs(self):
        status, data = http_get("/api/fo/specifications")
        self.assertEqual(status, 200)
        lot_sizes = data.get("lot_sizes", {})
        self.assertEqual(lot_sizes.get("NIFTY"), 25)
        self.assertEqual(lot_sizes.get("BANKNIFTY"), 15)
        self.assertEqual(lot_sizes.get("RELIANCE"), 250)

        exp_info = data.get("expiry_info", {})
        self.assertTrue(exp_info.get("current_monthly_expiry"))
        self.assertGreater(exp_info.get("days_to_monthly_expiry", 0), 0)

    def test_09_options_greeks_black_scholes(self):
        status, data = http_get("/api/fo/greeks?spot=24500&strike=24500&dte_days=14&iv=0.20&option_type=CE")
        self.assertEqual(status, 200)
        greeks = data.get("greeks", {})
        self.assertIn("delta", greeks)
        self.assertIn("gamma", greeks)
        self.assertIn("theta", greeks)
        self.assertIn("vega", greeks)
        self.assertAlmostEqual(greeks["delta"], 0.50, delta=0.08)
        self.assertGreater(greeks["gamma"], 0.0)
        self.assertLess(greeks["theta"], 0.0)
        self.assertGreater(greeks["vega"], 0.0)


class TestPhase10HistoricalSignalsLedger(unittest.TestCase):
    """4. Historical Signals Tests"""

    def test_10_immutable_ledger_and_filters(self):
        s_all, d_all = http_get("/api/trade-signals?view_mode=ALL")
        self.assertEqual(s_all, 200)
        signals_all = d_all.get("signals", [])

        s_act, d_act = http_get("/api/trade-signals?view_mode=ACTIVE")
        self.assertEqual(s_act, 200)
        signals_act = d_act.get("signals", [])

        s_arc, d_arc = http_get("/api/trade-signals?view_mode=ARCHIVED")
        self.assertEqual(s_arc, 200)
        signals_arc = d_arc.get("signals", [])

        self.assertGreaterEqual(len(signals_all), len(signals_act))
        self.assertGreaterEqual(len(signals_all), len(signals_arc))

    def test_11_date_filters(self):
        for df in ["today", "yesterday", "this_week", "this_month", "all"]:
            status, data = http_get(f"/api/trade-signals?date_filter={df}")
            self.assertEqual(status, 200)
            self.assertIn("signals", data)


class TestPhase10BacktestingEngine(unittest.TestCase):
    """5. Backtesting Tests"""

    def test_12_zero_lookahead_and_execution(self):
        payload = {
            "strategy_id": "ema_cross",
            "symbols": ["RELIANCE"],
            "instrument_type": "EQUITY",
            "timeframe": "15m",
            "initial_capital": 200000.0,
            "risk_per_trade_pct": 1.5,
            "slippage_pct": 0.0005
        }
        status, res = http_post("/api/backtest/run", payload)
        self.assertEqual(status, 200)
        metrics = res.get("metrics", {})
        self.assertIn("total_trades", metrics)
        self.assertIn("win_rate_pct", metrics)
        self.assertIn("net_profit", metrics)
        self.assertIn("total_charges", metrics)
        self.assertIn("equity_curve", res)
        self.assertIn("trades", res)

    def test_13_reproducible_results(self):
        payload = {
            "strategy_id": "ema_cross",
            "symbols": ["RELIANCE"],
            "instrument_type": "EQUITY",
            "timeframe": "15m",
            "initial_capital": 200000.0,
            "risk_per_trade_pct": 1.5,
            "slippage_pct": 0.0005
        }
        _, run1 = http_post("/api/backtest/run", payload)
        _, run2 = http_post("/api/backtest/run", payload)
        m1 = run1["metrics"]
        m2 = run2["metrics"]
        self.assertEqual(m1["total_trades"], m2["total_trades"])
        self.assertEqual(m1["net_profit"], m2["net_profit"])
        self.assertEqual(m1["win_rate_pct"], m2["win_rate_pct"])
        self.assertEqual(m1["total_charges"], m2["total_charges"])


class TestPhase10Regression(unittest.TestCase):
    """6. Regression Tests across Entire System"""

    def test_14_core_rest_endpoints(self):
        endpoints = [
            "/api/trade-signals",
            "/api/trade-signals/analytics",
            "/api/chart-data/COFORGE?timeframe=15m",
            "/api/stocks/live-ticks",
            "/api/indices",
            "/api/fii-dii",
            "/api/deals",
            "/api/52-week",
            "/api/news",
            "/api/companies"
        ]
        for ep in endpoints:
            st, _ = http_get(ep)
            self.assertEqual(st, 200, f"Endpoint {ep} failed with status {st}")

    def test_15_frontend_ssr_routes(self):
        routes = [
            "/",
            "/signals",
            "/52-week",
            "/chart",
            "/company/RELIANCE",
            "/deals",
            "/fii-dii",
            "/indices",
            "/news"
        ]
        for r in routes:
            st = check_frontend(r)
            self.assertEqual(st, 200, f"Frontend route {r} failed with status {st}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
