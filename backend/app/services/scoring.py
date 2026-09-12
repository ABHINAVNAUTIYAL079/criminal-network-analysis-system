"""Investigation Priority Scoring engine implementing PROJECT_SPEC.md §9 and AGENTS.md §5."""

from __future__ import annotations

from typing import Any, Dict, List
from app.config import WEIGHT_PAGERANK, WEIGHT_BETWEENNESS, WEIGHT_ANOMALY

LEGAL_DISCLAIMER = (
    "Investigation Priority Score is an analytical triage indicator designed for evidence prioritization. "
    "It does NOT represent guilt, proof of criminal activity, or probability of criminality."
)

def calculate_priority_score(
    pagerank: float, betweenness: float, anomaly_score: float
) -> float:
    """Calculates weighted Investigation Priority Score: 0.35*PR + 0.35*BW + 0.30*Anomaly."""
    pr_norm = max(0.0, min(1.0, float(pagerank)))
    bw_norm = max(0.0, min(1.0, float(betweenness)))
    an_norm = max(0.0, min(1.0, float(anomaly_score)))

    score = (
        (WEIGHT_PAGERANK * pr_norm)
        + (WEIGHT_BETWEENNESS * bw_norm)
        + (WEIGHT_ANOMALY * an_norm)
    )
    return round(max(0.0, min(1.0, score)), 4)

def generate_explanation(
    entity_id: str,
    canonical_name: str,
    pagerank: float,
    betweenness: float,
    anomaly_score: float,
    priority_score: float,
    top_features: List[str],
    reasons: List[str],
) -> Dict[str, Any]:
    """Generates explainable rationale for priority score."""
    explanation_reasons = list(reasons)
    if pagerank >= 0.6:
        explanation_reasons.append("High network connectivity (PageRank)")
    if betweenness >= 0.6:
        explanation_reasons.append("High betweenness centrality (broker / bridge position)")

    return {
        "entity_id": entity_id,
        "canonical_name": canonical_name,
        "priority_score": priority_score,
        "components": {
            "pagerank": pagerank,
            "betweenness": betweenness,
            "anomaly_score": anomaly_score,
            "weights": {
                "pagerank": WEIGHT_PAGERANK,
                "betweenness": WEIGHT_BETWEENNESS,
                "anomaly": WEIGHT_ANOMALY,
            },
        },
        "top_features": top_features,
        "reasons": explanation_reasons,
        "disclaimer": LEGAL_DISCLAIMER,
    }
