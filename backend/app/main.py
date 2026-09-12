"""Crime Network Intelligence System — FastAPI Main Application."""

from __future__ import annotations

import os
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.analytics import router as analytics_router
from app.api.auth import router as auth_router, users_router
from app.api.entities import router as entities_router
from app.api.graph import router as graph_router
from app.api.process import router as process_router
from app.api.search import reports_router, search_router, timeline_router
from app.api.uploads import router as upload_router
from app.schemas.common import ErrorPayload, StandardResponse

app = FastAPI(
    title="Crime Network Intelligence System API",
    version="1.0.0",
    description="Investigation-support platform for crime network intelligence and graph analytics.",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routers mounting under /api prefix
app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(upload_router, prefix="/api")
app.include_router(process_router, prefix="/api")
app.include_router(entities_router, prefix="/api")
app.include_router(graph_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(search_router, prefix="/api")
app.include_router(timeline_router, prefix="/api")
app.include_router(reports_router, prefix="/api")

@app.get("/health", response_model=StandardResponse[dict])
@app.get("/api/health", response_model=StandardResponse[dict])
def health_check():
    return StandardResponse(
        data={"status": "ok", "service": "crime-network-intelligence-api", "version": "1.0.0"},
        message="Service is healthy.",
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log error internally and return safe generic error without leaking sensitive secrets
    error_payload = ErrorPayload(
        code="INTERNAL_SERVER_ERROR",
        message="An unexpected server error occurred.",
        details=[{"issue": str(exc)}],
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"success": False, "data": None, "message": "Internal error.", "error": error_payload.model_dump()},
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
