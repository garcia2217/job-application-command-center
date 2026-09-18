from upstash_redis.asyncio import Redis

from app.config import Settings
from app.integrations.email import EmailSender, ResendEmailSender
from app.integrations.rate_limit import RateLimiter, RedisRateLimiter


def build_email_sender(settings: Settings) -> EmailSender:
    return ResendEmailSender(settings.resend_api_key, settings.email_from)


def build_rate_limiter(settings: Settings) -> RateLimiter:
    redis = Redis(
        url=settings.upstash_redis_rest_url, token=settings.upstash_redis_rest_token
    )
    return RedisRateLimiter(redis, settings.email_daily_limit)


__all__ = ["build_email_sender", "build_rate_limiter"]
