from fastapi import APIRouter, Query
from typing import Optional
from sqlalchemy import text
from database.connection import SessionLocal
from datetime import datetime, timedelta

router = APIRouter()

@router.get("/historical")
async def get_historical_analytics(
    project_id: Optional[int] = None,
    user_id: Optional[str] = None,
    time_range: str = Query("30d", pattern="^(1d|7d|30d)$")
):
    # Determine the time filter
    days_map = {"1d": 1, "7d": 7, "30d": 30}
    days = days_map.get(time_range, 30)
    
    async with SessionLocal() as db:
        if project_id and project_id > 0:
            sess_query = await db.execute(text("""
                SELECT id FROM sessions WHERE project_id = :pid
            """), {"pid": project_id})
            sessions = [row.id for row in sess_query.fetchall()]
        else:
            sess_query = await db.execute(text("SELECT id FROM sessions"))
            sessions = [row.id for row in sess_query.fetchall()]
            
        if not sessions:
            return {
                "overall_avg_focus": 0,
                "primary_emotion": "None",
                "focus_deviation": 0,
                "timeline": []
            }
            
        session_list_str = "('" + "','".join(sessions) + "')"

        # Build conditions
        conditions = f"a.session_id IN {session_list_str} AND a.timestamp > NOW() - INTERVAL '{days} days'"
        params = {}
        
        if user_id and user_id != "all":
            conditions += " AND a.user_id = :uid"
            params["uid"] = user_id
            
        # Get overall average focus
        avg_query = await db.execute(text(f"""
            SELECT AVG(a.attention_score) as avg_focus
            FROM attention_timeline a
            WHERE {conditions}
        """), params)
        avg_row = avg_query.fetchone()
        overall_avg = round(avg_row.avg_focus, 1) if avg_row and avg_row.avg_focus else 0

        # Get primary emotion
        emo_query = await db.execute(text(f"""
            SELECT e.emotion, COUNT(*) as cnt
            FROM emotion_timeline e
            JOIN attention_timeline a ON e.timestamp = a.timestamp AND e.session_id = a.session_id AND e.user_id = a.user_id
            WHERE {conditions}
            GROUP BY e.emotion
            ORDER BY cnt DESC
            LIMIT 1
        """), params)
        emo_row = emo_query.fetchone()
        primary_emotion = emo_row.emotion if emo_row else "None"
        
        # Calculate deviation (first 10% of records vs last 10% of records)
        # For simplicity, we just take the avg of the oldest day vs newest day in the range
        deviation_query = await db.execute(text(f"""
            WITH ranked AS (
                SELECT a.attention_score, a.timestamp,
                       ROW_NUMBER() OVER(ORDER BY a.timestamp ASC) as rn_asc,
                       ROW_NUMBER() OVER(ORDER BY a.timestamp DESC) as rn_desc,
                       COUNT(*) OVER() as total_rows
                FROM attention_timeline a
                WHERE {conditions}
            )
            SELECT 
                (SELECT AVG(attention_score) FROM ranked WHERE rn_asc <= total_rows * 0.1) as start_avg,
                (SELECT AVG(attention_score) FROM ranked WHERE rn_desc <= total_rows * 0.1) as end_avg,
                (SELECT COUNT(*) FROM ranked WHERE attention_score >= 70) as focused_secs,
                (SELECT COUNT(*) FROM ranked WHERE attention_score < 70) as distracted_secs
        """), params)
        dev_row = deviation_query.fetchone()
        deviation = 0
        focused_mins = 0
        distracted_mins = 0
        if dev_row:
            if dev_row.start_avg and dev_row.end_avg:
                deviation = round(dev_row.end_avg - dev_row.start_avg, 1)
            focused_mins = round((dev_row.focused_secs or 0) / 3600)
            distracted_mins = round((dev_row.distracted_secs or 0) / 3600)

        # Get timeline data (group by hour or day depending on time_range)
        trunc_unit = "hour" if days <= 7 else "day"
        time_query = await db.execute(text(f"""
            SELECT date_trunc('{trunc_unit}', a.timestamp) as time_bucket, AVG(a.attention_score) as avg_focus
            FROM attention_timeline a
            WHERE {conditions}
            GROUP BY time_bucket
            ORDER BY time_bucket ASC
        """), params)
        
        timeline = []
        for row in time_query.fetchall():
            timeline.append({
                "time": row.time_bucket.isoformat(),
                "focus": round(row.avg_focus, 1)
            })

        return {
            "overall_avg_focus": overall_avg,
            "primary_emotion": primary_emotion,
            "focus_deviation": deviation,
            "focused_mins": focused_mins,
            "distracted_mins": distracted_mins,
            "timeline": timeline
        }

from fastapi import Depends
from database.connection import get_db
from sqlalchemy.ext.asyncio import AsyncSession

@router.get("/host/subjects")
async def get_host_subjects_analytics(username: str, db: AsyncSession = Depends(get_db)):
    try:
        query = text("""
            SELECT 
                p.id as project_id,
                p.name as project_name,
                u.username as student_username,
                u.full_name as student_full_name,
                AVG(a.attention_score) as avg_attention,
                MIN(a.attention_score) as min_attention,
                STRING_AGG(DISTINCT e.emotion, ', ') as moods
            FROM projects p
            JOIN enrollments he ON he.project_id = p.id
            JOIN users h ON h.id = he.user_id AND h.username = :username
            JOIN enrollments se ON se.workspace_id = p.workspace_id AND se.project_id IS NULL
            JOIN users u ON u.id = se.user_id AND u.username != :username
            LEFT JOIN sessions s ON s.project_id = p.id
            LEFT JOIN attention_timeline a ON a.user_id = u.username AND a.session_id = s.id
            LEFT JOIN emotion_timeline e ON e.user_id = u.username AND e.session_id = s.id AND e.timestamp = a.timestamp
            GROUP BY p.id, p.name, u.username, u.full_name
        """)
        result = await db.execute(query, {"username": username})
        records = result.fetchall()
        
        subjects_map = {}
        for r in records:
            pid = r.project_id
            if pid not in subjects_map:
                subjects_map[pid] = {
                    "subject_id": pid,
                    "subject_name": r.project_name,
                    "students": []
                }
            
            spoofed = "YES" if (r.moods and "Spoofing" in r.moods) else "No"
            avg = round(r.avg_attention) if r.avg_attention is not None else None
            
            subjects_map[pid]["students"].append({
                "username": r.student_username,
                "full_name": r.student_full_name or r.student_username,
                "avg_attention": avg,
                "spoofed": spoofed
            })
            
        return list(subjects_map.values())
    except Exception as e:
        print(f"Error fetching host subjects analytics: {e}")
        return []
