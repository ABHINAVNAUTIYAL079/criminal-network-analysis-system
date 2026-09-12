"""Search, timeline, and report endpoints matching API_SPEC.md §7, §8, §9."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_current_user
from app.schemas.common import StandardResponse
from app.services.scoring import LEGAL_DISCLAIMER

search_router = APIRouter(prefix="/search", tags=["search"])
timeline_router = APIRouter(prefix="/timeline", tags=["timeline"])
reports_router = APIRouter(prefix="/reports", tags=["reports"])

@search_router.get("", response_model=StandardResponse[Dict[str, Any]])
def global_search(
    q: str = Query(..., min_length=1, max_length=128),
    type: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    from app.api.entities import SAMPLE_ENTITIES
    q_lower = q.lower()
    results = []
    for ent in SAMPLE_ENTITIES:
        if type and ent["type"].upper() != type.upper():
            continue
        if (
            q_lower in ent["name"].lower()
            or any(q_lower in a.lower() for a in ent.get("aliases", []))
            or q_lower in ent["id"].lower()
        ):
            results.append({
                "id": ent["id"],
                "type": ent["type"],
                "name": ent["name"],
                "aliases": ent.get("aliases", []),
                "priority_score": ent.get("priority_score", 0.0),
            })
    return StandardResponse(data={"items": results[:limit], "total": len(results)}, message="Search results.")

@timeline_router.get("/{entity_id}", response_model=StandardResponse[List[Dict[str, Any]]])
def get_entity_timeline(
    entity_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    events = [
        {"id": "ev_01", "type": "CALL", "timestamp": "2026-02-10T10:15:00Z", "description": "Call from +919876543001 to +919876543002 (320s)", "source_id": "CDR_001"},
        {"id": "ev_02", "type": "FIR_MENTION", "timestamp": "2026-02-15T18:00:00Z", "description": "Mentioned in FIR_2026_001 at Connaught Place", "source_id": "FIR_001"},
        {"id": "ev_03", "type": "MEETING", "timestamp": "2026-03-10T14:30:00Z", "description": "Surveillance logged meeting with Vikas Singh", "source_id": "SURV_01"},
        {"id": "ev_04", "type": "TRANSACTION", "timestamp": "2026-03-12T09:00:00Z", "description": "Transferred ₹1,50,000 to ACC002", "source_id": "TXN_001"},
    ]
    return StandardResponse(data=events, message="Timeline events retrieved.")

@reports_router.get("/{entity_id}", response_model=StandardResponse[Dict[str, Any]])
def get_investigation_report(
    entity_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    report = {
        "report_id": f"REP_2026_{entity_id.upper()}",
        "generated_at": "2026-09-12T04:00:00Z",
        "entity_id": entity_id,
        "entity_name": "Rahul Sharma",
        "priority_score": 0.88,
        "executive_summary": "Entity exhibits high network centrality and acts as a central communication node.",
        "key_findings": [
            "Frequent communication with primary bridge entity Arjun Mehta",
            "Co-mentioned in multiple FIR documents regarding organized syndicates",
            "Elevated transaction frequency during nocturnal periods"
        ],
        "disclaimer": LEGAL_DISCLAIMER,
    }
    return StandardResponse(data=report, message="Investigation report generated.")
