"""Graph builder service executing parameterized Cypher queries on Neo4j."""

from __future__ import annotations

import hashlib
from typing import Any, Dict, List, Optional, Tuple
from app.database.neo4j import Neo4jService

NODE_LABELS = [
    "Person",
    "Phone",
    "Location",
    "Vehicle",
    "Organization",
    "BankAccount",
    "FIR",
    "Crime",
]

RELATIONSHIPS = [
    "CALLED",
    "MET",
    "LOCATED_AT",
    "OWNS",
    "USED",
    "TRANSFERRED_TO",
    "ASSOCIATED_WITH",
    "MENTIONED_IN",
    "WORKS_FOR",
    "TRAVELLED_TO",
]

def edge_id(
    src_label: str,
    src_id: str,
    rel_type: str,
    dst_label: str,
    dst_id: str,
    source_key: str = "",
) -> str:
    raw = f"{src_label}:{src_id}->{rel_type}->{dst_label}:{dst_id}#{source_key}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

def ensure_schema(neo4j_svc: Neo4jService) -> None:
    """Creates unique constraints on canonical IDs for all entity node labels."""
    for label in NODE_LABELS:
        query = f"CREATE CONSTRAINT IF NOT EXISTS FOR (n:{label}) REQUIRE n.id IS UNIQUE"
        neo4j_svc.execute_write(query)

def merge_node(neo4j_svc: Neo4jService, label: str, props: Dict[str, Any]) -> None:
    """Merges a node by its unique id with parameterized properties."""
    if "id" not in props:
        raise ValueError(f"Cannot merge node {label} without 'id' in properties.")
    query = f"""
    MERGE (n:{label} {{id: $id}})
    ON CREATE SET n += $props
    ON MATCH SET n += $props
    """
    neo4j_svc.execute_write(query, {"id": props["id"], "props": props})

def merge_relationship(
    neo4j_svc: Neo4jService,
    src_label: str,
    src_id: str,
    rel_type: str,
    dst_label: str,
    dst_id: str,
    source_key: str = "",
    props: Optional[Dict[str, Any]] = None,
) -> None:
    """Merges a directed relationship between two nodes with parameterized properties."""
    eid = edge_id(src_label, src_id, rel_type, dst_label, dst_id, source_key)
    rel_props = dict(props or {})
    rel_props["edge_id"] = eid
    rel_props["source_key"] = source_key

    query = f"""
    MATCH (a:{src_label} {{id: $src_id}})
    MATCH (b:{dst_label} {{id: $dst_id}})
    MERGE (a)-[r:{rel_type} {{edge_id: $edge_id}}]->(b)
    ON CREATE SET r += $props
    ON MATCH SET r += $props
    """
    neo4j_svc.execute_write(
        query,
        {
            "src_id": src_id,
            "dst_id": dst_id,
            "edge_id": eid,
            "props": rel_props,
        },
    )

def verify_graph(neo4j_svc: Neo4jService) -> Dict[str, int]:
    """Returns counts of nodes and relationships in the Neo4j database."""
    node_counts = neo4j_svc.execute_query("MATCH (n) RETURN count(n) AS count")
    rel_counts = neo4j_svc.execute_query("MATCH ()-[r]->() RETURN count(r) AS count")
    return {
        "nodes": node_counts[0]["count"] if node_counts else 0,
        "relationships": rel_counts[0]["count"] if rel_counts else 0,
    }
