"""
StayWise ML Platform - Data Simulator v5 (FINAL)
Redis sebagai intraday buffer queue (FIFO).

Flow:
  - Data di-push ke Redis List sebagai buffer
  - Airflow DAG yang pull + QC + insert ke PostgreSQL
  - event_timestamp pakai tanggal transaksi asli dari CSV
  - Idempotent: aman dijalanin ulang

CHANGELOG vs v5:
  [FIX-1] ensure_tables() dihapus. Table creation adalah tanggung jawab
          schema SQL utama (init script). Simulator assume tables sudah ada.
  [FIX-2] customer_rating di row_to_payload() diubah dari str() ke int(),
          sesuai tipe SMALLINT di schema dan ekspektasi GE (between 1-5).
  [FIX-3] Signal reset r.set(REDIS_SIGNAL, "0") dipindah dari task pull
          ke setelah konfirmasi DAG selesai — lihat catatan di
          wait_for_dag_completion(). Di sisi simulator, sinyal hanya di-set
          ke "1" saat push; reset sepenuhnya tanggung jawab DAG (task_data_dump).
"""

import os
import time
import json
import hashlib
import logging
import requests
import pandas as pd
import redis
from datetime import datetime, timedelta
from faker import Faker

_fake = Faker("tr_TR")


def get_turkish_name(customer_id: str) -> str:
    """Generate deterministic Turkish name — same customer_id always → same name."""
    Faker.seed(hash(customer_id) % (2**32))
    return _fake.name()


logging.basicConfig(level=logging.INFO, format="%(asctime)s [SIMULATOR] %(message)s")
log = logging.getLogger(__name__)

# ─── Config ───
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
PG_HOST = os.getenv("POSTGRES_HOST", "postgres-dw")
PG_PORT = int(os.getenv("POSTGRES_PORT", 5432))
PG_DB = os.getenv("POSTGRES_DB", "datawarehouse")
PG_USER = os.getenv("POSTGRES_USER", "staywise")
PG_PASS = os.getenv("POSTGRES_PASSWORD", "staywise")
DATA_PATH = os.getenv("DATA_PATH", "/app/data/feed_2679.csv")
BATCH_SIZE = int(os.getenv("BATCH_SIZE", 1000))
BATCH_INTERVAL = int(os.getenv("BATCH_INTERVAL", 60))

# Airflow REST API
AIRFLOW_HOST = os.getenv("AIRFLOW_HOST", "localhost")
AIRFLOW_PORT = int(os.getenv("AIRFLOW_PORT", 8080))
AIRFLOW_USER = os.getenv("AIRFLOW_USER", "admin")
AIRFLOW_PASSWORD = os.getenv("AIRFLOW_PASSWORD", "admin")
AIRFLOW_DAG_ID = "data_ingestion_dag"

# Redis keys
REDIS_QUEUE = "queue:transactions"  # List FIFO — buffer data sepanjang hari
REDIS_QUEUE_META = "queue:meta"  # Hash — metadata batch
REDIS_SIGNAL = "simulator:trigger_pipeline"


# ════════════════════════════════════════
# CONNECTIONS
# ════════════════════════════════════════


def get_redis() -> redis.Redis:
    return redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)


# ════════════════════════════════════════
# DATA HELPERS
# ════════════════════════════════════════


def load_dataset(path: str) -> pd.DataFrame:
    log.info(f"Loading dataset from {path}")
    df = pd.read_csv(path)
    df.columns = df.columns.str.lower()
    df["date"] = pd.to_datetime(df["date"], dayfirst=True)
    df = df.sort_values("date").reset_index(drop=True)
    log.info(
        f"Total rows: {len(df)} | {df['date'].min().date()} to {df['date'].max().date()}"
    )
    return df


def row_to_payload(row) -> dict:
    """
    Convert satu row DataFrame jadi event payload dict.
    Semua tipe disesuaikan dengan schema DB dan ekspektasi GE di DAG:
      - customer_rating : int  → SMALLINT di fact_transactions, GE between(1,5)
      - transaction_date: str ISO (YYYY-MM-DD) → sudah dihandle dayfirst=True saat load
    """
    cust_id = str(row["customer_id"])
    return {
        # Customer info — dibutuhkan untuk insert dim_customers di DAG
        "customer_id": cust_id,
        "full_name": get_turkish_name(cust_id),  # deterministic faker
        "age": int(row["age"]),
        "gender": str(row["gender"]),
        "city": str(row["city"]),
        # Transaction info
        "event_type": "purchase_completed",
        "product_category": str(row["product_category"]),
        "payment_method": str(row["payment_method"]),
        "device_type": str(row["device_type"]),
        "transaction_date": str(row["date"].date()),  # YYYY-MM-DD (ISO)
        "quantity": int(row["quantity"]),
        "unit_price": float(row["unit_price"]),
        "discount_amount": float(row["discount_amount"]),
        "total_amount": float(row["total_amount"]),
        "session_duration_minutes": float(row["session_duration_minutes"]),
        "pages_viewed": int(row["pages_viewed"]),
        "delivery_time_days": int(row["delivery_time_days"]),
        # [FIX-2] int bukan str — sesuai SMALLINT di schema dan GE between(1,5)
        "customer_rating": int(row["customer_rating"]),
    }


# ════════════════════════════════════════
# PUSH KE REDIS QUEUE (FIFO)
# ════════════════════════════════════════


def push_to_redis_queue(df_batch: pd.DataFrame, r: redis.Redis, batch_num: int) -> int:
    """
    Push events ke Redis List sebagai intraday buffer (FIFO).
    Pakai rpush biar urutan FIFO terjaga (DAG pull pakai lpop).
    Data BELUM masuk ke DB — Airflow DAG yang akan:
      1. Pull dari queue ini
      2. Jalanin QC + GE Validation
      3. Insert ke PostgreSQL
    """
    pushed = 0
    pipe = r.pipeline()

    for _, row in df_batch.iterrows():
        payload = row_to_payload(row)
        payload_json = json.dumps(payload, sort_keys=True)
        payload_hash = hashlib.md5(payload_json.encode()).hexdigest()

        event = {
            "payload": payload,
            "payload_hash": payload_hash,
            "queued_at": datetime.now().isoformat(),
            "batch_num": batch_num,
        }

        # rpush untuk FIFO — data pertama masuk, pertama diproses
        pipe.rpush(REDIS_QUEUE, json.dumps(event))
        pushed += 1

    pipe.execute()

    # Update metadata queue
    r.hset(
        REDIS_QUEUE_META,
        mapping={
            "latest_batch": batch_num,
            "total_queued": r.llen(REDIS_QUEUE),
            "last_push_time": datetime.now().isoformat(),
            "last_batch_size": pushed,
        },
    )

    # Set signal trigger untuk Airflow
    # [FIX-3] Simulator hanya set ke "1". Reset ke "0" adalah tanggung jawab
    # DAG (task_data_dump) setelah dump ke DB selesai — bukan task_pull_from_queue.
    # Ini mencegah race condition di mana simulator push batch berikutnya
    # padahal DAG masih di tengah QC / GE / dump.
    r.set(REDIS_SIGNAL, "1")

    queue_size = r.llen(REDIS_QUEUE)
    log.info(f"Pushed {pushed} events to Redis queue | Queue size: {queue_size}")
    return pushed


# ════════════════════════════════════════
# TRIGGER AIRFLOW DAG
# ════════════════════════════════════════


def trigger_airflow_dag(batch_num: int):
    """Hit Airflow REST API untuk trigger DAG setelah batch di-push ke Redis."""
    url = f"http://{AIRFLOW_HOST}:{AIRFLOW_PORT}/api/v1/dags/{AIRFLOW_DAG_ID}/dagRuns"
    payload = {"conf": {"triggered_by": "simulator", "batch_num": batch_num}}
    try:
        resp = requests.post(
            url,
            json=payload,
            auth=(AIRFLOW_USER, AIRFLOW_PASSWORD),
            timeout=10,
        )
        if resp.status_code in (200, 201):
            run_id = resp.json().get("dag_run_id", "-")
            log.info(f"DAG triggered successfully | run_id={run_id}")
        else:
            log.warning(f"DAG trigger failed | status={resp.status_code} | {resp.text}")
    except Exception as e:
        log.error(f"DAG trigger error: {e}")


# ════════════════════════════════════════
# WAIT FOR DAG TO FINISH
# ════════════════════════════════════════


def wait_for_dag_completion(
    r: redis.Redis,
    batch_num: int,
    poll_interval: int = 10,
    timeout: int = 3600,
):
    """
    Tunggu sampai DAG selesai memproses batch secara penuh:
      - queue:transactions kosong (DAG sudah pull semua events)
      - simulator:trigger_pipeline = '0' (DAG sudah reset signal di task_data_dump)

    [FIX-3] Sebelumnya signal direset di task_pull_from_queue (terlalu awal),
    sehingga kondisi ini bisa terpenuhi padahal dump ke DB belum selesai.
    Setelah fix di DAG, signal baru direset di akhir task_data_dump,
    jadi wait ini benar-benar menunggu sampai seluruh pipeline selesai.
    """
    log.info(f"[Batch {batch_num}] Waiting for DAG to finish processing...")
    elapsed = 0
    while elapsed < timeout:
        queue_size = r.llen(REDIS_QUEUE)
        signal = r.get(REDIS_SIGNAL)

        if queue_size == 0 and signal == "0":
            log.info(
                f"[Batch {batch_num}] DAG finished! "
                f"queue=0 | signal=0 → safe to push next batch."
            )
            return

        log.info(
            f"[Batch {batch_num}] Still processing... "
            f"queue_size={queue_size} | signal={signal} | elapsed={elapsed}s"
        )
        time.sleep(poll_interval)
        elapsed += poll_interval

    log.warning(f"[Batch {batch_num}] Timeout waiting for DAG! Proceeding anyway.")


# ════════════════════════════════════════
# BATCH MODE
# ════════════════════════════════════════


def run_batch(df: pd.DataFrame, r: redis.Redis):
    # Clear queue lama sebelum mulai batch baru
    old_size = r.llen(REDIS_QUEUE)
    if old_size > 0:
        r.delete(REDIS_QUEUE)
        r.delete(REDIS_QUEUE_META)
        log.info(f"Cleared old queue ({old_size} events)")

    # Group by week_start (Monday) berdasarkan transaction date
    df["week_start"] = df["date"].apply(
        lambda d: (d - timedelta(days=d.weekday())).date()
    )
    weekly_groups = sorted(df.groupby("week_start"), key=lambda x: x[0])
    n_batches = len(weekly_groups)

    log.info(f"=== BATCH MODE: Push ke Redis Queue (weekly split) ===")
    log.info(f"Total data CSV  : {len(df)} rows")
    log.info(f"Total weeks     : {n_batches}")
    log.info(f"Redis queue     : {REDIS_QUEUE} (FIFO)")

    for i, (week_start, week_df) in enumerate(weekly_groups):
        week_end = week_df["date"].max().date()
        log.info(
            f"[Batch {i+1}/{n_batches}] week_start={week_start} → {week_end} | "
            f"{len(week_df)} events"
        )

        pushed = push_to_redis_queue(week_df, r, i + 1)
        queue_size = r.llen(REDIS_QUEUE)

        log.info(
            f"Queued: {pushed} | Total in queue: {queue_size} | "
            f"DB unchanged (waiting for DAG)"
        )
        trigger_airflow_dag(batch_num=i + 1)

        if i < n_batches - 1:
            # Tunggu DAG selesai proses batch ini dulu baru push batch berikutnya
            wait_for_dag_completion(r, batch_num=i + 1)

    log.info(f"=== Semua {n_batches} batch mingguan selesai! ===")


# ════════════════════════════════════════
# MAIN
# ════════════════════════════════════════


def main():
    log.info("=== StayWise ML Simulator v5 (FINAL) ===")
    log.info(f"Redis : {REDIS_HOST}:{REDIS_PORT}")
    log.info(f"DB    : {PG_HOST}:{PG_PORT}/{PG_DB}")

    # Kasih waktu services lain (Redis, Airflow) buat ready
    time.sleep(10)

    df = load_dataset(DATA_PATH)
    r = get_redis()

    # [FIX-1] ensure_tables() dihapus.
    # Table creation adalah tanggung jawab SQL init script (schema utama).
    # Simulator tidak boleh buat table sendiri karena bisa bikin schema drift
    # (tipe data beda, constraint beda, hypertable tidak terbuat, dsb.).

    run_batch(df, r)

    log.info("=== Simulator done ===")


if __name__ == "__main__":
    main()
