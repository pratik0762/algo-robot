"""
Tests for Phase 5: Real-Time Derivatives, Black-Scholes Greeks, IV Solver & OI Buildup
"""

import math
import pytest
from app.derivatives.black_scholes import BlackScholesEngine
from app.derivatives.oi_analyzer import OpenInterestAnalyzer, OIBuildupType
from app.derivatives.options_chain_service import options_chain_service


class TestBlackScholesPricing:
    """Test Black-Scholes-Merton analytic formula and put-call parity."""

    def test_call_pricing(self):
        # Spot 24000, Strike 24000, DTE 7, IV 15%, r 7%
        spot = 24000.0
        strike = 24000.0
        dte = 7.0
        iv = 0.15
        r = 0.07

        call_price = BlackScholesEngine.calculate_price(spot, strike, dte, iv, "CE", r)
        assert call_price > 100.0
        assert call_price < 300.0

    def test_put_pricing(self):
        spot = 24000.0
        strike = 24000.0
        dte = 7.0
        iv = 0.15
        r = 0.07

        put_price = BlackScholesEngine.calculate_price(spot, strike, dte, iv, "PE", r)
        assert put_price > 100.0
        assert put_price < 300.0

    def test_put_call_parity(self):
        """Put-Call Parity: C - P = S - K * exp(-r * T)"""
        spot = 24500.0
        strike = 24000.0
        dte = 14.0
        iv = 0.18
        r = 0.065
        t = dte / 365.0

        c = BlackScholesEngine.calculate_price(spot, strike, dte, iv, "CE", r)
        p = BlackScholesEngine.calculate_price(spot, strike, dte, iv, "PE", r)

        lhs = c - p
        rhs = spot - strike * math.exp(-r * t)
        assert abs(lhs - rhs) < 0.01

    def test_expired_option(self):
        # DTE <= 0 should yield intrinsic value
        c_itm = BlackScholesEngine.calculate_price(24100, 24000, 0, 0.15, "CE")
        assert c_itm == 100.0

        c_otm = BlackScholesEngine.calculate_price(23900, 24000, 0, 0.15, "CE")
        assert c_otm == 0.0

        p_itm = BlackScholesEngine.calculate_price(23900, 24000, 0, 0.15, "PE")
        assert p_itm == 100.0


class TestOptionGreeks:
    """Test standard Greek bounds and properties."""

    def test_delta_bounds(self):
        spot = 24000.0
        strike = 24000.0
        dte = 10.0
        iv = 0.16

        ce_greeks = BlackScholesEngine.calculate_greeks(spot, strike, dte, iv, "CE")
        pe_greeks = BlackScholesEngine.calculate_greeks(spot, strike, dte, iv, "PE")

        # Call Delta: (0, 1), Put Delta: (-1, 0)
        assert 0.4 < ce_greeks["delta"] < 0.6
        assert -0.6 < pe_greeks["delta"] < -0.4
        # Delta relationship: Delta_call - Delta_put = 1
        assert abs(ce_greeks["delta"] - pe_greeks["delta"] - 1.0) < 0.05

    def test_gamma_positive(self):
        spot = 24000.0
        strike = 24000.0
        dte = 10.0
        iv = 0.16

        ce_greeks = BlackScholesEngine.calculate_greeks(spot, strike, dte, iv, "CE")
        pe_greeks = BlackScholesEngine.calculate_greeks(spot, strike, dte, iv, "PE")

        assert ce_greeks["gamma"] > 0
        assert pe_greeks["gamma"] > 0
        # Gamma is equal for Call and Put at same strike
        assert abs(ce_greeks["gamma"] - pe_greeks["gamma"]) < 0.0001

    def test_vega_positive(self):
        spot = 24000.0
        strike = 24000.0
        dte = 10.0
        iv = 0.16

        ce_greeks = BlackScholesEngine.calculate_greeks(spot, strike, dte, iv, "CE")
        pe_greeks = BlackScholesEngine.calculate_greeks(spot, strike, dte, iv, "PE")

        assert ce_greeks["vega"] > 0
        assert pe_greeks["vega"] > 0
        assert abs(ce_greeks["vega"] - pe_greeks["vega"]) < 0.01

    def test_theta_negative(self):
        spot = 24000.0
        strike = 24000.0
        dte = 10.0
        iv = 0.16

        ce_greeks = BlackScholesEngine.calculate_greeks(spot, strike, dte, iv, "CE")
        pe_greeks = BlackScholesEngine.calculate_greeks(spot, strike, dte, iv, "PE")

        assert ce_greeks["theta"] < 0
        assert pe_greeks["theta"] < 0


class TestImpliedVolatilitySolver:
    """Test Newton-Raphson + Bisection numerical inversion."""

    def test_iv_roundtrip(self):
        spot = 24200.0
        strike = 24000.0
        dte = 15.0
        target_iv = 0.235
        r = 0.07

        # Generate theoretical price
        market_price = BlackScholesEngine.calculate_price(spot, strike, dte, target_iv, "CE", r)
        # Solve IV from price
        solved_iv = BlackScholesEngine.calculate_implied_volatility(market_price, spot, strike, dte, "CE", r)

        assert abs(solved_iv - target_iv) < 0.001

    def test_put_iv_roundtrip(self):
        spot = 23800.0
        strike = 24000.0
        dte = 7.0
        target_iv = 0.18
        r = 0.07

        market_price = BlackScholesEngine.calculate_price(spot, strike, dte, target_iv, "PE", r)
        solved_iv = BlackScholesEngine.calculate_implied_volatility(market_price, spot, strike, dte, "PE", r)

        assert abs(solved_iv - target_iv) < 0.001


class TestOpenInterestAnalyzer:
    """Test OI buildup classification, Max Pain, PCR, and Expected Move."""

    def test_classify_buildup(self):
        # Long Buildup: Price UP, OI UP
        assert OpenInterestAnalyzer.classify_strike_buildup(15.0, 50000) == OIBuildupType.LONG_BUILDUP.value
        # Short Buildup: Price DOWN, OI UP
        assert OpenInterestAnalyzer.classify_strike_buildup(-12.5, 42000) == OIBuildupType.SHORT_BUILDUP.value
        # Long Unwinding: Price DOWN, OI DOWN
        assert OpenInterestAnalyzer.classify_strike_buildup(-8.0, -15000) == OIBuildupType.LONG_UNWINDING.value
        # Short Covering: Price UP, OI DOWN
        assert OpenInterestAnalyzer.classify_strike_buildup(22.0, -30000) == OIBuildupType.SHORT_COVERING.value

    def test_max_pain(self):
        strikes = [23800.0, 23900.0, 24000.0, 24100.0, 24200.0]
        call_ois = [10000, 25000, 150000, 80000, 40000]
        put_ois = [50000, 110000, 130000, 30000, 10000]

        max_pain = OpenInterestAnalyzer.calculate_max_pain(strikes, call_ois, put_ois)
        assert max_pain == 24000.0

    def test_pcr_calculation(self):
        pcr = OpenInterestAnalyzer.calculate_pcr(
            total_call_oi=1000000,
            total_put_oi=1250000,
            total_call_vol=500000,
            total_put_vol=450000
        )
        assert pcr["pcr_oi"] == 1.25
        assert pcr["pcr_volume"] == 0.9
        assert "BULLISH" in pcr["market_direction"]

    def test_expected_move(self):
        spot = 24000.0
        atm_iv = 0.16
        dte = 7.0

        em = OpenInterestAnalyzer.calculate_expected_move(spot, atm_iv, dte)
        assert em["expected_move_points"] > 0
        assert em["upper_bound"] == spot + em["expected_move_points"]
        assert em["lower_bound"] == spot - em["expected_move_points"]
        assert em["expected_move_percent"] > 0


class TestOptionsChainService:
    """Test full Options Chain integration with Greeks and OI."""

    def test_live_chain_analytics_enrichment(self):
        chain = options_chain_service.get_live_chain_analytics("NIFTY", strike_count=20)
        assert "symbol" in chain
        assert "strikes" in chain
        assert len(chain["strikes"]) > 0

        # Check first strike has enriched Greeks
        first_strike = chain["strikes"][0]
        assert "strike" in first_strike
        assert "ce" in first_strike
        assert "pe" in first_strike

        ce = first_strike["ce"]
        pe = first_strike["pe"]

        assert "delta" in ce
        assert "gamma" in ce
        assert "theta" in ce
        assert "vega" in ce
        assert "iv" in ce
        assert "buildup" in ce

        assert "delta" in pe
        assert "buildup" in pe

        # Check aggregated analytics
        assert "max_pain" in chain
        assert "pcr" in chain
        assert "expected_move" in chain
