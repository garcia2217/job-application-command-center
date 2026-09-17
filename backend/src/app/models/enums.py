from enum import StrEnum


def enum_values(e: type[StrEnum]) -> list[str]:
    return [m.value for m in e]


class ApplicationStatus(StrEnum):
    WISHLIST = "wishlist"
    APPLIED = "applied"
    INTERVIEWING = "interviewing"
    OFFER = "offer"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


ACTIVE_STATUSES = frozenset(
    {
        ApplicationStatus.WISHLIST,
        ApplicationStatus.APPLIED,
        ApplicationStatus.INTERVIEWING,
    }
)


class WorkArrangement(StrEnum):
    ON_SITE = "on_site"
    HYBRID = "hybrid"
    REMOTE = "remote"


class StageOutcome(StrEnum):
    PENDING = "pending"
    PASSED = "passed"
    FAILED = "failed"


class JobType(StrEnum):
    QUIET_CHECK = "quiet_check"
    DIGEST = "digest"


class JobStatus(StrEnum):
    SUCCEEDED = "succeeded"
    SKIPPED = "skipped"
    NOT_SENT = "not_sent"
    FAILED = "failed"
