import collections
import time

class AttentionScorer:
    def __init__(self):
        self.no_face_state = {"consecutive": 0, "since": None}
        self.bored_state = {"since": None}
        self.smoothed_score = 100.0

    def calculate_final_score(self, avg_ear, pitch, yaw, gaze_distracted=False, mood="Neutral"):
        frame_score = 100
        if avg_ear < 0.22: frame_score -= 50
        if abs(yaw) > 25: frame_score -= 40
        if abs(pitch) > 20: frame_score -= 30
        if gaze_distracted: frame_score -= 40
        
        if mood == "Bored":
            if self.bored_state["since"] is None:
                self.bored_state["since"] = time.time()
            else:
                elapsed_bored = time.time() - self.bored_state["since"]
                if elapsed_bored > 2.0:
                    penalty = min(90, int((elapsed_bored - 2.0) * 10))
                    frame_score -= penalty
        else:
            self.bored_state["since"] = None

        frame_score = max(0, frame_score)
        
        if frame_score < self.smoothed_score:
            self.smoothed_score = (self.smoothed_score * 0.8) + (frame_score * 0.2)
        else:
            self.smoothed_score = (self.smoothed_score * 0.99) + (frame_score * 0.01)
            
        return int(self.smoothed_score)

    def handle_no_face(self):
        self.no_face_state["consecutive"] += 1
        if self.no_face_state["since"] is None:
            self.no_face_state["since"] = time.time()

        elapsed = time.time() - self.no_face_state["since"]
        warning = None
        if elapsed >= 3:
            warning = f"WARNING: No face detected for {elapsed:.1f}s"
            self.smoothed_score = (self.smoothed_score * 0.9) 
        return warning, elapsed

    def reset_no_face_state(self):
        self.no_face_state["consecutive"] = 0
        self.no_face_state["since"] = None
