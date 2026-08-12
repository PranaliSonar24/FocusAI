import os
from dotenv import load_dotenv
load_dotenv()

from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from langchain_groq import ChatGroq
from sqlalchemy import text
from database.connection import SessionLocal

def get_agent(session_id: str):
    """
    Initializes the LangGraph ReAct agent.
    The agent acts as a data analyst capable of querying the TimescaleDB.
    Requires GROQ_API_KEY in the environment.
    """
    
    @tool
    async def query_recent_telemetry(user_id: str = "all", limit: int = 50) -> str:
        """
        Queries the TimescaleDB database for the most recent cognitive telemetry records.
        Returns a chronological list of focus scores and mood over time. 
        MAXIMUM LIMIT is 100. You cannot fetch more than 100 records at a time.
        """
        limit = min(limit, 100) # Cap limit to prevent Token Rate Limit errors
        try:
            async with SessionLocal() as db:
                if user_id == "all":
                    query = text("""
                        SELECT a.timestamp, a.attention_score as focus_score, a.user_id, e.emotion as mood
                        FROM attention_timeline a
                        LEFT JOIN emotion_timeline e ON a.timestamp = e.timestamp AND a.session_id = e.session_id AND a.user_id = e.user_id
                        WHERE a.session_id = :session_id
                        ORDER BY a.timestamp DESC
                        LIMIT :limit
                    """)
                    result = await db.execute(query, {"limit": limit, "session_id": session_id})
                else:
                    query = text("""
                        SELECT a.timestamp, a.attention_score as focus_score, a.user_id, e.emotion as mood
                        FROM attention_timeline a
                        LEFT JOIN emotion_timeline e ON a.timestamp = e.timestamp AND a.session_id = e.session_id AND a.user_id = e.user_id
                        WHERE a.user_id = :uid AND a.session_id = :session_id
                        ORDER BY a.timestamp DESC
                        LIMIT :limit
                    """)
                    result = await db.execute(query, {"uid": user_id, "limit": limit, "session_id": session_id})
                    
                records = result.fetchall()
                
                if not records:
                    return "No telemetry data found in the database."
                
                output = []
                for r in reversed(records):
                    time_str = r.timestamp.strftime("%H:%M:%S")
                    mood = r.mood or "Neutral"
                    output.append(f"[{time_str}] User: {r.user_id} | Focus Score: {r.focus_score}/100 | Mood: {mood}")
                
                return "\n".join(output)
        except Exception as e:
            return f"Database error: {str(e)}"

    @tool
    async def get_student_summary() -> str:
        """
        Retrieves a high-level summary of every student in the session, including their average focus score, 
        their detected moods, and critically, whether they were caught spoofing (cheating).
        Use this tool first to get a broad overview of the meeting and to answer questions about who spoofed.
        """
        try:
            async with SessionLocal() as db:
                query = text("""
                    SELECT a.user_id, 
                           AVG(a.attention_score) as avg_score,
                           MIN(a.attention_score) as min_score,
                           STRING_AGG(DISTINCT e.emotion, ', ') as moods
                    FROM attention_timeline a
                    LEFT JOIN emotion_timeline e ON a.timestamp = e.timestamp AND a.session_id = e.session_id AND a.user_id = e.user_id
                    WHERE a.session_id = :session_id
                    GROUP BY a.user_id
                """)
                result = await db.execute(query, {"session_id": session_id})
                records = result.fetchall()
                
                if not records:
                    return "No data found for this session."
                
                output = []
                for r in records:
                    moods = r.moods or "Neutral"
                    spoofed = "YES (Spoofing Detected)" if "Spoofing" in moods else "No"
                    output.append(f"Student: {r.user_id} | Avg Focus: {round(r.avg_score)}/100 | Spoofing Detected? {spoofed} | Moods: {moods}")
                
                return "\n".join(output)
        except Exception as e:
            return f"Database error: {str(e)}"

    @tool
    async def get_course_summary() -> str:
        """
        Retrieves the ALL-TIME course/subject summary for every student, including their OVERALL average focus score across all meetings in the course.
        Use this tool when the user asks about an overall course average or if the user asks why the average in the table differs from the current meeting.
        """
        try:
            async with SessionLocal() as db:
                proj_res = await db.execute(text("SELECT project_id FROM sessions WHERE id = :sid"), {"sid": session_id})
                proj_row = proj_res.fetchone()
                if not proj_row or not proj_row.project_id:
                    return "Could not determine the subject for this session."
                
                project_id = proj_row.project_id
                
                query = text("""
                    SELECT a.user_id, 
                           AVG(a.attention_score) as avg_score,
                           MIN(a.attention_score) as min_score,
                           STRING_AGG(DISTINCT e.emotion, ', ') as moods
                    FROM attention_timeline a
                    JOIN sessions s ON s.id = a.session_id
                    LEFT JOIN emotion_timeline e ON a.timestamp = e.timestamp AND a.session_id = e.session_id AND a.user_id = e.user_id
                    WHERE s.project_id = :project_id
                    GROUP BY a.user_id
                """)
                result = await db.execute(query, {"project_id": project_id})
                records = result.fetchall()
                
                if not records:
                    return "No course data found."
                
                output = []
                for r in records:
                    moods = r.moods or "Neutral"
                    spoofed = "YES (Spoofing Detected)" if "Spoofing" in moods else "No"
                    output.append(f"Student: {r.user_id} | Course Avg Focus: {round(r.avg_score)}/100 | Spoofing Detected? {spoofed} | Moods: {moods}")
                
                return "\\n".join(output)
        except Exception as e:
            return f"Database error: {str(e)}"

    llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0)
    tools = [query_recent_telemetry, get_student_summary, get_course_summary]
    
    system_prompt = (
        "You are an AI data analyst for FocusAI. You have access to tools to query the database. "
        "Use `get_student_summary` to answer questions about the current specific meeting (session). "
        "Use `get_course_summary` to answer questions about overall, all-time performance across the entire subject/course. "
        "Use `query_recent_telemetry` only if asked for a moment-by-moment chronological timeline. "
        "DO NOT use or attempt to call any other tools such as `brave_search`. "
        "Answer the user's questions based ONLY on the data returned by your tools."
    )
    
    # create_react_agent builds a StateGraph under the hood
    agent = create_react_agent(llm, tools, prompt=system_prompt)
    return agent
