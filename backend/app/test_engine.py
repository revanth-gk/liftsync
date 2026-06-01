import numpy as np
from typing import List, Dict, Tuple, Any
from processing.segmentation import segment_reputations
from processing.features import extract_rep_features
from processing.statistics import detect_form_break
from sklearn.ensemble import RandomForestClassifier

def generate_synthetic_rep(
    rep_idx: int, 
    fs: float = 100.0, 
    is_fatigued: bool = False
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Generates synthetic 6-axis IMU data for a single repetition.
    The dominant movement axis is Y (vertical acceleration).
    """
    # 1. Define repetition duration based on fatigue state
    # Fresh reps: 2.0s. Fatigued reps: get progressively slower (up to 4.5s)
    if not is_fatigued:
        T = 2.0
    else:
        # Gradually increase duration based on rep index
        T = 2.0 + 0.3 * (rep_idx - 3)
        
    n_samples = int(T * fs)
    t = np.linspace(0, T, n_samples)
    
    # 2. Main lifting trajectory (dominant axis Y acceleration)
    # Sinusoidal profile modeling extension and contraction
    accel_y = 9.81 + 4.0 * np.sin(np.pi * t / T) 
    
    # Gyroscope pitch rotation (dominant axis X gyro)
    gyro_x = 2.5 * np.sin(2.0 * np.pi * t / T)
    
    # 3. Add shaking / tremor (Jerk)
    # Fatigued reps have a high frequency shake (tremor at 8 Hz)
    shake_freq = 8.0
    if not is_fatigued:
        shake_amp_accel = 0.05
        shake_amp_gyro = 0.02
    else:
        # Tremor grows with fatigue
        shake_amp_accel = 0.05 + 0.35 * (rep_idx - 3)
        shake_amp_gyro = 0.02 + 0.15 * (rep_idx - 3)
        
    noise_accel_y = shake_amp_accel * np.sin(2.0 * np.pi * shake_freq * t)
    noise_gyro_x = shake_amp_gyro * np.sin(2.0 * np.pi * shake_freq * t)
    
    # Apply noise
    accel_y += noise_accel_y
    gyro_x += noise_gyro_x
    
    # 4. Off-axis movement (instability in X and Z axes)
    # Fatigued reps start swaying laterally (X axis)
    if not is_fatigued:
        accel_x = np.random.normal(0, 0.05, n_samples)
        accel_z = np.random.normal(0, 0.05, n_samples)
        gyro_y = np.random.normal(0, 0.02, n_samples)
        gyro_z = np.random.normal(0, 0.02, n_samples)
    else:
        # Off-axis wobble sways slowly (1 Hz)
        wobble_amp = 0.1 * (rep_idx - 3)
        accel_x = wobble_amp * np.sin(2.0 * np.pi * 1.0 * t) + np.random.normal(0, 0.05, n_samples)
        accel_z = np.random.normal(0, 0.05, n_samples)
        gyro_y = wobble_amp * 0.5 * np.sin(2.0 * np.pi * 1.0 * t) + np.random.normal(0, 0.02, n_samples)
        gyro_z = np.random.normal(0, 0.02, n_samples)
        
    # Stack into columns: [X, Y, Z]
    accel = np.column_stack([accel_x, accel_y, accel_z])
    gyro = np.column_stack([gyro_x, gyro_y, gyro_z])
    
    return accel, gyro

def main():
    print("==================================================")
    print("      LIFTSYNC SIGNAL PROCESSING TEST BENCH       ")
    print("==================================================")
    
    fs = 100.0
    
    # 1. Synthesize a full workout session of 9 repetitions
    # Reps 1-3: Fresh form. Reps 4-9: Progressive fatigue
    session_accel = []
    session_gyro = []
    
    # Initial calibration quiet period (1 second stationary)
    session_accel.append(np.column_stack([np.zeros(100), np.ones(100) * 9.81, np.zeros(100)]))
    session_gyro.append(np.zeros((100, 3)))
    
    print("\n[Test Bench] Synthesizing 9 repetitions...")
    for i in range(1, 10):
        is_fatigued = i > 3
        # Generate rep
        accel, gyro = generate_synthetic_rep(i, fs=fs, is_fatigued=is_fatigued)
        session_accel.append(accel)
        session_gyro.append(gyro)
        
        # Add 1 second of rest between reps (gravity baseline only)
        rest_samples = 100
        session_accel.append(np.column_stack([
            np.random.normal(0, 0.02, rest_samples), 
            np.ones(rest_samples) * 9.81 + np.random.normal(0, 0.02, rest_samples), 
            np.random.normal(0, 0.02, rest_samples)
        ]))
        session_gyro.append(np.random.normal(0, 0.01, (rest_samples, 3)))
        
    # Concatenate all sessions
    accel_all = np.vstack(session_accel)
    gyro_all = np.vstack(session_gyro)
    
    print(f"Total session length: {len(accel_all)} samples ({len(accel_all)/fs:.2f} seconds).")
    
    # 2. Run repetition segmentation
    print("\n[Test Bench] Running segmentation.py...")
    reps = segment_reputations(accel_all, gyro_all, fs=fs)
    print(f"Segmented {len(reps)} repetitions successfully.")
    
    if len(reps) == 0:
        print("[FAIL] Segmentation failed to detect repetitions.")
        return
        
    # 3. Initialize and train the Random Forest Classifier
    # (Matches main.py startup training)
    print("\n[Test Bench] Training RandomForest Classifier...")
    clf = RandomForestClassifier(n_estimators=30, random_state=42)
    # Train data: [duration, rms_accel_mag, rms_gyro_mag, jerk, displacement_p2p, instability_ratio]
    fresh_train = np.random.normal(loc=[2.0, 6.0, 3.5, 2.5, 0.45, 0.05], scale=[0.25, 0.8, 0.5, 0.5, 0.05, 0.02], size=(50, 6))
    fatigued_train = np.random.normal(loc=[3.8, 5.0, 2.8, 7.5, 0.38, 0.28], scale=[0.5, 1.2, 0.8, 2.2, 0.07, 0.09], size=(50, 6))
    X_train = np.vstack([fresh_train, fatigued_train])
    y_train = np.array([0] * 50 + [1] * 50)
    clf.fit(X_train, y_train)
    
    # 4. Extract features per rep
    print("\n[Test Bench] Extracting rep features & running classifications...")
    rep_features = []
    classifications = []
    
    for idx, rep in enumerate(reps):
        s_idx, e_idx = rep["start_idx"], rep["end_idx"]
        accel_slice = accel_all[s_idx:e_idx+1]
        gyro_slice = gyro_all[s_idx:e_idx+1]
        
        # Extract features
        feats = extract_rep_features(accel_slice, gyro_slice, fs=fs)
        rep_features.append(feats)
        
        # Classify
        feat_vector = [
            feats["duration"],
            feats["rms_accel_mag"],
            feats["rms_gyro_mag"],
            feats["jerk"],
            feats["displacement_p2p"],
            feats["instability_ratio"]
        ]
        pred = clf.predict([feat_vector])[0]
        label = "Fatigued" if pred == 1 else "Fresh"
        classifications.append(label)
        
    # 5. Run CUSUM statistical change detection
    print("\n[Test Bench] Running CUSUMStatistics statistics.py...")
    break_idx, composite_scores, cusum_values = detect_form_break(
        rep_features, 
        baseline_count=3, 
        k_allowance=0.5, 
        h_threshold=3.0
    )
    
    # 6. Display results
    print("\n" + "="*80)
    print(f"{'Rep':<5} | {'Duration (s)':<12} | {'Jerk (m/s³)':<11} | {'Disp P2P (m)':<12} | {'Off-Axis %':<10} | {'ML Class':<10} | {'CUSUM':<6}")
    print("-"*80)
    
    for i in range(len(reps)):
        feats = rep_features[i]
        label = classifications[i]
        c_score = composite_scores[i]
        cusum = cusum_values[i]
        
        print(f"Rep {i+1:<2} | {feats['duration']:<12.2f} | {feats['jerk']:<11.1f} | {feats['displacement_p2p']:<12.3f} | {feats['instability_ratio']*100:<9.1f}% | {label:<10} | {cusum:<6.2f}")
        
    print("="*80)
    
    if break_idx != -1:
        print(f"\n[ALERT] Form Degradation confirmed at Repetition: {break_idx + 1}")
        print(f"[RECOMMENDATION] Set maximum repetitions ceiling to: {break_idx} reps.")
        print("[SUCCESS] CUSUM successfully isolated form breakdown.")
    else:
        print("\n[STATUS] Form remained stable throughout the set.")
        print("[FAIL] CUSUM failed to detect the synthetic degradation.")
        
if __name__ == "__main__":
    main()
