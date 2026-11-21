"""
ALGO ROBOT — Paytm Money Authentication & Session Security Tests
Validates credentials, session exchange, OAuth flow, JWT token headers,
and verifies zero exposure of sensitive API keys or secrets.
"""

import json
from unittest.mock import MagicMock, patch
import pytest
from app.config import Settings
from app.market_data.paytm_auth import (
    PaytmMoneyAuthService,
    mask_credential,
    paytm_auth_service,
)
from app.market_data.api_router import (
    get_paytm_status,
    get_paytm_login_url,
    generate_paytm_session,
    logout_paytm,
    login_paytm_redirect,
    paytm_oauth_callback,
    api_paytm_connect,
    api_paytm_disconnect,
    PaytmSessionRequest,
)
from app.db.session import SessionLocal, init_db
from app.db.models import OAuthState, BrokerCredential, BrokerName
from app.market_data.paytm_db_service import (
    create_oauth_state,
    verify_and_consume_oauth_state,
    store_encrypted_paytm_session,
    load_encrypted_paytm_session,
    deactivate_paytm_session,
)


def test_credential_masking():
    """Verify masking utility conceals secret values correctly."""
    assert mask_credential("") == ""
    assert mask_credential(None) == ""
    assert mask_credential("short") == "***"
    
    test_secret = "my_super_secret_paytm_key_12345"
    masked = mask_credential(test_secret, prefix_len=3, suffix_len=3)
    
    assert masked.startswith("my_")
    assert masked.endswith("345")
    assert "..." in masked
    assert "super_secret" not in masked
    assert len(masked) < len(test_secret)


def test_paytm_auth_service_credentials_validation():
    """Verify validation status reports readiness without leaking secret content."""
    service = PaytmMoneyAuthService()
    
    # Configure dummy credentials
    dummy_key = "dummy_api_key_abc123"
    dummy_secret = "dummy_api_secret_xyz789"
    service.configure_credentials(api_key=dummy_key, api_secret=dummy_secret)
    
    status = service.validate_credentials()
    
    assert status["provider"] == "PAYTM_MONEY"
    assert status["api_key_configured"] is True
    assert status["api_secret_configured"] is True
    assert status["is_ready_for_session"] is True
    
    # Assert raw secret is NEVER in the returned status dictionary
    assert dummy_secret not in str(status)
    assert dummy_key not in status["api_key_masked"]
    assert "..." in status["api_key_masked"]


def test_paytm_login_url_generation():
    """Verify login URL format complies with official merchant login structure."""
    service = PaytmMoneyAuthService()
    service.configure_credentials(api_key="test_key_999")
    
    url = service.get_login_url(state="user_state_session")
    assert url.startswith("https://login.paytmmoney.com/merchant-login?apiKey=test_key_999")
    assert "state=user_state_session" in url


def test_session_generation_success():
    """Verify token acquisition and header generation on valid API exchange."""
    service = PaytmMoneyAuthService()
    service.configure_credentials(
        api_key="mock_key_1234",
        api_secret="mock_secret_5678",
        request_token="req_tok_9999",
    )
    
    mock_response_body = json.dumps({
        "data": {
            "accessToken": "jwt_access_token_mock_val",
            "publicAccessToken": "jwt_public_token_mock_val",
            "readAccessToken": "jwt_read_token_mock_val",
        },
        "status": "success",
        "message": "Session generated successfully",
    }).encode("utf-8")
    
    mock_resp = MagicMock()
    mock_resp.read.return_value = mock_response_body
    mock_resp.__enter__.return_value = mock_resp
    
    with patch("urllib.request.urlopen", return_value=mock_resp):
        res = service.generate_session(request_token="req_tok_9999")
        
        assert res["status"] == "success"
        assert res["authenticated"] is True
        assert service.is_authenticated() is True
        assert service.get_access_token() == "jwt_access_token_mock_val"
        assert service.get_public_access_token() == "jwt_public_token_mock_val"
        
        headers = service.get_auth_headers()
        assert headers == {"x-jwt-token": "jwt_access_token_mock_val"}


def test_session_generation_direct_token_setting():
    """Verify setting tokens directly (from .env pre-generated session) functions seamlessly."""
    service = PaytmMoneyAuthService()
    service.set_tokens(
        access_token="direct_access_token_xyz",
        public_access_token="direct_public_token_xyz",
    )
    
    assert service.is_authenticated() is True
    assert service.get_access_token() == "direct_access_token_xyz"
    assert service.get_public_access_token() == "direct_public_token_xyz"
    assert service.get_auth_headers()["x-jwt-token"] == "direct_access_token_xyz"


def test_api_broker_paytm_endpoints():
    """Verify router endpoints for status, login URL, session generation, and logout."""
    # 1. Status endpoint
    status_data = get_paytm_status()
    assert status_data["provider"] == "PAYTM_MONEY"
    assert "api_secret" not in status_data  # Ensure secret is never exposed
    assert "api_key_masked" in status_data

    # 2. Login URL endpoint
    paytm_auth_service.configure_credentials(
        api_key="route_test_key_123",
        api_secret="route_test_secret_456",
    )
    url_data = get_paytm_login_url(state="test_state_123")
    assert url_data["status"] == "success"
    assert "https://login.paytmmoney.com/merchant-login" in url_data["login_url"]
    assert "state=test_state_123" in url_data["login_url"]

    # 3. Session generation endpoint with mocked API response
    mock_response_body = json.dumps({
        "data": {
            "accessToken": "route_jwt_token_456",
            "publicAccessToken": "route_public_token_456",
        },
        "status": "success",
    }).encode("utf-8")

    mock_resp = MagicMock()
    mock_resp.read.return_value = mock_response_body
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp):
        payload = PaytmSessionRequest(request_token="valid_request_token_abc")
        session_data = generate_paytm_session(payload)
        assert session_data["status"] == "success"
        assert session_data["authenticated"] is True
        assert paytm_auth_service.is_authenticated() is True
        assert paytm_auth_service.get_access_token() == "route_jwt_token_456"

    # 4. Logout endpoint
    logout_data = logout_paytm(revoke_remote=False)
    assert logout_data["status"] == "success"
    assert paytm_auth_service.is_authenticated() is False


def test_auth_callback_registration_and_trigger():
    """Verify that registering an auth callback triggers when session is established."""
    service = PaytmMoneyAuthService()
    callback_fired = False

    def dummy_callback():
        nonlocal callback_fired
        callback_fired = True

    service.register_auth_callback(dummy_callback)
    service.set_tokens(access_token="test_jwt_callback_token")

    assert callback_fired is True
    assert service.is_authenticated() is True

    # Cleanup
    service.logout(revoke_remote=False)


def test_login_paytm_redirect():
    """Verify login redirect endpoint returns HTTP 307 to Paytm merchant login."""
    paytm_auth_service.configure_credentials(api_key="redirect_test_key_777")
    resp = login_paytm_redirect(state="test_redirect_state")
    assert resp.status_code == 307
    assert "https://login.paytmmoney.com/merchant-login" in resp.headers["location"]
    assert "apiKey=redirect_test_key_777" in resp.headers["location"]
    assert "state=test_redirect_state" in resp.headers["location"]


@pytest.mark.asyncio
async def test_paytm_oauth_callback_direct_backend_processing():
    """
    CRITICAL TEST: Verify request_token is received and processed directly in the backend,
    auto-exchanging for JWT access token and returning success HTML with postMessage.
    """
    paytm_auth_service.configure_credentials(
        api_key="backend_cb_key_888",
        api_secret="backend_cb_secret_888"
    )

    mock_response_body = json.dumps({
        "data": {
            "accessToken": "backend_received_access_jwt",
            "publicAccessToken": "backend_received_public_jwt",
        },
        "status": "success",
    }).encode("utf-8")

    mock_resp = MagicMock()
    mock_resp.read.return_value = mock_response_body
    mock_resp.__enter__.return_value = mock_resp

    mock_request = MagicMock()
    mock_request.method = "GET"

    with patch("urllib.request.urlopen", return_value=mock_resp):
        response = await paytm_oauth_callback(
            request=mock_request,
            requestToken="automated_token_from_paytm_browser"
        )
        assert response.status_code == 200
        html = response.body.decode("utf-8")
        assert "Paytm Money Connected!" in html
        assert "PAYTM_AUTH_SUCCESS" in html
        assert paytm_auth_service.is_authenticated() is True
        assert paytm_auth_service.get_access_token() == "backend_received_access_jwt"


@pytest.mark.asyncio
async def test_paytm_oauth_callback_error_handling():
    """Verify callback handles denial or error parameters gracefully with 400 HTML page."""
    mock_request = MagicMock()
    mock_request.method = "GET"

    response = await paytm_oauth_callback(
        request=mock_request,
        error="access_denied",
        error_description="User cancelled authorization"
    )
    assert response.status_code == 400
    html = response.body.decode("utf-8")
    assert "Paytm Authentication Denied" in html
    assert "User cancelled authorization" in html


def test_pmclient_official_sdk_login_and_user_details():
    """Verify official pyPMClient SDK PMClient methods generate URL and handle sessions."""
    from pmClient import PMClient
    pm = PMClient(api_key="sdk_test_key_111", api_secret="sdk_test_secret_222")
    login_url = pm.login("state_xyz_123")
    assert "apiKey=sdk_test_key_111" in login_url
    assert "state=state_xyz_123" in login_url
    assert "login.paytmmoney.com/merchant-login" in login_url


def test_oauth_state_persistence_and_one_time_consumption():
    """
    CRITICAL SECURITY TEST:
    Verify that one-time OAuth state is persisted in PostgreSQL,
    succeeds once, and rejects replay attacks upon immediate reuse.
    """
    init_db()
    with SessionLocal() as db:
        state_token = create_oauth_state(db, broker_name="PAYTM_MONEY", ttl_seconds=300)
        assert len(state_token) >= 32

        # 1. State must exist in PostgreSQL
        record = db.query(OAuthState).filter(OAuthState.state == state_token).first()
        assert record is not None
        assert record.is_used is False

        # 2. First verification: must SUCCEED and mark consumed
        is_valid = verify_and_consume_oauth_state(db, state_token)
        assert is_valid is True

        # Check in DB that is_used is now True
        db.refresh(record)
        assert record.is_used is True

        # 3. Second verification: Replay attack with same state must be REJECTED
        is_reused = verify_and_consume_oauth_state(db, state_token)
        assert is_reused is False

        # 4. Unknown/random state must be REJECTED
        assert verify_and_consume_oauth_state(db, "forged_random_state") is False


def test_encrypted_credential_and_session_vaulting_in_postgresql():
    """
    CRITICAL SECURITY TEST:
    Verify API keys, secrets, and JWT access tokens are stored AES-256-GCM encrypted
    in the database and decrypted cleanly on recovery.
    """
    init_db()
    with SessionLocal() as db:
        test_key = "pm_api_key_secret_vault_99"
        test_sec = "pm_api_sec_secret_vault_88"
        test_acc = "pm_jwt_acc_token_top_secret_77"
        test_pub = "pm_jwt_pub_token_secret_66"
        test_read = "pm_jwt_read_token_secret_55"
        user_info = {"name": "Test Trader", "clientCode": "PM9081"}

        # Store in PostgreSQL
        record = store_encrypted_paytm_session(
            db=db,
            api_key=test_key,
            api_secret=test_sec,
            access_token=test_acc,
            public_access_token=test_pub,
            read_access_token=test_read,
            user_details=user_info,
        )

        assert record.is_active is True

        # Ensure raw secret and token are NOT stored in plaintext in the database columns!
        assert test_sec not in record.encrypted_credentials
        assert test_acc not in record.encrypted_token

        # Load and decrypt
        loaded = load_encrypted_paytm_session(db)
        assert loaded is not None
        assert loaded["api_key"] == test_key
        assert loaded["api_secret"] == test_sec
        assert loaded["access_token"] == test_acc
        assert loaded["public_access_token"] == test_pub
        assert loaded["read_access_token"] == test_read
        assert loaded["user_details"]["name"] == "Test Trader"


def test_api_brokers_paytm_connect_endpoint():
    """Verify POST /api/brokers/paytm/connect initiates state and returns login URL."""
    init_db()
    paytm_auth_service.configure_credentials(api_key="api_connect_key_123", api_secret="api_connect_sec_456")
    with SessionLocal() as db:
        res = api_paytm_connect(db=db)
        assert res["status"] == "success"
        assert "login_url" in res
        assert "state" in res
        assert res["provider"] == "PAYTM_MONEY"

        # Verify state exists in PostgreSQL
        state_record = db.query(OAuthState).filter(OAuthState.state == res["state"]).first()
        assert state_record is not None
        assert state_record.is_used is False


@pytest.mark.asyncio
async def test_api_brokers_paytm_callback_with_state_validation():
    """Verify callback validates real state from PostgreSQL and marks it consumed."""
    init_db()
    paytm_auth_service.configure_credentials(
        api_key="cb_state_key_111",
        api_secret="cb_state_sec_222"
    )

    mock_response_body = json.dumps({
        "data": {
            "accessToken": "jwt_verified_state_token",
            "publicAccessToken": "jwt_public_state_token",
        },
        "status": "success",
    }).encode("utf-8")

    mock_resp = MagicMock()
    mock_resp.read.return_value = mock_response_body
    mock_resp.__enter__.return_value = mock_resp

    mock_request = MagicMock()
    mock_request.method = "GET"

    with SessionLocal() as db:
        # Create a valid state in PostgreSQL
        valid_state = create_oauth_state(db, broker_name="PAYTM_MONEY", ttl_seconds=300)

        with patch("urllib.request.urlopen", return_value=mock_resp):
            # 1. First callback with valid state -> 200 SUCCESS
            resp = await paytm_oauth_callback(
                request=mock_request,
                requestToken="req_tok_val_123",
                state=valid_state,
                db=db
            )
            assert resp.status_code == 200
            assert "Paytm Money Connected!" in resp.body.decode("utf-8")

            # 2. Re-invoking callback with the SAME consumed state -> 400 REJECTED
            resp_replay = await paytm_oauth_callback(
                request=mock_request,
                requestToken="req_tok_val_123",
                state=valid_state,
                db=db
            )
            assert resp_replay.status_code == 400
            assert "Invalid or Expired State Token" in resp_replay.body.decode("utf-8")


def test_api_brokers_paytm_disconnect_and_state_recovery():
    """Verify disconnect invalidates session in DB, and restart restores active session."""
    init_db()
    with SessionLocal() as db:
        # 1. Setup active session in DB and service
        paytm_auth_service.set_tokens(
            access_token="session_recovery_access_jwt",
            public_access_token="session_recovery_public_jwt"
        )
        paytm_auth_service.configure_credentials(
            api_key="recovery_test_key",
            api_secret="recovery_test_secret"
        )
        paytm_auth_service._user_details = {"name": "Recovery User"}
        paytm_auth_service.save_session_to_db(db)

        # 2. Simulate server restart: Wipe in-memory session tokens
        paytm_auth_service._access_token = ""
        paytm_auth_service._public_access_token = ""
        paytm_auth_service._last_auth_time = None
        assert paytm_auth_service.is_authenticated() is False

        # 3. Server restart recovery: Restore from PostgreSQL
        restored = paytm_auth_service.restore_session_from_db(db)
        assert restored is True
        assert paytm_auth_service.is_authenticated() is True
        assert paytm_auth_service.get_access_token() == "session_recovery_access_jwt"

        # 4. Disconnect endpoint
        disc_res = api_paytm_disconnect(db=db)
        assert disc_res["status"] == "success"
        assert paytm_auth_service.is_authenticated() is False

        # Check DB status is deactivated
        cred = db.query(BrokerCredential).filter(BrokerCredential.broker_name == BrokerName.PAYTM_MONEY).first()
        assert cred.is_active is False


