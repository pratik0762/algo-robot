"""
ALGO ROBOT — RFC 7519 Compliant JSON Web Token (JWT) Engine
===========================================================
High-performance, dependency-free HMAC-SHA256 (HS256) JWT engine.
Issues and validates cryptographically signed Access and Refresh tokens.
"""

from __future__ import annotations
import base64
from datetime import datetime, timezone, timedelta
import hashlib
import hmac
import json
import logging
import secrets
from typing import Any, Dict, Optional

from app.config import settings

logger = logging.getLogger("algo_robot.core.jwt")

# Default token lifetimes
DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES = 60         # 1 hour
DEFAULT_REFRESH_TOKEN_EXPIRE_DAYS = 14           # 14 days


class JWTError(Exception):
    """Base exception for JWT validation errors."""
    pass


class TokenExpiredError(JWTError):
    """Raised when token has exceeded its expiration timestamp."""
    pass


class InvalidTokenError(JWTError):
    """Raised when signature, format, or claims are malformed or invalid."""
    pass


def _base64url_encode(data: bytes) -> str:
    """Encodes bytes to base64url string without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _base64url_decode(data_str: str) -> bytes:
    """Decodes base64url string with dynamic padding restoration."""
    rem = len(data_str) % 4
    if rem > 0:
        data_str += "=" * (4 - rem)
    return base64.urlsafe_b64decode(data_str.encode("ascii"))


def create_access_token(
    user_id: int,
    role: str,
    email: str = "",
    expires_delta: Optional[timedelta] = None,
    custom_claims: Optional[Dict[str, Any]] = None,
) -> str:
    """Issues an HS256-signed Access Token containing user claims."""
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES))

    header = {
        "alg": "HS256",
        "typ": "JWT",
    }

    payload = {
        "sub": str(user_id),
        "user_id": user_id,
        "email": email,
        "role": role.upper(),
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "jti": secrets.token_hex(8),
    }

    if custom_claims:
        payload.update(custom_claims)

    return _encode_jwt(header, payload, settings.SECRET_KEY)


def create_refresh_token(
    user_id: int,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Issues an HS256-signed Refresh Token for session renewal."""
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(days=DEFAULT_REFRESH_TOKEN_EXPIRE_DAYS))

    header = {
        "alg": "HS256",
        "typ": "JWT",
    }

    payload = {
        "sub": str(user_id),
        "user_id": user_id,
        "type": "refresh",
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "jti": secrets.token_hex(16),
    }

    return _encode_jwt(header, payload, settings.SECRET_KEY)


def decode_token(token: str, verify_exp: bool = True) -> Dict[str, Any]:
    """Decodes, verifies signature, and validates claims of an HS256 JWT."""
    if not token or not isinstance(token, str):
        raise InvalidTokenError("Token string is missing or empty")

    parts = token.split(".")
    if len(parts) != 3:
        raise InvalidTokenError("Malformed JWT: token must contain exactly 3 dot-separated parts")

    header_b64, payload_b64, signature_b64 = parts[0], parts[1], parts[2]

    # Verify signature
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    expected_sig = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()
    expected_sig_b64 = _base64url_encode(expected_sig)

    if not hmac.compare_digest(signature_b64, expected_sig_b64):
        raise InvalidTokenError("Invalid token signature: tamper detected")

    # Decode and parse payload
    try:
        payload_bytes = _base64url_decode(payload_b64)
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception as e:
        raise InvalidTokenError(f"Could not parse payload JSON: {e}")

    # Expiration validation
    if verify_exp:
        exp = payload.get("exp")
        if exp is None:
            raise InvalidTokenError("Token missing 'exp' expiration claim")
        now_ts = int(datetime.now(timezone.utc).timestamp())
        if now_ts >= exp:
            raise TokenExpiredError(f"Token expired at {exp} (current time: {now_ts})")

    return payload


def hash_token(token: str) -> str:
    """Computes SHA-256 hash of a token for secure database indexing."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _encode_jwt(header: Dict[str, Any], payload: Dict[str, Any], secret_key: str) -> str:
    """Internal helper to sign and serialize JWT."""
    header_json = json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_json = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")

    header_b64 = _base64url_encode(header_json)
    payload_b64 = _base64url_encode(payload_json)

    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    signature = hmac.new(
        secret_key.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()
    sig_b64 = _base64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{sig_b64}"
