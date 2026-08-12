import collections
import time

class AttentionScorer:
    def __init__(self):
        # Rolling window for temporal smoothing (last 50 frames ~ 5 seconds at 10fps)
        self.history_window = collections.deque(maxlen=50)
        
        # No-face tracking: consecutive missing-face frames + when it started
        self.no_face_state = {"consecutive": 0, "since": None}
        
        # Boredom tracking
        self.bored_state = {"since": None}

    def calculate_final_score(self, avg_ear, pitch, yaw, gaze_distracted=False, mood="Neutral"):
        frame_score = 100
        if avg_ear < 0.22: frame_score -= 50
        if abs(yaw) > 25: frame_score -= 40
        if abs(pitch) > 20: frame_score -= 30
        if gaze_distracted: frame_score -= 40 # Pupil tracking
        
        # Handle prolonged boredom penalty
        if mood == "Bored":
            if self.bored_state["since"] is None:
                self.bored_state["since"] = time.time()
            else:
                elapsed_bored = time.time() - self.bored_state["since"]
                if elapsed_bored > 2.0:
                    # Drop score by 10 points for every second bored after 2 seconds
                    # Maximum penalty of 90 points (so they can go down to 10% just from being bored)
                    penalty = min(90, int((elapsed_bored - 2.0) * 10))
                    frame_score -= penalty
        else:
            self.bored_state["since"] = None

        frame_score = max(0, frame_score)
        self.history_window.append(frame_score)
        
        # Smooth score over time
        return int(sum(self.history_window) / len(self.history_window))

    # ---------------------------------------------------------------------------------------
    # NO-FACE WARNING TRACKING
    # ---------------------------------------------------------------------------------------
    def handle_no_face(self):
        """
        Tracks consecutive no-face frames and produces an escalating warning once the
        face has been missing for a meaningful duration (not just a single dropped frame).
        """
        self.no_face_state["consecutive"] += 1
        if self.no_face_state["since"] is None:
            self.no_face_state["since"] = time.time()

        elapsed = time.time() - self.no_face_state["since"]
        warning = None
        if elapsed >= 3:
            warning = f"WARNING: No face detected for {elapsed:.1f}s"
        return warning, elapsed

    def reset_no_face_state(self):
        self.no_face_state["consecutive"] = 0
        self.no_face_state["since"] = None
