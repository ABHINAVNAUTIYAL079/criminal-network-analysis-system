"""Entity, Graph, and Analytics schemas."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from app.schemas.common import PaginationMeta

class SourceReference(BaseModel):
    document_id: str
    record_id: Optional[str] = None
    offsets: Optional[List[int]] = None
    confidence: float = 1.0

class EntityListItem(BaseModel):
    id: str
    type: str
    name: str
    aliases: List[str] = Field(default_factory=list)
    source_refs: List[SourceReference] = Field(default_factory=list)
    confidence: float = 1.0
    priority_score: float = 0.0

class EntityListResponse(BaseModel):
    items: List[EntityListItem]
    pagination: PaginationMeta

class EntityDetail(BaseModel):
    id: str
    type: str
    name: str
    aliases: List[str] = Field(default_factory=list)
    source_refs: List[SourceReference] = Field(default_factory=list)
    attributes: Dict[str, Any] = Field(default_factory=dict)
    analytics_summary: Dict[str, Any] = Field(default_factory=dict)
    related: List[Dict[str, Any]] = Field(default_factory=list)

class GraphNode(BaseModel):
    id: str
    label: str
    name: str
    type: str
    properties: Dict[str, Any] = Field(default_factory=dict)

class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    type: str
    confidence: float = 1.0
    method: str = "direct"
    source_record_id: Optional[str] = None
    properties: Dict[str, Any] = Field(default_factory=dict)

class GraphData(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]

class AnomalyExplanation(BaseModel):
    entity_id: str
    canonical_name: str
    anomaly_score: float
    priority_score: float
    top_features: List[str]
    reasons: List[str]
    disclaimer: str = "Investigation Priority Score is a triage indicator, not proof of guilt or criminal activity."

class PriorityRankingItem(BaseModel):
    entity_id: str
    name: str
    type: str
    pagerank: float
    betweenness: float
    anomaly_score: float
    priority_score: float
    community_id: Optional[str] = None
    top_features: List[str] = Field(default_factory=list)
