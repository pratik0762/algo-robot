"""
ALGO ROBOT — Central Authentication & User Management Service
=============================================================
Manages user registration, credential authentication, JWT issuance & rotation,
role-based permissions, and session lifecycle.
"""

from __future__ import annotations
from datetime import datetime, timezone, timedelta
import logging
import re
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.db.models import (
    User,
    UserRole,
    RefreshToken as DBRefreshToken,
    RiskSetting,
)
from app.core.security import hash_password, verify_password
from app.core.jwt import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_token,
    TokenExpiredError,
    InvalidTokenError,
)

logger = logging.getLogger("algo_robot.auth.service")

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


class AuthException(Exception):
    """Base authentication exception."""
    pass


class InvalidCredentialsException(AuthException):
    pass


class UserAlreadyExistsException(AuthException):
    pass


class UserNotFoundException(AuthException):
    pass


class UserInactiveException(AuthException):
    pass


class PermissionDeniedException(AuthException):
    pass


class AuthService:
    """Core Authentication & RBAC Orchestrator."""

    def register_user(
        self,
        email: str,
        password: str,
        full_name: Optional[str] = None,
        role: str = "TRADER",
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """Registers a new user, hashes password, and creates default risk profile."""
        clean_email = email.strip().lower()
        if not EMAIL_REGEX.match(clean_email):
            raise AuthException("Invalid email format.")

        if len(password) < 8:
            raise AuthException("Password must be at least 8 characters long.")

        try:
            role_enum = UserRole(role.upper())
        except ValueError:
            role_enum = UserRole.TRADER

        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            existing = db.query(User).filter(User.email == clean_email).first()
            if existing:
                raise UserAlreadyExistsException(f"User with email '{clean_email}' already exists.")

            pwd_hash = hash_password(password)
            user = User(
                email=clean_email,
                hashed_password=pwd_hash,
                full_name=full_name,
                role=role_enum,
                is_active=True,
            )
            db.add(user)
            db.flush()

            # Initialize Default User Risk Setting (Phase 8 integration)
            risk_setting = RiskSetting(
                user_id=user.id,
                max_daily_loss=15000.0,
                max_capital_per_trade=50000.0,
                max_open_positions=5,
                max_order_quantity_limit=1800,
                is_kill_switch_active=False,
            )
            db.add(risk_setting)
            db.commit()
            db.refresh(user)

            logger.info("Successfully registered user: %s (Role: %s)", clean_email, user.role.value)
            return self._user_to_dict(user)
        except Exception:
            db.rollback()
            raise
        finally:
            if close_db:
                db.close()

    def authenticate_user(
        self,
        email: str,
        password: str,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """Verifies credentials, generates access & refresh tokens, and tracks session."""
        clean_email = email.strip().lower()
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            user = db.query(User).filter(User.email == clean_email).first()
            if not user or not verify_password(password, user.hashed_password):
                raise InvalidCredentialsException("Invalid email or password.")

            if not user.is_active:
                raise UserInactiveException("User account is inactive. Please contact administrator.")

            # Issue Tokens
            access_token = create_access_token(
                user_id=user.id,
                role=user.role.value,
                email=user.email,
            )
            refresh_token = create_refresh_token(user_id=user.id)

            # Persist Refresh Token Hash
            token_payload = decode_token(refresh_token)
            expires_at = datetime.fromtimestamp(token_payload["exp"], tz=timezone.utc)
            db_ref_token = DBRefreshToken(
                user_id=user.id,
                token_hash=hash_token(refresh_token),
                expires_at=expires_at,
                revoked=False,
            )
            db.add(db_ref_token)
            db.commit()

            logger.info("User authenticated: %s (ID: %s, Role: %s)", user.email, user.id, user.role.value)
            return {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_type": "bearer",
                "expires_in": 3600,
                "user": self._user_to_dict(user),
            }
        finally:
            if close_db:
                db.close()

    def refresh_access_token(self, refresh_token_str: str, db: Optional[Session] = None) -> Dict[str, Any]:
        """Validates refresh token, rotates session token, and returns fresh access token."""
        try:
            payload = decode_token(refresh_token_str)
        except (TokenExpiredError, InvalidTokenError) as e:
            raise InvalidCredentialsException(f"Invalid refresh token: {str(e)}")

        if payload.get("type") != "refresh":
            raise InvalidCredentialsException("Token is not a refresh token.")

        user_id = int(payload.get("user_id", payload.get("sub")))
        t_hash = hash_token(refresh_token_str)

        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            token_rec = db.query(DBRefreshToken).filter(DBRefreshToken.token_hash == t_hash).first()
            if not token_rec or token_rec.revoked:
                raise InvalidCredentialsException("Refresh token revoked or invalid.")

            user = db.query(User).filter(User.id == user_id).first()
            if not user or not user.is_active:
                raise UserInactiveException("User account is inactive or not found.")

            # Revoke current refresh token (Rotation pattern)
            token_rec.revoked = True

            # Issue new token pair
            new_access_token = create_access_token(
                user_id=user.id,
                role=user.role.value,
                email=user.email,
            )
            new_refresh_token = create_refresh_token(user_id=user.id)

            new_payload = decode_token(new_refresh_token)
            new_expires_at = datetime.fromtimestamp(new_payload["exp"], tz=timezone.utc)
            new_token_rec = DBRefreshToken(
                user_id=user.id,
                token_hash=hash_token(new_refresh_token),
                expires_at=new_expires_at,
                revoked=False,
            )
            db.add(new_token_rec)
            db.commit()

            return {
                "access_token": new_access_token,
                "refresh_token": new_refresh_token,
                "token_type": "bearer",
                "expires_in": 3600,
            }
        finally:
            if close_db:
                db.close()

    def revoke_refresh_token(self, refresh_token_str: str, db: Optional[Session] = None) -> bool:
        """Revokes a refresh token to logout user session."""
        t_hash = hash_token(refresh_token_str)
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            token_rec = db.query(DBRefreshToken).filter(DBRefreshToken.token_hash == t_hash).first()
            if token_rec:
                token_rec.revoked = True
                db.commit()
                return True
            return False
        finally:
            if close_db:
                db.close()

    def change_password(
        self,
        user_id: int,
        old_password: str,
        new_password: str,
        db: Optional[Session] = None,
    ) -> bool:
        """Changes user password and invalidates all existing refresh sessions."""
        if len(new_password) < 8:
            raise AuthException("New password must be at least 8 characters long.")

        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user or not verify_password(old_password, user.hashed_password):
                raise InvalidCredentialsException("Incorrect current password.")

            user.hashed_password = hash_password(new_password)
            # Invalidate all active refresh tokens
            db.query(DBRefreshToken).filter(DBRefreshToken.user_id == user_id).update({"revoked": True})
            db.commit()
            logger.info("Password changed and sessions revoked for user ID %s", user_id)
            return True
        finally:
            if close_db:
                db.close()

    def update_user_role(
        self,
        admin_user: Dict[str, Any],
        target_user_id: int,
        new_role: str,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """Updates a user's role (SuperAdmin can set any role; Admin can set TRADER/VIEWER)."""
        admin_role = admin_user.get("role", "")
        if admin_role not in (UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value):
            raise PermissionDeniedException("Only Administrators can modify user roles.")

        try:
            new_role_enum = UserRole(new_role.upper())
        except ValueError:
            raise AuthException(f"Invalid role '{new_role}'.")

        if new_role_enum == UserRole.SUPER_ADMIN and admin_role != UserRole.SUPER_ADMIN.value:
            raise PermissionDeniedException("Only a SuperAdmin can assign the SUPER_ADMIN role.")

        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            target_user = db.query(User).filter(User.id == target_user_id).first()
            if not target_user:
                raise UserNotFoundException(f"User with ID {target_user_id} not found.")

            target_user.role = new_role_enum
            db.commit()
            db.refresh(target_user)
            logger.info("User ID %s role updated to %s by admin ID %s", target_user_id, new_role_enum.value, admin_user.get("id"))
            return self._user_to_dict(target_user)
        finally:
            if close_db:
                db.close()

    def list_users(self, skip: int = 0, limit: int = 50, db: Optional[Session] = None) -> List[Dict[str, Any]]:
        """Lists users with pagination."""
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            users = db.query(User).offset(skip).limit(limit).all()
            return [self._user_to_dict(u) for u in users]
        finally:
            if close_db:
                db.close()

    def get_user_by_id(self, user_id: int, db: Optional[Session] = None) -> Optional[Dict[str, Any]]:
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            u = db.query(User).filter(User.id == user_id).first()
            return self._user_to_dict(u) if u else None
        finally:
            if close_db:
                db.close()

    def update_user_profile(
        self,
        user_id: int,
        full_name: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """Updates user's profile details."""
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True

        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                raise UserNotFoundException(f"User with ID {user_id} not found.")

            if full_name is not None:
                user.full_name = full_name.strip()
            db.commit()
            db.refresh(user)
            return self._user_to_dict(user)
        finally:
            if close_db:
                db.close()

    @staticmethod
    def _user_to_dict(user: User) -> Dict[str, Any]:
        return {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        }


# Singleton auth service
auth_service = AuthService()
