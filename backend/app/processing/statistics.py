import numpy as np
from typing import List, Dict, Tuple, Any

def detect_form_break(
    features_list: List[Dict[str, Any]], 
    baseline_count: int = 3, 
    k_allowance: float = 0.5, 
    h_threshold: float = 3.0,
    custom_baseline: Dict[str, Any] = None
) -> Tuple[int, List[float], List[float]]:
    """
    Applies the Cumulative Sum (CUSUM) algorithm to detect statistical shifts
    in the repetition features, signaling form degradation.
    """
    n_reps = len(features_list)
    composite_scores = [0.0] * n_reps
    cusum_values = [0.0] * n_reps
    
    # Features to track for degradation
    target_keys = ["jerk", "duration", "instability_ratio"]
    
    if custom_baseline:
        # Load baseline parameters from pre-calculated dictionary
        means = {k: float(custom_baseline.get(f"{k}_mean", 1.0)) for k in target_keys}
        stds = {k: float(custom_baseline.get(f"{k}_std", 0.1)) for k in target_keys}
        for k in target_keys:
            if stds[k] < 1e-4:
                stds[k] = means[k] * 0.1 if means[k] > 1e-4 else 0.1
    else:
        if n_reps <= baseline_count:
            return -1, composite_scores, cusum_values
            
        # 1. Compute baseline mean and standard deviation from the first few reps
        baseline_features = {k: [] for k in target_keys}
        for i in range(baseline_count):
            for k in target_keys:
                baseline_features[k].append(features_list[i].get(k, 0.0))
                
        means = {}
        stds = {}
        for k in target_keys:
            means[k] = np.mean(baseline_features[k])
            stds[k] = np.std(baseline_features[k])
            if stds[k] < 1e-4:
                stds[k] = means[k] * 0.1 if means[k] > 1e-4 else 0.1
            
    # 2. Calculate normalized composite scores for each repetition
    for i in range(n_reps):
        z_sum = 0.0
        for k in target_keys:
            val = features_list[i].get(k, 0.0)
            z = (val - means[k]) / stds[k]
            z_sum += z
        composite_scores[i] = float(z_sum / len(target_keys))
        
    # 3. Run CUSUM algorithm sequentially
    running_sum = 0.0
    break_idx = -1
    
    for i in range(n_reps):
        if not custom_baseline and i < baseline_count:
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
