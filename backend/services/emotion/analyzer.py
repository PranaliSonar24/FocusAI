import math
import time
import collections
from utils.math import calculate_distance, get_eye_center, calculate_ear

class EmotionAnalyzer:
    def __init__(self):
        # --- State for the detectors -------------------------------------------------
        # Auto-calibration baseline for eyebrow resting height (first N frames after connect)
        self.eyebrow_calibration = {"samples": [], "baseline": None, "calibrated": False}

        # Smoothing windows for mouth aspect ratio (yawn) and lip gap (talking / movement)
        self.mar_window = collections.deque(maxlen=15)
        self.lip_gap_window = collections.deque(maxlen=10)

        # Yawn state machine: tracks how long the mouth has been open above threshold
        self.yawn_state = {"start_time": None, "yawning": False}

        # Emotion history: list of {"emotion": str, "timestamp": float} recorded on every change
        self.emotion_history = []
        self.current_emotion = {"label": None}

    # ---------------------------------------------------------------------------------------
    # EYEBROW UP / DOWN DETECTION
    # ---------------------------------------------------------------------------------------
    def calculate_eyebrow_position(self, left_eyebrow, right_eyebrow, left_eye, right_eye):
        def brow_to_eye_gap(eyebrow_pts, eye_pts):
            brow_y = sum(p.y for p in eyebrow_pts) / len(eyebrow_pts)
            eye_cx, eye_cy = get_eye_center(eye_pts)
            eye_width = abs(eye_pts[3].x - eye_pts[0].x)
            if eye_width == 0:
                return 0
            return (eye_cy - brow_y) / eye_width

        left_gap = brow_to_eye_gap(left_eyebrow, left_eye)
        right_gap = brow_to_eye_gap(right_eyebrow, right_eye)
        raw_ratio = (left_gap + right_gap) / 2.0

        if not self.eyebrow_calibration["calibrated"]:
            self.eyebrow_calibration["samples"].append(raw_ratio)
            if len(self.eyebrow_calibration["samples"]) >= 30:
                self.eyebrow_calibration["baseline"] = sum(self.eyebrow_calibration["samples"]) / len(self.eyebrow_calibration["samples"])
                self.eyebrow_calibration["calibrated"] = True
            return raw_ratio, "Neutral"

        baseline = self.eyebrow_calibration["baseline"]
        delta = raw_ratio - baseline

        if delta > 0.06:
            state = "Raised"
        elif delta < -0.04:
            state = "Lowered"
        else:
            state = "Neutral"

        return raw_ratio, state


    # ---------------------------------------------------------------------------------------
    # MOUTH ASPECT RATIO
    # ---------------------------------------------------------------------------------------
    def calculate_mouth_aspect_ratio(self, mouth_landmarks):
        left_corner, right_corner, top_outer, bottom_outer, top_inner, bottom_inner = mouth_landmarks[:6]
        width = calculate_distance(left_corner, right_corner)
        if width == 0:
            return 0
        vertical = calculate_distance(top_inner, bottom_inner)
        return vertical / width


    # ---------------------------------------------------------------------------------------
    # LIP MOVEMENT DETECTION
    # ---------------------------------------------------------------------------------------
    def detect_lip_movement(self, mouth_landmarks):
        mar = self.calculate_mouth_aspect_ratio(mouth_landmarks)
        self.lip_gap_window.append(mar)

        if len(self.lip_gap_window) < 3:
            return False, 0.0

        avg = sum(self.lip_gap_window) / len(self.lip_gap_window)
        variance = sum((v - avg) ** 2 for v in self.lip_gap_window) / len(self.lip_gap_window)
        movement_amount = math.sqrt(variance)

        is_moving = movement_amount > 0.015
        return is_moving, movement_amount


    # ---------------------------------------------------------------------------------------
    # YAWN DETECTION
    # ---------------------------------------------------------------------------------------
    def detect_yawn(self, mouth_landmarks, min_duration_sec=1.2):
        mar = self.calculate_mouth_aspect_ratio(mouth_landmarks)
        self.mar_window.append(mar)
        smoothed_mar = sum(self.mar_window) / len(self.mar_window)

        YAWN_MAR_THRESHOLD = 0.55
        now = time.time()

        if smoothed_mar > YAWN_MAR_THRESHOLD:
            if self.yawn_state["start_time"] is None:
                self.yawn_state["start_time"] = now
            elapsed = now - self.yawn_state["start_time"]
            if elapsed >= min_duration_sec:
                self.yawn_state["yawning"] = True
        else:
            self.yawn_state["start_time"] = None
            self.yawn_state["yawning"] = False

        return self.yawn_state["yawning"], smoothed_mar


    # ---------------------------------------------------------------------------------------
    # SMILE DETECTION
    # ---------------------------------------------------------------------------------------
    def detect_smile(self, mouth_landmarks, left_eye, right_eye):
        left_corner, right_corner, top_outer, bottom_outer = mouth_landmarks[:4]
        mouth_width = calculate_distance(left_corner, right_corner)
        mouth_center_y = (top_outer.y + bottom_outer.y) / 2.0

        corner_lift = mouth_center_y - ((left_corner.y + right_corner.y) / 2.0)
        smile_shape_ratio = corner_lift / mouth_width if mouth_width else 0

        is_smiling = smile_shape_ratio > 0.08

        if not is_smiling:
            return False, "None"

        avg_ear = (calculate_ear(left_eye) + calculate_ear(right_eye)) / 2.0

        if avg_ear < 0.32:
            return True, "Genuine"
        else:
            return True, "Fake/Social"


    # ---------------------------------------------------------------------------------------
    # FACIAL TENSION DETECTION
    # ---------------------------------------------------------------------------------------
    def detect_facial_tension(self, left_eyebrow, right_eyebrow, mouth_landmarks, is_smiling=False):
        brow_gap = min(calculate_distance(pl, pr) for pl in left_eyebrow for pr in right_eyebrow)

        left_corner, right_corner, top_outer, bottom_outer = mouth_landmarks[:4]
        mouth_width = calculate_distance(left_corner, right_corner)
        lip_thickness = calculate_distance(top_outer, bottom_outer)

        lip_compression = 1 - (lip_thickness / mouth_width) if mouth_width else 0

        tension_score = 0
        
        if is_smiling:
            return False, 0

        if mouth_width and (brow_gap / mouth_width) < 0.50:
            tension_score += 50
        if lip_compression > 0.65:
            tension_score += 50

        is_tense = tension_score >= 50
        return is_tense, tension_score


    # ---------------------------------------------------------------------------------------
    # EMOTION / MOOD DETECTION
    # ---------------------------------------------------------------------------------------
    def detect_emotion(self, avg_ear, pitch, yaw, eyebrow_state, is_tense, smile_type, is_yawning):
        if is_yawning or avg_ear < 0.20:
            return "Bored"

        if is_tense and eyebrow_state == "Lowered" and smile_type == "None":
            return "Confused"

        if eyebrow_state == "Raised" or smile_type == "Genuine":
            return "Interested"

        if abs(yaw) > 25 or abs(pitch) > 20:
            return "Bored"

        if eyebrow_state == "Lowered":
            return "Confused"

        return "Interested"


    def record_emotion_change(self, label):
        if self.current_emotion["label"] != label:
            entry = {
                "emotion": label,
                "previous_emotion": self.current_emotion["label"],
                "timestamp": time.time(),
            }
            self.emotion_history.append(entry)
            self.current_emotion["label"] = label
            return entry
        return None
