import os
import logging
from datetime import datetime, timezone
from typing import Dict, Any

from jose import jwt, JWTError

logger = logging.getLogger(__name__)

# Load JWT configuration from environment variables
JWT_PUBLIC_KEY = os.getenv("FOMS_JWT_PUBLIC_KEY")
JWT_ISSUER = os.getenv("FOMS_JWT_ISSUER", "https://foms.example.com")
JWT_AUDIENCE = os.getenv("FOMS_JWT_AUDIENCE", "foms-ai-service")

# Expected claims
REQUIRED_CLAIMS = {
    "sub",
    "name",
    "role",
    "account_type",
    "exp",
    "iss",
    "aud",
    "pwd_version",
}

def _assert_claims(payload: Dict[str, Any]) -> None:
    missing = REQUIRED_CLAIMS - payload.keys()
    if missing:
        raise JWTError(f"Missing required JWT claims: {missing}")

    # Verify issuer and audience
    if payload.get("iss") != JWT_ISSUER:
        raise JWTError("Invalid JWT issuer")
    if payload.get("aud") != JWT_AUDIENCE:
        raise JWTError("Invalid JWT audience")

    # Verify token is not expired (jose does this automatically, but double‑check for safety)
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    if exp < datetime.now(tz=timezone.utc):
        raise JWTError("JWT has expired")

    # For client tokens, ensure client_id claim exists
    if payload.get("account_type") == "Client" and "client_id" not in payload:
        raise JWTError("Client token missing client_id claim")

def decode_and_validate(token: str) -> Dict[str, Any]:
    """Decode a JWT, validate its signature and required claims.

    Args:
        token: The raw JWT string from the Authorization header.
    Returns:
        The decoded JWT payload as a dict.
    Raises:
        JWTError: If any validation step fails.
    """
    if not JWT_PUBLIC_KEY:
        logger.error("FOMS_JWT_PUBLIC_KEY is not configured")
        raise JWTError("Server misconfiguration")

    try:
        payload = jwt.decode(
            token,
            JWT_PUBLIC_KEY,
            algorithms=["RS256"],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE,
        )
    except JWTError as exc:
        logger.warning(f"JWT validation failed: {exc}")
        raise

    _assert_claims(payload)
    return payload
