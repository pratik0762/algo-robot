"""
ALGO ROBOT — Authentication & RBAC Module
"""

from app.auth.service import (
    AuthService,
    auth_service,
    AuthException,
    InvalidCredentialsException,
    UserAlreadyExistsException,
    UserNotFoundException,
    UserInactiveException,
    PermissionDeniedException,
)
from app.auth.dependencies import (
    get_current_user,
    get_current_active_user,
    optional_current_user,
    require_role,
    ROLE_HIERARCHY,
)

__all__ = [
    "AuthService",
    "auth_service",
    "AuthException",
    "InvalidCredentialsException",
    "UserAlreadyExistsException",
    "UserNotFoundException",
    "UserInactiveException",
    "PermissionDeniedException",
    "get_current_user",
    "get_current_active_user",
    "optional_current_user",
    "require_role",
    "ROLE_HIERARCHY",
]
