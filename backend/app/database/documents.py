"""SQLite-based document store for raw uploads, jobs, users, and audit logs."""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pathlib import Path

def default_db_path() -> str:
    from app.config import DOCUMENT_DB_PATH
    return DOCUMENT_DB_PATH

class DocumentStore:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or default_db_path()
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_tables()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_tables(self) -> None:
        with self._get_conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'INVESTIGATOR',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS uploads (
                    id TEXT PRIMARY KEY,
                    filename TEXT NOT NULL,
                    dataset_type TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    record_count INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'UPLOADED',
                    source_id TEXT,
                    source_name TEXT,
                    description TEXT,
                    raw_content TEXT,
                    uploaded_by TEXT NOT NULL,
                    uploaded_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS processing_jobs (
                    id TEXT PRIMARY KEY,
                    upload_id TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'QUEUED',
                    stages TEXT NOT NULL,
                    stage_statuses TEXT NOT NULL,
                    error_message TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(upload_id) REFERENCES uploads(id)
                );

                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT NOT NULL UNIQUE,
                    timestamp TEXT NOT NULL,
                    actor TEXT NOT NULL,
                    action TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    input_hash TEXT NOT NULL,
                    output_hash TEXT NOT NULL,
                    prev_hash TEXT NOT NULL,
                    entry_hash TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS entities (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    canonical_name TEXT NOT NULL,
                    aliases TEXT NOT NULL DEFAULT '[]',
                    attributes TEXT NOT NULL DEFAULT '{}',
                    source_refs TEXT NOT NULL DEFAULT '[]',
                    confidence REAL NOT NULL DEFAULT 1.0,
                    pagerank REAL NOT NULL DEFAULT 0.0,
                    betweenness REAL NOT NULL DEFAULT 0.0,
                    anomaly_score REAL NOT NULL DEFAULT 0.0,
                    priority_score REAL NOT NULL DEFAULT 0.0,
                    community_id TEXT,
                    updated_at TEXT NOT NULL
                );
            """)

    # User operations
    def create_user(self, user_data: Dict[str, Any]) -> Dict[str, Any]:
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_data["id"],
                    user_data["email"].strip().lower(),
                    user_data["name"],
                    user_data["password_hash"],
                    user_data.get("role", "INVESTIGATOR"),
                    user_data["created_at"],
                    user_data["updated_at"],
                ),
            )
        return user_data

    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE LOWER(email) = ?", (email.strip().lower(),)
            ).fetchone()
            return dict(row) if row else None

    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE id = ?", (user_id,)
            ).fetchone()
            return dict(row) if row else None

    def list_users(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            rows = conn.execute("SELECT id, email, name, role, created_at, updated_at FROM users").fetchall()
            return [dict(r) for r in rows]

    # Upload operations
    def create_upload(self, upload_data: Dict[str, Any]) -> Dict[str, Any]:
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO uploads (id, filename, dataset_type, size_bytes, record_count, status, source_id, source_name, description, raw_content, uploaded_by, uploaded_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    upload_data["id"],
                    upload_data["filename"],
                    upload_data["dataset_type"],
                    upload_data["size_bytes"],
                    upload_data.get("record_count", 0),
                    upload_data.get("status", "UPLOADED"),
                    upload_data.get("source_id", ""),
                    upload_data.get("source_name", ""),
                    upload_data.get("description", ""),
                    upload_data.get("raw_content", ""),
                    upload_data["uploaded_by"],
                    upload_data["uploaded_at"],
                ),
            )
        return upload_data

    def get_upload(self, upload_id: str) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            row = conn.execute("SELECT * FROM uploads WHERE id = ?", (upload_id,)).fetchone()
            return dict(row) if row else None

    def list_uploads(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            rows = conn.execute("SELECT id, filename, dataset_type, size_bytes, record_count, status, source_id, source_name, description, uploaded_by, uploaded_at FROM uploads ORDER BY uploaded_at DESC").fetchall()
            return [dict(r) for r in rows]

    def update_upload_status(self, upload_id: str, status: str, record_count: Optional[int] = None) -> None:
        with self._get_conn() as conn:
            if record_count is not None:
                conn.execute("UPDATE uploads SET status = ?, record_count = ? WHERE id = ?", (status, record_count, upload_id))
            else:
                conn.execute("UPDATE uploads SET status = ? WHERE id = ?", (status, upload_id))

    # Job operations
    def create_job(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO processing_jobs (id, upload_id, status, stages, stage_statuses, error_message, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_data["id"],
                    job_data["upload_id"],
                    job_data.get("status", "QUEUED"),
                    json.dumps(job_data.get("stages", [])),
                    json.dumps(job_data.get("stage_statuses", {})),
                    job_data.get("error_message", None),
                    job_data["created_at"],
                    job_data["updated_at"],
                ),
            )
        return job_data

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            row = conn.execute("SELECT * FROM processing_jobs WHERE id = ?", (job_id,)).fetchone()
            if not row:
                return None
            res = dict(row)
            res["stages"] = json.loads(res["stages"])
            res["stage_statuses"] = json.loads(res["stage_statuses"])
            return res

    def update_job(self, job_id: str, status: str, stage_statuses: Dict[str, Any], error_message: Optional[str] = None) -> None:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        with self._get_conn() as conn:
            conn.execute(
                """
                UPDATE processing_jobs
                SET status = ?, stage_statuses = ?, error_message = ?, updated_at = ?
                WHERE id = ?
                """,
                (status, json.dumps(stage_statuses), error_message, now, job_id),
            )

    # Audit operations
    def get_last_audit_hash(self) -> str:
        with self._get_conn() as conn:
            row = conn.execute("SELECT entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1").fetchone()
            return row["entry_hash"] if row else "0" * 64

    def append_audit_log(self, log_entry: Dict[str, Any]) -> None:
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO audit_logs (event_id, timestamp, actor, action, entity_type, entity_id, input_hash, output_hash, prev_hash, entry_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    log_entry["event_id"],
                    log_entry["timestamp"],
                    log_entry["actor"],
                    log_entry["action"],
                    log_entry["entity_type"],
                    log_entry["entity_id"],
                    log_entry["input_hash"],
                    log_entry["output_hash"],
                    log_entry["prev_hash"],
                    log_entry["entry_hash"],
                ),
            )

    def list_audit_logs(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]
