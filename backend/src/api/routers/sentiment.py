"""
Sentiment Analysis Router — Historical data (max 30 hari)
"""

from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional
import os

from fastapi import APIRouter, Query, HTTPException
import pymongo

router = APIRouter(prefix="/sentiment", tags=["Sentiment"])

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "social_sentiment")


def get_db():
    client = pymongo.MongoClient(MONGO_URI)
    return client[MONGO_DB]


def date_range(days: int):
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)
    return start.isoformat(), now.isoformat()


@router.get("/overview")
def get_overview(days: Annotated[int, Query(ge=1, le=30)] = 14):
    db = get_db()
    start, end = date_range(days)
    pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lte": end}}},
        {
            "$group": {
                "_id": "$sentiment",
                "count": {"$sum": 1},
                "avg_score": {"$avg": "$sentiment_score"},
            }
        },
    ]
    results = list(db.tweets.aggregate(pipeline))
    counts = {"positive": 0, "neutral": 0, "negative": 0}
    score_sum = 0.0
    for r in results:
        counts[r["_id"]] = r["count"]
        score_sum += (r["avg_score"] or 0) * r["count"]

    total = sum(counts.values())
    avg_score = round(score_sum / total, 1) if total else 0.0

    return {
        "days": days,
        "total": total,
        "avg_score": avg_score,
        "positive": counts["positive"],
        "neutral": counts["neutral"],
        "negative": counts["negative"],
        "pct_pos": round(counts["positive"] / total * 100, 1) if total else 0,
        "pct_neu": round(counts["neutral"] / total * 100, 1) if total else 0,
        "pct_neg": round(counts["negative"] / total * 100, 1) if total else 0,
    }


@router.get("/trend")
def get_trend(days: Annotated[int, Query(ge=1, le=30)] = 14):
    db = get_db()
    start, _ = date_range(days)
    pipeline = [
        {"$match": {"created_at": {"$gte": start}}},
        {
            "$group": {
                "_id": {
                    "date": {"$substr": ["$created_at", 0, 10]},
                    "sentiment": "$sentiment",
                },
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id.date": 1}},
    ]
    results = list(db.tweets.aggregate(pipeline))

    trend: dict = {}
    for r in results:
        date = r["_id"]["date"]
        sent = r["_id"]["sentiment"]
        if date not in trend:
            trend[date] = {"date": date, "positive": 0, "neutral": 0, "negative": 0}
        trend[date][sent] = r["count"]

    return {"days": days, "data": sorted(trend.values(), key=lambda x: x["date"])}


@router.get("/keywords")
def get_keywords(
    days: Annotated[int, Query(ge=1, le=30)] = 14,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    db = get_db()
    start, _ = date_range(days)
    pipeline = [
        {
            "$match": {
                "created_at": {"$gte": start},
                "keywords": {"$exists": True, "$ne": []},
            }
        },
        {"$unwind": "$keywords"},
        {
            "$group": {
                "_id": "$keywords",
                "freq": {"$sum": 1},
                "avg_score": {"$avg": "$sentiment_score"},
                "pos": {"$sum": {"$cond": [{"$eq": ["$sentiment", "positive"]}, 1, 0]}},
                "neg": {"$sum": {"$cond": [{"$eq": ["$sentiment", "negative"]}, 1, 0]}},
                "neu": {"$sum": {"$cond": [{"$eq": ["$sentiment", "neutral"]}, 1, 0]}},
            }
        },
        {"$sort": {"freq": -1}},
        {"$limit": limit},
        {
            "$project": {
                "_id": 0,
                "keyword": "$_id",
                "freq": 1,
                "avg_score": {"$round": ["$avg_score", 2]},
                "sentiment": {
                    "$switch": {
                        "branches": [
                            {"case": {"$gt": ["$avg_score", 0.2]}, "then": "positive"},
                            {"case": {"$lt": ["$avg_score", -0.2]}, "then": "negative"},
                        ],
                        "default": "neutral",
                    }
                },
                "pos": 1,
                "neg": 1,
                "neu": 1,
            }
        },
    ]
    return {"days": days, "keywords": list(db.tweets.aggregate(pipeline))}


@router.get("/keyword/{keyword}")
def get_keyword_detail(
    keyword: str,
    days: Annotated[int, Query(ge=1, le=30)] = 14,
):
    db = get_db()
    start, _ = date_range(days)
    match = {"keywords": keyword, "created_at": {"$gte": start}}

    # Stats
    stats_raw = list(
        db.tweets.aggregate(
            [
                {"$match": match},
                {
                    "$group": {
                        "_id": "$sentiment",
                        "count": {"$sum": 1},
                        "avg_score": {"$avg": "$sentiment_score"},
                    }
                },
            ]
        )
    )
    counts = {"positive": 0, "neutral": 0, "negative": 0}
    for s in stats_raw:
        counts[s["_id"]] = s["count"]
    total = sum(counts.values())
    if total == 0:
        raise HTTPException(status_code=404, detail=f"Keyword '{keyword}' not found")

    # Trend harian
    trend = [
        {"date": r["_id"], "count": r["count"], "score": round(r["score"] or 0, 3)}
        for r in db.tweets.aggregate(
            [
                {"$match": match},
                {
                    "$group": {
                        "_id": {"$substr": ["$created_at", 0, 10]},
                        "count": {"$sum": 1},
                        "score": {"$avg": "$sentiment_score"},
                    }
                },
                {"$sort": {"_id": 1}},
            ]
        )
    ]

    # Co-occurring keywords
    co_keywords = [
        {
            "keyword": r["_id"],
            "count": r["count"],
            "sentiment": (
                "positive"
                if (r["avg_score"] or 0) > 0.2
                else "negative" if (r["avg_score"] or 0) < -0.2 else "neutral"
            ),
        }
        for r in db.tweets.aggregate(
            [
                {"$match": match},
                {"$unwind": "$keywords"},
                {"$match": {"keywords": {"$ne": keyword}}},
                {
                    "$group": {
                        "_id": "$keywords",
                        "count": {"$sum": 1},
                        "avg_score": {"$avg": "$sentiment_score"},
                    }
                },
                {"$sort": {"count": -1}},
                {"$limit": 10},
            ]
        )
    ]

    # Sample tweets
    samples = {}
    for sent in ["positive", "negative", "neutral"]:
        samples[sent] = list(
            db.tweets.find(
                {**match, "sentiment": sent},
                {
                    "_id": 0,
                    "tweet_id": 1,
                    "text": 1,
                    "username": 1,
                    "name": 1,
                    "created_at": 1,
                    "sentiment_score": 1,
                    "keywords": 1,
                },
            )
            .sort("sentiment_score", -1 if sent == "positive" else 1)
            .limit(2)
        )

    return {
        "keyword": keyword,
        "days": days,
        "total": total,
        "counts": counts,
        "pct_pos": round(counts["positive"] / total * 100, 1),
        "pct_neu": round(counts["neutral"] / total * 100, 1),
        "pct_neg": round(counts["negative"] / total * 100, 1),
        "trend": trend,
        "co_keywords": co_keywords,
        "sample_tweets": samples,
    }
