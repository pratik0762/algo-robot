"""
ALGO ROBOT — Paytm Money Authentication & Session Manager
Handles OAuth login URL generation, request_token exchange, JWT access token
lifecycle, security masking, and session persistence without exposing secrets.
"""

from __future__ import annotations
import os
import json
import asyncio
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional
import urllib.request
import urllib.error

from app.config import Settings

logger = logging.getLogger("algo_robot.market_data.paytm_auth")

PAYTM_LOGIN_BASE_URL = "https://login.paytmmoney.com/merchant-login"
PAYTM_API_BASE_URL = "https://developer.paytmmoney.com"
SESSION_GENERATE_ENDPOINT = "/open-api/v1/generate-session"
SESSION_LOGOUT_ENDPOINT = "/open-api/v1/logout"


def mask_credential(value: Optional[str], prefix_len: int = 3, suffix_len: int = 3) -> str:
    """Masks a credential string, showing only prefix and suffix characters."""
    if not value:
        return ""
    val_str = str(value).strip()
    if len(val_str) <= (prefix_len + suffix_len):
        return "***"
    return f"{val_str[:prefix_len]}...{val_str[-suffix_len:]}"


class PaytmMoneyAuthService:
    """
    Thread-safe authentication service for Paytm Money Open API.
    Manages API keys, secrets, request-token exchanges, and JWT tokens.
    """

    _instance: Optional[PaytmMoneyAuthService] = None
    _lock = threading.RLock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
            return cls._instance

    def __init__(self, settings: Optional[Settings] = None):
        with self._lock:
            if getattr(self, "_initialized", False):
                return
            self._settings = settings or Settings()
            self._api_key: str = self._settings.PAYTM_MONEY_API_KEY.strip()
            self._api_secret: str = self._settings.PAYTM_MONEY_API_SECRET.strip()
            self._request_token: str = self._settings.PAYTM_MONEY_REQUEST_TOKEN.strip()
            self._access_token: str = self._settings.PAYTM_MONEY_ACCESS_TOKEN.strip()
            self._public_access_token: str = self._settings.PAYTM_MONEY_PUBLIC_ACCESS_TOKEN.strip()
            self._read_access_token: str = ""
            self._last_auth_time: Optional[float] = None
            self._token_file = os.path.join(os.path.dirname(__file__), ".paytm_tokens.json")
            self._auth_callbacks: List[Callable[[], Any]] = []

            # Try to load existing cached session tokens if present
            self._load_cached_session()

            # If access token was supplied in settings or cache, mark as authenticated
            if self._access_token or self._public_access_token:
                self._last_auth_time = time.time()

            self._initialized = True

    def register_auth_callback(self, callback: Callable[[], Any]) -> None:
        """Register a callback triggered whenever authentication succeeds."""
        with self._lock:
            if callback not in self._auth_callbacks:
                self._auth_callbacks.append(callback)

    def _notify_auth_success(self) -> None:
        """Invokes all registered post-authentication callbacks."""
        with self._lock:
            callbacks = list(self._auth_callbacks)
        for cb in callbacks:
            try:
                res = cb()
                if asyncio.iscoroutine(res):
                    try:
                        loop = asyncio.get_running_loop()
                        loop.create_task(res)
                    except RuntimeError:
                        res.close()
            except Exception as e:
                logger.warning("Error in Paytm auth callback: %s", e)

    def configure_credentials(
        self,
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
        request_token: Optional[str] = None,
    ) -> None:
        """Dynamically configure credentials (without logging or exposing them)."""
        with self._lock:
            if api_key is not None:
                self._api_key = api_key.strip()
            if api_secret is not None:
                self._api_secret = api_secret.strip()
            if request_token is not None:
                self._request_token = request_token.strip()

    def get_login_url(self, state: Optional[str] = None, redirect_uri: Optional[str] = None) -> str:
        """
        Generates the official Paytm Money browser merchant login URL.
        Trader navigates to this URL to authorize Algo Robot.
        """
        if not self._api_key:
            raise ValueError("Paytm Money API Key is not configured. Set PAYTM_MONEY_API_KEY in .env.")

        url = f"{PAYTM_LOGIN_BASE_URL}?apiKey={self._api_key}"
        if isinstance(state, str) and state.strip():
            url += f"&state={urllib.parse.quote_plus(state.strip())}"
        red_uri = redirect_uri if isinstance(redirect_uri, str) else getattr(self._settings, "PAYTM_MONEY_REDIRECT_URI", "")
        if isinstance(red_uri, str) and red_uri.strip():
            url += f"&redirect_uri={urllib.parse.quote_plus(red_uri.strip())}"
        return url

    def generate_session(self, request_token: Optional[str] = None) -> Dict[str, Any]:
        """
        Exchanges request_token + api_key + api_secret with Paytm Money Open API
        to acquire accessToken and publicAccessToken (used for WebSocket).
        """
        with self._lock:
            token_to_use = (request_token or self._request_token or "").strip()
            if not token_to_use:
                raise ValueError("request_token is required to generate a session.")
            if not self._api_key or not self._api_secret:
                raise ValueError("PAYTM_MONEY_API_KEY and PAYTM_MONEY_API_SECRET must be configured.")

            payload = {
                "apiKey": self._api_key,
                "apiSecret": self._api_secret,
                "requestToken": token_to_use,
            }

            url = f"{PAYTM_API_BASE_URL}{SESSION_GENERATE_ENDPOINT}"
            req_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=req_data,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
                method="POST",
            )

            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    resp_body = resp.read().decode("utf-8")
                    data = json.loads(resp_body)
            except urllib.error.HTTPError as e:
                err_text = e.read().decode("utf-8", errors="ignore")
                logger.error("Paytm Money session generation failed with HTTP %s", e.code)
                try:
                    err_json = json.loads(err_text)
                    err_msg = err_json.get("message") or err_json.get("error") or err_text
                except Exception:
                    err_msg = err_text
                raise RuntimeError(f"Paytm Money session generation failed (HTTP {e.code}): {err_msg}")
            except Exception as e:
                logger.error("Paytm Money session generation connection error: %s", type(e).__name__)
                raise RuntimeError(f"Paytm Money session generation network error: {str(e)}")

            # Parse returned token payload
            # Response structure can have tokens in 'data' object or at root
            token_data = data.get("data") if isinstance(data.get("data"), dict) else data

            access_token = token_data.get("accessToken", "")
            public_access_token = token_data.get("publicAccessToken", "")
            read_access_token = token_data.get("readAccessToken", "")

            if not access_token and not public_access_token:
                msg = data.get("message", "No tokens found in response payload.")
                raise RuntimeError(f"Paytm session response did not contain access tokens: {msg}")

            self._access_token = access_token
            self._public_access_token = public_access_token or access_token
            self._read_access_token = read_access_token
            self._last_auth_time = time.time()
            self._request_token = token_to_use

            # Persist tokens locally
            self._save_cached_session()

            # Trigger registered post-authentication callbacks
            self._notify_auth_success()

            return {
                "status": "success",
                "message": "Paytm Money session successfully established.",
                "authenticated": True,
                "has_access_token": bool(self._access_token),
                "has_public_access_token": bool(self._public_access_token),
                "authenticated_at": datetime.now(timezone.utc).isoformat(),
            }

    def set_tokens(
        self,
        access_token: str,
        public_access_token: Optional[str] = None,
        read_access_token: Optional[str] = None,
    ) -> None:
        """Directly sets tokens (e.g. when configured manually in .env)."""
        with self._lock:
            self._access_token = access_token.strip()
            self._public_access_token = (public_access_token or access_token).strip()
            if read_access_token:
                self._read_access_token = read_access_token.strip()
            self._last_auth_time = time.time()
            self._save_cached_session()
            self._notify_auth_success()

    def is_authenticated(self) -> bool:
        """Checks if a valid access token or public token is currently loaded."""
        with self._lock:
            return bool(self._access_token or self._public_access_token)

    def get_access_token(self) -> str:
        """Returns the active access token for REST API calls."""
        with self._lock:
            return self._access_token

    def get_public_access_token(self) -> str:
        """Returns the public access token (x_jwt_token) for WebSocket streams."""
        with self._lock:
            return self._public_access_token or self._access_token

    def get_auth_headers(self) -> Dict[str, str]:
        """Returns HTTP headers containing the active JWT token."""
        token = self.get_access_token()
        if not token:
            return {}
        return {"x-jwt-token": token}

    def validate_credentials(self) -> Dict[str, Any]:
        """
        Validates the format and presence of credentials without exposing them.
        Returns status flags and masked keys.
        """
        with self._lock:
            has_key = bool(self._api_key)
            has_secret = bool(self._api_secret)
            has_req_tok = bool(self._request_token)
            has_acc_tok = bool(self._access_token)
            has_pub_tok = bool(self._public_access_token)

            return {
                "provider": "PAYTM_MONEY",
                "api_key_configured": has_key,
                "api_secret_configured": has_secret,
                "api_key_masked": mask_credential(self._api_key),
                "request_token_present": has_req_tok,
                "access_token_present": has_acc_tok,
                "public_access_token_present": has_pub_tok,
                "is_ready_for_session": bool(has_key and has_secret),
                "is_authenticated": bool(has_acc_tok or has_pub_tok),
                "auth_state": "AUTHENTICATED" if (has_acc_tok or has_pub_tok) else (
                    "READY_FOR_LOGIN" if (has_key and has_secret) else "MISSING_CREDENTIALS"
                ),
            }

    def get_status(self) -> Dict[str, Any]:
        """Returns comprehensive authentication and connectivity status."""
        val = self.validate_credentials()
        with self._lock:
            val["last_authenticated_at"] = (
                datetime.fromtimestamp(self._last_auth_time, tz=timezone.utc).isoformat()
                if self._last_auth_time
                else None
            )
            val["login_url"] = self.get_login_url() if self._api_key else None
            val["token_expiry_info"] = "Paytm Money access tokens are valid until 06:00 AM IST of the following morning."
            val["session_active"] = bool(self._access_token or self._public_access_token)
            val["credentials_configured"] = bool(self._api_key and self._api_secret)
            val["masked_key"] = mask_credential(self._api_key)
            val["redirect_uri"] = getattr(self._settings, "PAYTM_MONEY_REDIRECT_URI", "")
            return val

    def logout(self, revoke_remote: bool = False) -> Dict[str, Any]:
        """Clears local tokens and optionally revokes session remotely."""
        with self._lock:
            token = self._access_token
            self._access_token = ""
            self._public_access_token = ""
            self._read_access_token = ""
            self._last_auth_time = None

            if os.path.exists(self._token_file):
                try:
                    os.remove(self._token_file)
                except OSError:
                    pass

            if revoke_remote and token:
                try:
                    url = f"{PAYTM_API_BASE_URL}{SESSION_LOGOUT_ENDPOINT}"
                    req = urllib.request.Request(
                        url,
                        headers={"x-jwt-token": token, "Accept": "application/json"},
                        method="POST",
                    )
                    with urllib.request.urlopen(req, timeout=3):
                        pass
                except Exception:
                    pass

            return {"status": "success", "message": "Paytm Money session cleared."}

    def _save_cached_session(self) -> None:
        """Saves active tokens to a local session cache file."""
        try:
            cache_data = {
                "access_token": self._access_token,
                "public_access_token": self._public_access_token,
                "read_access_token": self._read_access_token,
                "saved_at": time.time(),
            }
            with open(self._token_file, "w", encoding="utf-8") as f:
                json.dump(cache_data, f)
        except Exception as e:
            logger.warning("Could not cache Paytm Money session tokens: %s", e)

    def _load_cached_session(self) -> None:
        """Loads cached tokens from file if recently saved."""
        if not os.path.exists(self._token_file):
            return
        try:
            with open(self._token_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            saved_at = data.get("saved_at", 0)
            # If saved within 24 hours
            if time.time() - saved_at < 86400:
                if not self._access_token and data.get("access_token"):
                    self._access_token = data.get("access_token")
                if not self._public_access_token and data.get("public_access_token"):
                    self._public_access_token = data.get("public_access_token")
                if data.get("read_access_token"):
                    self._read_access_token = data.get("read_access_token")
                self._last_auth_time = saved_at
        except Exception as e:
            logger.warning("Could not read Paytm Money cached session: %s", e)


paytm_auth_service = PaytmMoneyAuthService()
