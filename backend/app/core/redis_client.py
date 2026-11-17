"""
ALGO ROBOT — Distributed Caching & In-Memory State Manager
Supports Redis with automatic fallback to high-speed in-process cache
for standalone development environments where Redis is not running.
"""

import asyncio
import logging
import threading
import time
from typing import Any, Dict, Optional
import orjson
from app.config import settings

logger = logging.getLogger("algo_robot.redis")


class InMemoryFallbackCache:
    """In-process thread-safe fallback cache when Redis is disabled or offline."""
    def __init__(self):
        self._store: Dict[str, bytes] = {}
        self._expires: Dict[str, float] = {}
        self._lock = threading.Lock()

    def get_sync(self, key: str) -> Optional[bytes]:
        with self._lock:
            if key in self._expires and time.time() > self._expires[key]:
                self._store.pop(key, None)
                self._expires.pop(key, None)
                return None
            return self._store.get(key)

    def set_sync(self, key: str, value: Any, ex: Optional[int] = None) -> bool:
        with self._lock:
            if isinstance(value, str):
                self._store[key] = value.encode("utf-8")
            elif isinstance(value, bytes):
                self._store[key] = value
            else:
                self._store[key] = orjson.dumps(value)
            
            if ex:
                self._expires[key] = time.time() + ex
            elif key in self._expires:
                del self._expires[key]
            return True

    def delete_sync(self, key: str) -> int:
        with self._lock:
            existed = 1 if key in self._store else 0
            self._store.pop(key, None)
            self._expires.pop(key, None)
            return existed

    async def get(self, key: str) -> Optional[bytes]:
        return self.get_sync(key)

    async def set(self, key: str, value: Any, ex: Optional[int] = None) -> bool:
        return self.set_sync(key, value, ex=ex)

    async def delete(self, key: str) -> int:
        return self.delete_sync(key)


class RedisManager:
    """Unified Redis Manager with async support and graceful fallback."""

    def __init__(self):
        self.enabled = settings.REDIS_ENABLED
        self.redis_url = settings.REDIS_URL
        self._redis_client = None
        self._fallback = InMemoryFallbackCache()

    async def get_client(self):
        if not self.enabled:
            return self._fallback

        if self._redis_client is None:
            try:
                import redis.asyncio as aioredis
                self._redis_client = aioredis.from_url(
                    self.redis_url,
                    encoding="utf-8",
                    decode_responses=False,
                )
                await self._redis_client.ping()
                logger.info("Successfully connected to Redis at %s", self.redis_url)
            except Exception as e:
                logger.warning("Redis connection failed (%s); falling back to in-memory cache", e)
                return self._fallback

        return self._redis_client

    async def get(self, key: str) -> Optional[bytes]:
        client = await self.get_client()
        try:
            return await client.get(key)
        except Exception:
            return await self._fallback.get(key)

    async def get_json(self, key: str) -> Optional[Any]:
        raw = await self.get(key)
        if raw:
            try:
                return orjson.loads(raw)
            except Exception:
                return None
        return None

    async def set(self, key: str, value: Any, ex: Optional[int] = None) -> bool:
        client = await self.get_client()
        try:
            if isinstance(value, (dict, list)):
                payload = orjson.dumps(value)
            elif isinstance(value, str):
                payload = value.encode("utf-8")
            else:
                payload = value
            return await client.set(key, payload, ex=ex)
        except Exception:
            return await self._fallback.set(key, value, ex=ex)

    async def delete(self, key: str) -> int:
        client = await self.get_client()
        try:
            return await client.delete(key)
        except Exception:
            return await self._fallback.delete(key)


redis_manager = RedisManager()
