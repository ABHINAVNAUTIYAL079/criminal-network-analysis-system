"""Application configuration and environment variables."""

from __future__ import annotations

import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
PROCESSED_DATA_DIR = DATA_DIR / "processed"
PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)

# Security & JWT
JWT_SECRET = os.environ.get("JWT_SECRET", "super-secret-crime-intelligence-key-at-least-32-chars-long")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

# Database paths
DOCUMENT_DB_PATH = os.environ.get(
    "DOCUMENT_DB_PATH", str(PROCESSED_DATA_DIR / "documents.db")
)

# Neo4j Settings
NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "testpassword123")

# Ingestion Constraints
MAX_FILE_SIZE_BYTES = int(os.environ.get("MAX_FILE_SIZE_BYTES", str(25 * 1024 * 1024)))  # 25 MB
ALLOWED_DATASET_TYPES = ["FIR", "CDR", "TRANSACTION", "VEHICLE", "LOCATION"]

# Investigation Priority Weights (Fixed per PROJECT_SPEC.md §9 and AGENTS.md §5)
WEIGHT_PAGERANK = 0.35
WEIGHT_BETWEENNESS = 0.35
WEIGHT_ANOMALY = 0.30
