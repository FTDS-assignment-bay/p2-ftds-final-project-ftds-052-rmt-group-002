"""
StayWise ML Platform - Serving API
FastAPI service for serving churn predictions from the Data Warehouse.
"""

import asyncio
from contextlib import asynccontextmanager
from websocket import ws_router, push_loop

import logging
import os
import sys
from datetime import datetime, timezone

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import query_one
from routers import customers, dashboard, sentiment, trending

logging.basicConfig(level=logging.INFO, format="%(asctime)s [API] %(message)s")
log = logging.getLogger(__name__)

# ─── Startup Validation ───────────────────────────────────────
if not os.getenv("DW_POSTGRES_PASSWORD"):
    sys.exit("FATAL: DW_POSTGRES_PASSWORD environment variable is not set")


# ─── App ──────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(push_loop())
    yield
    task.cancel()


app = FastAPI(
    title="StayWise Churn Prediction API",
    description="Serving layer for StayWise ML Platform — query churn predictions and customer risk segments.",
    version="1.0.0",
    lifespan=lifespan,
)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────
app.include_router(dashboard.router)
app.include_router(customers.router)
app.include_router(sentiment.router)
app.include_router(trending.router)
app.include_router(ws_router)

# ─── System Endpoints ─────────────────────────────────────────


class HealthResponse(BaseModel):
    status: str
    db: str
    timestamp: str


@app.get("/health", response_model=HealthResponse, tags=["System"])
def health_check(response: Response):
    """Check API and database connectivity."""
    try:
        query_one("SELECT 1")
        db_status = "connected"
    except Exception as e:
        log.error(f"DB health check failed: {e}")
        db_status = "error"

    if db_status != "connected":
        response.status_code = 503

    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "db": db_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
