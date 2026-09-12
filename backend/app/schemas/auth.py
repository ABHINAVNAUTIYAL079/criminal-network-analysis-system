"""Auth and user schemas."""

from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field

class LoginRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 86400
    user: UserProfile

class UserProfile(BaseModel):
    id: str
    name: str
    email: str
    role: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class CreateUserRequest(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=8)
    role: str = "INVESTIGATOR"
