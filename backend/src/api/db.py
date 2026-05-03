"""
Database connection pool — StayWise API
"""

import logging
import os
import threading
import psycopg2
import psycopg2.extras
import psycopg2.pool

log = logging.getLogger(__name__)

PG_CONN = dict(
    host=os.getenv("DW_POSTGRES_HOST", "postgres-dw"),
    dbname=os.getenv("DW_POSTGRES_DB", "datawarehouse"),
    user=os.getenv("DW_POSTGRES_USER", "staywise"),
    password=os.getenv("DW_POSTGRES_PASSWORD"),
    port=int(os.getenv("DW_POSTGRES_PORT", 5432)),
)

_pool: psycopg2.pool.ThreadedConnectionPool | None = None
_pool_lock = threading.Lock()


def get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = psycopg2.pool.ThreadedConnectionPool(
                    minconn=2, maxconn=10, **PG_CONN
                )
                log.info("Connection pool created ✅")
    return _pool


def query(sql: str, params=None) -> list[dict]:
    pool = get_pool()
    conn = None
    try:
        conn = pool.getconn()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
        return [dict(r) for r in rows]
    except Exception:
        if conn:
            conn.rollback()  # ← fix: bersihkan state kotor
        raise
    finally:
        if conn:
            pool.putconn(conn)


def query_one(sql: str, params=None) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None
