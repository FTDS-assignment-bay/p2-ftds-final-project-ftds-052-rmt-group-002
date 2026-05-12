import os

# ── PostgreSQL ────────────────────────────────────────────

PG_CONN = dict(
    host=os.getenv("DW_POSTGRES_HOST", "postgres-dw"),
    dbname=os.getenv("DW_POSTGRES_DB", "datawarehouse"),
    user=os.getenv("DW_POSTGRES_USER", "staywise"),
    password=os.getenv("DW_POSTGRES_PASSWORD", "staywise"),
    port=int(os.getenv("DW_DB_PORT", 5432)),
)
