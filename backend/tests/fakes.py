"""In-memory stand-ins for provider clients (PRD NFR-06: test doubles at the boundary)."""

from dataclasses import dataclass, field
from datetime import date

from app.integrations.email import EmailSendError


@dataclass(frozen=True)
class SentEmail:
    to: str
    subject: str
    html: str
    text: str


@dataclass
class FakeEmailSender:
    sent: list[SentEmail] = field(default_factory=list)
    fail_with: str | None = None

    async def send(self, *, to: str, subject: str, html: str, text: str) -> str:
        if self.fail_with is not None:
            raise EmailSendError(self.fail_with)
        self.sent.append(SentEmail(to=to, subject=subject, html=html, text=text))
        return f"fake-{len(self.sent)}"


@dataclass
class FakeRateLimiter:
    limit: int = 5
    counts: dict[date, int] = field(default_factory=dict)

    async def try_acquire(self, day: date) -> bool:
        self.counts[day] = self.counts.get(day, 0) + 1
        return self.counts[day] <= self.limit


@dataclass
class FakeRedis:
    """Only the two commands RedisRateLimiter uses."""

    values: dict[str, int] = field(default_factory=dict)
    expirations: dict[str, int] = field(default_factory=dict)

    async def incr(self, key: str) -> int:
        self.values[key] = self.values.get(key, 0) + 1
        return self.values[key]

    async def expire(self, key: str, seconds: int) -> bool:
        self.expirations[key] = seconds
        return True
