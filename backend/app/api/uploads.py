"""Upload endpoints matching API_SPEC.md §1."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.api.deps import get_current_user, get_doc_store
from app.database.documents import DocumentStore
from app.schemas.common import StandardResponse
from app.schemas.uploads import UploadMetadata
from app.services.audit import record_audit_event
from app.services.validation import validate_upload

router = APIRouter(prefix="/upload", tags=["upload"])

@router.post("", response_model=StandardResponse[UploadMetadata], status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    dataset_type: str = Form(...),
    source_name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    store: DocumentStore = Depends(get_doc_store),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    content = await file.read()
    valid, msg, record_count = validate_upload(file.filename or "upload.csv", dataset_type, content)
    if not valid:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=msg)

    upload_id = f"upl_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    raw_text = content.decode("utf-8", errors="replace")

    upload_record = {
        "id": upload_id,
        "filename": file.filename,
        "dataset_type": dataset_type.upper(),
        "size_bytes": len(content),
        "record_count": record_count,
        "status": "UPLOADED",
        "source_id": f"SRC_{datetime.now().year}_{uuid.uuid4().hex[:4].upper()}",
        "source_name": source_name or file.filename,
        "description": description or "",
        "raw_content": raw_text,
        "uploaded_by": current_user["id"],
        "uploaded_at": now,
    }

    store.create_upload(upload_record)
    record_audit_event(
        store=store,
        actor=current_user["id"],
        action="UPLOAD",
        entity_type=dataset_type.upper(),
        entity_id=upload_id,
        input_data={"filename": file.filename, "size": len(content)},
        output_data={"upload_id": upload_id, "record_count": record_count},
    )

    metadata = UploadMetadata(
        upload_id=upload_id,
        dataset_type=dataset_type.upper(),
        filename=file.filename or "upload.csv",
        size_bytes=len(content),
        record_count=record_count,
        status="UPLOADED",
        source_id=upload_record["source_id"],
        source_name=upload_record["source_name"],
        description=upload_record["description"],
        uploaded_at=now,
        uploaded_by=current_user["id"],
    )

    return StandardResponse(data=metadata, message="File uploaded and queued for validation.")

@router.get("", response_model=StandardResponse[List[UploadMetadata]])
def list_uploads(
    store: DocumentStore = Depends(get_doc_store),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    uploads = store.list_uploads()
    res = [
        UploadMetadata(
            upload_id=u["id"],
            dataset_type=u["dataset_type"],
            filename=u["filename"],
            size_bytes=u["size_bytes"],
            record_count=u.get("record_count", 0),
            status=u.get("status", "UPLOADED"),
            source_id=u.get("source_id"),
            source_name=u.get("source_name"),
            description=u.get("description"),
            uploaded_at=u["uploaded_at"],
            uploaded_by=u["uploaded_by"],
        )
        for u in uploads
    ]
    return StandardResponse(data=res, message="Uploads retrieved.")
