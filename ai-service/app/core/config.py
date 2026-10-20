import os
from sqlalchemy.engine import URL

from pathlib import Path

# Auto-load variables from .env file if python-dotenv is installed
try:
    from dotenv import load_dotenv
    # Look for .env in current working dir, ai-service root, and project root
    for p in [Path.cwd() / ".env", Path(__file__).resolve().parents[2] / ".env", Path(__file__).resolve().parents[3] / ".env"]:
        if p.is_file():
            load_dotenv(p, override=True)
            break
    else:
        load_dotenv(override=True)
except ImportError:
    pass

def _has_psycopg2() -> bool:
    try:
        import psycopg2
        return True
    except (ImportError, Exception):
        return False

def _has_pg8000() -> bool:
    try:
        import pg8000
        return True
    except (ImportError, Exception):
        return False

class Settings:
    PROJECT_NAME: str = "FOMS AI Intelligence Service"
    API_V1_STR: str = "/api/ai"
    
    # AI Backend API Key (For Gateway authenticating with AI backend)
    AI_SERVICE_API_KEY: str = os.getenv("AI_SERVICE_API_KEY", "change-me")
    
    # Databases (defaults to Docker network hostnames, overridden locally by .env)
    _default_pg_driver = "postgresql+pg8000" if (not _has_psycopg2() and _has_pg8000()) else "postgresql+psycopg2"
    _raw_postgres = os.getenv(
        "POSTGRES_CONNECTION_STRING", 
        "postgresql://postgres:postgres@localhost:5432/foms_ai_results"
    )
    if not _has_psycopg2() and _has_pg8000():
        if _raw_postgres.startswith("postgresql://"):
            POSTGRES_URI: str = _raw_postgres.replace("postgresql://", "postgresql+pg8000://", 1)
        elif _raw_postgres.startswith("postgresql+psycopg2://"):
            POSTGRES_URI: str = _raw_postgres.replace("postgresql+psycopg2://", "postgresql+pg8000://", 1)
        else:
            POSTGRES_URI: str = _raw_postgres
    else:
        POSTGRES_URI: str = _raw_postgres

    _postgres_connection_string = os.getenv("POSTGRES_CONNECTION_STRING", "")
    if _postgres_connection_string and not _postgres_connection_string.startswith(
        ("postgresql://", "postgresql+psycopg2://", "postgresql+pg8000://")
    ):
        POSTGRES_URI = URL.create(
            _default_pg_driver,
            username=os.getenv("POSTGRES_USER", "postgres"),
            password=os.getenv("POSTGRES_PASSWORD", ""),
            host=os.getenv("POSTGRES_HOST", "localhost"),
            port=int(os.getenv("POSTGRES_PORT", "5432")),
            database=os.getenv("POSTGRES_DATABASE", os.getenv("POSTGRES_DB", "foms_ai_results")),
        )
    MONGODB_URI: str = os.getenv(
        "MONGODB_URI", 
        "mongodb://foms-ai-mongodb:27017/"
    )
    MONGODB_DB: str = "foms_trends_db"

    # Microsoft SQL Server (FOMS_DB Source of Truth) configuration
    MSSQL_SERVER: str = os.getenv("MSSQL_SERVER", "localhost\\SQLEXPRESS")
    MSSQL_DATABASE: str = os.getenv("MSSQL_DATABASE", os.getenv("MSSQL_DB", "FOMS_DB"))
    MSSQL_DRIVER: str = os.getenv("MSSQL_DRIVER", "ODBC Driver 17 for SQL Server")
    MSSQL_TRUSTED_CONNECTION: str = os.getenv("MSSQL_TRUSTED_CONNECTION", "yes")
    MSSQL_TRUST_SERVER_CERTIFICATE: str = os.getenv("MSSQL_TRUST_SERVER_CERTIFICATE", "yes")
    MSSQL_USER: str = os.getenv("MSSQL_USER", "")
    MSSQL_PASSWORD: str = os.getenv("MSSQL_PASSWORD", "")

    @property
    def MSSQL_URI(self) -> str:
        """
        Dynamically constructs or retrieves the Microsoft SQL Server connection URI.
        Supports mssql+pyodbc driver for SQLAlchemy with Windows Authentication or SQL Server Auth.
        """
        custom_uri = os.getenv("MSSQL_SQLALCHEMY_URL") or os.getenv("MSSQL_CONNECTION_STRING")
        if custom_uri:
            if custom_uri.startswith("mssql"):
                return custom_uri
            import urllib.parse
            return f"mssql+pyodbc:///?odbc_connect={urllib.parse.quote_plus(custom_uri)}"

        import urllib.parse
        driver_encoded = urllib.parse.quote_plus(self.MSSQL_DRIVER)
        is_trusted = self.MSSQL_TRUSTED_CONNECTION.lower() in ("yes", "true", "1")
        trust_cert = "yes" if self.MSSQL_TRUST_SERVER_CERTIFICATE.lower() in ("yes", "true", "1") else "no"

        if is_trusted or not self.MSSQL_USER:
            return (
                f"mssql+pyodbc://@{self.MSSQL_SERVER}/{self.MSSQL_DATABASE}"
                f"?driver={driver_encoded}&trusted_connection=yes&TrustServerCertificate={trust_cert}"
            )
        else:
            user_enc = urllib.parse.quote_plus(self.MSSQL_USER)
            pwd_enc = urllib.parse.quote_plus(self.MSSQL_PASSWORD)
            return (
                f"mssql+pyodbc://{user_enc}:{pwd_enc}@{self.MSSQL_SERVER}/{self.MSSQL_DATABASE}"
                f"?driver={driver_encoded}&TrustServerCertificate={trust_cert}"
            )
    
    # Legacy FOMS Read-Only API Configuration
    FOMS_API_URL: str = os.getenv("FOMS_READ_API_URL", "http://foms-legacy-mock:8001")
    FOMS_API_KEY: str = os.getenv("FOMS_AI_SERVICE_API_KEY", "change-me")
    
    # Sync Interval (Minutes)
    SYNC_INTERVAL_MINUTES: int = int(os.getenv("SYNC_INTERVAL_MINUTES", "10"))

settings = Settings()
