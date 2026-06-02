import numpy as np
from scipy.signal import butter, filtfilt, find_peaks
from typing import List, Dict, Tuple, Any

def butter_lowpass_filter(data: np.ndarray, cutoff: float, fs: float, order: int = 2) -> np.ndarray:
    """
    Applies a zero-phase Butterworth low-pass filter to smooth IMU signals.
    """
    nyq = 0.5 * fs
    normal_cutoff = cutoff / nyq
    # Avoid filter instability if normalized cutoff is out of bounds
    normal_cutoff = max(0.001, min(0.999, normal_cutoff))
    
    b, a = butter(order, normal_cutoff, btype='low', analog=False)
    
    # If data is too short, we cannot use zero-phase filtering. Return as is or pad.
    if len(data) <= 3 * max(len(a), len(b)):
        return data
        
    try:
        return filtfilt(b, a, data)
    except Exception:
        return data

def identify_dominant_axis(accel_data: np.ndarray, gyro_data: np.ndarray) -> Tuple[str, np.ndarray]:
    """
    Identifies the dominant movement axis by finding the signal with the highest variance.
    Returns:
        axis_name: Name of the dominant axis (e.g., 'accel_y', 'gyro_x')
        signal: The raw signal of that dominant axis
    """
    # accel_data shape: (N, 3), gyro_data shape: (N, 3)
    # Axes order: X = 0, Y = 1, Z = 2
    accel_vars = np.var(accel_data, axis=0) if len(accel_data) > 0 else np.zeros(3)
    gyro_vars = np.var(gyro_data, axis=0) if len(gyro_data) > 0 else np.zeros(3)
    
    # Normalize variances relative to typical scales to make them comparable
    # Accelerometer is in m/s^2 (typically 0-20), Gyroscope is in rad/s (typically 0-10)
    # We can scale gyro variance slightly or compare them directly by finding the maximum z-scored variance
    accel_max_idx = np.argmax(accel_vars)
    gyro_max_idx = np.argmax(gyro_vars)
    
    accel_names = ['accel_x', 'accel_y', 'accel_z']
    gyro_names = ['gyro_x', 'gyro_y', 'gyro_z']
    
    # Simple selection: pick the axis (accel or gyro) with the largest absolute variance
    # Curls are usually gyro-dominated, Squats/Presses are accel-dominated.
    # To balance, we scale gyro variance (rad/s)^2 to be comparable to accel (m/s^2)^2.
    # 1 rad/s ~ 57 deg/s. A scale factor of ~2.0 is a reasonable heuristic.
    scaled_gyro_vars = gyro_vars * 2.0
    
    if accel_vars[accel_max_idx] >= scaled_gyro_vars[gyro_max_idx]:
        return accel_names[accel_max_idx], accel_data[:, accel_max_idx]
    else:
        return gyro_names[gyro_max_idx], gyro_data[:, gyro_max_idx]

def segment_repetitions(
    accel_data: np.ndarray, 
    gyro_data: np.ndarray, 
    fs: float = 100.0
) -> List[Dict[str, Any]]:
    """
    Segments individual repetitions from raw IMU data.
    Args:
        accel_data: (N, 3) numpy array of X, Y, Z acceleration in m/s^2
        gyro_data: (N, 3) numpy array of X, Y, Z angular velocity in rad/s
        fs: Polling rate in Hz (default 100 Hz)
    Returns:
        List of dicts representing each repetition:
        [
            {
                "start_idx": int,
                "peak_idx": int,
                "end_idx": int,
                "dominant_axis": str
            },
            ...
        ]
    """
    n_samples = len(accel_data)
    if n_samples < int(fs * 1.5): # Need at least 1.5 seconds of data to find repetitions
        return []
        
    # 1. Identify dominant axis and retrieve its signal
    axis_name, raw_signal = identify_dominant_axis(accel_data, gyro_data)
    
    # 2. Filter the signal (Low-pass Butterworth filter at 2 Hz to remove jitter/noise)
    filtered_signal = butter_lowpass_filter(raw_signal, cutoff=2.0, fs=fs, order=2)
    
    # 3. Demean using median (much more robust to outliers/active spikes than mean)
    processed_signal_centered = filtered_signal - np.median(filtered_signal)
    
    # 4. Polarity detection: Determine if the dominant movement deflections are positive or negative
    # Ignore the first 1.5 seconds (setup phase) to avoid setup spikes flipping polarity
    setup_offset = int(fs * 1.5)
    active_signal = processed_signal_centered[setup_offset:] if n_samples > setup_offset * 2 else processed_signal_centered
    
    max_val = np.max(active_signal) if len(active_signal) > 0 else 1.0
    min_val = np.min(active_signal) if len(active_signal) > 0 else -1.0
    if np.abs(min_val) > np.abs(max_val):
        processed_signal = -processed_signal_centered
    else:
        processed_signal = processed_signal_centered
        
    # 5. Find peaks in the processed signal
    # A typical gym rep takes 0.8 to 7.0 seconds. Set minimum distance between peaks to 1.0s.
    min_distance = int(1.0 * fs) 
    
    # Prominence threshold: peak must stand out compared to surrounding valleys
    # Dynamic but bounded prominence threshold to prevent noise triggering or missing reps
    signal_std = np.std(processed_signal)
    if 'accel' in axis_name:
        # Acceleration peak prominence: minimum 0.5 m/s^2, maximum 4.0 m/s^2
        min_prominence = np.clip(0.4 * signal_std, 0.5, 4.0)
    else:
        # Gyroscope peak prominence: minimum 0.25 rad/s, maximum 2.0 rad/s
        min_prominence = np.clip(0.4 * signal_std, 0.25, 2.0)
        
    peaks, properties = find_peaks(
        processed_signal, 
        distance=min_distance, 
        prominence=min_prominence
    )
    
    reps = []
    for peak in peaks:
        # 6. Locate start and end of rep (valleys on either side of the peak)
        # Search backwards for start
        start_idx = peak
        while start_idx > 0:
            if start_idx <= 2:
                start_idx = 0
                break
            # Check for local minimum (valley)
            if processed_signal[start_idx - 1] >= processed_signal[start_idx] <= processed_signal[start_idx + 1]:
                # Stop if it falls below 50% of the peak value
                if processed_signal[start_idx] < 0.5 * processed_signal[peak]:
                    break
            start_idx -= 1
            
        # Search forwards for end
        end_idx = peak
        while end_idx < n_samples - 1:
            if end_idx >= n_samples - 3:
                end_idx = n_samples - 1
                break
            # Check for local minimum (valley)
            if processed_signal[end_idx - 1] >= processed_signal[end_idx] <= processed_signal[end_idx + 1]:
                if processed_signal[end_idx] < 0.5 * processed_signal[peak]:
                    break
            end_idx += 1
            
        # 7. Sanity check representation duration (must be between 0.8s and 7.0s)
        duration = (end_idx - start_idx) / fs
        if 0.8 <= duration <= 7.0:
            reps.append({
                "start_idx": int(start_idx),
                "peak_idx": int(peak),
                "end_idx": int(end_idx),
                "dominant_axis": axis_name
            })
            
    # Resolve overlapping repetitions (sort and merge or filter outliers)
    reps = sorted(reps, key=lambda r: r['start_idx'])
    filtered_reps = []
    
    for r in reps:
        if not filtered_reps:
            filtered_reps.append(r)
        else:
            prev = filtered_reps[-1]
            # If they overlap significantly, choose the one with the higher peak value
            if r['start_idx'] < prev['end_idx']:
                overlap_ratio = (prev['end_idx'] - r['start_idx']) / min(prev['end_idx'] - prev['start_idx'], r['end_idx'] - r['start_idx'])
                if overlap_ratio > 0.3: # Overlap greater than 30%
                    prev_peak_val = processed_signal[prev['peak_idx']]
                    curr_peak_val = processed_signal[r['peak_idx']]
                    if curr_peak_val > prev_peak_val:
                        filtered_reps[-1] = r
                else:
                    # Minor overlap, just adjust bounds to avoid collision
                    mid = int((prev['end_idx'] + r['start_idx']) / 2)
                    prev['end_idx'] = mid
                    r['start_idx'] = mid + 1
                    filtered_reps.append(r)
            else:
                filtered_reps.append(r)
                
    return filtered_reps
