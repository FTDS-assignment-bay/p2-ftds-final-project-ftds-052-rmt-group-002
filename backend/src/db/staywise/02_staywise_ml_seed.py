"""
StayWise — ML Inference Seeder (Initial Population)
====================================================
Mengisi kolom inference di customer_rfm_daily dari hasil model:
- churn_probability    → dari churn model
- predicted_clv_90d    → dari CLV model
- segment_name         → dari segmentation model
- risk_segment         → derived dari churn_probability

Jalankan setelah 01_staywise_seed.py:

    python src/db/staywise/01_staywise_ml_seed.py

Notes:
- predicted_clv_90_days yang NULL di CSV → di-skip (kolom tetap NULL di DB)
- risk_segment di-derive: high (>=0.7), medium (>=0.4), low (<0.4)
- model_version dan mlflow_run_id diisi placeholder "initial_seed"
  karena ini inisiasi manual, bukan dari MLflow run
"""

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

# ── Config ───────────────────────────────────────────────────────
DB_CONFIG = {
    "host": "localhost",
    "port": 5434,
    "database": "datawarehouse",
    "user": "staywise",
    "password": "staywise",
}
CSV_PATH = "../../../data/seed_initial_ml_inference.csv"


# ── Helpers ──────────────────────────────────────────────────────
def derive_risk_segment(churn_prob: float) -> str:
    if churn_prob >= 0.55: # for experimental data (default : 0.7)
        return "high"
    elif churn_prob >= 0.45:  # for experimental data (default : 0.4)
        return "medium"
    return "low"


# ── Load CSV ─────────────────────────────────────────────────────
df = pd.read_csv(CSV_PATH)
print(f"Loaded {len(df):,} rows from CSV")
print(f"Null CLV count: {df['predicted_clv_90_days'].isnull().sum()}")

# ── Connect ──────────────────────────────────────────────────────
conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()
print("Connected to database ✅")

# ── Cek snapshot_date yang ada di customer_rfm_daily ─────────────
cur.execute("SELECT DISTINCT snapshot_date FROM customer_rfm_daily ORDER BY snapshot_date DESC LIMIT 1")
row = cur.fetchone()
if row is None:
    raise RuntimeError("customer_rfm_daily kosong — jalankan 02_staywise_seed.py dulu!")
snapshot_date = row[0]
print(f"Target snapshot_date: {snapshot_date}")

# ── Build records ─────────────────────────────────────────────────
records = []
for _, r in df.iterrows():
    churn_prob  = float(r["churn_probability"])
    clv         = float(r["predicted_clv_90_days"]) if pd.notna(r["predicted_clv_90_days"]) else None
    segment     = r["SEGMENT_NAME"]
    risk        = derive_risk_segment(churn_prob)
    customer_id = r["customer_id"]

    records.append((
        churn_prob,
        clv,
        segment,
        risk,
        "initial_seed",   # model_version
        "initial_seed",   # mlflow_run_id
        customer_id,
        snapshot_date,
    ))

print(f"Records to upsert: {len(records):,}")

# ── Upsert ke customer_rfm_daily ──────────────────────────────────
execute_values(
    cur,
    """
    UPDATE customer_rfm_daily SET
        churn_probability = data.churn_probability,
        predicted_clv_90d = data.predicted_clv_90d,
        segment_name      = data.segment_name,
        risk_segment      = data.risk_segment,
        model_version     = data.model_version,
        mlflow_run_id     = data.mlflow_run_id,
        computed_at       = NOW()
    FROM (VALUES %s) AS data(
        churn_probability, predicted_clv_90d, segment_name,
        risk_segment, model_version, mlflow_run_id,
        customer_id, snapshot_date
    )
    WHERE customer_rfm_daily.customer_id = data.customer_id
      AND customer_rfm_daily.snapshot_date = data.snapshot_date::DATE
    """,
    records,
    template="(%s, %s, %s, %s, %s, %s, %s, %s)"
)

conn.commit()
print("  customer_rfm_daily inference columns updated ✅")

# ── Verify ────────────────────────────────────────────────────────
print("\nVerifikasi hasil update:")

cur.execute("""
    SELECT
        COUNT(*)                                          AS total,
        COUNT(churn_probability)                          AS has_churn,
        COUNT(predicted_clv_90d)                          AS has_clv,
        COUNT(segment_name)                               AS has_segment,
        COUNT(risk_segment)                               AS has_risk
    FROM customer_rfm_daily
    WHERE snapshot_date = %s
""", (snapshot_date,))
row = cur.fetchone()
total, has_churn, has_clv, has_segment, has_risk = row
print(f"  Total rows       : {total:,}")
print(f"  churn_probability: {has_churn:,} filled ({has_churn/total*100:.1f}%)")
print(f"  predicted_clv_90d: {has_clv:,} filled ({has_clv/total*100:.1f}%)")
print(f"  segment_name     : {has_segment:,} filled ({has_segment/total*100:.1f}%)")
print(f"  risk_segment     : {has_risk:,} filled ({has_risk/total*100:.1f}%)")

print("\nDistribusi risk_segment:")
cur.execute("""
    SELECT risk_segment, COUNT(*) AS n
    FROM customer_rfm_daily
    WHERE snapshot_date = %s
    GROUP BY risk_segment ORDER BY n DESC
""", (snapshot_date,))
for seg, count in cur.fetchall():
    print(f"  {seg}: {count:,}")

print("\nDistribusi segment_name:")
cur.execute("""
    SELECT segment_name, COUNT(*) AS n
    FROM customer_rfm_daily
    WHERE snapshot_date = %s
    GROUP BY segment_name ORDER BY n DESC
""", (snapshot_date,))
for seg, count in cur.fetchall():
    print(f"  {seg}: {count:,}")

cur.close()
conn.close()
print("\nDone! Connection closed ✅")
