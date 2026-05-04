-- ================================================================
--  Social Sentiment Pipeline — TimescaleDB Schema
--  Run once on first startup via docker entrypoint atau manual
-- ================================================================

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ── Main table: enriched tweets ─────────────────────────────────
CREATE TABLE IF NOT EXISTS tweets (
    tweet_id        TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,           -- partition key
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Raw tweet fields
    text            TEXT        NOT NULL,
    text_clean      TEXT,
    author_id       TEXT,
    username        TEXT,
    name            TEXT,
    like_count      INT         DEFAULT 0,
    retweet_count   INT         DEFAULT 0,

    -- Enrichment results
    keywords        TEXT[]      DEFAULT '{}',
    sentiment       TEXT        NOT NULL CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    sentiment_score FLOAT       NOT NULL,           -- -1.0 → +1.0
    confidence      FLOAT       NOT NULL,           -- 0.0 → 1.0

    PRIMARY KEY (tweet_id, created_at)              -- composite PK required by TimescaleDB
);

-- Convert ke hypertable, partisi per hari
SELECT create_hypertable(
    'tweets',
    'created_at',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists       => TRUE
);

-- ── Indexes ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tweets_sentiment
    ON tweets (sentiment, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tweets_keywords
    ON tweets USING GIN (keywords);               -- fast array search

CREATE INDEX IF NOT EXISTS idx_tweets_username
    ON tweets (username, created_at DESC);

-- ── Continuous aggregate: daily sentiment stats ──────────────────
-- Persist agregasi harian — tetap ada meski raw tweet sudah di-evict
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_sentiment_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', created_at)    AS day,
    sentiment,
    COUNT(*)                            AS tweet_count,
    AVG(sentiment_score)                AS avg_score,
    SUM(like_count)                     AS total_likes,
    SUM(retweet_count)                  AS total_retweets
FROM tweets
GROUP BY day, sentiment
WITH NO DATA;

-- Refresh policy: update agregasi tiap jam
SELECT add_continuous_aggregate_policy(
    'daily_sentiment_stats',
    start_offset => INTERVAL '3 days',
    end_offset   => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- ── Continuous aggregate: daily keyword frequency ────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_keyword_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', created_at)    AS day,
    UNNEST(keywords)                    AS keyword,
    COUNT(*)                            AS freq,
    AVG(sentiment_score)                AS avg_score
FROM tweets
GROUP BY day, keyword
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
    'daily_keyword_stats',
    start_offset => INTERVAL '3 days',
    end_offset   => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- ── Retention policy: drop raw tweets > 30 hari ─────────────────
-- Continuous aggregates tetap ada setelah raw data dihapus
SELECT add_retention_policy(
    'tweets',
    drop_after    => INTERVAL '30 days',
    if_not_exists => TRUE
);

-- ── Helper view: today's overview (dipakai REST endpoint) ────────
CREATE OR REPLACE VIEW today_overview AS
SELECT
    sentiment,
    COUNT(*)            AS tweet_count,
    AVG(sentiment_score) AS avg_score,
    SUM(like_count)     AS total_likes
FROM tweets
WHERE created_at >= date_trunc('day', NOW())
GROUP BY sentiment;