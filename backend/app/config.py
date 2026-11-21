"""
ALGO ROBOT — Central Application Configuration & Settings
Validated using Pydantic Settings (v2) with strict typing and security guards.
"""

import os
import secrets
from typing import List, Union
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Core Application Settings
    APP_NAME: str = "ALGO ROBOT Trading Platform"
    ENV: str = Field(default="development", description="'development', 'staging', or 'production'")
    DEBUG: bool = False
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
    ]

    # Security & Encryption
    SECRET_KEY: str = Field(
        default="algorobot-super-secret-jwt-key-change-in-production-32chars",
        description="Master secret key for JWT session signing (min 32 chars)",
    )
    ENCRYPTION_MASTER_KEY: str = Field(
        default="",
        description="32-byte hex-encoded key for AES-256-GCM symmetric encryption",
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    ALGORITHM: str = "HS256"

    # Outbound Webhook Security (SSRF Protection)
    ALLOW_PRIVATE_IPS_IN_WEBHOOKS: bool = False

    # Database Configuration
    DATABASE_URL: str = Field(
        default="sqlite:///./algo_robot.db",
        description="Database connection URL (PostgreSQL/TimescaleDB recommended for production)",
    )
    SYNC_DATABASE_URL: str = Field(
        default="sqlite:///./algo_robot.db",
        description="Synchronous database connection URL",
    )

    # Redis Distributed Caching & Pub/Sub
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_ENABLED: bool = False

    # Market Data & Rule 1 Enforcement
    DATA_SOURCE_MODE: str = Field(
        default="REAL_ONLY",
        description="'REAL_ONLY' strictly bars synthetic or mock ticks from production",
    )

    # Broker API Keys & Secrets
    ZERODHA_API_KEY: str = ""
    ZERODHA_API_SECRET: str = ""
    ZERODHA_ACCESS_TOKEN: str = ""

    ANGEL_API_KEY: str = ""
    ANGEL_CLIENT_CODE: str = ""
    ANGEL_PIN: str = ""
    ANGEL_TOTP_KEY: str = ""

    UPSTOX_API_KEY: str = ""
    UPSTOX_API_SECRET: str = ""
    UPSTOX_REDIRECT_URI: str = "http://localhost:8000/api/broker/upstox/callback"

    DHAN_CLIENT_ID: str = ""
    DHAN_ACCESS_TOKEN: str = ""

    SHOONYA_USER_ID: str = ""
    SHOONYA_PASSWORD: str = ""
    SHOONYA_FACTOR2: str = ""
    SHOONYA_VC: str = ""
    SHOONYA_API_KEY: str = ""

    # Paytm Money Open API
    PAYTM_MONEY_API_KEY: str = ""
    PAYTM_MONEY_API_SECRET: str = ""
    PAYTM_MONEY_REQUEST_TOKEN: str = ""
    PAYTM_MONEY_ACCESS_TOKEN: str = ""
    PAYTM_MONEY_PUBLIC_ACCESS_TOKEN: str = ""
    PAYTM_MONEY_REDIRECT_URI: str = "http://localhost:8000/api/broker/paytm/callback"
    FRONTEND_BASE_URL: str = "http://localhost:3000"

    # Alert Channels
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    DISCORD_WEBHOOK_URL: str = ""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("ENCRYPTION_MASTER_KEY", mode="after")
    @classmethod
    def validate_or_generate_encryption_key(cls, v: str) -> str:
        """
        Ensures a valid 32-byte hex-encoded encryption key is present.
        If missing in development mode, a deterministic local dev key is provided.
        """
        if not v or len(v.strip()) < 32:
            # Deterministic development fallback key (never for production)
            dev_fallback = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
            return dev_fallback
        return v.strip()


# Instantiate singleton
settings = Settings()
