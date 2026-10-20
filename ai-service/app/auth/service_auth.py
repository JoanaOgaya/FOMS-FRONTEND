import os
import logging
from datetime import datetime, timezone
from jose import jwt, JWTError

logger = logging.getLogger(__name__)

SERVICE_JWT_SECRET = os.getenv("SERVICE_JWT_SECRET")
SERVICE_JWT_ISSUER = os.getenv("SERVICE_JWT_ISSUER", "foms-ai-service")
SERVICE_JWT_AUDIENCE = os.getenv("SERVICE_JWT_AUDIENCE", "foms-backend")

def validate_service_token(token: str) -> bool:
    """Validate a signed service JWT.
    Returns True if valid, otherwise False.
    """
    if not SERVICE_JWT_SECRET:
        logger.error("SERVICE_JWT_SECRET not configured")
        return False
    try:
        payload = jwt.decode(
            token,
            SERVICE_JWT_SECRET,
            algorithms=["HS256"],
            issuer=SERVICE_JWT_ISSUER,
            audience=SERVICE_JWT_AUDIENCE,
        )
    except JWTError as exc:
        logger.warning(f"Service token validation failed: {exc}")
        return False

    # Optional: enforce expiration (jose does automatically)
    exp = datetime.fromtimestamp(payload.get("exp", 0), tz=timezone.utc)
    if exp < datetime.now(tz=timezone.utc):
        logger.warning("Service token expired")
        return False
    return True
