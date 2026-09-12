"""Common envelope schemas matching API_SPEC.md §11."""

from __future__ import annotations

from typing import Any, Generic, List, Optional, TypeVar
from pydantic import BaseModel, Field

DataT = TypeVar("DataT")

class ErrorDetail(BaseModel):
    field: Optional[str] = None
    issue: str

class ErrorPayload(BaseModel):
    code: str
    message: str
    details: List[ErrorDetail] = Field(default_factory=list)

class StandardResponse(BaseModel, Generic[DataT]):
    success: bool = True
    data: Optional[DataT] = None
    message: str = "Operation completed."
    error: Optional[ErrorPayload] = None

class PaginationMeta(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int
