"""Shared field types. Shape rules live here; cross-field rules live in services."""

from typing import Annotated, Any
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AfterValidator, BeforeValidator, Field


def _strip_non_blank(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Field required")
    return value


def _http_url(value: str) -> str:
    value = value.strip()
    parts = urlsplit(value)
    if parts.scheme not in {"http", "https"} or not parts.netloc:
        raise ValueError("Must be a valid http(s) URL")
    return value


def _upper_stripped(value: Any) -> Any:
    return value.strip().upper() if isinstance(value, str) else value


def _iana_timezone(value: str) -> str:
    try:
        ZoneInfo(value)
    except ZoneInfoNotFoundError, ValueError, TypeError:
        raise ValueError("Unknown time zone") from None
    return value


def reject_null(value: Any) -> Any:
    """For PATCH fields that may be omitted but not cleared."""
    if value is None:
        raise ValueError("Field may be omitted but not set to null")
    return value


NonBlankStr = Annotated[str, Field(max_length=200), AfterValidator(_strip_non_blank)]
OptionalText = Annotated[str | None, Field(max_length=200)]
HttpUrlStr = Annotated[str, Field(max_length=2000), AfterValidator(_http_url)]
CurrencyCode = Annotated[
    str, BeforeValidator(_upper_stripped), Field(pattern=r"^[A-Z]{3}$")
]
TimezoneName = Annotated[str, Field(max_length=64), AfterValidator(_iana_timezone)]
