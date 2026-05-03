"""
Shared SQL fragments — reusable across routers
"""

LATEST_RFM_CTE = """
    WITH latest_rfm AS (
        SELECT DISTINCT ON (customer_id)
            customer_id,
            snapshot_date,
            recency_days,
            frequency,
            monetary_total,
            monetary_avg,
            avg_session_duration,
            avg_pages_viewed,
            avg_delivery_days,
            avg_rating,
            preferred_category,
            preferred_device,
            preferred_payment,
            churn_probability,
            is_churn_predicted,
            risk_segment,
            model_version,
            computed_at
        FROM customer_rfm_daily
        ORDER BY customer_id, snapshot_date DESC
    )
"""
