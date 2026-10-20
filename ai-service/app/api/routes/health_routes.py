from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models.database import get_db
from app.core.config import settings
from pymongo import MongoClient
import os

router = APIRouter()

@router.get("")
def health_check():
    return {"status": "HEALTHY", "service": "FOMS AI Intelligence Layer"}

@router.get("/ready")
def readiness_check(db: Session = Depends(get_db)):
    postgres_status = "DISCONNECTED"
    mongodb_status = "DISCONNECTED"

    # Test PostgreSQL Connection
    try:
        db.execute(text("SELECT 1"))
        postgres_status = "CONNECTED"
    except Exception as e:
        postgres_status = f"ERROR: {str(e)}"


    # Test MongoDB Connection
    try:
        mongo_uri = settings.MONGODB_URI or os.getenv("MONGODB_URI", "mongodb://host.docker.internal:27017/")
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=2000)
        client.admin.command('ping')
        mongodb_status = "CONNECTED"
    except Exception as e:
        mongodb_status = f"ERROR: {str(e)}"

    is_ready = postgres_status == "CONNECTED" and mongodb_status == "CONNECTED"

    return {
        "status": "READY" if is_ready else "DEGRADED",
        "postgres": postgres_status,
        "mongodb": mongodb_status,
        "service": "FOMS AI Service"
    }

