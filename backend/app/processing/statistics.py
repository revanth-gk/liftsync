import numpy as np
from typing import List, Dict, Tuple, Any

def detect_form_break(
    features_list: List[Dict[str, Any]], 
    baseline_count: int = 3, 
    k_allowance: float = 0.5, 
    h_threshold: float = 3.0
) -> Tuple[int, List[float], List[float]]:
    """
    Applies the Cumulative Sum (CUSUM) algorithm to detect statistical shifts
    in the repetition features, signaling form degradation.
    
    Args:
        features_list: List of dictionaries containing rep-level features.
        baseline_count: Number of initial repetitions to establish the baseline.
        k_allowance: Drift allowance parameter (in standard deviation units).
        h_threshold: Decision threshold for flagging a form break.
        
    Returns:
        break_idx: The rep-by-rep index where form-break is confirmed (-1 if none).
        composite_scores: The normalized degradation score for each repetition.
        cusum_values: The running CUSUM statistic for each repetition.
    """
    n_reps = len(features_list)
    composite_scores = [0.0] * n_reps
    cusum_values = [0.0] * n_reps
    
    if n_reps <= baseline_count:
        return -1, composite_scores, cusum_values
        
    # Features to track for degradation
    # CUSUM tracks features expected to INCREASE when form degrades:
    # 1. Jerk (shakiness)
    # 2. Duration (slowing down / struggle)
    # 3. Instability ratio (lateral/off-axis movements)
    target_keys = ["jerk", "duration", "instability_ratio"]
    
    # 1. Compute baseline mean and standard deviation from the first few reps
    baseline_features = {k: [] for k in target_keys}
    for i in range(baseline_count):
        for k in target_keys:
            baseline_features[k].append(features_list[i].get(k, 0.0))
            
    means = {}
    stds = {}
    for k in target_keys:
        means[k] = np.mean(baseline_features[k])
        # Add a small value to std to avoid division by zero
        stds[k] = np.std(baseline_features[k])
        if stds[k] < 1e-4:
            stds[k] = means[k] * 0.1 if means[k] > 1e-4 else 0.1
            
    # 2. Calculate normalized composite scores for each repetition
    # A simple average of the z-scores for the monitored features
    for i in range(n_reps):
        z_sum = 0.0
        for k in target_keys:
            val = features_list[i].get(k, 0.0)
            z = (val - means[k]) / stds[k]
            z_sum += z
        composite_scores[i] = float(z_sum / len(target_keys))
        
    # 3. Run CUSUM algorithm sequentially starting from the end of baseline reps
    running_sum = 0.0
    break_idx = -1
    
    # We only start accumulation after the baseline reps
    for i in range(n_reps):
        if i < baseline_count:
            cusum_values[i] = 0.0
            continue
            
        # Standard CUSUM formulation: S_i = max(0, S_{i-1} + z_i - k)
        score = composite_scores[i]
        running_sum = max(0.0, running_sum + score - k_allowance)
        cusum_values[i] = float(running_sum)
        
        # If we exceed the threshold and haven't already flagged a break, record it
        if running_sum > h_threshold and break_idx == -1:
            break_idx = i
            
    return break_idx, composite_scores, cusum_values
