from datetime import date
from typing import Protocol

from upstash_redis.asyncio import Redis

KEY_TTL_SECONDS = 172_800  # two days: the key only matters for one UTC day


class RateLimiter(Protocol):
    async def try_acquire(self, day: date) -> bool:
        """Reserve one send slot for `day`; False when the daily cap is reached."""
        ...


class RedisRateLimiter:
    """System-wide cap on outbound emails per UTC calendar day (PRD F-05).

    A slot is reserved before sending and never released: a failed send is not
    retried, so counting it keeps the cap conservative.
    """

    def __init__(self, redis: Redis, limit: int) -> None:
        self.redis = redis
        self.limit = limit

    async def try_acquire(self, day: date) -> bool:
        key = f"emails:sent:{day.isoformat()}"
        count = await self.redis.incr(key)
        if count == 1:
            await self.redis.expire(key, KEY_TTL_SECONDS)
        return count <= self.limit
