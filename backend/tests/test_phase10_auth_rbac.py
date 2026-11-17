"""
ALGO ROBOT — Phase 10 Verification Test Suite: Multi-User Architecture & RBAC
=============================================================================
Tests JWT generation, validation, expiration, and tampering.
Tests user registration, secure hashing, login, token rotation, and password reset.
Tests Role-Based Access Control (RBAC) hierarchy and endpoint protection.
"""

import os
import sys
import time
import pytest
from fastapi.testclient import TestClient

from app.core.jwt import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_token,
    TokenExpiredError,
    InvalidTokenError,
)
from app.core.security import hash_password, verify_password
from app.db.session import SessionLocal, init_db
from app.db.models import User, UserRole, RefreshToken
from app.auth.service import (
    AuthService,
    AuthException,
    InvalidCredentialsException,
    UserAlreadyExistsException,
    PermissionDeniedException,
)
from app.main import app

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    """Ensure tables exist before running auth tests."""
    init_db()
    yield


# =========================================================================
# 1. JWT Cryptographic Engine Tests
# =========================================================================

def test_jwt_create_and_decode():
    """Verify access token creation, payload claims, and decoding."""
    token = create_access_token(user_id=101, role="TRADER", email="trader101@algorobot.local")
    assert isinstance(token, str)
    assert len(token.split(".")) == 3

    payload = decode_token(token)
    assert payload["sub"] == "101"
    assert payload["role"] == "TRADER"
    assert payload["email"] == "trader101@algorobot.local"
    assert payload["type"] == "access"
    assert payload["exp"] > time.time()


def test_jwt_expired_token():
    """Expired tokens must raise TokenExpiredError."""
    # Create token that expired 10 seconds ago
    import json
    import base64
    import hmac
    import hashlib
    from app.config import settings

    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    now = int(time.time())
    payload_data = {"sub": "102", "role": "VIEWER", "type": "access", "exp": now - 10}
    payload_encoded = base64.urlsafe_b64encode(json.dumps(payload_data).encode()).decode().rstrip("=")
    signing_input = f"{header}.{payload_encoded}"
    signature = base64.urlsafe_b64encode(
        hmac.new(settings.SECRET_KEY.encode(), signing_input.encode(), hashlib.sha256).digest()
    ).decode().rstrip("=")

    expired_token = f"{signing_input}.{signature}"

    with pytest.raises(TokenExpiredError):
        decode_token(expired_token)


def test_jwt_tampered_signature():
    """Tampering with token content or signature must raise InvalidTokenError."""
    token = create_access_token(user_id=103, role="ADMIN")
    parts = token.split(".")
    tampered_token = f"{parts[0]}.{parts[1]}.invalidsignaturexyz123"

    with pytest.raises(InvalidTokenError):
        decode_token(tampered_token)


def test_refresh_token_and_hash():
    """Verify refresh token properties and deterministic SHA-256 hash."""
    ref_token = create_refresh_token(user_id=105)
    payload = decode_token(ref_token)
    assert payload["sub"] == "105"
    assert payload["type"] == "refresh"

    h1 = hash_token(ref_token)
    h2 = hash_token(ref_token)
    assert h1 == h2
    assert len(h1) == 64


# =========================================================================
# 2. AuthService Core Registration, Login & Rotation Tests
# =========================================================================

def test_auth_service_registration():
    """Test user registration with password hashing and risk profile attachment."""
    auth_srv = AuthService()
    email = f"user_{int(time.time()*1000)}@algorobot.test"

    user = auth_srv.register_user(
        email=email,
        password="SuperSecretPassword123!",
        full_name="Algorithmic Trader",
        role="TRADER",
    )
    assert user["email"] == email
    assert user["role"] == "TRADER"
    assert user["full_name"] == "Algorithmic Trader"
    assert user["is_active"] is True

    # Duplicate registration must fail
    with pytest.raises(UserAlreadyExistsException):
        auth_srv.register_user(email=email, password="AnotherPassword999!")


def test_auth_service_invalid_registration():
    """Rejects malformed emails and short passwords."""
    auth_srv = AuthService()
    with pytest.raises(AuthException, match="Invalid email format"):
        auth_srv.register_user(email="not-an-email", password="ValidPassword123!")

    with pytest.raises(AuthException, match="at least 8 characters"):
        auth_srv.register_user(email="valid@algorobot.test", password="short")


def test_auth_service_authentication_and_rotation():
    """Test login, token issuance, refresh token rotation, and reuse defense."""
    auth_srv = AuthService()
    email = f"rotate_{int(time.time()*1000)}@algorobot.test"
    password = "SafePassword999!"

    auth_srv.register_user(email=email, password=password, role="TRADER")

    # Login with wrong password
    with pytest.raises(InvalidCredentialsException):
        auth_srv.authenticate_user(email=email, password="WrongPassword!")

    # Login with correct password
    login_data = auth_srv.authenticate_user(email=email, password=password)
    access_token = login_data["access_token"]
    refresh_token = login_data["refresh_token"]
    assert access_token and refresh_token

    # Rotate refresh token
    new_tokens = auth_srv.refresh_access_token(refresh_token)
    assert new_tokens["access_token"]
    assert new_tokens["refresh_token"]
    assert new_tokens["refresh_token"] != refresh_token

    # Re-using the revoked refresh token must be rejected
    with pytest.raises(InvalidCredentialsException):
        auth_srv.refresh_access_token(refresh_token)


def test_auth_service_change_password():
    """Test password update and session invalidation."""
    auth_srv = AuthService()
    email = f"pwd_{int(time.time()*1000)}@algorobot.test"
    old_pwd = "OldPassword123!"
    new_pwd = "NewBrandPassword456!"

    user = auth_srv.register_user(email=email, password=old_pwd, role="TRADER")
    tokens = auth_srv.authenticate_user(email=email, password=old_pwd)

    # Change password
    auth_srv.change_password(user_id=user["id"], old_password=old_pwd, new_password=new_pwd)

    # Old password no longer works
    with pytest.raises(InvalidCredentialsException):
        auth_srv.authenticate_user(email=email, password=old_pwd)

    # New password succeeds
    login_new = auth_srv.authenticate_user(email=email, password=new_pwd)
    assert login_new["access_token"]

    # Old refresh token is revoked
    with pytest.raises(InvalidCredentialsException):
        auth_srv.refresh_access_token(tokens["refresh_token"])


# =========================================================================
# 3. RBAC Hierarchy & Permissions Tests
# =========================================================================

def test_rbac_role_elevation_permissions():
    """SuperAdmin can promote to any role; Admin cannot assign SUPER_ADMIN; Trader cannot modify."""
    auth_srv = AuthService()
    sa_email = f"sa_{int(time.time()*1000)}@algorobot.test"
    admin_email = f"admin_{int(time.time()*1000)}@algorobot.test"
    target_email = f"target_{int(time.time()*1000)}@algorobot.test"

    sa_user = auth_srv.register_user(email=sa_email, password="SuperPassword123!", role="SUPER_ADMIN")
    admin_user = auth_srv.register_user(email=admin_email, password="AdminPassword123!", role="ADMIN")
    target_user = auth_srv.register_user(email=target_email, password="TargetPassword123!", role="VIEWER")

    # Trader/Viewer cannot promote
    with pytest.raises(PermissionDeniedException):
        auth_srv.update_user_role(admin_user=target_user, target_user_id=target_user["id"], new_role="TRADER")

    # Admin cannot promote to SUPER_ADMIN
    with pytest.raises(PermissionDeniedException):
        auth_srv.update_user_role(admin_user=admin_user, target_user_id=target_user["id"], new_role="SUPER_ADMIN")

    # Admin CAN promote to TRADER
    promoted = auth_srv.update_user_role(admin_user=admin_user, target_user_id=target_user["id"], new_role="TRADER")
    assert promoted["role"] == "TRADER"

    # SuperAdmin CAN promote to SUPER_ADMIN
    promoted_sa = auth_srv.update_user_role(admin_user=sa_user, target_user_id=target_user["id"], new_role="SUPER_ADMIN")
    assert promoted_sa["role"] == "SUPER_ADMIN"


# =========================================================================
# 4. REST Endpoints Integration Tests (TestClient)
# =========================================================================

def test_endpoint_auth_lifecycle():
    """Verify registration, login, /me, profile update, and logout endpoints."""
    email = f"rest_{int(time.time()*1000)}@algorobot.test"
    pwd = "RestUserSecret123!"

    # 1. Register
    reg_res = client.post("/api/auth/register", json={
        "email": email,
        "password": pwd,
        "full_name": "REST Test User",
        "role": "TRADER",
    })
    assert reg_res.status_code == 201
    assert reg_res.json()["user"]["email"] == email

    # 2. Login
    login_res = client.post("/api/auth/login", json={"email": email, "password": pwd})
    assert login_res.status_code == 200
    token_data = login_res.json()
    access_token = token_data["access_token"]
    refresh_token = token_data["refresh_token"]

    # 3. GET /me with Bearer token
    headers = {"Authorization": f"Bearer {access_token}"}
    me_res = client.get("/api/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["user"]["email"] == email

    # 4. GET /me without token fails
    assert client.get("/api/auth/me").status_code == 401

    # 5. PUT /profile
    prof_res = client.put("/api/auth/profile", json={"full_name": "Updated Profile Name"}, headers=headers)
    assert prof_res.status_code == 200
    assert prof_res.json()["user"]["full_name"] == "Updated Profile Name"

    # 6. POST /refresh
    ref_res = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert ref_res.status_code == 200
    assert "access_token" in ref_res.json()

    # 7. POST /logout
    logout_res = client.post("/api/auth/logout", json={"refresh_token": ref_res.json()["refresh_token"]})
    assert logout_res.status_code == 200


def test_endpoint_rbac_order_placement_restriction():
    """A VIEWER user must be blocked with 403 when attempting to place orders; TRADER succeeds."""
    auth_srv = AuthService()
    viewer_email = f"viewer_{int(time.time()*1000)}@algorobot.test"
    trader_email = f"trader_{int(time.time()*1000)}@algorobot.test"
    pwd = "ValidPassword123!"

    auth_srv.register_user(email=viewer_email, password=pwd, role="VIEWER")
    auth_srv.register_user(email=trader_email, password=pwd, role="TRADER")

    viewer_login = auth_srv.authenticate_user(email=viewer_email, password=pwd)
    trader_login = auth_srv.authenticate_user(email=trader_email, password=pwd)

    viewer_headers = {"Authorization": f"Bearer {viewer_login['access_token']}"}
    trader_headers = {"Authorization": f"Bearer {trader_login['access_token']}"}

    order_payload = {
        "symbol": "RELIANCE",
        "side": "BUY",
        "order_type": "MARKET",
        "quantity": 1,
        "product": "MIS",
        "execution_mode": "PAPER",
    }

    # VIEWER is blocked with 403 Forbidden
    res_viewer = client.post("/api/orders/place", json=order_payload, headers=viewer_headers)
    assert res_viewer.status_code == 403
    assert "Trader privileges required" in res_viewer.json()["detail"]

    # TRADER succeeds with 200 OK
    res_trader = client.post("/api/orders/place", json=order_payload, headers=trader_headers)
    assert res_trader.status_code == 200
    assert res_trader.json()["status"] == "success"
