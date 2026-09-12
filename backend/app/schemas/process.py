"""Process schemas matching API_SPEC.md §2."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

class ProcessOptions(BaseModel):
    extract_entities: bool = True
    resolve_entities: bool = True
    build_graph: bool = True
    run_analytics: bool = True

class ProcessRequest(BaseModel):
    upload_id: str
    options: ProcessOptions = Field(default_factory=ProcessOptions)

class ProcessJobStatus(BaseModel):
    job_id: str
    upload_id: str
    status: str
    stages: List[str]
    stage_statuses: Dict[str, str]
    error_message: Optional[str] = None
    created_at: str
    updated_at: str
