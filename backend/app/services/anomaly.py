"""Anomaly detection using Scikit-Learn Isolation Forest and behavioral feature extraction."""

from __future__ import annotations

from typing import Any, Dict, List, Tuple
import math

try:
    import numpy as np
except ImportError:
    np = None

try:
    from sklearn.ensemble import IsolationForest
except ImportError:
    IsolationForest = None

FEATURE_NAMES = [
    "calls_per_day",
    "unique_contacts",
    "average_call_duration",
    "night_calls",
    "transaction_count",
    "transaction_amount",
    "unique_locations",
    "location_changes",
]

def compute_anomaly_scores(
    entities: List[Dict[str, Any]],
    cdrs: List[Dict[str, Any]],
    transactions: List[Dict[str, Any]],
    locations: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    """
    Computes Isolation Forest anomaly scores and top contributing features.
    Returns: {entity_id: {"anomaly_score": float, "top_features": List[str], "reasons": List[str]}}
    """
    results: Dict[str, Dict[str, Any]] = {}
    if not entities:
        return results

    feature_matrix = []
    entity_ids = []

    for ent in entities:
        eid = ent["id"]
        entity_ids.append(eid)

        # Behavioral aggregation
        ent_cdrs = [c for c in cdrs if c.get("caller") == eid or c.get("receiver") == eid]
        ent_txns = [t for t in transactions if t.get("sender_account") == eid or t.get("receiver_account") == eid]
        ent_locs = [l for l in locations if l.get("location_id") == eid or l.get("name") == eid]

        calls_count = len(ent_cdrs)
        unique_contacts = len(set([c.get("caller") for c in ent_cdrs] + [c.get("receiver") for c in ent_cdrs]))
        avg_duration = sum([float(c.get("duration", 0)) for c in ent_cdrs]) / max(1, calls_count)
        night_calls = len([c for c in ent_cdrs if "22:" in str(c.get("timestamp", "")) or "23:" in str(c.get("timestamp", "")) or "00:" in str(c.get("timestamp", "")) or "01:" in str(c.get("timestamp", "")) or "02:" in str(c.get("timestamp", "")) or "03:" in str(c.get("timestamp", "")) or "04:" in str(c.get("timestamp", ""))])
        txn_count = len(ent_txns)
        txn_amount = sum([float(t.get("amount", 0)) for t in ent_txns])
        unique_locations = len(set([l.get("location_id") for l in ent_locs]))
        loc_changes = max(0, len(ent_locs) - 1)

        vec = [
            float(calls_count),
            float(unique_contacts),
            float(avg_duration),
            float(night_calls),
            float(txn_count),
            float(txn_amount),
            float(unique_locations),
            float(loc_changes),
        ]
        feature_matrix.append(vec)

    if np is not None:
        X = np.array(feature_matrix)
    else:
        X = feature_matrix

    if IsolationForest is not None and np is not None and len(X) >= 2:
        try:
            clf = IsolationForest(contamination=0.15, random_state=42)
            clf.fit(X)
            raw_scores = -clf.decision_function(X)  # Higher = more anomalous
            min_s, max_s = float(np.min(raw_scores)), float(np.max(raw_scores))
            denom = max(1e-6, max_s - min_s)
            normalized_scores = (raw_scores - min_s) / denom
        except Exception:
            normalized_scores = [0.0] * len(entity_ids)
    else:
        # Heuristic fallback based on activity magnitude
        if np is not None and isinstance(X, np.ndarray):
            sums = np.sum(X, axis=1) if len(X) > 0 else np.zeros(len(entity_ids))
            max_v = float(np.max(sums)) if len(sums) > 0 and float(np.max(sums)) > 0 else 1.0
            normalized_scores = sums / max_v
        else:
            sums = [sum(row) for row in feature_matrix]
            max_v = max(sums) if sums and max(sums) > 0 else 1.0
            normalized_scores = [s / max_v for s in sums]

    for idx, eid in enumerate(entity_ids):
        score = round(float(normalized_scores[idx]), 4)
        feats = X[idx]
        # Identify top contributing features
        if np is not None and isinstance(feats, np.ndarray):
            top_idx = list(np.argsort(feats)[::-1][:3])
        else:
            top_idx = sorted(range(len(feats)), key=lambda i: feats[i], reverse=True)[:3]
        top_features = [FEATURE_NAMES[i] for i in top_idx if feats[i] > 0]
        if not top_features:
            top_features = ["standard_activity"]

        reasons = []
        if feats[0] > 10 or feats[1] > 5:
            reasons.append("High volume of call contacts")
        if feats[3] > 0:
            reasons.append("Unusual night-time communication patterns")
        if feats[5] > 50000:
            reasons.append("Elevated high-value transaction amounts")
        if feats[7] > 2:
            reasons.append("Frequent multi-location transitions")
        if not reasons:
            reasons.append("Baseline operational activity")

        results[eid] = {
            "anomaly_score": score,
            "top_features": top_features,
            "reasons": reasons,
        }

    return results
