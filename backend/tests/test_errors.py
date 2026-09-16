import json
from pathlib import Path

from httpx import ASGITransport, AsyncClient

FIXTURE = Path(__file__).parents[2] / "docs" / "api-fixtures" / "validation-error.json"


async def test_unknown_route_is_problem_json(client: AsyncClient) -> None:
    response = await client.get("/does-not-exist")
    assert response.status_code == 404
    assert "application/problem+json" in response.headers["content-type"]
    body = response.json()
    assert body["status"] == 404
    assert "instance" not in body and "request_id" not in body


async def test_validation_error_matches_contract_fixture(app) -> None:
    # Task 7's login endpoint makes this real; until then use a probe route.
    from pydantic import BaseModel

    class Probe(BaseModel):
        role_title: str

    @app.post("/probe")
    async def probe(payload: Probe) -> dict[str, str]:  # pragma: no cover
        return {"ok": "yes"}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.post("/probe", json={})

    assert response.status_code == 422
    assert response.json() == json.loads(FIXTURE.read_text())


async def test_unhandled_error_is_generic_500(app) -> None:
    @app.get("/boom")
    async def boom() -> None:  # pragma: no cover
        raise RuntimeError("secret internals")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/boom")

    assert response.status_code == 500
    assert response.json()["code"] == "INTERNAL_ERROR"
    assert "secret internals" not in response.text
