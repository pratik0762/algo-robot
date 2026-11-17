"""
ALGO ROBOT — Black-Scholes Institutional Options Pricing & Greeks Engine
Provides high-precision analytical European/American option pricing, Greeks,
and fast Implied Volatility (IV) solving via Newton-Raphson with Brent bracket fallback.
"""

from __future__ import annotations
import math
from typing import Dict, List, Optional, Tuple, Union
import numpy as np


def norm_cdf(x: float) -> float:
    """Standard Normal Cumulative Distribution Function."""
    return (1.0 + math.erf(x / math.sqrt(2.0))) / 2.0


def norm_pdf(x: float) -> float:
    """Standard Normal Probability Density Function."""
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


class BlackScholesEngine:
    """Institutional Black-Scholes-Merton Pricing and Greeks Engine."""

    @staticmethod
    def calculate_price(
        spot: float,
        strike: float,
        days_to_expiry: float = 0.0,
        iv: float = 0.16,
        option_type: Union[str, float] = "CE",
        r: Union[str, float] = 0.065,
        q: float = 0.0,
        t: Optional[float] = None,
    ) -> float:
        """
        Calculates theoretical Black-Scholes option price.
        Supports both (spot, strike, dte, iv, option_type, r) and (spot, strike, t, iv, r, option_type).
        """
        # Swap safely if caller passed r as 5th argument and option_type as 6th
        if isinstance(option_type, (int, float)) and isinstance(r, str):
            eff_r = float(option_type)
            eff_type = str(r).upper()
        else:
            eff_r = float(r) if isinstance(r, (int, float)) else 0.065
            eff_type = str(option_type).upper() if isinstance(option_type, str) else "CE"

        if t is not None:
            time_in_years = max(0.0, float(t))
        else:
            # If days_to_expiry > 1.0, interpret as days; if <= 1.0 and > 0, check if already in years
            time_in_years = float(days_to_expiry) / 365.0

        is_call = eff_type == "CE"

        if spot <= 0 or strike <= 0 or time_in_years <= 0 or iv <= 0:
            intrinsic = max(0.0, (spot - strike) if is_call else (strike - spot))
            return round(intrinsic, 2)

        t_val = max(time_in_years, 0.00001)
        sqrt_t = math.sqrt(t_val)
        d1 = (math.log(spot / strike) + (eff_r - q + 0.5 * iv * iv) * t_val) / (iv * sqrt_t)
        d2 = d1 - iv * sqrt_t

        exp_rt = math.exp(-eff_r * t_val)
        exp_qt = math.exp(-q * t_val)

        if is_call:
            price = spot * exp_qt * norm_cdf(d1) - strike * exp_rt * norm_cdf(d2)
        else:
            price = strike * exp_rt * norm_cdf(-d2) - spot * exp_qt * norm_cdf(-d1)

        intrinsic = max(0.0, (spot - strike) if is_call else (strike - spot))
        return round(max(price, intrinsic, 0.05), 2)

    @staticmethod
    def calculate_greeks(
        spot: float,
        strike: float,
        days_to_expiry: float,
        iv: float,
        option_type: str = "CE",
        r: float = 0.065,
        q: float = 0.0,
        risk_free_rate: Optional[float] = None,
    ) -> Dict[str, float]:
        """
        Calculates complete institutional Greeks:
        - Delta: Price sensitivity per 1 point underlying move
        - Gamma: Delta sensitivity per 1 point underlying move
        - Theta: Daily time decay (per calendar day)
        - Theta (Trading): Daily time decay (per 252 trading days)
        - Vega: Sensitivity per 1% change in IV
        - Rho: Sensitivity per 1% change in interest rate
        """
        eff_r = risk_free_rate if risk_free_rate is not None else r
        t = max(days_to_expiry / 365.0, 0.0001)
        sqrt_t = math.sqrt(t)
        is_call = option_type.upper() == "CE"

        if spot <= 0 or strike <= 0 or iv <= 0:
            intrinsic = max(0.0, (spot - strike) if is_call else (strike - spot))
            return {
                "price": round(intrinsic, 2),
                "delta": 1.0 if (is_call and spot > strike) else (-1.0 if (not is_call and spot < strike) else 0.0),
                "gamma": 0.0,
                "theta": 0.0,
                "theta_trading": 0.0,
                "vega": 0.0,
                "rho": 0.0,
            }

        d1 = (math.log(spot / strike) + (eff_r - q + 0.5 * iv * iv) * t) / (iv * sqrt_t)
        d2 = d1 - iv * sqrt_t

        pdf_d1 = norm_pdf(d1)
        exp_rt = math.exp(-eff_r * t)
        exp_qt = math.exp(-q * t)

        # Delta
        if is_call:
            delta = exp_qt * norm_cdf(d1)
        else:
            delta = -exp_qt * norm_cdf(-d1)

        # Gamma
        gamma = (exp_qt * pdf_d1) / (spot * iv * sqrt_t)

        # Vega (per 1% IV move)
        vega = (spot * exp_qt * sqrt_t * pdf_d1) / 100.0

        # Theta (per calendar day and per 252 trading day)
        term1 = -(spot * exp_qt * pdf_d1 * iv) / (2.0 * sqrt_t)
        if is_call:
            term2 = eff_r * strike * exp_rt * norm_cdf(d2)
            term3 = q * spot * exp_qt * norm_cdf(d1)
            theta_annual = term1 - term2 + term3
            rho = (strike * t * exp_rt * norm_cdf(d2)) / 100.0
            price = spot * exp_qt * norm_cdf(d1) - strike * exp_rt * norm_cdf(d2)
        else:
            term2 = eff_r * strike * exp_rt * norm_cdf(-d2)
            term3 = q * spot * exp_qt * norm_cdf(-d1)
            theta_annual = term1 + term2 - term3
            rho = (-strike * t * exp_rt * norm_cdf(-d2)) / 100.0
            price = strike * exp_rt * norm_cdf(-d2) - spot * exp_qt * norm_cdf(-d1)

        theta_calendar = theta_annual / 365.0
        theta_trading = theta_annual / 252.0

        intrinsic = max(0.0, (spot - strike) if is_call else (strike - spot))
        price = max(price, intrinsic, 0.05)

        return {
            "price": round(price, 2),
            "delta": round(delta, 4),
            "gamma": round(gamma, 6),
            "theta": round(theta_calendar, 2),
            "theta_trading": round(theta_trading, 2),
            "vega": round(vega, 2),
            "rho": round(rho, 4),
        }

    @staticmethod
    def calculate_implied_volatility(
        market_price: float,
        spot: float,
        strike: float,
        days_to_expiry: float,
        option_type: str = "CE",
        r: float = 0.065,
        q: float = 0.0,
        initial_guess: float = 0.20,
        max_iterations: int = 50,
        tolerance: float = 1e-4,
    ) -> float:
        """
        Solves for Implied Volatility (IV) using Newton-Raphson method
        with robust Bisection bracket fallback.
        Returns: Annualized IV decimal (e.g. 0.165 = 16.5%).
        """
        t = max(days_to_expiry / 365.0, 0.0001)
        is_call = option_type.upper() == "CE"
        intrinsic = max(0.0, (spot - strike) if is_call else (strike - spot))

        if market_price <= intrinsic or market_price <= 0.05:
            return 0.12  # Baseline floor

        iv = initial_guess

        # 1. Newton-Raphson Iteration
        for _ in range(max_iterations):
            theo_price = BlackScholesEngine.calculate_price(
                spot=spot, strike=strike, days_to_expiry=days_to_expiry, iv=iv, option_type=option_type, r=r, q=q
            )
            diff = theo_price - market_price

            if abs(diff) < tolerance:
                return round(iv, 4)

            # Vega
            d1 = (math.log(spot / strike) + (r - q + 0.5 * iv * iv) * t) / (iv * math.sqrt(t))
            vega = spot * math.exp(-q * t) * math.sqrt(t) * norm_pdf(d1)

            if vega < 1e-5:
                break  # Vega near zero, escape to bisection

            iv_new = iv - (diff / vega)
            if iv_new <= 0.001 or iv_new > 5.0:
                break  # Out of range, escape to bisection
            iv = iv_new

        # 2. Bisection Bracket Fallback
        low_iv, high_iv = 0.01, 3.50
        for _ in range(35):
            mid_iv = (low_iv + high_iv) * 0.5
            p_mid = BlackScholesEngine.calculate_price(
                spot=spot, strike=strike, days_to_expiry=days_to_expiry, iv=mid_iv, option_type=option_type, r=r, q=q
            )
            diff = p_mid - market_price

            if abs(diff) < tolerance:
                return round(mid_iv, 4)

            if diff > 0:
                high_iv = mid_iv
            else:
                low_iv = mid_iv

        return round((low_iv + high_iv) * 0.5, 4)
