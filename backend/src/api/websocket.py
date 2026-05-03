"""
WebSocket Manager + Background Push Loop
Push update ke semua connected dashboard clients tiap 30 detik.
"""

import json
import asyncio
import logging
import os
from datetime import datetime, timezone

from fastapi import WebSocket, WebSocketDisconnect, APIRouter

log = logging.getLogger(__name__)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
PUSH_INTERVAL = 30  # detik

ws_router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        log.info(f"WS connected. Total: {len(self.active)}")

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)
        log.info(f"WS disconnected. Total: {len(self.active)}")

    async def broadcast(self, data: dict):
        if not self.active:
            return
        payload = json.dumps(data)
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


async def get_trending_payload() -> dict:
    import redis.asyncio as aioredis

    r = aioredis.from_url(REDIS_URL, decode_responses=True)
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    try:
        raw_kws = await r.zrevrange(f"kw:freq:{date_str}", 0, 49, withscores=True)
        keywords = [{"keyword": kw, "freq": int(score)} for kw, score in raw_kws]

        stats = await r.hgetall(f"stats:{date_str}")
        total = int(stats.get("total", 0))
        pos = int(stats.get("positive", 0))
        neu = int(stats.get("neutral", 0))
        neg = int(stats.get("negative", 0))
        score_sum = float(stats.get("score_sum", 0))
        avg_score = round(score_sum / total * 100, 1) if total else 0.0

        return {
            "type": "trending_update",
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
    finally:
        await r.aclose()


async def push_loop():
    """Background task: broadcast ke semua WS client tiap PUSH_INTERVAL detik."""
    while True:
        await asyncio.sleep(PUSH_INTERVAL)
        if not manager.active:
            continue
        try:
            payload = await get_trending_payload()
            await manager.broadcast(payload)
        except Exception as e:
            log.error(f"Push loop error: {e}")


@ws_router.websocket("/ws/trending")
async def websocket_trending(ws: WebSocket):
    await manager.connect(ws)
    # Kirim snapshot langsung saat pertama connect
    try:
        payload = await get_trending_payload()
        await ws.send_text(json.dumps(payload))
    except Exception as e:
        log.error(f"Initial push failed: {e}")

    try:
        while True:
            await ws.receive_text()  # keep-alive
    except WebSocketDisconnect:
        manager.disconnect(ws)
