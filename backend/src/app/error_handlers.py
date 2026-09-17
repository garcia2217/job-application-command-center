import logging
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.errors import AppError, ErrorCode

logger = logging.getLogger("app.errors")
PROBLEM_TYPE_BASE = "https://example.com/errors/"

# Raw HTTPExceptions (routing 404/405, third-party raises) get the closest
# contract code; app code raises AppError subclasses instead.
_HTTP_STATUS_CODES = {
    401: ErrorCode.UNAUTHENTICATED,
    404: ErrorCode.NOT_FOUND,
    409: ErrorCode.CONFLICT,
}


def problem_response(
    *,
    status: int,
    code: ErrorCode | str,
    title: str,
    detail: str | None = None,
    errors: list[dict[str, Any]] | None = None,
    extra: dict[str, Any] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": f"{PROBLEM_TYPE_BASE}{str(code).lower().replace('_', '-')}",
        "title": title,
        "status": status,
        "detail": detail,
        "code": str(code),
    }
    if errors:
        body["errors"] = errors
    if extra:
        reserved = body.keys() | {"instance", "request_id"}
        body.update({k: v for k, v in extra.items() if k not in reserved})
    return JSONResponse(
        status_code=status, content=body, media_type="application/problem+json"
    )


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    logger.info(
        "%s %s -> %s %s", request.method, request.url.path, exc.status_code, exc.code
    )
    return problem_response(
        status=exc.status_code,
        code=exc.code,
        title=exc.title,
        detail=exc.detail,
        errors=exc.errors,
        extra=exc.extra,
    )


async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    # Rebuilt (not exc.errors() verbatim) so submitted input and ctx never leak.
    errors = []
    for err in exc.errors():
        loc = [str(part) for part in err.get("loc", ())]
        errors.append(
            {
                "location": loc[0] if loc else "body",
                "field": ".".join(loc[1:]) or None,
                "message": err.get("msg", "Invalid value"),
                "type": err.get("type", "value_error"),
            }
        )
    return problem_response(
        status=422,
        code=ErrorCode.VALIDATION_FAILED,
        title="Request validation failed",
        detail=f"{len(errors)} field(s) failed validation",
        errors=errors,
    )


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    try:
        title = HTTPStatus(exc.status_code).phrase
    except ValueError:
        title = "HTTP error"
    if exc.status_code >= 500:
        code = ErrorCode.INTERNAL_ERROR
    else:
        code = _HTTP_STATUS_CODES.get(exc.status_code, ErrorCode.HTTP_ERROR)
    return problem_response(
        status=exc.status_code,
        code=code,
        title=title,
        detail=exc.detail if isinstance(exc.detail, str) else None,
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return problem_response(
        status=500,
        code=ErrorCode.INTERNAL_ERROR,
        title="Internal server error",
        detail="An unexpected error occurred.",
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
