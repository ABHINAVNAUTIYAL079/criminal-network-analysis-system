"""Deterministic entity resolution and alias mapping service."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Set, Tuple

def normalize_name(name: str) -> str:
    cleaned = re.sub(r"[^\w\s]", "", name.lower())
    return " ".join(cleaned.split())

def resolve_entities(
    extracted_entities: List[Dict[str, Any]], existing_entities: List[Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """
    Resolves extracted entity mentions to canonical entities based on identifiers and names.
    Returns: (resolved_canonical_entities, mention_to_canonical_id_map)
    """
    resolved: List[Dict[str, Any]] = list(existing_entities)
    mention_map: Dict[str, str] = {}

    for mention in extracted_entities:
        m_type = mention["type"]
        m_name = mention["name"]
        norm_name = normalize_name(m_name)
        matched_id = None

        for cand in resolved:
            if cand["type"] != m_type:
                continue
            # Exact or normalized name match
            if normalize_name(cand["canonical_name"]) == norm_name:
                matched_id = cand["id"]
                break
            # Alias match
            cand_aliases = [normalize_name(a) for a in cand.get("aliases", [])]
            if norm_name in cand_aliases:
                matched_id = cand["id"]
                break

        if matched_id:
            mention_map[f"{m_type}:{m_name}"] = matched_id
        else:
            new_id = f"{m_type.lower()}_{len(resolved) + 1:03d}"
            new_entity = {
                "id": new_id,
                "type": m_type,
                "canonical_name": m_name,
                "normalized_name": norm_name,
                "aliases": [],
                "attributes": {},
                "source_refs": [
                    {
                        "document_id": mention.get("document_id", ""),
                        "record_id": mention.get("record_id", ""),
                        "offsets": mention.get("offsets", []),
                        "confidence": mention.get("confidence", 1.0),
                    }
                ],
                "confidence": mention.get("confidence", 1.0),
                "priority_score": 0.0,
            }
            resolved.append(new_entity)
            mention_map[f"{m_type}:{m_name}"] = new_id

    return resolved, mention_map
