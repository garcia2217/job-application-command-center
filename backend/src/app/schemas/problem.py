from typing import Any

from pydantic import BaseModel


class ProblemResponse(BaseModel):
    """application/problem+json body (docs/API_CONTRACT.md). For OpenAPI only."""

    type: str
    title: str
    status: int
    detail: str
    code: str
    errors: list[dict[str, Any]] | None = None


def problem_responses(*statuses: int) -> dict[int | str, dict[str, Any]]:
    return {
        status: {
            "model": ProblemResponse,
            "content": {"application/problem+json": {}},
        }
        for status in statuses
    }
