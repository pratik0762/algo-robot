"""
ALGO ROBOT — Paytm Money PostgreSQL Persistence Service
Handles persistent storage of one-time OAuth state parameters (anti-CSRF),
AES-256-GCM encrypted credential vaulting, session token restoration on reboot,
and connection state lifecycle management.
"""

import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session

from app.core.security import encryption_service, hash_password
from app.db.models import BrokerCredential, BrokerName, OAuthState, User, UserRole

logger = logging.getLogger("algo_robot.market_data.paytm_db")


def create_oauth_state(db: Session, broker_name: str = "PAYTM_MONEY", ttl_seconds: int = 600) -> str:
    """
    Generates a cryptographically secure 256-bit URL-safe random state token,
    persists it into PostgreSQL with an expiration timestamp (default 10 min),
    and returns the state token for the OAuth login URL.
    """
    state_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)

    oauth_record = OAuthState(
        state=state_token,
        broker_name=broker_name,
        expires_at=expires_at,
        is_used=False,
    )
    db.add(oauth_record)
    db.commit()
    db.refresh(oauth_record)
    logger.info("Persisted new one-time OAuth state token in PostgreSQL (expires in %ds)", ttl_seconds)
    return state_token


def verify_and_consume_oauth_state(db: Session, state: Optional[str], broker_name: str = "PAYTM_MONEY") -> bool:
    """
    Validates that the received state exists in PostgreSQL, has not expired,
    and has not been previously consumed. If valid, marks is_used=True to prevent replay attacks.
    """
    if not state or not isinstance(state, str) or not state.strip():
        logger.warning("OAuth verification rejected: missing or blank state parameter")
        return False

    state_clean = state.strip()
    record = (
        db.query(OAuthState)
        .filter(OAuthState.state == state_clean, OAuthState.broker_name == broker_name)
        .first()
    )

    if not record:
        logger.warning("OAuth state verification failed: state token not found in PostgreSQL")
        return False

    if record.is_used:
        logger.warning("OAuth state verification failed: state token has ALREADY been consumed (replay attack detected)")
        return False

    now = datetime.now(timezone.utc)
    exp = record.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    if now >= exp:
        logger.warning("OAuth state verification failed: state token has expired at %s (now: %s)", exp, now)
        return False

    # Mark as consumed immediately
    record.is_used = True
    db.commit()
    logger.info("OAuth state token verified and consumed successfully in PostgreSQL")
    return True


def get_or_create_default_user(db: Session) -> User:
    """Retrieves an existing system user or initializes a primary institutional trader account."""
    user = db.query(User).first()
    if not user:
        user = User(
            email="trader@algorobot.local",
            hashed_password=hash_password("AlgoRobot2026!"),
            full_name="Algo Robot Institutional Trader",
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("Created primary institutional trader user (id: %s)", user.id)
    return user


def store_encrypted_paytm_session(
    db: Session,
    api_key: str,
    api_secret: str,
    access_token: str,
    public_access_token: str,
    read_access_token: str = "",
    user_details: Optional[Dict[str, Any]] = None,
) -> BrokerCredential:
    """
    Encrypts sensitive credentials (api_key, api_secret) and session tokens
    (access_token, public_access_token, read_access_token) using AES-256-GCM
    and stores them in PostgreSQL BrokerCredential table.
    """
    user = get_or_create_default_user(db)

    # Prepare plaintext JSON payloads
    credentials_payload = json.dumps({
        "api_key": api_key.strip(),
        "api_secret": api_secret.strip(),
    })
    tokens_payload = json.dumps({
        "access_token": access_token.strip(),
        "public_access_token": public_access_token.strip(),
        "read_access_token": (read_access_token or "").strip(),
        "user_details": user_details or {},
        "saved_at": datetime.now(timezone.utc).isoformat(),
    })

    # AES-256-GCM encryption at rest
    enc_credentials = encryption_service.encrypt(credentials_payload)
    enc_token = encryption_service.encrypt(tokens_payload)

    cred_record = (
        db.query(BrokerCredential)
        .filter(
            BrokerCredential.user_id == user.id,
            BrokerCredential.broker_name == BrokerName.PAYTM_MONEY,
        )
        .first()
    )

    if not cred_record:
        cred_record = BrokerCredential(
            user_id=user.id,
            broker_name=BrokerName.PAYTM_MONEY,
            encrypted_credentials=enc_credentials,
            encrypted_token=enc_token,
            is_active=True,
            last_authenticated_at=datetime.now(timezone.utc),
        )
        db.add(cred_record)
    else:
        cred_record.encrypted_credentials = enc_credentials
        cred_record.encrypted_token = enc_token
        cred_record.is_active = True
        cred_record.last_authenticated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(cred_record)
    logger.info("Encrypted and safely vaulted Paytm Money credentials and session tokens in PostgreSQL")
    return cred_record


def load_encrypted_paytm_session(db: Session) -> Optional[Dict[str, Any]]:
    """
    Retrieves and decrypts the active Paytm Money session tokens from PostgreSQL.
    Used for server reboot recovery without requiring re-authentication.
    """
    cred_record = (
        db.query(BrokerCredential)
        .filter(
            BrokerCredential.broker_name == BrokerName.PAYTM_MONEY,
            BrokerCredential.is_active.is_(True),
        )
        .first()
    )

    if not cred_record or not cred_record.encrypted_token:
        return None

    try:
        dec_tokens_str = encryption_service.decrypt(cred_record.encrypted_token)
        tokens_data = json.loads(dec_tokens_str)

        dec_creds_str = encryption_service.decrypt(cred_record.encrypted_credentials)
        creds_data = json.loads(dec_creds_str)

        return {
            "api_key": creds_data.get("api_key", ""),
            "api_secret": creds_data.get("api_secret", ""),
            "access_token": tokens_data.get("access_token", ""),
            "public_access_token": tokens_data.get("public_access_token", ""),
            "read_access_token": tokens_data.get("read_access_token", ""),
            "user_details": tokens_data.get("user_details", {}),
            "last_authenticated_at": cred_record.last_authenticated_at.isoformat() if cred_record.last_authenticated_at else None,
        }
    except Exception as e:
        logger.error("Failed to decrypt stored Paytm Money session: %s", e)
        return None


def deactivate_paytm_session(db: Session) -> None:
    """Deactivates and invalidates stored Paytm Money session in PostgreSQL on disconnect."""
    cred_records = (
        db.query(BrokerCredential)
        .filter(BrokerCredential.broker_name == BrokerName.PAYTM_MONEY)
        .all()
    )
    for record in cred_records:
        record.is_active = False
        record.encrypted_token = None
    db.commit()
    logger.info("Deactivated Paytm Money session in PostgreSQL")
