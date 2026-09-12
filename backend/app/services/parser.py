"""Parser service for extracting structured tabular and unstructured data."""

from __future__ import annotations

import csv
import io
import json
from typing import Any, Dict, List

def parse_csv_content(text: str) -> List[Dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]

def parse_json_content(text: str) -> List[Dict[str, Any]]:
    data = json.loads(text)
    return data if isinstance(data, list) else [data]
