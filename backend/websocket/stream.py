from fastapi import APIRouter, WebSocket
import numpy as np
from sqlalchemy import text
import time
import random

from database.connection import SessionLocal
from models.timescale import AttentionTimeline, EmotionTimeline, FacialMetrics
from utils.math import calculate_head_pose, detect_gaze, calculate_ear, get_eye_center
from services.emotion.analyzer import EmotionAnalyzer
from services.attention.scorer import AttentionScorer

router = APIRouter()

@router.websocket("/ws/user/{user_id}/{session_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, session_id: str):
    # How it works: This is the FastAPI WebSocket endpoint. It maintains an open, high-speed connection with the frontend, receiving the JSON coordinates up to 30 times a second.
    await websocket.accept()
    
    # Validate session status
    async with SessionLocal() as db:
        res = await db.execute(text("SELECT status FROM sessions WHERE id = :sid"), {"sid": session_id})
        session = res.fetchone()
        if not session or session[0] != "active":
            await websocket.close(code=1008, reason="Session is not active")
            print(f"[{user_id}] Rejected connection to ended/invalid session: {session_id}")
            return
            
    print(f"[{user_id}] Connected to AI Telemetry stream for session {session_id}.")
    
    try:
        last_blink_time = time.time()
        
        # Instantiate per-user state tracking classes
        analyzer = EmotionAnalyzer()
        scorer = AttentionScorer()
        
        while True:
            # The Action: It acts as the traffic controller. For every frame of data it receives, it passes the raw coordinates to the mathematical scoring engines.
            data = await websocket.receive_json()
            
            attention_score = "No Face Detected"
            score = 0.0
            avg_ear = 0.0
            mar = 0.0
            pitch = 0.0
            yaw = 0.0
            roll = 0.0
            eyebrow_state = "Neutral"
            is_moving_lips = False
            is_yawning = False
            is_tense = False
            tension_score = 0
            smile_type = "None"
            mood = "Absent"
            
            spoof_detected = False
            spoof_reason = ""
            
            if data and data.get("no_face"):
                warning, elapsed = scorer.handle_no_face()
                attention_score = "User Not Found"
                last_blink_time = time.time()
                
            elif data and "right_eye" in data:
                scorer.reset_no_face_state()

                class FakePoint:
                    def __init__(self, d):
                        self.x = d['x']
                        self.y = d['y']
                        self.z = d.get('z', 0)
                
                right_eye = [FakePoint(pt) for pt in data['right_eye']]
                left_eye = [FakePoint(pt) for pt in data['left_eye']]
                
                avg_ear = (calculate_ear(right_eye) + calculate_ear(left_eye)) / 2.0
                
                gaze_distracted = False
                if data.get('irises'):
                    iris_a = FakePoint(data['irises'][0])
                    iris_b = FakePoint(data['irises'][1])
                    
                    right_eye_center_x, _ = get_eye_center(right_eye)
                    if abs(iris_a.x - right_eye_center_x) < abs(iris_b.x - right_eye_center_x):
                        right_iris, left_iris = iris_a, iris_b
                    else:
                        right_iris, left_iris = iris_b, iris_a
                    
                    r_rx, r_ry = detect_gaze(right_iris, right_eye)
                    l_rx, l_ry = detect_gaze(left_iris, left_eye)
                    
                    avg_rx = (r_rx + l_rx) / 2.0
                    avg_ry = (r_ry + l_ry) / 2.0
                    
                    # Increased sensitivity: a ratio of > 0.12 means the iris has moved significantly off-center horizontally
                    if abs(avg_rx) > 0.12 or abs(avg_ry) > 0.08:
                        gaze_distracted = True
                
                pitch, yaw, roll = 0, 0, 0
                if data.get('matrix'):
                    flat_matrix = data['matrix']
                    matrix = np.array(flat_matrix).reshape(4, 4)
                    pitch, yaw, roll = calculate_head_pose(matrix)
                
                # MOOD IS NOW CALCULATED FIRST SO IT CAN BE PASSED TO THE SCORER
                lip_movement_amount = 0.0
                is_smiling = False

                if data.get('left_eyebrow') and data.get('right_eyebrow'):
                    left_eyebrow = [FakePoint(pt) for pt in data['left_eyebrow']]
                    right_eyebrow = [FakePoint(pt) for pt in data['right_eyebrow']]
                    _, eyebrow_state = analyzer.calculate_eyebrow_position(left_eyebrow, right_eyebrow, left_eye, right_eye)

                if data.get('mouth'):
                    mouth = [FakePoint(pt) for pt in data['mouth']]
                    is_moving_lips, lip_movement_amount = analyzer.detect_lip_movement(mouth)
                    is_yawning, mar = analyzer.detect_yawn(mouth)
                    is_smiling, smile_type = analyzer.detect_smile(mouth, left_eye, right_eye)
                    if data.get('left_eyebrow') and data.get('right_eyebrow'):
                        is_tense, tension_score = analyzer.detect_facial_tension(left_eyebrow, right_eyebrow, mouth, is_smiling)

                mood = analyzer.detect_emotion(avg_ear, pitch, yaw, eyebrow_state, is_tense, smile_type, is_yawning)
                emotion_change = analyzer.record_emotion_change(mood)
                
                final_score = scorer.calculate_final_score(avg_ear, pitch, yaw, gaze_distracted, mood)
                
                # Track blink transitions so static photos with closed/small eyes don't reset the timer forever
                if avg_ear < 0.22:
                    if not getattr(websocket, "is_eyes_closed", False):
                        last_blink_time = time.time()
                        websocket.is_eyes_closed = True
                else:
                    websocket.is_eyes_closed = False
                
                # Passive Liveness 1: Blink Timeout
                if time.time() - last_blink_time > 50:
                    spoof_detected = True
                    spoof_reason = "No Blink Detected (Static Image)"
                


                if spoof_detected:
                    final_score = 0
                    mood = "Spoofing Detected"
                    status = spoof_reason
                    # Stop showing live facial data in the dashboard
                    smile_type = "None"
                    is_yawning = False
                    eyebrow_state = "Neutral"
                    is_tense = False
                    is_moving_lips = False
                elif avg_ear < 0.22:
                    status = "Blinking / Eyes Closed"
                elif abs(yaw) > 25 or abs(pitch) > 20: 
                    status = "Distracted"
                elif gaze_distracted:
                    status = "Distracted"
                elif mood == "Bored":
                    status = "Bored (Focus Dropping)"
                else:
                    status = "Attentive"
                    
                # CALIBRATION: Fetch ground truth offset
                offset = 0
                try:
                    async with SessionLocal() as db:
                        cal_res = await db.execute(text("""
                            SELECT c.base_offset FROM calibrations c 
                            JOIN users u ON c.user_id = u.id 
                            WHERE u.username = :uid
                        """), {"uid": user_id})
                        cal_row = cal_res.fetchone()
                        if cal_row: offset = cal_row.base_offset
                except Exception as e:
                    pass
                
                final_score = max(0, min(100, final_score + offset))
                
                attention_score = f"{status} | Overall Focus: {final_score}%"
                score = final_score

                extra_features = {
                    "eyebrows": eyebrow_state,
                    "lip_movement": is_moving_lips,
                    "yawning": is_yawning,
                    "smile": smile_type,
                    "facial_tension": is_tense,
                    "tension_score": tension_score,
                    "mood": mood,
                }
                if 'emotion_change' in locals() and emotion_change:
                    extra_features["emotion_changed_at"] = emotion_change["timestamp"]
                    extra_features["previous_mood"] = emotion_change["previous_emotion"]
            
            try:
                async with SessionLocal() as db:
                    s_id = session_id
                    
                    att_rec = AttentionTimeline(
                        session_id=s_id,
                        user_id=user_id,
                        attention_score=round(score, 1),
                        confidence=1.0
                    )
                    
                    emo_rec = EmotionTimeline(
                        session_id=s_id,
                        user_id=user_id,
                        emotion=mood,
                        confidence=1.0
                    )
                    
                    face_rec = FacialMetrics(
                        session_id=s_id,
                        user_id=user_id,
                        ear=avg_ear,
                        mar=mar,
                        smile_type=smile_type,
                        eyebrow_raise=1.0 if eyebrow_state == "Raised" else 0.0,
                        eyebrow_lower=1.0 if eyebrow_state == "Lowered" else 0.0,
                        head_pitch=pitch,
                        head_roll=roll,
                        head_yaw=yaw,
                        is_tense=is_tense,
                        yawning=is_yawning,
                        lip_movement=is_moving_lips
                    )
                    
                    db.add_all([att_rec, emo_rec, face_rec])
                    await db.commit()
            except Exception as db_err:
                print(f"Database insert error: {db_err}")

            payload = {"attention_score": attention_score}
            if data and "right_eye" in data:
                payload["features"] = extra_features
                payload["emotion_history"] = analyzer.emotion_history[-10:]
            await websocket.send_json(payload)
    except Exception as e:
        print(f"User disconnected: {e}")
