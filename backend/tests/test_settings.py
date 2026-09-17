from httpx import AsyncClient


async def test_update_threshold_and_timezone(owner_client: AsyncClient) -> None:
    response = await owner_client.patch(
        "/settings", json={"quiet_threshold_days": 10, "timezone": "Asia/Bangkok"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["quiet_threshold_days"] == 10
    assert body["timezone"] == "Asia/Bangkok"

    me = await owner_client.get("/auth/me")
    assert me.json()["quiet_threshold_days"] == 10


async def test_partial_update_keeps_other_field(owner_client: AsyncClient) -> None:
    await owner_client.patch("/settings", json={"timezone": "Europe/Berlin"})
    response = await owner_client.patch("/settings", json={"quiet_threshold_days": 3})
    assert response.json()["timezone"] == "Europe/Berlin"


async def test_threshold_bounds_rejected(owner_client: AsyncClient) -> None:  # AC-04.9
    for bad in (0, 91, 7.5, "7"):
        response = await owner_client.patch(
            "/settings", json={"quiet_threshold_days": bad}
        )
        assert response.status_code == 422, bad
        assert response.json()["errors"][0]["field"] == "quiet_threshold_days"


async def test_unknown_timezone_rejected(owner_client: AsyncClient) -> None:
    response = await owner_client.patch("/settings", json={"timezone": "Mars/Olympus"})
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "timezone"


async def test_null_is_rejected(owner_client: AsyncClient) -> None:
    response = await owner_client.patch("/settings", json={"timezone": None})
    assert response.status_code == 422


async def test_requires_session(client: AsyncClient) -> None:
    response = await client.patch("/settings", json={"quiet_threshold_days": 5})
    assert response.status_code == 401
