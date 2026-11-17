"""
ALGO ROBOT — FastAPI Authentication & RBAC Dependencies
======================================================
Provides dependency injection functions to authenticate Bearer JWTs,
retrieve active users, and enforce role-based access control (RBAC).
"""

from __future__ import annotations
import logging
from typing import Callable, List, Optional
from fastapi import Depends, HTTPException, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import User, UserRole
from app.core.jwt import decode_token, TokenExpiredError, InvalidTokenError

logger = logging.getLogger("algo_robot.auth.dependencies")

security = HTTPBearer(auto_error=False)

# Role Hierarchy Numerical Weight: higher encompasses lower
ROLE_HIERARCHY = {
    UserRole.SUPER_ADMIN: 4,
    UserRole.ADMIN: 3,
    UserRole.TRADER: 2,
    UserRole.VIEWER: 1,
}


def _extract_token_string(
    credentials: Optional[HTTPAuthorizationCredentials],
    authorization_header: Optional[str],
) -> Optional[str]:
    """Extracts raw JWT string from Bearer credentials or raw header."""
    if credentials and credentials.credentials:
        return credentials.credentials.strip()
    if authorization_header:
        parts = authorization_header.strip().split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            return parts[1]
        elif len(parts) == 1:
            return parts[0]
    return None


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> User:
    """
    Validates Bearer access JWT and returns the matching User instance.
    Raises 401 Unauthorized if missing, expired, or invalid.
    """
    token = _extract_token_string(credentials, authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided. Missing Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_token(token)
    except TokenExpiredError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token has expired. Please refresh your session.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_type = payload.get("type")
    if token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type. An access token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token: missing subject claim.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token: invalid subject identifier.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with this token does not exist.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Verifies that the authenticated user is actively allowed access."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive or disabled.",
        )
    return current_user


def optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    Returns the authenticated user if a valid Bearer token is present,
    or None if no token was supplied.
    """
    token = _extract_token_string(credentials, authorization)
    if not token:
        return None

    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        user_id = int(payload.get("sub"))
        user = db.query(User).filter(User.id == user_id).first()
        if user and user.is_active:
            return user
    except Exception:
        return None

    return None


def require_role(*allowed_roles: str) -> Callable[[User], User]:
    """
    RBAC dependency factory.
    Enforces that the authenticated user has at least one of the allowed roles,
    or a higher role in the role hierarchy.
    """
    # Normalize strings to UserRole enum values
    normalized_allowed: List[UserRole] = []
    for r in allowed_roles:
        try:
            normalized_allowed.append(UserRole(r.upper()))
        except ValueError:
            pass

    min_required_weight = min(
        [ROLE_HIERARCHY.get(r, 0) for r in normalized_allowed]
    ) if normalized_allowed else 1

    def _role_checker(current_user: User = Depends(get_current_active_user)) -> User:
        user_role = current_user.role
        user_weight = ROLE_HIERARCHY.get(user_role, 0)

        # Check explicit membership or hierarchical superiority
        if user_role in normalized_allowed or user_weight >= min_required_weight:
            return current_user

        allowed_names = [r.value for r in normalized_allowed]
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied. Requires one of roles: {allowed_names}. User role is '{user_role.value}'.",
        )

    return _role_checker
