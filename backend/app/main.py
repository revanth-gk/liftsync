import asyncio
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sklearn.ensemble import RandomForestClassifier
from typing import List, Dict, Any, Tuple

from processing.segmentation import segment_reputations
from processing.features import extract_rep_features
from processing.statistics import detect_form_break

app = FastAPI(
    title="LiftSync API",
    description="Real-time exercise repetition segmentation & form degradation detection engine",
    version="1.0.0"
)

# Enable CORS for frontend local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# Startup: Online Machine Learning Classifier Training
# ---------------------------------------------------------
# We train a binary classifier (Random Forest) on startup using synthetic data
# reflecting typical kinematic characteristics of fresh vs. fatigued movement patterns.
clf = RandomForestClassifier(n_estimators=30, random_state=42)

def train_classifier():
    np.random.seed(42)
    # Features vector:
    # 0: duration (s)
    # 1: rms_accel_mag (m/s^2)
    # 2: rms_gyro_mag (rad/s)
    # 3: jerk (m/s^3)
    # 4: displacement_p2p (m)
    # 5: instability_ratio
    
    # Fresh repetitions (consistent speed, low jerk/shakiness, stable plane of motion)
    fresh_samples = np.random.normal(
        loc=[2.0, 6.0, 3.5, 2.5, 0.45, 0.05], 
        scale=[0.25, 0.8, 0.5, 0.5, 0.05, 0.02], 
        size=(100, 6)
    )
    # Ensure values remain physically meaningful (positive)
    fresh_samples = np.clip(fresh_samples, a_min=0.001, a_max=None)
    
    # Fatigued repetitions (longer duration/struggle, high jerk/instability, off-axis movements)
    fatigued_samples = np.random.normal(
        loc=[3.8, 5.0, 2.8, 7.5, 0.38, 0.28], 
        scale=[0.5, 1.2, 0.8, 2.2, 0.07, 0.09], 
        size=(100, 6)
    )
    fatigued_samples = np.clip(fatigued_samples, a_min=0.001, a_max=None)
    
    X = np.vstack([fresh_samples, fatigued_samples])
    y = np.array([0] * 100 + [1] * 100) # 0: Fresh, 1: Fatigued
    
    clf.fit(X, y)
    print("[LiftSync Engine] Random Forest Classifier trained successfully on startup.")

@app.on_event("startup")
async def startup_event():
    train_classifier()

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "LiftSync Biomechanical Signal Engine",
        "classifier": "RandomForestClassifier(30 estimators)"
    }

# ---------------------------------------------------------
# WebSocket Router: Real-time Signal Processing Session
# ---------------------------------------------------------
class SessionManager:
    def __init__(self):
        self.raw_accel = []
        self.raw_gyro = []
        self.processed_reps_count = 0
        self.rep_features_history = []
        self.rep_classifications = []
        self.dominant_axis = "unknown"
        self.exercise = "unknown"

    def add_data(self, accel_batch: List[List[float]], gyro_batch: List[List[float]]):
        self.raw_accel.extend(accel_batch)
        self.raw_gyro.extend(gyro_batch)

    def process_session(self) -> Dict[str, Any]:
        accel_np = np.array(self.raw_accel)
        gyro_np = np.array(self.raw_gyro)
        
        # 1. Segment repetitions
        reps = segment_reputations(accel_np, gyro_np, fs=100.0)
        
        # If no reps segmented yet, return blank status
        if not reps:
            return {
                "rep_count": 0,
                "reps": [],
                "form_break_idx": -1,
                "recommended_ceiling": None,
                "dominant_axis": "unknown"
            }
            
        self.dominant_axis = reps[0]["dominant_axis"]
        
        # 2. Extract features and classify newly completed repetitions
        new_reps_detected = len(reps) - self.processed_reps_count
        
        if new_reps_detected > 0:
            for i in range(self.processed_reps_count, len(reps)):
                rep = reps[i]
                s_idx, e_idx = rep["start_idx"], rep["end_idx"]
                
                # Extract slices
                accel_slice = accel_np[s_idx:e_idx + 1]
                gyro_slice = gyro_np[s_idx:e_idx + 1]
                
                features = extract_rep_features(accel_slice, gyro_slice, fs=100.0)
                
                # Run ML Classifier: Fresh vs Fatigued
                # Feature vector must match training: [duration, rms_accel, rms_gyro, jerk, disp, instability]
                feature_vector = [
                    features["duration"],
                    features["rms_accel_mag"],
                    features["rms_gyro_mag"],
                    features["jerk"],
                    features["displacement_p2p"],
                    features["instability_ratio"]
                ]
                
                prediction = clf.predict([feature_vector])[0]
                classification_label = "Fatigued" if prediction == 1 else "Fresh"
                
                self.rep_features_history.append(features)
                self.rep_classifications.append(classification_label)
                
            self.processed_reps_count = len(reps)
            
        # 3. Apply CUSUM statistical change detection
        # Runs on the sliding window/list of rep features collected so far
        form_break_idx, composite_scores, cusum_values = detect_form_break(
            self.rep_features_history,
            baseline_count=3,
            k_allowance=0.5,
            h_threshold=3.0
        )
        
        # 4. Construct response message
        rep_results = []
        for idx in range(len(self.rep_features_history)):
            rep_results.append({
                "rep_index": idx + 1,
                "start_idx": reps[idx]["start_idx"],
                "end_idx": reps[idx]["end_idx"],
                "features": self.rep_features_history[idx],
                "classification": self.rep_classifications[idx],
                "composite_score": composite_scores[idx],
                "cusum_value": cusum_values[idx]
            })
            
        recommended_ceiling = form_break_idx if form_break_idx != -1 else None
        
        return {
            "rep_count": len(self.rep_features_history),
            "reps": rep_results,
            "form_break_idx": form_break_idx + 1 if form_break_idx != -1 else -1, # Return 1-indexed to match UI rep numbers
            "recommended_ceiling": recommended_ceiling,
            "dominant_axis": self.dominant_axis,
            "exercise": self.exercise
        }

@app.websocket("/ws/session")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[LiftSync WS] Client connected.")
    session = SessionManager()
    
    try:
        while True:
            # Receive incoming JSON batch from PWA client
            data = await websocket.receive_json()
            
            event = data.get("event")
            
            if event == "start":
                # Reset/Initialize session state
                session = SessionManager()
                session.exercise = data.get("exercise", "bicep_curl")
                await websocket.send_json({"status": "session_started", "exercise": session.exercise})
                print(f"[LiftSync WS] Session started for exercise: {session.exercise}")
                
            elif event == "data":
                accel = data.get("accel", [])
                gyro = data.get("gyro", [])
                
                if accel and gyro:
                    session.add_data(accel, gyro)
                    
                    # Run processing pipeline on the accumulated signal buffer
                    result = session.process_session()
                    await websocket.send_json({
                        "status": "processing",
                        "data": result
                    })
                    
            elif event == "stop":
                result = session.process_session()
                await websocket.send_json({
                    "status": "session_stopped",
                    "data": result
                })
                print("[LiftSync WS] Session stopped.")
                break
                
    except WebSocketDisconnect:
        print("[LiftSync WS] Client disconnected.")
    except Exception as e:
        print(f"[LiftSync WS] Error occurred: {str(e)}")
        try:
            await websocket.send_json({"status": "error", "message": str(e)})
        except:
            pass
