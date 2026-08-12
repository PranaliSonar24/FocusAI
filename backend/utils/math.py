import math

# Helper to extract Pitch, Yaw, and Roll from transformation matrix
def calculate_head_pose(transformation_matrix):
    # Standard decomposition of 3x3 rotation matrix using pure numpy/math
    # (Since we removed cv2 to make the server blazing fast)
    rmat = transformation_matrix[:3, :3]
    sy = math.sqrt(rmat[0,0] * rmat[0,0] + rmat[1,0] * rmat[1,0])
    singular = sy < 1e-6
    if not singular:
        x = math.atan2(rmat[2,1], rmat[2,2])
        y = math.atan2(-rmat[2,0], sy)
        z = math.atan2(rmat[1,0], rmat[0,0])
    else:
        x = math.atan2(-rmat[1,2], rmat[1,1])
        y = math.atan2(-rmat[2,0], sy)
        z = 0
    # Convert to degrees
    return math.degrees(x), math.degrees(y), math.degrees(z)

# Euclidean distance for 3D points
def calculate_distance(p1, p2):
    return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2 + (p1.z - p2.z)**2)

# Calculate Eye Aspect Ratio (EAR)
def calculate_ear(eye_landmarks):
    v1 = calculate_distance(eye_landmarks[1], eye_landmarks[5])
    v2 = calculate_distance(eye_landmarks[2], eye_landmarks[4])
    h = calculate_distance(eye_landmarks[0], eye_landmarks[3])
    return (v1 + v2) / (2.0 * h) if h != 0 else 0

# MediaPipe Eye Landmark Indices
RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144]
LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380]

def get_eye_center(eye_landmarks):
    # Index 0 and 3 are the outer and inner corners. These are anchored to the skull
    # and DO NOT move when you look up or down, providing a perfectly rigid center!
    x = (eye_landmarks[0].x + eye_landmarks[3].x) / 2.0
    y = (eye_landmarks[0].y + eye_landmarks[3].y) / 2.0
    return x, y

def get_eye_dimensions(eye_landmarks):
    xs = [pt.x for pt in eye_landmarks]
    ys = [pt.y for pt in eye_landmarks]
    width = max(xs) - min(xs)
    height = max(ys) - min(ys)
    return width, height

def detect_gaze(iris, eye_landmarks):
    center_x, center_y = get_eye_center(eye_landmarks)
    
    # We use WIDTH to normalize BOTH X and Y because the eye width is a rigid bone structure.
    # The eye height expands/contracts when looking up/down, which would ruin the math!
    width = abs(eye_landmarks[3].x - eye_landmarks[0].x)
    if width == 0: return 0, 0
        
    dx = iris.x - center_x
    dy = iris.y - center_y
    
    ratio_x = dx / width
    ratio_y = dy / width
    
    return ratio_x, ratio_y
