"""Tamper-evident audit logging service using SHA-256 hash chaining (PROJECT_SPEC.md §17)."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict
from app.database.documents import DocumentStore

def compute_sha256(data: Any) -> str:
    raw = json.dumps(data, sort_keys=True) if not isinstance(data, (str, bytes)) else data
    if isinstance(raw, str):
        raw = raw.encode("utf-8")
    return hashlib.sha256(raw).hexdigest()

def record_audit_event(
    store: DocumentStore,
    actor: str,
    action: str,
    entity_type: str,
    entity_id: str,
    input_data: Any,
    output_data: Any,
) -> Dict[str, Any]:
    """Appends an event to the hash-chained tamper-evident audit log."""
    event_id = f"evt_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    input_h = compute_sha256(input_data)
    output_h = compute_sha256(output_data)
    prev_h = store.get_last_audit_hash()

    chain_str = f"{prev_h}:{event_id}:{now}:{actor}:{action}:{entity_type}:{entity_id}:{input_h}:{output_h}"
    entry_h = hashlib.sha256(chain_str.encode("utf-8")).hexdigest()

    entry = {
        "event_id": event_id,
        "timestamp": now,
        "actor": actor,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "input_hash": input_h,
        "output_hash": output_h,
        "prev_hash": prev_h,
        "entry_hash": entry_h,
    }
    store.append_audit_log(entry)
    return entry
