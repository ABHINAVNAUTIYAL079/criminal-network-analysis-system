"""Analytics endpoints matching API_SPEC.md §5 and §6."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_current_user
from app.schemas.common import StandardResponse
from app.schemas.entities import AnomalyExplanation, PriorityRankingItem
from app.services.scoring import LEGAL_DISCLAIMER

router = APIRouter(tags=["analytics"])

ANOMALY_DATA: List[Dict[str, Any]] = [
    {
        "entity_id": "person_009",
        "canonical_name": "Manoj Tiwari",
        "anomaly_score": 0.98,
        "priority_score": 0.91,
        "top_features": ["transaction_amount", "transaction_count", "night_calls"],
        "reasons": ["Elevated high-value transaction amounts", "Unusual night-time communication patterns"],
        "disclaimer": LEGAL_DISCLAIMER,
    },
    {
        "entity_id": "person_001",
        "canonical_name": "Rahul Sharma",
        "anomaly_score": 0.82,
        "priority_score": 0.88,
        "top_features": ["unique_contacts", "calls_per_day", "location_changes"],
        "reasons": ["High volume of call contacts", "Frequent multi-location transitions"],
        "disclaimer": LEGAL_DISCLAIMER,
    },
    {
        "entity_id": "person_007",
        "canonical_name": "Arjun Mehta",
        "anomaly_score": 0.85,
        "priority_score": 0.89,
        "top_features": ["unique_contacts", "night_calls"],
        "reasons": ["High volume of call contacts", "Bridge position between disparate clusters"],
        "disclaimer": LEGAL_DISCLAIMER,
    },
    {
        "entity_id": "person_003",
        "canonical_name": "Vikas Singh",
        "anomaly_score": 0.84,
        "priority_score": 0.83,
        "top_features": ["calls_per_day", "night_calls"],
        "reasons": ["Surge in communication frequency", "Burst communication patterns"],
        "disclaimer": LEGAL_DISCLAIMER,
    },
]

RANKINGS_DATA: List[Dict[str, Any]] = [
    {
        "entity_id": "person_009",
        "name": "Manoj Tiwari",
        "type": "PERSON",
        "pagerank": 0.89,
        "betweenness": 0.86,
        "anomaly_score": 0.98,
        "priority_score": 0.91,
        "community_id": "C02",
        "top_features": ["transaction_amount", "night_calls"],
    },
    {
        "entity_id": "person_007",
        "name": "Arjun Mehta",
        "type": "PERSON",
        "pagerank": 0.88,
        "betweenness": 0.94,
        "anomaly_score": 0.85,
        "priority_score": 0.89,
        "community_id": "C01",
        "top_features": ["unique_contacts", "night_calls"],
    },
    {
        "entity_id": "person_001",
        "name": "Rahul Sharma",
        "type": "PERSON",
        "pagerank": 0.92,
        "betweenness": 0.89,
        "anomaly_score": 0.82,
        "priority_score": 0.88,
        "community_id": "C01",
        "top_features": ["unique_contacts", "calls_per_day"],
    },
    {
        "entity_id": "person_003",
        "name": "Vikas Singh",
        "type": "PERSON",
        "pagerank": 0.85,
        "betweenness": 0.81,
        "anomaly_score": 0.84,
        "priority_score": 0.83,
        "community_id": "C01",
        "top_features": ["calls_per_day"],
    },
    {
        "entity_id": "person_002",
        "name": "Amit Kumar",
        "type": "PERSON",
        "pagerank": 0.78,
        "betweenness": 0.71,
        "anomaly_score": 0.79,
        "priority_score": 0.76,
        "community_id": "C01",
        "top_features": ["calls_per_day"],
    },
    {
        "entity_id": "person_008",
        "name": "Kavita Rao",
        "type": "PERSON",
        "pagerank": 0.73,
        "betweenness": 0.68,
        "anomaly_score": 0.82,
        "priority_score": 0.74,
        "community_id": "C02",
        "top_features": ["night_calls"],
    },
]

@router.get("/anomalies", response_model=StandardResponse[List[AnomalyExplanation]])
def list_anomalies(
    limit: int = Query(20, ge=1, le=100),
    min_score: float = Query(0.0, ge=0.0, le=1.0),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    filtered = [a for a in ANOMALY_DATA if a["anomaly_score"] >= min_score][:limit]
    res = [AnomalyExplanation(**a) for a in filtered]
    return StandardResponse(data=res, message="Anomalies retrieved.")

@router.get("/analytics/priority-ranking", response_model=StandardResponse[List[PriorityRankingItem]])
def get_priority_rankings(
    limit: int = Query(20, ge=1, le=100),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    res = [PriorityRankingItem(**r) for r in RANKINGS_DATA[:limit]]
    return StandardResponse(data=res, message="Priority rankings retrieved.")
