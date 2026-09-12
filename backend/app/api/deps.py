"""FastAPI dependency injection: database stores and JWT authentication guards."""

from __future__ import annotations

from typing import Dict, Any, Generator, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.database.documents import DocumentStore, default_db_path
from app.database.neo4j import Neo4jService
from app.services.auth import decode_access_token

security = HTTPBearer(auto_error=False)

def get_doc_store() -> DocumentStore:
    return DocumentStore(default_db_path())

def get_neo4j_service() -> Neo4jService:
    return Neo4jService()

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    store: DocumentStore = Depends(get_doc_store),
) -> Dict[str, Any]:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub") or payload.get("id")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload.")
        user = store.get_user_by_id(user_id) or store.get_user_by_email(user_id)
        if not user:
            # Return payload user if database user not yet synced
            return {
                "id": user_id,
                "email": payload.get("email", "user@example.com"),
                "name": payload.get("name", "Investigator"),
                "role": payload.get("role", "INVESTIGATOR"),
            }
        return user
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(exc)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

def require_admin(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if current_user.get("role") != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions. Admin role required.",
        )
    return current_user
