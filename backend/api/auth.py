from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select
from database.connection import SessionLocal
from models.relational import User, Role
import jwt
from datetime import datetime, timedelta


router = APIRouter()
SECRET_KEY = "focusai_super_secret_key"
ALGORITHM = "HS256"

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
async def login(req: LoginRequest):
    async with SessionLocal() as db:
        result = await db.execute(select(User).where(User.username == req.username))
        user = result.scalars().first()
        
        if not user or user.password != req.password:
            raise HTTPException(status_code=401, detail="Invalid username or password")
            
        role_result = await db.execute(select(Role).where(Role.id == user.role_id))
        role = role_result.scalars().first()
        role_name = role.name if role else "User"

        payload = {
            "sub": user.username,
            "role": role_name,
            "exp": datetime.utcnow() + timedelta(days=1)
        }
        token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "role": role_name,
            "user_id": user.username,
            "full_name": user.full_name or user.username
        }
