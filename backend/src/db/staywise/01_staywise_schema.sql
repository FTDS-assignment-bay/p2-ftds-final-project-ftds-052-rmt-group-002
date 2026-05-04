-- ================================================================
--  StayWise ML Platform — Database Schema
--  Star Schema + TimescaleDB hypertables
--
--  Execution order matters:
--  1. Extensions
--  2. Dimension tables (no FK deps)
--  3. Hypertables (fact + time-series)
--  4. Indexes
--  5. Compression policies
--  6. Continuous aggregates + refresh policies
-- ================================================================

-- ── 1. Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ── 2. Dimension tables ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dim_customers (
    customer_id     VARCHAR(50)  PRIMARY KEY,
    full_name       VARCHAR(150),
    age             INT,
    gender          VARCHAR(20),
    city            VARCHAR(100),
    first_seen_date DATE,
    last_updated    TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dim_products (
    product_category VARCHAR(100) PRIMARY KEY,
    created_at       TIMESTAMP   DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dim_payment_methods (
    payment_method  VARCHAR(100) PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS dim_devices (
    device_type     VARCHAR(50)  PRIMARY KEY
);

-- ── 3. Time-series tables (will be converted to hypertables) ────
CREATE TABLE IF NOT EXISTS fact_transactions (
    transaction_id           BIGSERIAL,
    customer_id              VARCHAR(50)    NOT NULL REFERENCES dim_customers(customer_id),
    product_category         VARCHAR(100)   REFERENCES dim_products(product_category),
    payment_method           VARCHAR(100)   REFERENCES dim_payment_methods(payment_method),
    device_type              VARCHAR(50)    REFERENCES dim_devices(device_type),
    transaction_date         TIMESTAMPTZ    NOT NULL,
    quantity                 INT,
    unit_price               NUMERIC(12,2),
    discount_amount          NUMERIC(12,2),
    total_amount             NUMERIC(12,2),
    session_duration_minutes NUMERIC(8,2),
    pages_viewed             INT,
    delivery_time_days       INT,
    customer_rating          SMALLINT,
    loaded_at                TIMESTAMPTZ    DEFAULT NOW(),
    CONSTRAINT unique_tx UNIQUE (customer_id, transaction_date, product_category, total_amount, quantity)
);

CREATE TABLE IF NOT EXISTS raw_events (
    event_id        BIGSERIAL,
    customer_id     VARCHAR(50),
    event_type      VARCHAR(50),
    event_payload   JSONB,
    payload_hash    VARCHAR(32),
    event_timestamp TIMESTAMPTZ  NOT NULL,
    ingested_at     TIMESTAMPTZ  DEFAULT NOW(),
    CONSTRAINT unique_event UNIQUE (customer_id, payload_hash, event_timestamp)
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    run_id           SERIAL      PRIMARY KEY,
    dag_id           VARCHAR(100),
    run_date         DATE,
    rows_processed   INT,
    status           VARCHAR(20),
    duration_seconds FLOAT,
    started_at       TIMESTAMP,
    finished_at      TIMESTAMP   DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_rfm_daily (
    snapshot_date        DATE         NOT NULL,
    customer_id          VARCHAR(50)  NOT NULL REFERENCES dim_customers(customer_id),

    -- RFM core
    recency_days         INT,
    frequency            INT,
    monetary_total       NUMERIC(14,2),
    monetary_avg         NUMERIC(12,2),

    -- Behavioural
    avg_session_duration NUMERIC(8,2),
    avg_pages_viewed     NUMERIC(8,2),
    avg_delivery_days    NUMERIC(6,2),
    avg_rating           NUMERIC(4,2),

    -- Preferences
    preferred_category   VARCHAR(100),
    preferred_device     VARCHAR(50),
    preferred_payment    VARCHAR(100),

    -- Churn prediction
    churn_probability    FLOAT,
    is_churn_predicted   BOOLEAN,
    risk_segment         VARCHAR(20),
    model_version        VARCHAR(50),

    computed_at          TIMESTAMPTZ  DEFAULT NOW(),
    PRIMARY KEY (customer_id, snapshot_date)
);

-- ── 4. Convert to hypertables ───────────────────────────────────
SELECT create_hypertable(
    'fact_transactions', 'transaction_date',
    chunk_time_interval => INTERVAL '1 month',
    migrate_data        => true,
    if_not_exists       => true
);

SELECT create_hypertable(
    'raw_events', 'event_timestamp',
    chunk_time_interval => INTERVAL '1 month',
    migrate_data        => true,
    if_not_exists       => true
);

SELECT create_hypertable(
    'customer_rfm_daily', 'snapshot_date',
    chunk_time_interval => INTERVAL '1 month',
    migrate_data        => true,
    if_not_exists       => true
);

-- ── 5. Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fact_customer_date
    ON fact_transactions (customer_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_raw_events_customer
    ON raw_events (customer_id, event_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_rfm_daily_customer_date
    ON customer_rfm_daily (customer_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_rfm_daily_risk_date
    ON customer_rfm_daily (risk_segment, snapshot_date DESC);

-- ── 6. Compression policies ─────────────────────────────────────
ALTER TABLE fact_transactions SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'customer_id',
    timescaledb.compress_orderby   = 'transaction_date DESC'
);
SELECT add_compression_policy(
    'fact_transactions', INTERVAL '3 months', if_not_exists => true
);

ALTER TABLE customer_rfm_daily SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'customer_id',
    timescaledb.compress_orderby   = 'snapshot_date DESC'
);
SELECT add_compression_policy(
    'customer_rfm_daily', INTERVAL '3 months', if_not_exists => true
);

-- ── 7. Continuous aggregates ────────────────────────────────────
-- Weekly RFM + churn trend per customer
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_customer_rfm_trend
WITH (timescaledb.continuous) AS
SELECT
    customer_id,
    time_bucket('1 week', snapshot_date)    AS bucket,
    AVG(churn_probability)                  AS avg_churn_prob,
    MAX(churn_probability)                  AS max_churn_prob,
    LAST(is_churn_predicted, snapshot_date) AS latest_is_churn,
    LAST(risk_segment, snapshot_date)       AS latest_risk_segment,
    LAST(recency_days, snapshot_date)       AS recency_days,
    LAST(frequency, snapshot_date)          AS frequency,
    LAST(monetary_total, snapshot_date)     AS monetary_total,
    AVG(avg_rating)                         AS avg_rating,
    LAST(model_version, snapshot_date)      AS model_version
FROM customer_rfm_daily
GROUP BY customer_id, bucket
WITH NO DATA;

-- Weekly risk breakdown across all customers
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_weekly_risk_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 week', snapshot_date)    AS bucket,
    risk_segment,
    COUNT(*)                                AS total_customers,
    AVG(churn_probability)                  AS avg_churn_prob
FROM customer_rfm_daily
GROUP BY bucket, risk_segment
WITH NO DATA;

-- Refresh policies
SELECT add_continuous_aggregate_policy(
    'mv_customer_rfm_trend',
    start_offset      => INTERVAL '5 weeks',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists     => true
);

SELECT add_continuous_aggregate_policy(
    'mv_weekly_risk_summary',
    start_offset      => INTERVAL '3 months',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '6 hours',
    if_not_exists     => true
);

-- Indexes on continuous aggregates
CREATE INDEX IF NOT EXISTS idx_mv_rfm_trend_customer_bucket
    ON mv_customer_rfm_trend (customer_id, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_mv_rfm_trend_risk
    ON mv_customer_rfm_trend (latest_risk_segment, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_mv_risk_summary_bucket
    ON mv_weekly_risk_summary (bucket DESC, risk_segment);