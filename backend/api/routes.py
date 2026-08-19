from fastapi import APIRouter
from sqlalchemy import text
from typing import Optional
from pydantic import BaseModel
from langchain_core.messages import HumanMessage

from database.connection import SessionLocal
from services.agents.master_agent import get_agent

router = APIRouter()

def format_records(records):
    output = []
    for r in records:
        eyebrows = "Neutral"
        # Safely handle None values from LEFT JOIN
        raise_val = r.eyebrow_raise if hasattr(r, 'eyebrow_raise') and r.eyebrow_raise is not None else 0
        lower_val = r.eyebrow_lower if hasattr(r, 'eyebrow_lower') and r.eyebrow_lower is not None else 0
        
        if raise_val > 0.5:
            eyebrows = "Raised"
        elif lower_val > 0.5:
            eyebrows = "Lowered"

        if r.mood == "Spoofing Detected":
            status = "Spoofing Detected"
        elif r.mood == "Absent" or r.focus_score == 0:
            status = "User Not Found"
        else:
            status = "Attentive" if r.focus_score > 60 else "Distracted"

        output.append({
            "timestamp": r.timestamp.isoformat(),
            "focus_score": r.focus_score,
            "status": status,
            "is_tense": bool(r.is_tense) if hasattr(r, 'is_tense') else False,
            "mood": r.mood or "Neutral",
            "user_id": r.user_id,
            "full_name": getattr(r, 'full_name', r.user_id) or r.user_id,
            "smile_type": r.smile_type if hasattr(r, 'smile_type') and r.smile_type else "None",
            "yawning": bool(r.yawning) if hasattr(r, 'yawning') else False,
            "lip_movement": bool(r.lip_movement) if hasattr(r, 'lip_movement') else False
        })
    return output

@router.get("/telemetry")
async def get_telemetry(session_id: str, user_id: Optional[str] = None):
    try:
        async with SessionLocal() as db:
            if user_id and user_id != "all":
                query = text("""
                                        SELECT * FROM (
                        SELECT a.timestamp, a.attention_score as focus_score, a.user_id,
                               e.emotion as mood, f.smile_type,
                               f.is_tense, f.yawning, f.lip_movement,
                               f.eyebrow_raise, f.eyebrow_lower
                        FROM attention_timeline a
                        LEFT JOIN emotion_timeline e ON a.timestamp = e.timestamp AND a.session_id = e.session_id
                        LEFT JOIN facial_metrics f ON a.timestamp = f.timestamp AND a.session_id = f.session_id
                        WHERE a.user_id = :uid AND a.session_id = :session_id
                        ORDER BY a.timestamp DESC
                        LIMIT 200
                    ) sub ORDER BY timestamp ASC
                """)
                result = await db.execute(query, {"uid": user_id, "session_id": session_id})
            else:
                query = text("""
                                        SELECT * FROM (
                        SELECT a.timestamp, a.attention_score as focus_score, a.user_id,
                               e.emotion as mood, f.smile_type,
                               f.is_tense, f.yawning, f.lip_movement,
                               f.eyebrow_raise, f.eyebrow_lower
                        FROM attention_timeline a
                        JOIN users u ON a.user_id = u.username
                        JOIN roles r ON u.role_id = r.id
                        LEFT JOIN emotion_timeline e ON a.timestamp = e.timestamp AND a.session_id = e.session_id
                        LEFT JOIN facial_metrics f ON a.timestamp = f.timestamp AND a.session_id = f.session_id
                        WHERE r.name = 'User' AND a.session_id = :session_id
                        ORDER BY a.timestamp DESC
                        LIMIT 200
                    ) sub ORDER BY timestamp ASC
                """)
                result = await db.execute(query, {"session_id": session_id})
                
            records = result.fetchall()
            return format_records(records)
    except Exception as e:
        print(f"Error fetching telemetry: {e}")
        return []

@router.get("/telemetry/summary")
async def get_telemetry_summary(session_id: str, user_id: Optional[str] = None):
    try:
        async with SessionLocal() as db:
            if user_id and user_id != "all":
                query = text("""
                    SELECT 
                        COUNT(CASE WHEN attention_score >= 70 THEN 1 END) as focused_secs,
                        COUNT(CASE WHEN attention_score < 70 THEN 1 END) as distracted_secs
                    FROM attention_timeline 
                    WHERE user_id = :uid AND session_id = :session_id
                """)
                result = await db.execute(query, {"uid": user_id, "session_id": session_id})
            else:
                query = text("""
                    SELECT 
                        COUNT(CASE WHEN a.attention_score >= 70 THEN 1 END) as focused_secs,
                        COUNT(CASE WHEN a.attention_score < 70 THEN 1 END) as distracted_secs
                    FROM attention_timeline a
                    JOIN users u ON a.user_id = u.username
                    JOIN roles r ON u.role_id = r.id
                    WHERE r.name = 'User' AND a.session_id = :session_id
                """)
                result = await db.execute(query, {"session_id": session_id})
            
            row = result.fetchone()
            if row:
                return {
                    "focused_mins": round((row.focused_secs or 0) / 3600),
                    "distracted_mins": round((row.distracted_secs or 0) / 3600)
                }
            return {"focused_mins": 0, "distracted_mins": 0}
    except Exception as e:
        print(f"Error fetching telemetry summary: {e}")
        return {"focused_mins": 0, "distracted_mins": 0}

@router.get("/telemetry/latest")
async def get_latest_telemetry(session_id: str):
    try:
        async with SessionLocal() as db:
            query = text("""
                SELECT DISTINCT ON (a.user_id) 
                       a.timestamp, a.attention_score as focus_score, a.user_id, u.full_name,
                       e.emotion as mood, f.smile_type,
                       f.is_tense, f.yawning, f.lip_movement,
                       f.eyebrow_raise, f.eyebrow_lower
                FROM attention_timeline a
                JOIN users u ON a.user_id = u.username
                JOIN roles r ON u.role_id = r.id
                LEFT JOIN emotion_timeline e ON a.timestamp = e.timestamp AND a.session_id = e.session_id AND a.user_id = e.user_id
                LEFT JOIN facial_metrics f ON a.timestamp = f.timestamp AND a.session_id = f.session_id AND a.user_id = f.user_id
                WHERE r.name = 'User' AND a.session_id = :session_id
                ORDER BY a.user_id, a.timestamp DESC
            """)
            result = await db.execute(query, {"session_id": session_id})
            records = result.fetchall()
            return format_records(records)
    except Exception as e:
        print(f"Error fetching latest telemetry: {e}")
        return []

class ChatRequest(BaseModel):
    message: str
    session_id: str
    user_id: Optional[str] = None
    role: Optional[str] = "Admin"
    subject_name: Optional[str] = None
    present_count: Optional[int] = None
    absent_count: Optional[int] = None

@router.post("/chat")
async def chat_endpoint(req: ChatRequest):
    try:
        agent = get_agent(req.session_id)
        
        attendance_ctx = f" Currently, there are {req.present_count} students present and {req.absent_count} students absent in this class." if req.present_count is not None else ""

        if req.role == "Host":
            context = f"[Context: You are assisting a Host (faculty). You ONLY have access to data for the subject '{req.subject_name}' in meeting room '{req.session_id}'.{attendance_ctx} If the user asks about ANY other subject, course, or meeting, you MUST explicitly tell them you do not have access to it.]\n\nUser Query: "
        else:
            context = f"[Context: You are assisting an Admin. You are analyzing data for {'all users' if not req.user_id or req.user_id == 'all' else f'user {req.user_id}'} in meeting room '{req.session_id}'.{attendance_ctx}]\n\nUser Query: "
            
        messages = [HumanMessage(content=context + req.message)]
        
        result = await agent.ainvoke({"messages": messages})
        final_message = result["messages"][-1].content
        return {"response": final_message}
    except Exception as e:
        return {"response": f"AI Error: Make sure your GROQ_API_KEY is valid! Details: {str(e)}"}

class CalibrationRequest(BaseModel):
    user_id: str
    ground_truth_score: int
    current_system_score: int

@router.post("/telemetry/calibrate")
async def calibrate_score(req: CalibrationRequest):
    from models.relational import Calibration, User
    try:
        async with SessionLocal() as db:
            # Get user id from username
            query = text("SELECT id FROM users WHERE username = :username")
            res = await db.execute(query, {"username": req.user_id})
            u_row = res.fetchone()
            if not u_row: return {"status": "error", "message": "User not found"}
            
            offset = req.ground_truth_score - req.current_system_score
            
            # Upsert calibration
            cal_query = text("SELECT id FROM calibrations WHERE user_id = :uid")
            cal_res = await db.execute(cal_query, {"uid": u_row.id})
            cal_row = cal_res.fetchone()
            
            if cal_row:
                await db.execute(text("UPDATE calibrations SET base_offset = :offset WHERE id = :cid"), {"offset": offset, "cid": cal_row.id})
            else:
                db.add(Calibration(user_id=u_row.id, base_offset=offset))
            await db.commit()
            return {"status": "success", "message": f"AI weights calibrated. Score offset of {offset}% applied."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/telemetry/user_timeline")
async def get_user_timeline(session_id: str, user_id: str):
    from datetime import timedelta
    try:
        async with SessionLocal() as db:
            query = text("""
                SELECT a.timestamp, a.attention_score as focus_score, e.emotion as mood
                FROM attention_timeline a
                LEFT JOIN emotion_timeline e ON a.timestamp = e.timestamp AND a.session_id = e.session_id AND a.user_id = e.user_id
                WHERE a.session_id = :session_id AND a.user_id = :user_id
                ORDER BY a.timestamp ASC
            """)
            result = await db.execute(query, {"session_id": session_id, "user_id": user_id})
            records = result.fetchall()
            
            if not records:
                return {"timeline": [], "overall_score": 0}

            timeline = []
            current_bucket = records[0].timestamp.replace(minute=records[0].timestamp.minute - (records[0].timestamp.minute % 5), second=0, microsecond=0)
            current_block_scores = []
            current_block_moods = []
            all_scores = []
            
            for r in records:
                all_scores.append(r.focus_score)
                bucket = r.timestamp.replace(minute=r.timestamp.minute - (r.timestamp.minute % 5), second=0, microsecond=0)
                
                if bucket != current_bucket:
                    if current_block_scores:
                        avg_score = sum(current_block_scores) / len(current_block_scores)
                        most_frequent_mood = max(set(current_block_moods), key=current_block_moods.count) if current_block_moods else "Neutral"
                        
                        if avg_score < 60:
                            status = "Distracted"
                        else:
                            status = most_frequent_mood
                            
                        # Override historical false positive spoofing records
                        if status == "Spoofing Detected":
                            status = "Distracted"
                        
                        timeline.append({
                            "time": current_bucket.isoformat(),
                            "end_time": (current_bucket + timedelta(minutes=5)).isoformat(),
                            "status": status,
                            "mood": most_frequent_mood,
                            "focus_score": round(avg_score)
                        })
                    
                    missing_bucket = current_bucket + timedelta(minutes=5)
                    while missing_bucket < bucket:
                        timeline.append({
                            "time": missing_bucket.isoformat(),
                            "end_time": (missing_bucket + timedelta(minutes=5)).isoformat(),
                            "status": "Absent",
                            "mood": "Away",
                            "focus_score": 0
                        })
                        missing_bucket += timedelta(minutes=5)
                    
                    current_bucket = bucket
                    current_block_scores = []
                    current_block_moods = []
                
                current_block_scores.append(r.focus_score)
                current_block_moods.append(r.mood or "Neutral")
                
            # Add the final block
            if current_block_scores:
                avg_score = sum(current_block_scores) / len(current_block_scores)
                most_frequent_mood = max(set(current_block_moods), key=current_block_moods.count) if current_block_moods else "Neutral"
                
                if avg_score < 60:
                    status = "Distracted"
                else:
                    status = most_frequent_mood
                    
                # Override historical false positive spoofing records
                if status == "Spoofing Detected":
                    status = "Distracted"
                
                timeline.append({
                    "time": current_bucket.isoformat(),
                    "end_time": (current_bucket + timedelta(minutes=5)).isoformat(),
                    "status": status,
                    "mood": most_frequent_mood,
                    "focus_score": round(avg_score)
                })
                
            overall_score = round(sum(all_scores) / len(all_scores)) if all_scores else 0
            
            return {"timeline": timeline, "overall_score": overall_score}
    except Exception as e:
        print(f"Error fetching user timeline: {e}")
        return {"timeline": [], "overall_score": 0}

@router.get("/user_subject_timeline")
async def get_user_subject_timeline(project_id: int, user_id: str):
    from datetime import timedelta
    try:
        async with SessionLocal() as db:
            query = text("""
                SELECT a.timestamp, a.attention_score as focus_score, e.emotion as mood, a.session_id
                FROM attention_timeline a
                LEFT JOIN emotion_timeline e ON a.timestamp = e.timestamp AND a.session_id = e.session_id AND a.user_id = e.user_id
                JOIN sessions s ON s.id = a.session_id
                WHERE s.project_id = :project_id AND a.user_id = :user_id
                ORDER BY a.timestamp ASC
            """)
            result = await db.execute(query, {"project_id": project_id, "user_id": user_id})
            records = result.fetchall()
            
            if not records:
                return {"timeline": [], "overall_score": 0}

            timeline = []
            current_bucket = records[0].timestamp.replace(minute=records[0].timestamp.minute - (records[0].timestamp.minute % 5), second=0, microsecond=0)
            current_block_scores = []
            current_block_moods = []
            all_scores = []
            
            for r in records:
                all_scores.append(r.focus_score)
                bucket = r.timestamp.replace(minute=r.timestamp.minute - (r.timestamp.minute % 5), second=0, microsecond=0)
                
                if bucket != current_bucket:
                    if current_block_scores:
                        avg_score = sum(current_block_scores) / len(current_block_scores)
                        most_frequent_mood = max(set(current_block_moods), key=current_block_moods.count) if current_block_moods else "Neutral"
                        
                        if "Spoofing" in current_block_moods:
                            status = "Spoofing Detected"
                            avg_score = 0
                        elif avg_score < 60:
                            status = "Distracted"
                        else:
                            status = most_frequent_mood
                            
                        # Override historical false positive spoofing records
                        if status == "Spoofing Detected":
                            status = "Distracted"
                        
                        timeline.append({
                            "time": current_bucket.isoformat(),
                            "end_time": (current_bucket + timedelta(minutes=5)).isoformat(),
                            "status": status,
                            "mood": most_frequent_mood,
                            "focus_score": round(avg_score)
                        })
                    
                    missing_bucket = current_bucket + timedelta(minutes=5)
                    while missing_bucket < bucket:
                        timeline.append({
                            "time": missing_bucket.isoformat(),
                            "end_time": (missing_bucket + timedelta(minutes=5)).isoformat(),
                            "status": "Absent",
                            "mood": "Away",
                            "focus_score": 0
                        })
                        missing_bucket += timedelta(minutes=5)
                    
                    current_bucket = bucket
                    current_block_scores = []
                    current_block_moods = []
                
                current_block_scores.append(r.focus_score)
                current_block_moods.append(r.mood or "Neutral")
                
            # Add the final block
            if current_block_scores:
                avg_score = sum(current_block_scores) / len(current_block_scores)
                most_frequent_mood = max(set(current_block_moods), key=current_block_moods.count) if current_block_moods else "Neutral"
                
                if "Spoofing" in current_block_moods:
                    status = "Spoofing Detected"
                    avg_score = 0
                elif avg_score < 60:
                    status = "Distracted"
                else:
                    status = most_frequent_mood
                    
                # Override historical false positive spoofing records
                if status == "Spoofing Detected":
                    status = "Distracted"
                
                timeline.append({
                    "time": current_bucket.isoformat(),
                    "end_time": (current_bucket + timedelta(minutes=5)).isoformat(),
                    "status": status,
                    "mood": most_frequent_mood,
                    "focus_score": round(avg_score)
                })
                
            overall_score = round(sum(all_scores) / len(all_scores)) if all_scores else 0
            
            return {"timeline": timeline, "overall_score": overall_score}
    except Exception as e:
        print(f"Error fetching user subject timeline: {e}")
        return {"timeline": [], "overall_score": 0}
