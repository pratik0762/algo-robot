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
    PaytmSessionRequest,
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
