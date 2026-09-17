from enum import StrEnum
from typing import Any


class ErrorCode(StrEnum):
    VALIDATION_FAILED = "VALIDATION_FAILED"
    UNAUTHENTICATED = "UNAUTHENTICATED"
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    ACCOUNT_LOCKED = "ACCOUNT_LOCKED"
    NOT_FOUND = "NOT_FOUND"
    CONFLICT = "CONFLICT"
    COMPANY_NAME_TAKEN = "COMPANY_NAME_TAKEN"
    COMPANY_HAS_APPLICATIONS = "COMPANY_HAS_APPLICATIONS"
    DUPLICATE_APPLICATION = "DUPLICATE_APPLICATION"
    CONTACT_COMPANY_MISMATCH = "CONTACT_COMPANY_MISMATCH"
    HTTP_ERROR = "HTTP_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class AppError(Exception):
    """Expected application error; handlers map it to problem+json."""

    status_code: int = 500
    code: ErrorCode = ErrorCode.INTERNAL_ERROR
    title: str = "Internal server error"

    def __init__(
        self,
        detail: str | None = None,
        *,
        code: ErrorCode | None = None,
        errors: list[dict[str, Any]] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        self.detail = detail if detail is not None else self.title
        if code is not None:
            self.code = code
        self.errors = errors
        # RFC 9457 extension members (e.g. existing_id); never overrides base keys.
        self.extra = extra
        super().__init__(detail or self.title)


class NotFoundError(AppError):
    status_code = 404
    code = ErrorCode.NOT_FOUND
    title = "Resource not found"


class ConflictError(AppError):
    status_code = 409
    code = ErrorCode.CONFLICT
    title = "Conflict"


class AuthenticationError(AppError):
    status_code = 401
    code = ErrorCode.UNAUTHENTICATED
    title = "Authentication required"


class ValidationFailedError(AppError):
    status_code = 422
    code = ErrorCode.VALIDATION_FAILED
    title = "Request validation failed"


def field_error(field: str, message: str) -> ValidationFailedError:
    """One field-level failure in the contract's errors[] shape (NFR-07)."""
    return ValidationFailedError(
        "1 field(s) failed validation",
        errors=[
            {
                "location": "body",
                "field": field,
                "message": message,
                "type": "value_error",
            }
        ],
    )
