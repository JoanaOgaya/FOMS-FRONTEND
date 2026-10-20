from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models.database import get_db
from app.core.config import settings
import bcrypt
import base64
import json
import time
import httpx

router = APIRouter()

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    token: str
    user: dict

class ChangePasswordRequest(BaseModel):
    username: str
    current_password: str
    new_password: str

def create_app_jwt(username: str, role: str, permissions: list, client_id: str, password_version: int):
    header = {"alg": "none", "typ": "JWT"}
    payload = {
        "unique_name": username,
        "role": role,
        "permissions": permissions,
        "client_id": client_id,
        "account_type": "Client" if role == "Client" else "Staff",
        "password_version": str(password_version),
        "exp": int(time.time()) + 3600
    }
    header_b64 = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip('=')
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip('=')
    return f"{header_b64}.{payload_b64}."

@router.post("/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    try:
        # Check against database
        result = db.execute(
            text("SELECT * FROM users WHERE login_id = :login_id"), 
            {"login_id": request.username}
        ).mappings().first()

        if not result:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        # Compare passwords gracefully handling non-bcrypt hashes
        try:
            if not bcrypt.checkpw(request.password.encode('utf-8'), result["password_hash"].encode('utf-8')):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        except ValueError:
            # Raised by bcrypt if the hash is not in a valid format (e.g., PBKDF2)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials. Hash format mismatch.")

        if not result.get("is_active", True):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")

        full_name = result["full_name"]
        role_name = result["role_name"]
        client_id = request.username if role_name == "Client" else ""
        password_version = result.get("password_version", 2)
        must_change_password = result.get("must_change_password", False)
        
        token = create_app_jwt(
            username=full_name,
            role=role_name,
            permissions=[],
            client_id=client_id,
            password_version=password_version
        )
        
        return {
            "token": token,
            "user": {
                "username": full_name,
                "role": role_name,
                "must_change_password": must_change_password
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))



@router.post("/change-password")
def change_password(request: ChangePasswordRequest, db: Session = Depends(get_db)):
    result = db.execute(
        text("SELECT * FROM users WHERE login_id = :login_id"), 
        {"login_id": request.username}
    ).mappings().first()
    
    if not result:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        
    if not bcrypt.checkpw(request.current_password.encode('utf-8'), result["password_hash"].encode('utf-8')):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        
    new_hash = bcrypt.hashpw(request.new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    db.execute(
        text("""
            UPDATE users SET 
                password_hash = :new_hash, 
                password_version = password_version + 1,
                must_change_password = FALSE,
                is_temporary_password = FALSE,
                password_changed_at = CURRENT_TIMESTAMP
            WHERE login_id = :login_id
        """),
        {"new_hash": new_hash, "login_id": request.username}
    )
    db.commit()
    
    return {"success": True, "message": "Password updated successfully"}
