"""
Root ASGI entrypoint redirecting to app.main:app.
This allows both `uvicorn app.main:app` and `uvicorn main:app` to work seamlessly.
"""
from app.main import app

__all__ = ["app"]
