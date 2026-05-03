"""
Dashboard router — KPI summary for StayWise dashboard
"""

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from db import query, query_one

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


# ─── Response Models ──────────────────────────────────────────────────────────


class DateRangeResponse(BaseModel):
    min_date: str
    max_date: str


class KpiResponse(BaseModel):
    start_date: str
    end_date: str
    prev_start_date: str
    prev_end_date: str
    total_revenue: float
    total_revenue_change: float
    avg_order_value: float
    avg_order_value_change: float
    total_orders: int
    total_orders_change: float
    active_customers: int
    active_customers_change: float


class RevenueTrendPoint(BaseModel):
    month: str
    revenue: float
    orders: int


class RevenueTrendResponse(BaseModel):
    start_date: str
    end_date: str
    granularity: str  # "day" | "week"
    trend: list[RevenueTrendPoint]


class CategoryGenderPoint(BaseModel):
    category: str
    male: float
    female: float
    other: float


class CategoryGenderResponse(BaseModel):
    data: list[CategoryGenderPoint]


class AgeGroupRevenuePoint(BaseModel):
    age_group: str
    total_revenue: float
    avg_revenue: float
    order_count: int


class AgeGroupRevenueResponse(BaseModel):
    data: list[AgeGroupRevenuePoint]


class CityRevenuePoint(BaseModel):
    city: str
    total_revenue: float


class CityRevenueResponse(BaseModel):
    data: list[CityRevenuePoint]


# ─── Helpers ──────────────────────────────────────────────────────────────────


def pct(val):
    return float(val) if val is not None else 0.0


def get_db_date_range() -> tuple[date, date]:
    """Fetch min and max transaction date from DB."""
    row = query_one(
        "SELECT MIN(transaction_date)::date AS min_date, MAX(transaction_date)::date AS max_date FROM fact_transactions;"
    )
    latest = row["max_date"] if row and row["max_date"] else date.today()
    earliest = (
        row["min_date"] if row and row["min_date"] else latest - timedelta(days=89)
    )
    return earliest, latest


# ─── SQL ──────────────────────────────────────────────────────────────────────

KPI_SQL = """
WITH
current_period AS (
    SELECT
        COALESCE(SUM(total_amount), 0)      AS revenue,
        COALESCE(AVG(total_amount), 0)      AS avg_order_value,
        COUNT(*)                            AS total_orders,
        COUNT(DISTINCT customer_id)         AS active_customers
    FROM fact_transactions
    WHERE transaction_date >= %s::timestamptz
      AND transaction_date <  %s::timestamptz + INTERVAL '1 day'
),
previous_period AS (
    SELECT
        COALESCE(SUM(total_amount), 0)      AS revenue,
        COALESCE(AVG(total_amount), 0)      AS avg_order_value,
        COUNT(*)                            AS total_orders,
        COUNT(DISTINCT customer_id)         AS active_customers
    FROM fact_transactions
    WHERE transaction_date >= %s::timestamptz
      AND transaction_date <  %s::timestamptz + INTERVAL '1 day'
)
SELECT
    c.revenue,
    CASE WHEN p.revenue = 0 THEN NULL
         ELSE ROUND(((c.revenue - p.revenue) / p.revenue * 100)::NUMERIC, 2)
    END                                                         AS total_revenue_change,
    c.avg_order_value,
    CASE WHEN p.avg_order_value = 0 THEN NULL
         ELSE ROUND(((c.avg_order_value - p.avg_order_value) / p.avg_order_value * 100)::NUMERIC, 2)
    END                                                         AS avg_order_value_change,
    c.total_orders,
    CASE WHEN p.total_orders = 0 THEN NULL
         ELSE ROUND(((c.total_orders - p.total_orders)::NUMERIC / p.total_orders * 100), 2)
    END                                                         AS total_orders_change,
    c.active_customers,
    CASE WHEN p.active_customers = 0 THEN NULL
         ELSE ROUND(((c.active_customers - p.active_customers)::NUMERIC / p.active_customers * 100), 2)
    END                                                         AS active_customers_change
FROM current_period c, previous_period p;
"""

REVENUE_TREND_SQL_DAY = """
SELECT
    DATE(transaction_date)::text                                AS month,
    COALESCE(SUM(total_amount), 0)                              AS revenue,
    COUNT(*)                                                    AS orders
FROM fact_transactions
WHERE transaction_date >= %s::timestamptz
  AND transaction_date <  %s::timestamptz + INTERVAL '1 day'
GROUP BY 1
ORDER BY 1;
"""

REVENUE_TREND_SQL_WEEK = """
SELECT
    TO_CHAR(DATE_TRUNC('week', transaction_date), 'YYYY-MM-DD') AS month,
    COALESCE(SUM(total_amount), 0)                              AS revenue,
    COUNT(*)                                                    AS orders
FROM fact_transactions
WHERE transaction_date >= %s::timestamptz
  AND transaction_date <  %s::timestamptz + INTERVAL '1 day'
GROUP BY 1
ORDER BY 1;
"""

CATEGORY_GENDER_SQL = """
SELECT *
FROM (
    SELECT
        ft.product_category                                             AS category,
        COALESCE(SUM(ft.total_amount) FILTER (
            WHERE LOWER(dc.gender) IN ('male', 'm', 'laki-laki')
        ), 0)                                                           AS male,
        COALESCE(SUM(ft.total_amount) FILTER (
            WHERE LOWER(dc.gender) IN ('female', 'f', 'perempuan')
        ), 0)                                                           AS female,
        COALESCE(SUM(ft.total_amount) FILTER (
            WHERE LOWER(dc.gender) NOT IN ('male', 'm', 'laki-laki', 'female', 'f', 'perempuan')
               OR dc.gender IS NULL
        ), 0)                                                           AS other
    FROM fact_transactions ft
    LEFT JOIN dim_customers dc ON ft.customer_id = dc.customer_id
    GROUP BY ft.product_category
) t
ORDER BY (male + female + other) DESC;
"""

AGE_GROUP_REVENUE_SQL = """
SELECT
    age_group,
    COALESCE(SUM(total_amount), 0)   AS total_revenue,
    COALESCE(AVG(total_amount), 0)   AS avg_revenue,
    COUNT(*)                         AS order_count
FROM (
    SELECT
        ft.total_amount,
        CASE
            WHEN dc.age BETWEEN 18 AND 25 THEN '18-25'
            WHEN dc.age BETWEEN 26 AND 35 THEN '26-35'
            WHEN dc.age BETWEEN 36 AND 45 THEN '36-45'
            WHEN dc.age BETWEEN 46 AND 55 THEN '46-55'
            ELSE '56+'
        END AS age_group
    FROM fact_transactions ft
    LEFT JOIN dim_customers dc ON ft.customer_id = dc.customer_id
    WHERE dc.age IS NOT NULL
) t
GROUP BY age_group
ORDER BY
    CASE age_group
        WHEN '18-25' THEN 1
        WHEN '26-35' THEN 2
        WHEN '36-45' THEN 3
        WHEN '46-55' THEN 4
        ELSE 5
    END;
"""

CITY_REVENUE_SQL = """
SELECT
    dc.city,
    COALESCE(SUM(ft.total_amount), 0) AS total_revenue
FROM fact_transactions ft
JOIN dim_customers dc ON ft.customer_id = dc.customer_id
WHERE dc.city IS NOT NULL
GROUP BY dc.city
ORDER BY total_revenue DESC;
"""


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/date-range", response_model=DateRangeResponse)
def get_date_range():
    """
    Min dan max transaction_date yang tersedia di DB.
    Dipakai frontend sebagai anchor untuk default range.
    """
    row = query_one(
        "SELECT MIN(transaction_date)::date AS min_date, MAX(transaction_date)::date AS max_date FROM fact_transactions;"
    )
    if not row or not row["max_date"]:
        raise HTTPException(status_code=404, detail="No transaction data found")
    return {
        "min_date": str(row["min_date"]),
        "max_date": str(row["max_date"]),
    }


@router.get("/kpi", response_model=KpiResponse)
def get_kpi(
    start_date: Optional[date] = Query(
        None, description="Start date (YYYY-MM-DD). Default: 1st of current month."
    ),
    end_date: Optional[date] = Query(
        None, description="End date (YYYY-MM-DD). Default: latest in DB."
    ),
):
    """
    KPI cards — custom date range vs previous period (shift-back).
    Previous period = same duration, directly before start_date.
    """
    _, latest = get_db_date_range()

    end = end_date or latest
    start = start_date or date(latest.year, latest.month, 1)

    if start > end:
        raise HTTPException(
            status_code=400, detail="start_date must be before or equal to end_date"
        )

    duration = (end - start).days
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=duration)

    row = query_one(KPI_SQL, (start, end, prev_start, prev_end))

    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "prev_start_date": prev_start.isoformat(),
        "prev_end_date": prev_end.isoformat(),
        "total_revenue": float(row["revenue"]),
        "total_revenue_change": pct(row["total_revenue_change"]),
        "avg_order_value": float(row["avg_order_value"]),
        "avg_order_value_change": pct(row["avg_order_value_change"]),
        "total_orders": int(row["total_orders"]),
        "total_orders_change": pct(row["total_orders_change"]),
        "active_customers": int(row["active_customers"]),
        "active_customers_change": pct(row["active_customers_change"]),
    }


@router.get("/revenue-trend", response_model=RevenueTrendResponse)
def get_revenue_trend(
    start_date: Optional[date] = Query(
        None, description="Start date. Default: 90 days before latest DB date."
    ),
    end_date: Optional[date] = Query(
        None, description="End date. Default: latest in DB."
    ),
):
    """
    Revenue trend (time-based).
    - <= 30 days → daily granularity
    - >  30 days → weekly granularity (~13 points for 90d)
    """
    _, latest = get_db_date_range()

    end = end_date or latest
    start = start_date or (latest - timedelta(days=89))

    if start > end:
        raise HTTPException(
            status_code=400, detail="start_date must be before or equal to end_date"
        )

    granularity = "day" if (end - start).days <= 30 else "week"
    trend_sql = (
        REVENUE_TREND_SQL_DAY if granularity == "day" else REVENUE_TREND_SQL_WEEK
    )
    trend_rows = query(trend_sql, (start, end))

    return {
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "granularity": granularity,
        "trend": [
            {
                "month": str(r["month"]),
                "revenue": float(r["revenue"]),
                "orders": int(r["orders"]),
            }
            for r in trend_rows
        ],
    }


@router.get("/category-gender", response_model=CategoryGenderResponse)
def get_category_gender():
    """
    All-time revenue breakdown by product category and gender.
    No date filter — always returns full DB range.
    """
    rows = query(CATEGORY_GENDER_SQL)
    return {
        "data": [
            {
                "category": r["category"],
                "male": float(r["male"]),
                "female": float(r["female"]),
                "other": float(r["other"]),
            }
            for r in rows
        ]
    }


@router.get("/revenue-by-age", response_model=AgeGroupRevenueResponse)
def get_revenue_by_age():
    """
    All-time revenue distribution by age group (no date filter).
    Age bins: 18-25 | 26-35 | 36-45 | 46-55 | 56+
    """
    rows = query(AGE_GROUP_REVENUE_SQL)
    return {
        "data": [
            {
                "age_group": r["age_group"],
                "total_revenue": float(r["total_revenue"]),
                "avg_revenue": round(float(r["avg_revenue"]), 2),
                "order_count": int(r["order_count"]),
            }
            for r in rows
        ],
    }


@router.get("/revenue-by-city", response_model=CityRevenueResponse)
def get_revenue_by_city():
    """
    All-time total revenue per city.
    Dipakai customer distribution map.
    """
    rows = query(CITY_REVENUE_SQL)
    return {
        "data": [
            {
                "city": r["city"],
                "total_revenue": float(r["total_revenue"]),
            }
            for r in rows
        ]
    }
