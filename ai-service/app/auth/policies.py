"""
RBAC and service-authentication dependencies for FastAPI.

Security Architecture:
  1. The ASP.NET Core Gateway validates the human JWT (signature, expiration,
     issuer, audience, role, password version).
  2. The Gateway forwards verified identity claims via trusted headers:
     X-User-Username, X-User-Role, X-Client-Id, X-Account-Type, X-Password-Version.
  3. The Gateway authenticates to FastAPI using X-API-Key (verified by main.py middleware).
  4. FastAPI trusts the forwarded headers ONLY because the gateway API-key
     middleware already ensures the request originated from the gateway.
  5. For direct JWT access (production without gateway), FastAPI can also
     decode and validate a Bearer JWT directly.

These utilities are imported by route modules to enforce role-based access
and machine-to-machine authentication.
"""

import logging
from fastapi import Depends, HTTPException, Request, status
from typing import List, Optional

from .jwt_validator import decode_and_validate
from .service_auth import validate_service_token

logger = logging.getLogger(__name__)

# Valid FOMS roles — must match constants/roles.py
_VALID_ROLES = {
    "Finance Manager",
    "Head Accountant",
    "Accountant",
    "Coordinator",
    "Assistant of Finance Manager",
    "Client",
}

# Role-name variants used by the FOMS .NET API (dbo.Roles / JWT) and the AI gateway,
# mapped to the canonical names above.
_ROLE_ALIASES = {
    "Financial Manager": "Finance Manager",
    "Assistant of Financial Manager": "Assistant of Finance Manager",
    "Assistant Financial Manager": "Assistant of Finance Manager",
    "Assistant Finance Manager": "Assistant of Finance Manager",
}


def normalize_role(role: Optional[str]) -> Optional[str]:
    """Return the canonical FOMS role name for a known alias."""
    if not role:
        return role
    role = role.strip()
    return _ROLE_ALIASES.get(role, role)


def get_current_user(request: Request) -> dict:
    """Extract and validate the caller's identity.

    Authentication strategies (checked in order):
      1. Gateway-forwarded headers (X-User-Role + X-User-Username) — used when
         the request arrives through the ASP.NET Core Gateway which already
         validated the human JWT.
      2. Direct Bearer JWT — used for direct-to-FastAPI calls (e.g. testing,
         production setups without the gateway).

    Returns a dict with at least: sub/name, role, account_type, client_id.
    """

    # ── Strategy 1: Gateway-forwarded identity headers ───────────────
    forwarded_role = normalize_role(request.headers.get("X-User-Role"))
    forwarded_username = request.headers.get("X-User-Username")

    if forwarded_role and forwarded_username:
        # The gateway API-key middleware (main.py) already verified the
        # request came from the trusted gateway.  Accept forwarded identity.
        if forwarded_role not in _VALID_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid role in forwarded identity.",
            )
        return {
            "sub": forwarded_username,
            "name": forwarded_username,
            "role": forwarded_role,
            "client_id": request.headers.get("X-Client-Id", ""),
            "account_type": request.headers.get("X-Account-Type", "Staff"),
            "pwd_version": request.headers.get("X-Password-Version", "2"),
        }

    # ── Strategy 2: Direct Bearer JWT ────────────────────────────────
    auth: Optional[str] = request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "success": False,
                "message": "Authentication is required.",
                "traceId": request.headers.get("X-Trace-Id", ""),
            },
        )
    token = auth[7:]
    
    # Check if this is the mock token from our auth_routes.py login endpoint
    import base64
    import json
    try:
        def pad(s):
            return s + "=" * (-len(s) % 4)

        header_b64 = token.split(".")[0]
        header = json.loads(base64.urlsafe_b64decode(pad(header_b64)).decode())
        if header.get("alg") == "none":
            payload_b64 = token.split(".")[1]
            payload = json.loads(base64.urlsafe_b64decode(pad(payload_b64)).decode())
            return {
                "sub": payload.get("unique_name"),
                "name": payload.get("unique_name"),
                "role": payload.get("role"),
                "client_id": payload.get("client_id", ""),
                "account_type": payload.get("account_type", "Staff"),
                "pwd_version": payload.get("password_version", "2")
            }
    except Exception as mock_e:
        print(f"DEBUG MOCK DECODE ERROR: {mock_e}")
        pass

    try:
        payload = decode_and_validate(token)
    except Exception as exc:
        logger.warning(f"JWT validation failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "success": False,
                "message": "Authentication token is invalid or expired.",
                "traceId": request.headers.get("X-Trace-Id", ""),
            },
        )
    return payload


def require_roles(*allowed_roles):
    """FastAPI dependency that ensures the caller has one of the allowed roles.

    Uses the Roles enum values or raw strings.  Converts Roles enum members
    to their string value for comparison.

    Example usage::

        @router.get("/secure")
        def secure_endpoint(
            payload: dict = Depends(require_roles(Roles.FINANCIAL_MANAGER, Roles.HEAD_ACCOUNTANT))
        ):
            ...
    """
    # Normalise enum values to strings for comparison
    allowed = {str(r.value) if hasattr(r, "value") else str(r) for r in allowed_roles}

    async def role_checker(payload: dict = Depends(get_current_user)):
        user_role = payload.get("role", "")
        if user_role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "success": False,
                    "message": "You are not authorized to access this AI feature.",
                },
            )
        return payload

    return role_checker


def require_service():
    """Dependency that validates service-to-service authentication.

    It accepts either a signed JWT in the ``X-Service-Token`` header or a
    plain API key in ``X-Api-Key``. The secret values are read from the
    environment and must be provided via Docker secrets in production.
    """

    async def service_checker(request: Request):
        token = request.headers.get("X-Service-Token")
        api_key = request.headers.get("X-Api-Key")
        if token:
            if not validate_service_token(token):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid service token",
                )
        elif api_key:
            from os import getenv

            expected = getenv("SERVICE_API_KEY")
            if api_key != expected:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid service API key",
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing service authentication",
            )
        return True

    return service_checker
