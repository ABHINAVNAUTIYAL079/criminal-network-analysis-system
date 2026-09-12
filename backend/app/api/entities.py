"""Entities retrieval and resolution endpoints matching API_SPEC.md §3."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_current_user, get_doc_store, get_neo4j_service
from app.database.documents import DocumentStore
from app.database.neo4j import Neo4jService
from app.schemas.common import PaginationMeta, StandardResponse
from app.schemas.entities import EntityDetail, EntityListItem, EntityListResponse, SourceReference

router = APIRouter(prefix="/entities", tags=["entities"])

# Default baseline synthetic entities
SAMPLE_ENTITIES: List[Dict[str, Any]] = [
    {
        "id": "person_001",
        "type": "PERSON",
        "name": "Rahul Sharma",
        "aliases": ["Rahul S Sharma", "R. Sharma"],
        "confidence": 0.96,
        "priority_score": 0.88,
        "source_refs": [{"document_id": "FIR_001", "record_id": "FIR_001_R1", "offsets": [12, 24], "confidence": 0.95}],
        "attributes": {"phones": ["phone_001"], "accounts": ["ACC001"], "vehicles": ["vehicle_001"]},
        "analytics_summary": {"pagerank": 0.92, "betweenness": 0.89, "community_id": "C01", "anomaly_score": 0.82, "priority_score": 0.88},
        "related": [{"id": "phone_001", "type": "PHONE", "relation": "USED"}, {"id": "person_002", "type": "PERSON", "relation": "CALLED"}]
    },
    {
        "id": "person_002",
        "type": "PERSON",
        "name": "Amit Kumar",
        "aliases": ["Amit K", "A. Kumar"],
        "confidence": 0.94,
        "priority_score": 0.76,
        "source_refs": [{"document_id": "FIR_001", "record_id": "FIR_001_R2", "offsets": [45, 55], "confidence": 0.92}],
        "attributes": {"phones": ["phone_002"], "accounts": ["ACC002"], "vehicles": ["vehicle_002"]},
        "analytics_summary": {"pagerank": 0.78, "betweenness": 0.71, "community_id": "C01", "anomaly_score": 0.79, "priority_score": 0.76},
        "related": [{"id": "person_001", "type": "PERSON", "relation": "CALLED"}]
    },
    {
        "id": "person_003",
        "type": "PERSON",
        "name": "Vikas Singh",
        "aliases": ["Vikas S", "V. Singh"],
        "confidence": 0.91,
        "priority_score": 0.83,
        "source_refs": [{"document_id": "FIR_002", "record_id": "FIR_002_R1", "offsets": [10, 21], "confidence": 0.90}],
        "attributes": {"phones": ["phone_003"], "accounts": ["ACC003"], "vehicles": ["vehicle_003"]},
        "analytics_summary": {"pagerank": 0.85, "betweenness": 0.81, "community_id": "C01", "anomaly_score": 0.84, "priority_score": 0.83},
        "related": [{"id": "person_001", "type": "PERSON", "relation": "MET"}]
    },
    {
        "id": "person_007",
        "type": "PERSON",
        "name": "Arjun Mehta",
        "aliases": ["A. Mehta"],
        "confidence": 0.95,
        "priority_score": 0.89,
        "source_refs": [{"document_id": "FIR_001", "record_id": "FIR_001_R3", "offsets": [80, 91], "confidence": 0.94}],
        "attributes": {"phones": ["phone_007"], "accounts": ["ACC005"], "vehicles": ["vehicle_005"]},
        "analytics_summary": {"pagerank": 0.88, "betweenness": 0.94, "community_id": "C01", "anomaly_score": 0.85, "priority_score": 0.89},
        "related": [{"id": "person_008", "type": "PERSON", "relation": "CALLED"}]
    },
    {
        "id": "person_008",
        "type": "PERSON",
        "name": "Kavita Rao",
        "aliases": ["K. Rao"],
        "confidence": 0.93,
        "priority_score": 0.74,
        "source_refs": [{"document_id": "FIR_002", "record_id": "FIR_002_R2", "offsets": [60, 70], "confidence": 0.91}],
        "attributes": {"phones": ["phone_008"], "accounts": ["ACC006"], "vehicles": ["vehicle_006"]},
        "analytics_summary": {"pagerank": 0.73, "betweenness": 0.68, "community_id": "C02", "anomaly_score": 0.82, "priority_score": 0.74},
        "related": [{"id": "person_007", "type": "PERSON", "relation": "CALLED"}]
    },
    {
        "id": "person_009",
        "type": "PERSON",
        "name": "Manoj Tiwari",
        "aliases": ["M. Tiwari"],
        "confidence": 0.92,
        "priority_score": 0.91,
        "source_refs": [{"document_id": "FIR_003", "record_id": "FIR_003_R1", "offsets": [15, 27], "confidence": 0.93}],
        "attributes": {"phones": ["phone_009"], "accounts": ["ACC007", "ACC008"], "vehicles": ["vehicle_007"]},
        "analytics_summary": {"pagerank": 0.89, "betweenness": 0.86, "community_id": "C02", "anomaly_score": 0.98, "priority_score": 0.91},
        "related": [{"id": "person_010", "type": "PERSON", "relation": "TRANSFERRED_TO"}]
    }
]

@router.get("", response_model=StandardResponse[EntityListResponse])
def list_entities(
    type: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str = Query("name"),
    order: str = Query("asc"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    filtered = list(SAMPLE_ENTITIES)
    if type:
        filtered = [e for e in filtered if e["type"].upper() == type.upper()]
    if q:
        q_lower = q.lower()
        filtered = [
            e for e in filtered
            if q_lower in e["name"].lower()
            or any(q_lower in a.lower() for a in e.get("aliases", []))
            or q_lower in e["id"].lower()
        ]

    reverse = order.lower() == "desc"
    if sort == "priority":
        filtered.sort(key=lambda x: x.get("priority_score", 0), reverse=reverse)
    else:
        filtered.sort(key=lambda x: x.get("name", ""), reverse=reverse)

    total = len(filtered)
    start = (page - 1) * page_size
    end = start + page_size
    items = filtered[start:end]

    response_items = [
        EntityListItem(
            id=i["id"],
            type=i["type"],
            name=i["name"],
            aliases=i.get("aliases", []),
            source_refs=[SourceReference(**sr) for sr in i.get("source_refs", [])],
            confidence=i.get("confidence", 1.0),
            priority_score=i.get("priority_score", 0.0),
        )
        for i in items
    ]

    total_pages = max(1, (total + page_size - 1) // page_size)
    pagination = PaginationMeta(page=page, page_size=page_size, total=total, total_pages=total_pages)
    return StandardResponse(
        data=EntityListResponse(items=response_items, pagination=pagination),
        message="Entities retrieved.",
    )

@router.get("/{entity_id}", response_model=StandardResponse[EntityDetail])
def get_entity_detail(
    entity_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    ent = next((e for e in SAMPLE_ENTITIES if e["id"] == entity_id), None)
    if not ent:
        raise HTTPException(status_code=404, detail=f"Entity {entity_id} not found.")

    return StandardResponse(
        data=EntityDetail(
            id=ent["id"],
            type=ent["type"],
            name=ent["name"],
            aliases=ent.get("aliases", []),
            source_refs=[SourceReference(**sr) for sr in ent.get("source_refs", [])],
            attributes=ent.get("attributes", {}),
            analytics_summary=ent.get("analytics_summary", {}),
            related=ent.get("related", []),
        ),
        message="Entity retrieved.",
    )
