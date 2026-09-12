"""Neo4j knowledge graph database connection and execution service."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

try:
    from neo4j import GraphDatabase, Driver, Session
except ImportError:
    GraphDatabase = None
    Driver = None
    Session = None

from app.config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

@dataclass
class Neo4jConfig:
    uri: str = NEO4J_URI
    user: str = NEO4J_USER
    password: str = NEO4J_PASSWORD

class Neo4jService:
    def __init__(self, config: Optional[Neo4jConfig] = None):
        self.config = config or Neo4jConfig()
        self._driver: Optional[Driver] = None

    def get_driver(self) -> Optional[Driver]:
        if self._driver is None and GraphDatabase is not None:
            try:
                self._driver = GraphDatabase.driver(
                    self.config.uri,
                    auth=(self.config.user, self.config.password),
                    max_connection_lifetime=30 * 60,
                    max_connection_pool_size=50,
                )
            except Exception as e:
                self._driver = None
        return self._driver

    def close(self) -> None:
        if self._driver is not None:
            self._driver.close()
            self._driver = None

    def execute_query(
        self, query: str, parameters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Executes a Cypher query with parameters and returns list of record dicts."""
        driver = self.get_driver()
        if driver is None:
            return []
        try:
            with driver.session() as session:
                result = session.run(query, parameters or {})
                return [record.data() for record in result]
        except Exception as e:
            return []

    def execute_write(
        self, query: str, parameters: Optional[Dict[str, Any]] = None
    ) -> Any:
        """Executes a Cypher write transaction with parameters."""
        driver = self.get_driver()
        if driver is None:
            return None
        try:
            with driver.session() as session:
                return session.execute_write(
                    lambda tx: [r.data() for r in tx.run(query, parameters or {})]
                )
        except Exception as e:
            return None

    def is_connected(self) -> bool:
        driver = self.get_driver()
        if driver is None:
            return False
        try:
            with driver.session() as session:
                res = session.run("RETURN 1 AS test").single()
                return res and res["test"] == 1
        except Exception:
            return False
