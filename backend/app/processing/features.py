import numpy as np
from scipy.integrate import cumulative_trapezoid
from typing import Dict, Any

def compute_rms(signal: np.ndarray) -> float:
    """
    Computes the Root Mean Square (RMS) of a signal.
    """
    if len(signal) == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(signal))))

def compute_jerk(accel_data: np.ndarray, fs: float) -> float:
    """
    Computes the mean absolute jerk of 3-axis accelerometer data.
    Jerk is the first derivative of acceleration.
    """
    if len(accel_data) < 2:
        return 0.0
    # Difference between consecutive frames, scaled by sample rate
    jerk = np.diff(accel_data, axis=0) * fs
    # Calculate magnitude of jerk vector at each sample step
    jerk_magnitudes = np.linalg.norm(jerk, axis=1)
    return float(np.mean(jerk_magnitudes))

def compute_displacement_p2p(accel_data: np.ndarray, fs: float) -> float:
    """
    Computes peak-to-peak displacement along the dominant motion axis
    using double integration with linear velocity drift correction.
    """
    n_samples = len(accel_data)
    if n_samples < 5:
        return 0.0
        
    dt = 1.0 / fs
    
    # 1. Identify dominant axis of acceleration in this segment
    var_axes = np.var(accel_data, axis=0)
    dom_axis_idx = np.argmax(var_axes)
    accel_axis = accel_data[:, dom_axis_idx]
    
    # Remove gravity/DC offset (demean the signal)
    accel_centered = accel_axis - np.mean(accel_axis)
    
    # 2. First integration: acceleration -> velocity
    # cumulative_trapezoid returns array of length N-1
    vel = cumulative_trapezoid(accel_centered, dx=dt, initial=0.0)
    
    # Drift Correction: Assume velocity at start (t=0) and end (t=T) is zero.
    # Subtract a linear trend connecting vel[0] to vel[-1].
    time_steps = np.arange(n_samples)
    slope = vel[-1] / (n_samples - 1)
    vel_corrected = vel - (slope * time_steps)
    
    # 3. Second integration: velocity -> displacement
    disp = cumulative_trapezoid(vel_corrected, dx=dt, initial=0.0)
    
    # Detrend displacement to force start and end back to baseline
    disp_slope = disp[-1] / (n_samples - 1)
    disp_corrected = disp - (disp_slope * time_steps)
    
    # 4. Calculate peak-to-peak displacement
    p2p_disp = np.max(disp_corrected) - np.min(disp_corrected)
    return float(p2p_disp)

def compute_fft_peak_frequency(signal: np.ndarray, fs: float) -> float:
    """
    Computes the frequency corresponding to the peak power in the FFT spectrum,
    excluding the DC component (0 Hz).
    """
    n = len(signal)
    if n < 4:
        return 0.0
        
    # Remove mean to suppress DC peak
    signal_centered = signal - np.mean(signal)
    
    fft_vals = np.fft.rfft(signal_centered)
    fft_freqs = np.fft.rfftfreq(n, d=1.0/fs)
    
    # Find index of max amplitude (excluding 0 Hz)
    amplitudes = np.abs(fft_vals)
    if len(amplitudes) <= 1:
        return 0.0
        
    max_idx = np.argmax(amplitudes[1:]) + 1
    return float(fft_freqs[max_idx])

def extract_rep_features(
    accel_segment: np.ndarray, 
    gyro_segment: np.ndarray, 
    fs: float = 100.0
) -> Dict[str, Any]:
    """
    Extracts a feature vector from an isolated repetition's accelerometer and gyroscope data.
    """
    # 1. Magnitudes
    accel_mag = np.linalg.norm(accel_segment, axis=1)
    gyro_mag = np.linalg.norm(gyro_segment, axis=1)
    
    # 2. Duration
    duration = len(accel_segment) / fs
    
    # 3. RMS Features
    rms_accel_mag = compute_rms(accel_mag)
    rms_gyro_mag = compute_rms(gyro_mag)
    
    rms_accel_x = compute_rms(accel_segment[:, 0])
    rms_accel_y = compute_rms(accel_segment[:, 1])
    rms_accel_z = compute_rms(accel_segment[:, 2])
    
    rms_gyro_x = compute_rms(gyro_segment[:, 0])
    rms_gyro_y = compute_rms(gyro_segment[:, 1])
    rms_gyro_z = compute_rms(gyro_segment[:, 2])
    
    # 4. Kinematic Jerk (stability indicator)
    jerk = compute_jerk(accel_segment, fs)
    
    # 5. Peak-to-peak displacement along dominant axis
    disp_p2p = compute_displacement_p2p(accel_segment, fs)
    
    # 6. Spectral Peak Frequencies
    fft_accel_mag = compute_fft_peak_frequency(accel_mag, fs)
    fft_gyro_mag = compute_fft_peak_frequency(gyro_mag, fs)
    
    # 7. Multi-axis Degradation Analysis:
    # We identify which axis has the highest variance to know the primary motion plane.
    # We also evaluate which plane is showing signs of lateral drift or instability.
    # For example, if X is dominant, high Y or Z acceleration indicates form instability.
    var_accel = np.var(accel_segment, axis=0)
    dom_axis_idx = np.argmax(var_accel)
    non_dominant_axes = [i for i in range(3) if i != dom_axis_idx]
    
    # Calculate ratio of non-dominant axis energy to dominant axis energy
    dom_energy = var_accel[dom_axis_idx]
    non_dom_energy = sum(var_accel[non_dominant_axes])
    instability_ratio = float(non_dom_energy / dom_energy) if dom_energy > 1e-4 else 0.0
    
    # Label planes (0=Sagittal/Lateral, 1=Coronal/Vertical, etc depending on sensor mounting,
    # but we can report them as axis index names: X, Y, Z)
    axis_labels = ["X-axis", "Y-axis", "Z-axis"]
    dominant_plane = axis_labels[dom_axis_idx]
    
    # Identify which secondary plane has the highest proportion of off-axis movement
    if var_accel[non_dominant_axes[0]] >= var_accel[non_dominant_axes[1]]:
        degrading_plane_idx = non_dominant_axes[0]
    else:
        degrading_plane_idx = non_dominant_axes[1]
    degrading_plane = axis_labels[degrading_plane_idx]
    
    return {
        "duration": duration,
        "rms_accel_mag": rms_accel_mag,
        "rms_gyro_mag": rms_gyro_mag,
        "rms_accel_x": rms_accel_x,
        "rms_accel_y": rms_accel_y,
        "rms_accel_z": rms_accel_z,
        "rms_gyro_x": rms_gyro_x,
        "rms_gyro_y": rms_gyro_y,
        "rms_gyro_z": rms_gyro_z,
        "jerk": jerk,
        "displacement_p2p": disp_p2p,
        "fft_accel_mag": fft_accel_mag,
        "fft_gyro_mag": fft_gyro_mag,
        "dominant_plane": dominant_plane,
        "degrading_plane": degrading_plane,
        "instability_ratio": instability_ratio
    }
