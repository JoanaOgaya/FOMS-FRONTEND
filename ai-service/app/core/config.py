import os
from sqlalchemy.engine import URL

# Auto-load variables from .env file if python-dotenv is installed
try:
    from dotenv import load_dotenv
    load_dotenv(override=True)
except ImportError:
    pass

class Settings:
    PROJECT_NAME: str = "FOMS AI Intelligence Service"
    API_V1_STR: str = "/api/ai"
    
    # AI Backend API Key (For Gateway authenticating with AI backend)
    AI_SERVICE_API_KEY: str = os.getenv("AI_SERVICE_API_KEY", "change-me")
    
    # Databases (defaults to Docker network hostnames, overridden locally by .env)
    POSTGRES_URI: str = os.getenv(
        "POSTGRES_CONNECTION_STRING", 
        "postgresql://postgres:postgres@foms-ai-postgres:5432/foms_ai_db"
    )
    _postgres_connection_string = os.getenv("POSTGRES_CONNECTION_STRING", "")
    if _postgres_connection_string and not _postgres_connection_string.startswith(
        ("postgresql://", "postgresql+psycopg2://")
    ):
        POSTGRES_URI = URL.create(
            "postgresql+psycopg2",
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
    
    # Legacy FOMS Read-Only API Configuration
    FOMS_API_URL: str = os.getenv("FOMS_READ_API_URL", "http://foms-legacy-mock:8001")
    FOMS_API_KEY: str = os.getenv("FOMS_AI_SERVICE_API_KEY", "change-me")
    
    # Sync Interval (Minutes)
    SYNC_INTERVAL_MINUTES: int = int(os.getenv("SYNC_INTERVAL_MINUTES", "10"))

settings = Settings()
