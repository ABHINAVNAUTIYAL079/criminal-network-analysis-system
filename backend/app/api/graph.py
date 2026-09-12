"""Graph endpoints matching API_SPEC.md §4."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_current_user, get_neo4j_service
from app.database.neo4j import Neo4jService
from app.schemas.common import StandardResponse
from app.schemas.entities import GraphData, GraphEdge, GraphNode

router = APIRouter(prefix="/graph", tags=["graph"])

# High fidelity synthetic graph dataset matching schema
SAMPLE_NODES: List[Dict[str, Any]] = [
    {"id": "person_001", "label": "Person", "name": "Rahul Sharma", "type": "PERSON", "properties": {"priority_score": 0.88, "community_id": "C01"}},
    {"id": "person_002", "label": "Person", "name": "Amit Kumar", "type": "PERSON", "properties": {"priority_score": 0.76, "community_id": "C01"}},
    {"id": "person_003", "label": "Person", "name": "Vikas Singh", "type": "PERSON", "properties": {"priority_score": 0.83, "community_id": "C01"}},
    {"id": "person_007", "label": "Person", "name": "Arjun Mehta", "type": "PERSON", "properties": {"priority_score": 0.89, "community_id": "C01"}},
    {"id": "person_008", "label": "Person", "name": "Kavita Rao", "type": "PERSON", "properties": {"priority_score": 0.74, "community_id": "C02"}},
    {"id": "person_009", "label": "Person", "name": "Manoj Tiwari", "type": "PERSON", "properties": {"priority_score": 0.91, "community_id": "C02"}},
    {"id": "phone_001", "label": "Phone", "name": "+919876543001", "type": "PHONE", "properties": {"number": "+919876543001"}},
    {"id": "phone_002", "label": "Phone", "name": "+919876543002", "type": "PHONE", "properties": {"number": "+919876543002"}},
    {"id": "vehicle_001", "label": "Vehicle", "name": "DL01AB1234", "type": "VEHICLE", "properties": {"registration_number": "DL01AB1234"}},
    {"id": "location_001", "label": "Location", "name": "Connaught Place, Delhi", "type": "LOCATION", "properties": {"latitude": 28.63, "longitude": 77.21}},
    {"id": "FIR_001", "label": "FIR", "name": "FIR_2026_001", "type": "FIR", "properties": {"date": "2026-02-15", "police_station": "Connaught Place"}},
]

SAMPLE_EDGES: List[Dict[str, Any]] = [
    {"id": "e01", "source": "person_001", "target": "phone_001", "type": "USED", "confidence": 1.0, "method": "telecom_record", "properties": {}},
    {"id": "e02", "source": "person_002", "target": "phone_002", "type": "USED", "confidence": 1.0, "method": "telecom_record", "properties": {}},
    {"id": "e03", "source": "phone_001", "target": "phone_002", "type": "CALLED", "confidence": 1.0, "method": "cdr", "properties": {"calls_count": 28, "duration": 1840}},
    {"id": "e04", "source": "person_001", "target": "person_002", "type": "CALLED", "confidence": 0.92, "method": "cdr_resolved", "properties": {}},
    {"id": "e05", "source": "person_001", "target": "person_003", "type": "MET", "confidence": 0.85, "method": "surveillance", "properties": {"timestamp": "2026-03-10T14:30:00Z"}},
    {"id": "e06", "source": "person_001", "target": "vehicle_001", "type": "OWNS", "confidence": 1.0, "method": "vahan_registry", "properties": {}},
    {"id": "e07", "source": "person_007", "target": "person_008", "type": "CALLED", "confidence": 0.94, "method": "cdr_resolved", "properties": {}},
    {"id": "e08", "source": "person_008", "target": "person_009", "type": "ASSOCIATED_WITH", "confidence": 0.88, "method": "company_directorship", "properties": {}},
    {"id": "e09", "source": "person_001", "target": "location_001", "type": "LOCATED_AT", "confidence": 0.90, "method": "tower_ping", "properties": {}},
    {"id": "e10", "source": "person_001", "target": "FIR_001", "type": "MENTIONED_IN", "confidence": 0.95, "method": "nlp_extraction", "properties": {}},
]

@router.get("", response_model=StandardResponse[GraphData])
def get_graph(
    center_node: Optional[str] = Query(None),
    depth: int = Query(2, ge=1, le=4),
    node_types: Optional[str] = Query(None),
    rel_types: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    neo4j_svc: Neo4jService = Depends(get_neo4j_service),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    nodes = list(SAMPLE_NODES)
    edges = list(SAMPLE_EDGES)

    if center_node:
        connected_ids = {center_node}
        for e in edges:
            if e["source"] == center_node or e["target"] == center_node:
                connected_ids.add(e["source"])
                connected_ids.add(e["target"])
        nodes = [n for n in nodes if n["id"] in connected_ids]
        edges = [e for e in edges if e["source"] in connected_ids and e["target"] in connected_ids]

    if node_types:
        allowed = set(nt.strip().upper() for nt in node_types.split(","))
        nodes = [n for n in nodes if n["type"] in allowed or n["label"].upper() in allowed]
        node_ids = {n["id"] for n in nodes}
        edges = [e for e in edges if e["source"] in node_ids and e["target"] in node_ids]

    res_nodes = [GraphNode(**n) for n in nodes[:limit]]
    res_edges = [GraphEdge(**e) for e in edges[:limit]]

    return StandardResponse(data=GraphData(nodes=res_nodes, edges=res_edges), message="Graph retrieved.")
