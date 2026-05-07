"""
StayWise ML Platform - DAG 1: Data Ingestion
Schedule: triggered by simulator via REST API (schedule_interval=None)

Flow:
  Redis queue (marketplace events buffer)
      → Sense signal dari simulator
      → Pull events dari queue
      → Data QC (validasi & cleaning)
      → Great Expectations Validation
      → Data Dump ke Data Warehouse DB
      → Trigger DAG 2 (feature engineering)
"""

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.trigger_dagrun import TriggerDagRunOperator
from airflow.sensors.base import BaseSensorOperator
from airflow.utils.dates import days_ago
from datetime import timedelta
import logging
import os
import json

log = logging.getLogger(__name__)

default_args = {
    "owner": "staywise-ml",
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}

PG_CONN = dict(
    host=os.getenv("DW_POSTGRES_HOST", "postgres-dw"),
    dbname=os.getenv("DW_POSTGRES_DB", "datawarehouse"),
    user=os.getenv("DW_POSTGRES_USER", "staywise"),
    password=os.getenv("DW_POSTGRES_PASSWORD", "staywise"),
    port=int(os.getenv("DW_DB_PORT", 5432)),
)

REDIS_QUEUE = "queue:transactions"
REDIS_QUEUE_META = "queue:meta"
REDIS_SIGNAL = "simulator:trigger_pipeline"

# Simpan events ke /tmp bukan XCom supaya tidak blow up Airflow metadata DB
EVENTS_TMP_DIR = "/tmp/staywise_events"


def _get_tmp_path(run_id: str, stage: str) -> str:
    os.makedirs(EVENTS_TMP_DIR, exist_ok=True)
    # Sanitize run_id supaya aman jadi filename
    safe_run_id = run_id.replace(":", "_").replace("+", "_")
    return f"{EVENTS_TMP_DIR}/{safe_run_id}_{stage}.json"


# ════════════════════════════════════════
# SENSOR: tunggu signal dari simulator
# ════════════════════════════════════════


class RedisBatchSensor(BaseSensorOperator):
    """
    Poll Redis sampai simulator kasih signal batch baru siap di queue.
    Pakai mode='reschedule' supaya tidak block worker slot saat nunggu.
    """

    def poke(self, context):
        import redis

        r = redis.Redis(host="redis", port=6379, decode_responses=True)

        trigger = r.get(REDIS_SIGNAL)
        queue_size = r.llen(REDIS_QUEUE)

        if trigger == "1" and queue_size > 0:
            meta = r.hgetall(REDIS_QUEUE_META)
            log.info(f"Signal detected! queue_size={queue_size} | meta={meta}")
            return True

        log.info(f"Waiting... trigger={trigger} | queue_size={queue_size}")
        return False


# ════════════════════════════════════════
# TASK 1: Pull events dari Redis queue
# ════════════════════════════════════════


def task_pull_from_queue(**kwargs):
    """
    Pull semua events dari Redis queue (FIFO via lpop).
    Events disimpan ke /tmp (bukan XCom) untuk menghindari metadata DB bloat.
    """
    import redis

    r = redis.Redis(host="redis", port=6379, decode_responses=True)
    queue_size = r.llen(REDIS_QUEUE)

    log.info(f"=== PULL FROM REDIS QUEUE | queue_size={queue_size} ===")

    if queue_size == 0:
        log.info("Queue kosong, skip.")
        kwargs["ti"].xcom_push(key="event_count", value=0)
        kwargs["ti"].xcom_push(key="events_path", value=None)
        return

    events = []
    while True:
        raw = r.lpop(REDIS_QUEUE)
        if raw is None:
            break
        events.append(json.loads(raw))

    # Reset signal setelah pull selesai
    r.set(REDIS_SIGNAL, "0")

    # Simpan ke /tmp, push path-nya ke XCom
    path = _get_tmp_path(kwargs["run_id"], "raw")
    with open(path, "w") as f:
        json.dump(events, f)

    log.info(f"Pulled {len(events)} events → saved to {path}")
    kwargs["ti"].xcom_push(key="event_count", value=len(events))
    kwargs["ti"].xcom_push(key="events_path", value=path)


# ════════════════════════════════════════
# TASK 2: Data QC
# ════════════════════════════════════════


def task_data_qc(**kwargs):
    """
    Validasi kualitas events yang di-pull dari Redis queue.
    Cek: null values, nilai negatif, tipe data.
    Baca dari /tmp, tulis hasil ke /tmp baru.
    """
    events_path = kwargs["ti"].xcom_pull(key="events_path")
    if not events_path:
        log.info("Tidak ada events untuk di-QC.")
        kwargs["ti"].xcom_push(key="qc_passed_path", value=None)
        return

    with open(events_path) as f:
        events = json.load(f)

    log.info(f"=== DATA QC | total events: {len(events)} ===")

    passed = []
    failed = []

    for event in events:
        payload = event.get("payload", {})
        issues = []

        for col in [
            "customer_id",
            "transaction_date",
            "total_amount",
            "product_category",
        ]:
            if not payload.get(col):
                issues.append(f"null_{col}")

        if float(payload.get("total_amount", 0)) < 0:
            issues.append("negative_total_amount")
        if int(payload.get("quantity", 0)) <= 0:
            issues.append("invalid_quantity")

        if issues:
            failed.append({"event": event, "issues": issues})
            log.warning(f"QC FAILED: {payload.get('customer_id')} | issues: {issues}")
        else:
            passed.append(event)

    qc_results = {
        "total": len(events),
        "passed": len(passed),
        "failed": len(failed),
        "status": "PASSED" if len(failed) == 0 else "PARTIAL",
    }

    log.info(f"QC Results: {json.dumps(qc_results, indent=2)}")

    if len(passed) == 0:
        raise ValueError("QC FAILED: Semua events gagal QC!")

    path = _get_tmp_path(kwargs["run_id"], "qc_passed")
    with open(path, "w") as f:
        json.dump(passed, f)

    kwargs["ti"].xcom_push(key="qc_passed_path", value=path)
    kwargs["ti"].xcom_push(key="qc_results", value=qc_results)


# ════════════════════════════════════════
# TASK 3: Great Expectations Validation
# ════════════════════════════════════════


def task_great_expectations(**kwargs):
    """
    Validasi data menggunakan Great Expectations.
    Baca dari /tmp qc_passed, tulis ge_passed ke /tmp baru.
    """
    import pandas as pd
    import great_expectations as ge
    from datetime import datetime

    qc_passed_path = kwargs["ti"].xcom_pull(key="qc_passed_path")
    if not qc_passed_path:
        log.info("Tidak ada events untuk di-validasi GE.")
        kwargs["ti"].xcom_push(key="ge_passed_path", value=None)
        return

    with open(qc_passed_path) as f:
        events = json.load(f)

    log.info(f"=== GREAT EXPECTATIONS VALIDATION | total events: {len(events)} ===")

    rows = [event["payload"] for event in events]
    df = pd.DataFrame(rows)
    gdf = ge.from_pandas(df)

    # ── Null checks ──────────────────────────────────────────────
    critical_cols = [
        "customer_id",
        "transaction_date",
        "product_category",
        "payment_method",
        "device_type",
        "total_amount",
        "quantity",
        "unit_price",
    ]
    for col in critical_cols:
        gdf.expect_column_values_to_not_be_null(col)

    # ── Format & type checks ─────────────────────────────────────
    gdf.expect_column_values_to_not_match_regex("customer_id", r"^\s*$")
    gdf.expect_column_values_to_match_regex("transaction_date", r"^\d{4}-\d{2}-\d{2}$")

    today = datetime.now().strftime("%Y-%m-%d")
    gdf.expect_column_values_to_be_between(
        "transaction_date", min_value="2000-01-01", max_value=today
    )

    # ── Range nilai ──────────────────────────────────────────────
    gdf.expect_column_values_to_be_between("quantity", min_value=1, max_value=100)
    gdf.expect_column_values_to_be_between(
        "unit_price", min_value=0.01, max_value=100_000_000
    )
    gdf.expect_column_values_to_be_between("discount_amount", min_value=0)
    gdf.expect_column_values_to_be_between("total_amount", min_value=0.01)
    gdf.expect_column_values_to_be_between(
        "session_duration_minutes", min_value=1, max_value=1440
    )
    gdf.expect_column_values_to_be_between("pages_viewed", min_value=1, max_value=1000)
    gdf.expect_column_values_to_be_between(
        "delivery_time_days", min_value=0, max_value=60
    )
    gdf.expect_column_values_to_be_between("age", min_value=17, max_value=100)

    # ── Categorical checks ───────────────────────────────────────
    gdf.expect_column_values_to_be_in_set(
        "gender", ["Male", "Female", "Other", "male", "female", "other"]
    )
    gdf.expect_column_values_to_be_in_set(
        "customer_rating",
        [
            "Poor",
            "Fair",
            "Good",
            "Very Good",
            "Excellent",
            "poor",
            "fair",
            "good",
            "very good",
            "excellent",
        ],
    )
    gdf.expect_column_values_to_be_in_set(
        "device_type", ["Mobile", "Desktop", "Tablet", "mobile", "desktop", "tablet"]
    )
    gdf.expect_column_value_lengths_to_be_between(
        "customer_id", min_value=1, max_value=50
    )
    gdf.expect_column_values_to_be_between(
        "total_amount", min_value=0.01, max_value=100_000_000
    )

    # ── Run validation ───────────────────────────────────────────
    results = gdf.validate()
    all_results = results["results"]

    failed_cols = set()
    for r in all_results:
        if not r["success"]:
            col = r["expectation_config"]["kwargs"].get("column", "unknown")
            failed_cols.add(col)
            log.warning(
                f"GE FAILED | column: {col} | "
                f"expectation: {r['expectation_config']['expectation_type']} | "
                f"result: {r['result']}"
            )

    # Filter per-row berdasarkan unexpected_index_list dari GE
    # Kumpulkan index baris yang gagal di expectation manapun
    failed_indices = set()
    for r in all_results:
        if not r["success"]:
            unexpected_indices = r.get("result", {}).get("unexpected_index_list", [])
            failed_indices.update(unexpected_indices)

    passed_events = [e for i, e in enumerate(events) if i not in failed_indices]
    failed_events = [e for i, e in enumerate(events) if i in failed_indices]

    for i in failed_indices:
        cid = events[i]["payload"].get("customer_id")
        log.warning(f"GE ROW SKIP index={i} customer_id={cid}")

    ge_summary = {
        "total": len(events),
        "ge_passed": len(passed_events),
        "ge_failed": len(failed_events),
        "failed_columns": list(failed_cols),
        "expectations": {
            "total": results["statistics"]["evaluated_expectations"],
            "success": results["statistics"]["successful_expectations"],
            "failed": results["statistics"]["unsuccessful_expectations"],
        },
        "status": "PASSED" if len(failed_cols) == 0 else "PARTIAL",
    }

    log.info(f"GE Summary: {json.dumps(ge_summary, indent=2)}")

    if len(passed_events) == 0:
        raise ValueError("GE VALIDATION: Semua events gagal validasi!")

    path = _get_tmp_path(kwargs["run_id"], "ge_passed")
    with open(path, "w") as f:
        json.dump(passed_events, f)

    kwargs["ti"].xcom_push(key="ge_passed_path", value=path)
    kwargs["ti"].xcom_push(key="ge_summary", value=ge_summary)


# ════════════════════════════════════════
# TASK 4: Data Dump ke PostgreSQL
# ════════════════════════════════════════


def task_data_dump(**kwargs):
    """
    Insert events yang lolos GE validation ke fact_transactions & raw_events.
    Urutan insert: dim_customers → dim_products/payments/devices → fact_transactions → raw_events
    Idempotent via ON CONFLICT DO NOTHING.
    """
    import psycopg2
    import hashlib
    from psycopg2.extras import execute_values

    ge_passed_path = kwargs["ti"].xcom_pull(key="ge_passed_path")
    if not ge_passed_path:
        log.info("Tidak ada events untuk di-dump.")
        return

    with open(ge_passed_path) as f:
        events = json.load(f)

    log.info(f"=== DATA DUMP | inserting {len(events)} events ===")

    conn = psycopg2.connect(**PG_CONN)
    cur = conn.cursor()

    dim_customers = {}
    dim_products = set()
    dim_payments = set()
    dim_devices = set()
    fact_rows = []
    event_rows = []

    for event in events:
        payload = event["payload"]
        tx_date = payload["transaction_date"]
        cust_id = payload["customer_id"]

        if cust_id not in dim_customers:
            dim_customers[cust_id] = {
                "first_seen_date": tx_date,
                "full_name": payload.get("full_name"),
                "age": payload.get("age"),
                "gender": payload.get("gender"),
                "city": payload.get("city"),
            }

        dim_products.add(payload["product_category"])
        dim_payments.add(payload["payment_method"])
        dim_devices.add(payload["device_type"])

        fact_rows.append(
            (
                cust_id,
                payload["product_category"],
                payload["payment_method"],
                payload["device_type"],
                tx_date,
                int(payload["quantity"]),
                float(payload["unit_price"]),
                float(payload["discount_amount"]),
                float(payload["total_amount"]),
                float(payload["session_duration_minutes"]),
                int(payload["pages_viewed"]),
                int(payload["delivery_time_days"]),
                str(payload["customer_rating"]),
            )
        )

        payload_json = json.dumps(payload, sort_keys=True)
        payload_hash = hashlib.md5(payload_json.encode()).hexdigest()
        event_rows.append(
            (
                cust_id,
                "purchase_completed",
                payload_json,
                payload_hash,
                tx_date,
            )
        )

    # 1. Insert dim_customers
    execute_values(
        cur,
        """INSERT INTO dim_customers (customer_id, full_name, age, gender, city, first_seen_date)
           VALUES %s ON CONFLICT (customer_id) DO NOTHING""",
        [
            (
                cid,
                i["full_name"],
                i["age"],
                i["gender"],
                i["city"],
                i["first_seen_date"],
            )
            for cid, i in dim_customers.items()
        ],
    )
    log.info(f"dim_customers: {len(dim_customers)} records")

    # 2. Insert dim tables lainnya
    execute_values(
        cur,
        "INSERT INTO dim_products (product_category) VALUES %s ON CONFLICT (product_category) DO NOTHING",
        [(c,) for c in dim_products],
    )
    execute_values(
        cur,
        "INSERT INTO dim_payment_methods (payment_method) VALUES %s ON CONFLICT (payment_method) DO NOTHING",
        [(p,) for p in dim_payments],
    )
    execute_values(
        cur,
        "INSERT INTO dim_devices (device_type) VALUES %s ON CONFLICT (device_type) DO NOTHING",
        [(d,) for d in dim_devices],
    )

    # 3. Insert fact_transactions
    execute_values(
        cur,
        """INSERT INTO fact_transactions (
            customer_id, product_category, payment_method, device_type,
            transaction_date, quantity, unit_price, discount_amount, total_amount,
            session_duration_minutes, pages_viewed, delivery_time_days, customer_rating
           ) VALUES %s
           ON CONFLICT ON CONSTRAINT unique_tx DO NOTHING""",
        fact_rows,
    )
    log.info(f"fact_transactions: {len(fact_rows)} records")

    # 4. Insert raw_events
    execute_values(
        cur,
        """INSERT INTO raw_events
           (customer_id, event_type, event_payload, payload_hash, event_timestamp)
           VALUES %s
           ON CONFLICT ON CONSTRAINT unique_event DO NOTHING""",
        event_rows,
    )
    log.info(f"raw_events: {len(event_rows)} records")

    # 5. Log pipeline run — status dari ge_summary, bukan hardcode
    ge_summary = kwargs["ti"].xcom_pull(key="ge_summary") or {}
    status = "partial" if ge_summary.get("ge_failed", 0) > 0 else "success"
    cur.execute(
        """INSERT INTO pipeline_runs (dag_id, run_date, rows_processed, status, started_at)
           VALUES (%s, NOW()::date, %s, %s, NOW())""",
        ("data_ingestion_dag", len(fact_rows), status),
    )

    conn.commit()
    log.info(
        f"Dump complete: {len(fact_rows)} transactions | {len(event_rows)} events | status={status}"
    )

    cur.close()
    conn.close()

    # Cleanup tmp files setelah dump sukses
    for path in [
        kwargs["ti"].xcom_pull(key="events_path"),
        kwargs["ti"].xcom_pull(key="qc_passed_path"),
        ge_passed_path,
    ]:
        try:
            if path and os.path.exists(path):
                os.remove(path)
        except Exception as e:
            log.warning(f"Cleanup failed for {path}: {e}")


# ════════════════════════════════════════
# DAG DEFINITION
# ════════════════════════════════════════

with DAG(
    dag_id="data_ingestion_dag",
    default_args=default_args,
    description="Daily data ingestion: Redis queue → QC → GE Validation → Dump to DW",
    schedule_interval=None,  # triggered by simulator via REST API
    start_date=days_ago(1),
    catchup=False,
    tags=["ingestion", "daily", "staywise"],
) as dag:

    sense_signal = RedisBatchSensor(
        task_id="sense_marketplace_events",
        poke_interval=60,
        timeout=86400,
        mode="reschedule",  # fix: tidak block worker slot
    )

    pull_queue = PythonOperator(
        task_id="pull_from_queue",
        python_callable=task_pull_from_queue,
    )

    data_qc = PythonOperator(
        task_id="data_qc",
        python_callable=task_data_qc,
    )

    ge_validation = PythonOperator(
        task_id="great_expectations_validation",
        python_callable=task_great_expectations,
    )

    data_dump = PythonOperator(
        task_id="data_dump",
        python_callable=task_data_dump,
    )

    trigger_feature_dag = TriggerDagRunOperator(
        task_id="trigger_feature_dag",
        trigger_dag_id="feature_and_refresh_dag",
        wait_for_completion=False,  # fire and forget
        conf={"source_run_id": "{{ run_id }}"},
    )

    (
        sense_signal
        >> pull_queue
        >> data_qc
        >> ge_validation
        >> data_dump
        >> trigger_feature_dag
    )
