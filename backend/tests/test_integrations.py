from datetime import date
from unittest.mock import AsyncMock

import pytest
import resend

from app.integrations.email import EmailSendError, ResendEmailSender
from app.integrations.rate_limit import KEY_TTL_SECONDS, RedisRateLimiter
from tests.fakes import FakeRedis


async def test_redis_limiter_allows_limit_then_refuses() -> None:
    redis = FakeRedis()
    limiter = RedisRateLimiter(redis, limit=5)
    day = date(2026, 9, 21)
    results = [await limiter.try_acquire(day) for _ in range(6)]
    assert results == [True] * 5 + [False]
    assert redis.values == {"emails:sent:2026-09-21": 6}
    # TTL is set exactly once, when the key is created.
    assert redis.expirations == {"emails:sent:2026-09-21": KEY_TTL_SECONDS}


async def test_redis_limiter_counts_per_day() -> None:
    limiter = RedisRateLimiter(FakeRedis(), limit=1)
    assert await limiter.try_acquire(date(2026, 9, 21)) is True
    assert await limiter.try_acquire(date(2026, 9, 21)) is False
    assert await limiter.try_acquire(date(2026, 9, 22)) is True


async def test_resend_sender_passes_params_and_returns_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    send_async = AsyncMock(return_value={"id": "email_123"})
    monkeypatch.setattr(resend.Emails, "send_async", send_async)
    sender = ResendEmailSender(api_key="re_test", from_address="Me <me@example.com>")

    message_id = await sender.send(
        to="owner@example.com", subject="Hi", html="<p>x</p>", text="x"
    )

    assert message_id == "email_123"
    assert resend.api_key == "re_test"
    send_async.assert_awaited_once_with(
        {
            "from": "Me <me@example.com>",
            "to": ["owner@example.com"],
            "subject": "Hi",
            "html": "<p>x</p>",
            "text": "x",
        }
    )


async def test_resend_sender_wraps_provider_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        resend.Emails, "send_async", AsyncMock(side_effect=RuntimeError("401 bad key"))
    )
    sender = ResendEmailSender(api_key="re_test", from_address="me@example.com")
    with pytest.raises(EmailSendError) as info:
        await sender.send(to="a@b.c", subject="s", html="h", text="t")
    assert str(info.value) == "RuntimeError: 401 bad key"
