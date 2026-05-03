"""
Customers router — list, detail, transactions, high-risk
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from db import query, query_one
from sql import LATEST_RFM_CTE

router = APIRouter(prefix="/customers", tags=["Customers"])


# ─── Response Models ──────────────────────────────────────────


class CustomerDetailResponse(BaseModel):
    customer_id: str
    full_name: Optional[str]
    age: Optional[int]
    gender: Optional[str]
    city: Optional[str]
    first_seen_date: Optional[str]
    churn_probability: Optional[float]  # ← kasih Optional
    is_churn_predicted: Optional[bool]  # ← kasih Optional
    risk_segment: Optional[str]  # ← kasih Optional
    model_version: Optional[str]  # ← kasih Optional
    predicted_at: Optional[str]  # ← kasih Optional
    recency_days: Optional[int]
    frequency: Optional[int]
    monetary_total: Optional[float]
    monetary_avg: Optional[float]
    preferred_category: Optional[str]
    preferred_device: Optional[str]
    preferred_payment: Optional[str]


# ─── Helpers ──────────────────────────────────────────────────

CUSTOMER_SELECT = """
    SELECT
        r.customer_id, c.full_name, c.age, c.gender, c.city,
        c.first_seen_date, r.churn_probability, r.is_churn_predicted,
        r.risk_segment, r.model_version, r.computed_at, r.recency_days,
        r.frequency, r.monetary_total, r.monetary_avg, r.preferred_category,
        r.preferred_device, r.preferred_payment
    FROM latest_rfm r
    LEFT JOIN dim_customers c ON r.customer_id = c.customer_id
"""


def _serialize(row: dict) -> dict:
    return {
        **row,
        "predicted_at": str(row["computed_at"]) if row.get("computed_at") else None,
        "first_seen_date": (
            str(row["first_seen_date"]) if row.get("first_seen_date") else None
        ),
    }


# ─── Endpoints ────────────────────────────────────────────────


@router.get("", response_model=List[CustomerDetailResponse])
def get_all_customers(
    risk_segment: Optional[str] = Query(None, description="Filter: high, medium, low"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List all customers with pagination."""
    valid_segments = {"high", "medium", "low"}
    if risk_segment and risk_segment not in valid_segments:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid risk_segment. Must be one of: {valid_segments}",
        )

    where = "WHERE r.risk_segment = %s" if risk_segment else ""
    params = (risk_segment, limit, offset) if risk_segment else (limit, offset)

    rows = query(
        LATEST_RFM_CTE
        + CUSTOMER_SELECT
        + f"{where} ORDER BY r.churn_probability DESC NULLS LAST LIMIT %s OFFSET %s",
        params,
    )
    return [_serialize(r) for r in rows]


@router.get("/count", tags=["Customers"])
def get_customers_count(
    risk_segment: Optional[str] = Query(None, description="Filter: high, medium, low"),
):
    """Number of customers."""
    where = "WHERE risk_segment = %s" if risk_segment else ""
    params = (risk_segment,) if risk_segment else None

    row = query_one(
        LATEST_RFM_CTE + f"SELECT COUNT(*) AS total FROM latest_rfm {where}", params
    )
    return {"total": int(row["total"]) if row else 0}


@router.get("/high-risk", response_model=List[CustomerDetailResponse])
def get_high_risk_customers(
    limit: int = Query(50, ge=1, le=500, description="Max number of results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
):
    """Customer high-risk sorted by churn probability descending."""
    rows = query(
        LATEST_RFM_CTE
        + CUSTOMER_SELECT
        + "WHERE r.risk_segment = 'high' ORDER BY r.churn_probability DESC LIMIT %s OFFSET %s",
        (limit, offset),
    )
    return [_serialize(r) for r in rows]


@router.get("/{customer_id}", response_model=CustomerDetailResponse)
def get_customer_detail(customer_id: str):
    """Churn prediction detail and RFM for each customer."""
    row = query_one(
        LATEST_RFM_CTE + CUSTOMER_SELECT + "WHERE r.customer_id = %s",
        (customer_id,),
    )
    if not row:
        raise HTTPException(
            status_code=404, detail=f"Customer '{customer_id}' not found"
        )
    return _serialize(row)


@router.get("/{customer_id}/transactions")
def get_customer_transactions(customer_id: str, limit: int = Query(20, ge=1, le=100)):
    """Transaction history for each customer."""
    customer = query_one(
        "SELECT customer_id FROM dim_customers WHERE customer_id = %s", (customer_id,)
    )
    if not customer:
        raise HTTPException(
            status_code=404, detail=f"Customer '{customer_id}' not found"
        )

    rows = query(
        """
        SELECT
            transaction_id, transaction_date, product_category,
            payment_method, device_type, quantity, unit_price,
            discount_amount, total_amount, session_duration_minutes,
            pages_viewed, delivery_time_days, customer_rating
        FROM fact_transactions
        WHERE customer_id = %s
        ORDER BY transaction_date DESC
        LIMIT %s
        """,
        (customer_id, limit),
    )
    return {
        "customer_id": customer_id,
        "total_transactions": len(rows),
        "transactions": [
            {**r, "transaction_date": str(r["transaction_date"])} for r in rows
        ],
    }
