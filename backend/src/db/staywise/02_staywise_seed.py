"""
StayWise — Data Seeder
======================
Assumes schema is already created via 01_staywise_schema.sql.
Run this after the database is up:

    python src/db/staywise/02_seed.py

Steps:
1. Load CSV
2. Seed dimension tables
3. Seed fact_transactions
4. Seed raw_events from fact_transactions
5. Compute and seed customer_rfm_daily
6. Manually refresh continuous aggregates (initial population)
7. Verify all tables
"""

import hashlib
import json as json_lib
import random
from datetime import datetime

import pandas as pd
import psycopg2
from faker import Faker
from psycopg2.extras import execute_values

fake = Faker("tr_TR")

# ── Config ──────────────────────────────────────────────────────
DB_CONFIG = {
    "host": "localhost",
    "port": 5434,
    "database": "datawarehouse",
    "user": "staywise",
    "password": "staywise",
}
CSV_PATH = "../../../data/seed_14370.csv"


# ── Helpers ─────────────────────────────────────────────────────
def get_turkish_name(customer_id: str) -> str:
    random.seed(hash(customer_id) % (2**32))
    Faker.seed(hash(customer_id) % (2**32))
    full_name = fake.name()
    if len(full_name) <= 25:
        return full_name
    parts = full_name.split()
    return f"{parts[0]} {parts[-1][0]}."


# ── Load CSV ────────────────────────────────────────────────────
df = pd.read_csv(CSV_PATH)
df["Date"] = pd.to_datetime(df["Date"], dayfirst=True)

# Generate is_churn column
last_purchase = df.groupby("Customer_ID")["Date"].max().reset_index()
cutoff = df["Date"].max()
last_purchase["days_since_last"] = (cutoff - last_purchase["Date"]).dt.days
last_purchase["is_churn"] = last_purchase["days_since_last"].apply(
    lambda x: 1 if x > 90 else 0
)
df = df.merge(last_purchase[["Customer_ID", "is_churn"]], on="Customer_ID", how="left")
print(f"Loaded {len(df)} rows from CSV")

# ── Connect ─────────────────────────────────────────────────────
conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()
print("Connected to database ✅")

# ── 1. Seed dimension tables ────────────────────────────────────
customers = (
    df.groupby("Customer_ID")
    .agg(
        age=("Age", "first"),
        gender=("Gender", "first"),
        city=("City", "first"),
        first_seen_date=("Date", "min"),
    )
    .reset_index()
)
execute_values(
    cur,
    """INSERT INTO dim_customers (customer_id, full_name, age, gender, city, first_seen_date)
       VALUES %s ON CONFLICT (customer_id) DO NOTHING""",
    [
        (
            r["Customer_ID"],
            get_turkish_name(r["Customer_ID"]),
            int(r["age"]),
            r["gender"],
            r["city"],
            r["first_seen_date"].date(),
        )
        for _, r in customers.iterrows()
    ],
)

execute_values(
    cur,
    "INSERT INTO dim_products (product_category) VALUES %s ON CONFLICT DO NOTHING",
    [(p,) for p in df["Product_Category"].unique()],
)
execute_values(
    cur,
    "INSERT INTO dim_payment_methods (payment_method) VALUES %s ON CONFLICT DO NOTHING",
    [(p,) for p in df["Payment_Method"].unique()],
)
execute_values(
    cur,
    "INSERT INTO dim_devices (device_type) VALUES %s ON CONFLICT DO NOTHING",
    [(d,) for d in df["Device_Type"].unique()],
)
conn.commit()
print("  dimension tables seeded ✅")

# ── 2. Seed fact_transactions ────────────────────────────────────
execute_values(
    cur,
    """INSERT INTO fact_transactions (
           customer_id, product_category, payment_method, device_type,
           transaction_date, quantity, unit_price, discount_amount,
           total_amount, session_duration_minutes, pages_viewed,
           delivery_time_days, customer_rating
       ) VALUES %s ON CONFLICT ON CONSTRAINT unique_tx DO NOTHING""",
    [
        (
            row["Customer_ID"],
            row["Product_Category"],
            row["Payment_Method"],
            row["Device_Type"],
            row["Date"].date(),
            int(row["Quantity"]),
            float(row["Unit_Price"]),
            float(row["Discount_Amount"]),
            float(row["Total_Amount"]),
            float(row["Session_Duration_Minutes"]),
            int(row["Pages_Viewed"]),
            int(row["Delivery_Time_Days"]),
            int(row["Customer_Rating"]),
        )
        for _, row in df.iterrows()
    ],
)
conn.commit()
print("  fact_transactions seeded ✅")

# ── 3. Seed raw_events ───────────────────────────────────────────
cur.execute("""
    SELECT transaction_id, customer_id, product_category, payment_method,
           device_type, transaction_date, quantity, unit_price, total_amount,
           session_duration_minutes, pages_viewed, delivery_time_days, customer_rating
    FROM fact_transactions ORDER BY transaction_date
""")
transactions = cur.fetchall()

event_rows = []
for tx in transactions:
    (
        tx_id,
        cust_id,
        prod_cat,
        pay_method,
        dev_type,
        tx_date,
        qty,
        unit_price,
        total_amt,
        session_dur,
        pages,
        delivery,
        rating,
    ) = tx

    payload = {
        "transaction_id": tx_id,
        "customer_id": cust_id,
        "event_type": "purchase_completed",
        "product_category": prod_cat,
        "payment_method": pay_method,
        "device_type": dev_type,
        "transaction_date": str(tx_date),
        "quantity": qty,
        "unit_price": float(unit_price),
        "total_amount": float(total_amt),
        "session_duration_minutes": float(session_dur),
        "pages_viewed": pages,
        "delivery_time_days": delivery,
        "customer_rating": rating,
    }
    payload_json = json_lib.dumps(payload, sort_keys=True)
    payload_hash = hashlib.md5(payload_json.encode()).hexdigest()
    event_rows.append(
        (
            cust_id,
            "purchase_completed",
            payload_json,
            payload_hash,
            datetime.combine(tx_date, datetime.min.time()),
        )
    )

execute_values(
    cur,
    """INSERT INTO raw_events (customer_id, event_type, event_payload, payload_hash, event_timestamp)
       VALUES %s ON CONFLICT ON CONSTRAINT unique_event DO NOTHING""",
    event_rows,
)
conn.commit()
print("  raw_events seeded ✅")

# ── 4. Compute and seed customer_rfm_daily ───────────────────────
cur.execute("SELECT MAX(transaction_date) FROM fact_transactions")
reference_date = cur.fetchone()[0]

cur.execute(f"""
    INSERT INTO customer_rfm_daily (
        customer_id, snapshot_date, recency_days, frequency,
        monetary_total, monetary_avg, avg_session_duration, avg_pages_viewed,
        avg_delivery_days, avg_rating, preferred_category,
        preferred_device, preferred_payment, computed_at
    )
    SELECT
        t.customer_id,
        DATE '{reference_date}'                                              AS snapshot_date,
        (DATE '{reference_date}' - MAX(t.transaction_date::DATE))::INT       AS recency_days,
        COUNT(*)                                                             AS frequency,
        SUM(t.total_amount)                                                  AS monetary_total,
        AVG(t.total_amount)                                                  AS monetary_avg,
        AVG(t.session_duration_minutes)                                      AS avg_session_duration,
        AVG(t.pages_viewed)                                                  AS avg_pages_viewed,
        AVG(t.delivery_time_days)                                            AS avg_delivery_days,
        AVG(t.customer_rating)                                               AS avg_rating,
        MODE() WITHIN GROUP (ORDER BY t.product_category)                    AS preferred_category,
        MODE() WITHIN GROUP (ORDER BY t.device_type)                         AS preferred_device,
        MODE() WITHIN GROUP (ORDER BY t.payment_method)                      AS preferred_payment,
        NOW()
    FROM fact_transactions t
    GROUP BY t.customer_id
    ON CONFLICT (customer_id, snapshot_date) DO UPDATE SET
        recency_days         = EXCLUDED.recency_days,
        frequency            = EXCLUDED.frequency,
        monetary_total       = EXCLUDED.monetary_total,
        monetary_avg         = EXCLUDED.monetary_avg,
        avg_session_duration = EXCLUDED.avg_session_duration,
        avg_pages_viewed     = EXCLUDED.avg_pages_viewed,
        avg_delivery_days    = EXCLUDED.avg_delivery_days,
        avg_rating           = EXCLUDED.avg_rating,
        preferred_category   = EXCLUDED.preferred_category,
        preferred_device     = EXCLUDED.preferred_device,
        preferred_payment    = EXCLUDED.preferred_payment,
        computed_at          = EXCLUDED.computed_at
""")
conn.commit()
print("  customer_rfm_daily seeded ✅")

# ── 5. Refresh continuous aggregates (initial population) ────────
conn.commit()
conn.autocommit = True
for mv in ["mv_customer_rfm_trend", "mv_weekly_risk_summary"]:
    cur.execute(f"CALL refresh_continuous_aggregate('{mv}', NULL, NULL);")
    print(f"  {mv} refreshed ✅")
conn.autocommit = False

# ── 6. Verify ────────────────────────────────────────────────────
print("\nRow counts:")
for table in [
    "dim_customers",
    "dim_products",
    "dim_payment_methods",
    "dim_devices",
    "fact_transactions",
    "raw_events",
    "customer_rfm_daily",
]:
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    count = cur.fetchone()[0]
    status = "✅" if count > 0 else "⚠️ "
    print(f"  {status} {table}: {count:,}")

print("\nHypertable chunks:")
cur.execute("""
    SELECT hypertable_name, COUNT(*) AS num_chunks
    FROM timescaledb_information.chunks
    GROUP BY hypertable_name ORDER BY hypertable_name
""")
for row in cur.fetchall():
    print(f"  ✅ {row[0]}: {row[1]} chunk(s)")

cur.close()
conn.close()
print("\nDone! Connection closed ✅")
