"""Uploads and Process schemas."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

class UploadMetadata(BaseModel):
    upload_id: str
    dataset_type: str
    filename: str
    size_bytes: int
    record_count: int = 0
    status: str = "UPLOADED"
    source_id: Optional[str] = None
    source_name: Optional[str] = None
    description: Optional[str] = None
    uploaded_at: str
    uploaded_by: str

class ProcessOptions(BaseModel):
    run_ner: bool = True
    run_resolution: bool = True
    update_graph: bool = True
    refresh_analytics: bool = False

class ProcessRequest(BaseModel):
    upload_id: str
    options: ProcessOptions = Field(default_factory=ProcessOptions)

class ProcessJobStatus(BaseModel):
    job_id: str
    upload_id: str
    status: str
    stages: List[str]
    stage_statuses: Dict[str, str] = Field(default_factory=dict)
    error_message: Optional[str] = None
    created_at: str
    updated_at: str
