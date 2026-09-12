"""Validation service for incoming raw datasets."""

from __future__ import annotations

import csv
import io
import json
import re
from typing import Any, Dict, List, Tuple
from app.config import MAX_FILE_SIZE_BYTES, ALLOWED_DATASET_TYPES

PHONE_RE = re.compile(r"^\+91\d{10}$")
VEHICLE_RE = re.compile(r"^[A-Z]{2}\d{2}[A-Z]{2}\d{4}$")
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

def validate_upload(filename: str, dataset_type: str, content: bytes) -> Tuple[bool, str, int]:
    if len(content) > MAX_FILE_SIZE_BYTES:
        return False, f"File size ({len(content)} bytes) exceeds maximum limit of {MAX_FILE_SIZE_BYTES} bytes.", 0
    if len(content) == 0:
        return False, "Uploaded file is empty.", 0
    if dataset_type.upper() not in ALLOWED_DATASET_TYPES:
        return False, f"Unsupported dataset_type: {dataset_type}.", 0

    # Count records
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        return False, "File must be valid UTF-8 encoded text.", 0

    if filename.endswith(".csv"):
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        record_count = max(0, len(rows) - 1)
    elif filename.endswith(".json"):
        try:
            data = json.loads(text)
            record_count = len(data) if isinstance(data, list) else 1
        except json.JSONDecodeError:
            return False, "Invalid JSON structure.", 0
    else:
        record_count = len([line for line in text.splitlines() if line.strip()])

    return True, "Validation successful.", record_count
