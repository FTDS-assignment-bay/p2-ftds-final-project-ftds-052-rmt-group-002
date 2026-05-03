"""
Trending Today Router — Near-realtime data
"""

from datetime import datetime, timedelta, timezone
from typing import Annotated
import os

from fastapi import APIRouter, Query
import pymongo
import redis

router = APIRouter(prefix="/trending", tags=["Trending"])

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "social_sentiment")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")


def get_db():
    client = pymongo.MongoClient(MONGO_URI)
    return client[MONGO_DB]


def get_redis():
    return redis.from_url(REDIS_URL, decode_responses=True)


def today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


@router.get("/today")
def get_today():
    r = get_redis()
    date_str = today_str()

    # Stats dari Redis
    stats_raw = r.hgetall(f"stats:{date_str}")
    total = int(stats_raw.get("total", 0))
    pos = int(stats_raw.get("positive", 0))
    neu = int(stats_raw.get("neutral", 0))
    neg = int(stats_raw.get("negative", 0))
    score_sum = float(stats_raw.get("score_sum", 0.0))
    avg_score = round(score_sum / total * 100, 1) if total else 0.0

    # Top keywords dari Redis sorted set
    raw_kws = r.zrevrange(f"kw:freq:{date_str}", 0, 49, withscores=True)

    # Enrich sentimen per keyword dari MongoDB
    db = get_db()
    kw_names = [kw for kw, _ in raw_kws]
    sent_map: dict[str, str] = {}

    if kw_names:
        for doc in db.tweets.aggregate(
            [
                {
                    "$match": {
                        "keywords": {"$in": kw_names},
                        "created_at": {"$gte": f"{date_str}T00:00:00Z"},
                    }
                },
                {"$unwind": "$keywords"},
                {"$match": {"keywords": {"$in": kw_names}}},
                {
                    "$group": {
                        "_id": "$keywords",
                        "avg_score": {"$avg": "$sentiment_score"},
                    }
                },
            ]
        ):
            score = doc["avg_score"] or 0
            sent_map[doc["_id"]] = (
                "positive" if score > 0.2 else "negative" if score < -0.2 else "neutral"
            )

    keywords = [
        {
            "keyword": kw,
            "freq": int(score),
            "sentiment": sent_map.get(kw, "neutral"),
        }
        for kw, score in raw_kws
    ]

    return {
        "date": date_str,
        "stats": {
            "total": total,
            "positive": pos,
            "neutral": neu,
            "negative": neg,
            "avg_score": avg_score,
            "pct_pos": round(pos / total * 100, 1) if total else 0,
            "pct_neu": round(neu / total * 100, 1) if total else 0,
            "pct_neg": round(neg / total * 100, 1) if total else 0,
        },
        "keywords": keywords,
    }


@router.get("/feed")
def get_feed(
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    sentiment: Annotated[str | None, Query()] = None,
    keyword: Annotated[str | None, Query()] = None,
):
    db = get_db()
    date_str = today_str()

    match: dict = {"created_at": {"$gte": f"{date_str}T00:00:00Z"}}
    if sentiment in ("positive", "neutral", "negative"):
        match["sentiment"] = sentiment
    if keyword:
        match["keywords"] = keyword

    tweets = list(
        db.tweets.find(
            match,
            {
                "_id": 0,
                "tweet_id": 1,
                "text": 1,
                "username": 1,
                "name": 1,
                "created_at": 1,
                "sentiment": 1,
                "sentiment_score": 1,
                "keywords": 1,
                "like_count": 1,
                "retweet_count": 1,
            },
        )
        .sort("created_at", -1)
        .limit(limit)
    )
    return {"date": date_str, "count": len(tweets), "tweets": tweets}


@router.get("/spike")
def get_spikes(
    window_minutes: Annotated[int, Query(ge=10, le=120)] = 60,
    threshold_pct: Annotated[float, Query(ge=0.1)] = 0.30,
):
    db = get_db()
    now = datetime.now(timezone.utc)
    t1 = now - timedelta(minutes=window_minutes * 2)
    t2 = now - timedelta(minutes=window_minutes)

    def window_stats(start: datetime, end: datetime) -> dict:
        return {
            r["_id"]: {
                "count": r["count"],
                "avg_score": r["avg_score"] or 0,
                "neg_ratio": r["neg_count"] / r["count"] if r["count"] else 0,
            }
            for r in db.tweets.aggregate(
                [
                    {
                        "$match": {
                            "created_at": {
                                "$gte": start.isoformat(),
                                "$lt": end.isoformat(),
                            },
                            "keywords": {"$exists": True, "$ne": []},
                        }
                    },
                    {"$unwind": "$keywords"},
                    {
                        "$group": {
                            "_id": "$keywords",
                            "count": {"$sum": 1},
                            "avg_score": {"$avg": "$sentiment_score"},
                            "neg_count": {
                                "$sum": {
                                    "$cond": [{"$eq": ["$sentiment", "negative"]}, 1, 0]
                                }
                            },
                        }
                    },
                ]
            )
        }

    before = window_stats(t1, t2)
    after = window_stats(t2, now)

    spikes = []
    for kw, curr in after.items():
        if curr["count"] < 5:
            continue
        prev = before.get(kw)
        if not prev or prev["count"] < 3:
            continue

        neg_delta = curr["neg_ratio"] - prev["neg_ratio"]
        if neg_delta >= threshold_pct:
            spikes.append(
                {
                    "keyword": kw,
                    "spike_type": "negative",
                    "neg_ratio_before": round(prev["neg_ratio"] * 100, 1),
                    "neg_ratio_after": round(curr["neg_ratio"] * 100, 1),
                    "delta_pct": round(neg_delta * 100, 1),
                    "count_after": curr["count"],
                    "score_delta": round(curr["avg_score"] - prev["avg_score"], 3),
                }
            )

    spikes.sort(key=lambda x: x["delta_pct"], reverse=True)

    return {
        "window_minutes": window_minutes,
        "threshold_pct": threshold_pct * 100,
        "checked_at": now.isoformat(),
        "spike_count": len(spikes),
        "spikes": spikes,
    }
