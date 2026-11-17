"""
ALGO ROBOT — Cryptographic Security & Credential Vault
Provides AES-256-GCM authenticated encryption for broker secrets, API keys,
and tokens, ensuring sensitive data is never stored in plaintext.
"""

import os
import base64
import hashlib
import hmac
import secrets
from typing import Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.config import settings


class EncryptionService:
    """
    AES-256-GCM Authenticated Symmetric Encryption Service.
    Guarantees confidentiality and authenticity (tamper-detection)
    for sensitive credentials stored in database or files.
    """

    def __init__(self, master_key_hex: Optional[str] = None):
        key_hex = master_key_hex or settings.ENCRYPTION_MASTER_KEY
        try:
            # Parse hex key or derive 32-byte key
            if len(key_hex) == 64:
                self._key = bytes.fromhex(key_hex)
            else:
                self._key = hashlib.sha256(key_hex.encode("utf-8")).digest()
        except Exception:
            self._key = hashlib.sha256(b"algorobot-dev-master-key-seed-32").digest()

        if len(self._key) != 32:
            raise ValueError(f"Invalid AES-256 key length: expected 32 bytes, got {len(self._key)}")

        self._aesgcm = AESGCM(self._key)

    def encrypt(self, plaintext: str, associated_data: Optional[bytes] = None) -> str:
        """
        Encrypts a plaintext string into a base64-encoded payload containing:
        nonce (12 bytes) + ciphertext + authentication tag (16 bytes).
        """
        if not plaintext:
            return ""
        
        # 96-bit nonce (12 bytes) as recommended for AES-GCM
        nonce = secrets.token_bytes(12)
        plaintext_bytes = plaintext.encode("utf-8")
        ciphertext = self._aesgcm.encrypt(nonce, plaintext_bytes, associated_data)
        
        # Combine nonce + ciphertext
        payload = nonce + ciphertext
        return base64.urlsafe_b64encode(payload).decode("utf-8")

    def decrypt(self, encrypted_token: str, associated_data: Optional[bytes] = None) -> str:
        """
        Decrypts a base64-encoded AES-GCM payload.
        Verifies authentication tag and returns original plaintext.
        Raises ValueError if data has been tampered with or key is incorrect.
        """
        if not encrypted_token:
            return ""
        
        try:
            payload = base64.urlsafe_b64decode(encrypted_token.encode("utf-8"))
            if len(payload) < 28:  # 12 nonce + 16 auth tag minimum
                raise ValueError("Payload too short for valid AES-GCM ciphertext")
            
            nonce = payload[:12]
            ciphertext = payload[12:]
            decrypted_bytes = self._aesgcm.decrypt(nonce, ciphertext, associated_data)
            return decrypted_bytes.decode("utf-8")
        except Exception as e:
            raise ValueError(f"Decryption failed: integrity check failed or invalid key ({str(e)})")


def hash_password(password: str, salt: Optional[str] = None) -> str:
    """
    PBKDF2-HMAC-SHA256 password hashing with 100,000 iterations.
    Format: salt$hash
    """
    if salt is None:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return f"{salt}${key.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    """
    Verifies a password against the stored salt$hash using constant-time comparison.
    """
    try:
        parts = hashed.split("$")
        if len(parts) != 2:
            return False
        salt, expected_hash = parts[0], parts[1]
        test_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000).hex()
        return hmac.compare_digest(expected_hash, test_hash)
    except Exception:
        return False


# Singleton encryption service
encryption_service = EncryptionService()
