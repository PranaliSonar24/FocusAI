import random
import string
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from sqlalchemy.sql import func
from database.connection import get_db
from models.relational import Session, User, Enrollment, Project, Role
from datetime import datetime

router = APIRouter()

def generate_meeting_code():
    # Generates a code like "AI-492" or "MEET-928"
    prefix = random.choice(["AI", "MEET", "CLASS", "ROOM"])
    suffix = "".join(random.choices(string.digits, k=3))
    return f"{prefix}-{suffix}"

from pydantic import BaseModel

class CreateSessionReq(BaseModel):
    project_id: int = None

@router.post("/create")
async def create_session(req: CreateSessionReq, db: AsyncSession = Depends(get_db)):
    try:
        # Generate a unique code
        code = generate_meeting_code()
        
        # Ensure it doesn't already exist
        result = await db.execute(select(Session).where(Session.id == code))
        while result.scalar_one_or_none() is not None:
            code = generate_meeting_code()
            result = await db.execute(select(Session).where(Session.id == code))
        
        new_session = Session(
            id=code,
            project_id=req.project_id,
            status="active"
        )
        db.add(new_session)
        await db.commit()
        
        return {"session_id": code, "message": "Meeting created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/active")
async def get_active_sessions(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(Session).where(Session.status == "active").order_by(Session.start_time.desc())
        )
        sessions = result.scalars().all()
        return [{"session_id": s.id, "start_time": s.start_time} for s in sessions]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class EndSessionReq(BaseModel):
    session_id: str

@router.post("/end")
async def end_session(req: EndSessionReq, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(Session).where(Session.id == req.session_id))
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if session.status == "ended":
            return {"message": "Session is already ended"}
            
        session.status = "ended"
        session.end_time = func.now()
        await db.commit()
        return {"message": f"Session {req.session_id} ended successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/validate/{session_id}")
async def validate_session(session_id: str, username: str = Query(None), db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(Session).where(Session.id == session_id))
        session = result.scalar_one_or_none()
        if not session:
            return {"valid": False, "reason": "Session does not exist"}
        if session.status != "active":
            return {"valid": False, "reason": "Session has ended"}
            
        if username and session.project_id:
            u_res = await db.execute(select(User, Role.name).outerjoin(Role, User.role_id == Role.id).where(User.username == username))
            user_data = u_res.first()
            if user_data:
                user_obj, role_name = user_data
                if role_name != "Admin":
                    # Fetch the workspace_id of the session's project
                    proj_res = await db.execute(select(Project).where(Project.id == session.project_id))
                    proj = proj_res.scalar_one_or_none()
                    
                    if proj:
                        # Allow if enrolled in the exact project OR enrolled in the workspace (course-level)
                        enr_res = await db.execute(select(Enrollment).where(
                            (Enrollment.user_id == user_obj.id) & 
                            (
                                ((Enrollment.workspace_id == proj.workspace_id) & (Enrollment.project_id.is_(None))) |
                                (Enrollment.project_id == session.project_id)
                            )
                        ))
                        if not enr_res.first():
                            return {"valid": False, "reason": "Access Denied: You are not enrolled in this course."}
                    else:
                        return {"valid": False, "reason": "Invalid subject"}
                        
        return {"valid": True, "project_id": session.project_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/history")
async def get_sessions_history(
    username: str = Query(None),
    role: str = Query("Admin"),
    db: AsyncSession = Depends(get_db)
):
    try:
        if role == "Admin":
            query = select(Session.id, Session.start_time, Session.status, Project.name.label("subject_name"), Session.project_id).outerjoin(Project, Session.project_id == Project.id).order_by(Session.start_time.desc()).limit(50)
            result = await db.execute(query)
            sessions = result.fetchall()
        else:
            if not username:
                return []
            
            u_res = await db.execute(select(User).where(User.username == username))
            user = u_res.scalar_one_or_none()
            if not user:
                return []
            
            enr_res = await db.execute(select(Enrollment.project_id).where(Enrollment.user_id == user.id))
            project_ids = [r for r in enr_res.scalars().all() if r is not None]
            
            if not project_ids:
                return []
                
            query = select(Session.id, Session.start_time, Session.status, Project.name.label("subject_name"), Session.project_id).outerjoin(Project, Session.project_id == Project.id).where(Session.project_id.in_(project_ids)).order_by(Session.start_time.desc()).limit(50)
            result = await db.execute(query)
            sessions = result.fetchall()
            
        return [{"session_id": s.id, "start_time": s.start_time, "status": s.status, "subject_name": s.subject_name or "General Session", "project_id": s.project_id} for s in sessions]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

