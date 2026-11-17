"""
Unit and Integration Test Suite — Phase 1: Security, Environment & Database Foundation
========================================================================================
Validates:
1. Pydantic Settings configuration & validation
2. AES-256-GCM symmetric encryption, nonce uniqueness & tamper detection
3. PBKDF2 password hashing & verification
4. SSRF guard blocking private, loopback & metadata IPs
5. SQLAlchemy 2.0 models & database session operations
6. In-memory / Redis fallback caching
7. Encrypted broker credential management
"""

import os
import sys
import pytest
from datetime import datetime, timezone

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.config import settings
from app.core.security import encryption_service, EncryptionService, hash_password, verify_password
from app.core.ssrf import validate_outbound_url
from app.core.redis_client import InMemoryFallbackCache
from app.db.session import init_db, SessionLocal, engine
from app.db.models import (
    Base,
    User,
    UserRole,
    BrokerCredential,
    BrokerName,
    Order,
    OrderStatus,
    TransactionType,
    Trade,
    SignalRecord,
    SignalStatus,
    RiskSetting,
)


# -----------------------------------------------------------------------------
# 1. Configuration & Settings Tests
# -----------------------------------------------------------------------------
def test_settings_initialization():
    assert settings.APP_NAME == "ALGO ROBOT Trading Platform"
    assert settings.DATA_SOURCE_MODE == "REAL_ONLY"
    assert len(settings.ENCRYPTION_MASTER_KEY) >= 32
    assert settings.ACCESS_TOKEN_EXPIRE_MINUTES > 0


# -----------------------------------------------------------------------------
# 2. Cryptographic Security & AES-256-GCM Tests
# -----------------------------------------------------------------------------
def test_aes_gcm_encryption_roundtrip():
    secret_text = "zerodha_kite_access_token_super_secret_xyz123"
    encrypted = encryption_service.encrypt(secret_text)
    
    assert encrypted != secret_text
    assert len(encrypted) > len(secret_text)
    
    # Decryption recovers exact plaintext
    decrypted = encryption_service.decrypt(encrypted)
    assert decrypted == secret_text


def test_aes_gcm_nonce_uniqueness():
    secret_text = "same_secret_encrypted_twice"
    enc1 = encryption_service.encrypt(secret_text)
    enc2 = encryption_service.encrypt(secret_text)
    
    # Nonces must be random; identical plaintexts must produce different ciphertexts
    assert enc1 != enc2
    assert encryption_service.decrypt(enc1) == secret_text
    assert encryption_service.decrypt(enc2) == secret_text


def test_aes_gcm_tamper_detection():
    secret_text = "critical_trading_credential"
    encrypted = encryption_service.encrypt(secret_text)
    
    # Tamper with the ciphertext byte stream
    tampered = encrypted[:-2] + ("A" if encrypted[-1] != "A" else "B") + encrypted[-1:]
    
    with pytest.raises(ValueError, match="Decryption failed"):
        encryption_service.decrypt(tampered)


def test_password_hashing():
    raw_pass = "TraderSuperSecretPassword!2026"
    hashed = hash_password(raw_pass)
    
    assert hashed != raw_pass
    assert "$" in hashed
    assert verify_password(raw_pass, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False


# -----------------------------------------------------------------------------
# 3. SSRF Protection Tests
# -----------------------------------------------------------------------------
def test_ssrf_blocks_loopback_and_private_ips():
    forbidden_urls = [
        "http://localhost:8000/admin",
        "http://127.0.0.1:5000/metrics",
        "http://10.0.0.1/internal",
        "http://192.168.1.1/router-login",
        "http://169.254.169.254/latest/meta-data/",  # AWS metadata
        "http://metadata.google.internal/computeMetadata/v1/", # GCP metadata
    ]
    
    for url in forbidden_urls:
        with pytest.raises(ValueError, match="SSRF Protection"):
            validate_outbound_url(url, allow_private=False)


def test_ssrf_rejects_unsupported_schemes():
    with pytest.raises(ValueError, match="Unsupported scheme"):
        validate_outbound_url("ftp://example.com/file.txt")
    
    with pytest.raises(ValueError, match="Unsupported scheme"):
        validate_outbound_url("file:///etc/passwd")


# -----------------------------------------------------------------------------
# 4. Database Schema, Models & Transaction Tests
# -----------------------------------------------------------------------------
@pytest.fixture(scope="module")
def db_session():
    init_db()
    session = SessionLocal()
    yield session
    session.close()


def test_database_user_and_credential_creation(db_session):
    # Create test user
    test_email = f"trader_{int(datetime.now().timestamp())}@algorobot.test"
    user = User(
        email=test_email,
        hashed_password=hash_password("test_pass_123"),
        full_name="Algorithmic Quantitative Trader",
        role=UserRole.TRADER,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    assert user.id is not None
    assert user.email == test_email

    # Add encrypted broker credentials
    raw_api_secret = "angel_one_secret_key_884920"
    encrypted_secret = encryption_service.encrypt(raw_api_secret)

    cred = BrokerCredential(
        user_id=user.id,
        broker_name=BrokerName.ANGEL,
        encrypted_credentials=encrypted_secret,
        is_active=True,
    )
    db_session.add(cred)
    db_session.commit()
    db_session.refresh(cred)

    assert cred.id is not None
    # Decrypt and verify
    assert encryption_service.decrypt(cred.encrypted_credentials) == raw_api_secret

    # Verify risk setting profile
    risk = RiskSetting(
        user_id=user.id,
        max_daily_loss=15000.0,
        max_capital_per_trade=60000.0,
        max_open_positions=4,
        is_kill_switch_active=False,
    )
    db_session.add(risk)
    db_session.commit()
    db_session.refresh(risk)

    assert risk.max_daily_loss == 15000.0
    assert risk.is_kill_switch_active is False


def test_database_order_and_trade_flow(db_session):
    # Query an existing user or create one
    user = db_session.query(User).first()
    assert user is not None

    # Place an order
    order = Order(
        user_id=user.id,
        broker_order_id="ORD-NSE-2026-9901",
        symbol="RELIANCE",
        exchange="NSE",
        transaction_type=TransactionType.BUY,
        product_type="MIS",
        order_type="MARKET",
        quantity=50,
        filled_quantity=50,
        price=2950.50,
        average_price=2950.50,
        status=OrderStatus.COMPLETE,
        is_paper=True,
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)

    assert order.id is not None
    assert order.status == OrderStatus.COMPLETE

    # Record trade fill with regulatory cost breakdown
    trade = Trade(
        order_id=order.id,
        user_id=user.id,
        symbol="RELIANCE",
        exchange="NSE",
        transaction_type=TransactionType.BUY,
        quantity=50,
        execution_price=2950.50,
        brokerage=20.0,
        stt_tax=36.88,
        exchange_turnover_fee=4.35,
        gst=4.38,
        sebi_turnover_fee=0.15,
        stamp_duty=2.21,
        total_charges=67.97,
        net_pnl=0.0,
    )
    db_session.add(trade)
    db_session.commit()
    db_session.refresh(trade)

    assert trade.id is not None
    assert trade.total_charges == 67.97
    assert trade.order_id == order.id


def test_database_signal_record_lifecycle(db_session):
    sig = SignalRecord(
        symbol="HDFCBANK",
        timeframe="5m",
        strategy_name="SmartMoney_OrderBlock_Bullish",
        signal_type="BUY",
        entry_price=1620.0,
        stop_loss=1605.0,
        target_1=1645.0,
        target_2=1665.0,
        status=SignalStatus.ACTIVE,
    )
    db_session.add(sig)
    db_session.commit()
    db_session.refresh(sig)

    assert sig.id is not None
    assert sig.status == SignalStatus.ACTIVE

    # Simulate target hit transition
    sig.status = SignalStatus.TARGET_HIT
    sig.exit_price = 1645.0
    sig.pnl_points = 25.0
    sig.pnl_percentage = (25.0 / 1620.0) * 100.0
    sig.closed_at = datetime.now(timezone.utc)
    db_session.commit()
    db_session.refresh(sig)

    assert sig.status == SignalStatus.TARGET_HIT
    assert sig.pnl_points == 25.0


# -----------------------------------------------------------------------------
# 5. In-Memory / Redis Fallback Cache Tests
# -----------------------------------------------------------------------------
def test_in_memory_fallback_cache():
    cache = InMemoryFallbackCache()
    
    # Basic sync get/set
    cache.set_sync("test_key", {"price": 1250.75, "symbol": "INFY"})
    val = cache.get_sync("test_key")
    assert val is not None
    assert b"INFY" in val

    # Expiry test
    cache.set_sync("ephemeral_key", "short_lived_tick", ex=1)
    val_active = cache.get_sync("ephemeral_key")
    assert val_active == b"short_lived_tick"

    # Delete
    deleted = cache.delete_sync("test_key")
    assert deleted == 1
    assert cache.get_sync("test_key") is None
