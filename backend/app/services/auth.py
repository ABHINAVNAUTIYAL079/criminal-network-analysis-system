"""Authentication, password policy, and JWT token services."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

try:
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
except ImportError:
    pwd_context = None

try:
    from jose import JWTError, jwt
except ImportError:
    jwt = None
    JWTError = Exception

from app.config import JWT_ALGORITHM, JWT_SECRET, ACCESS_TOKEN_EXPIRE_MINUTES

def validate_password_policy(password: str) -> None:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")

def hash_password(password: str) -> str:
    if pwd_context is not None:
        return pwd_context.hash(password)
    import hashlib
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if pwd_context is not None and hashed_password.startswith("$2"):
        return pwd_context.verify(plain_password, hashed_password)
    import hashlib
    return hashlib.sha256(plain_password.encode("utf-8")).hexdigest() == hashed_password

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    if jwt is not None:
        return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    import base64, json
    return "mock_token." + base64.b64encode(json.dumps(to_encode).encode("utf-8")).decode("utf-8")

def decode_access_token(token: str) -> Dict[str, Any]:
    if jwt is not None:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    import base64, json
    parts = token.split(".")
    if len(parts) >= 2:
        return json.loads(base64.b64decode(parts[1]).decode("utf-8"))
    raise ValueError("Invalid token format")
