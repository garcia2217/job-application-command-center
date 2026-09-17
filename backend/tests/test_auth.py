from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account
from app.models import Session as SessionModel


async def test_login_success_returns_token_and_expiry(
    client: AsyncClient, owner_account: Account
) -> None:  # AC-01.1
    response = await client.post(
        "/auth/login",
        json={"email": "owner@example.com", "password": "owner-password-1"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token"]
    assert body["expires_at"].endswith("Z") or "+00:00" in body["expires_at"]


async def test_wrong_password_generic_error(
    client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-01.2
    response = await client.post(
        "/auth/login", json={"email": "owner@example.com", "password": "wrong"}
    )
    assert response.status_code == 401
    body = response.json()
    assert body["code"] == "INVALID_CREDENTIALS"
    assert body["detail"] == "Email or password is incorrect"
    assert "www-authenticate" not in response.headers
    count = (await db_session.execute(select(func.count(SessionModel.id)))).scalar_one()
    assert count == 0


async def test_empty_fields_are_validation_not_attempt(
    client: AsyncClient, owner_account: Account
) -> None:
    for _ in range(5):
        response = await client.post("/auth/login", json={"email": "", "password": ""})
        assert response.status_code == 422
    # Five empty submissions counted no attempts: correct login still works.
    ok = await client.post(
        "/auth/login",
        json={"email": "owner@example.com", "password": "owner-password-1"},
    )
    assert ok.status_code == 200


async def test_protected_endpoint_without_session(
    client: AsyncClient,
) -> None:  # AC-01.6
    response = await client.get("/auth/me")
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"


async def test_me_with_session(client: AsyncClient, owner_account: Account) -> None:
    login = await client.post(
        "/auth/login",
        json={"email": "owner@example.com", "password": "owner-password-1"},
    )
    client.cookies.set("session", login.json()["token"])
    response = await client.get("/auth/me")
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "owner@example.com"
    assert "hashed_password" not in body


async def test_logout_revokes_session(
    client: AsyncClient, owner_account: Account
) -> None:  # AC-01.4
    login = await client.post(
        "/auth/login",
        json={"email": "owner@example.com", "password": "owner-password-1"},
    )
    client.cookies.set("session", login.json()["token"])
    assert (await client.post("/auth/logout")).status_code == 204
    response = await client.get("/auth/me")
    assert response.status_code == 401


async def test_lockout_via_api(
    client: AsyncClient, owner_account: Account
) -> None:  # AC-01.3 (API half)
    for _ in range(5):
        await client.post(
            "/auth/login", json={"email": "owner@example.com", "password": "no"}
        )
    response = await client.post(
        "/auth/login",
        json={"email": "owner@example.com", "password": "owner-password-1"},
    )
    assert response.status_code == 401
    body = response.json()
    assert body["code"] == "ACCOUNT_LOCKED"
    assert body["detail"] == "Too many attempts. Try again in 15 minutes."


def test_no_signup_route_exists(app) -> None:  # AC-01.9
    # app.routes may contain lazily-expanded router wrappers depending on
    # FastAPI version; the OpenAPI schema always reflects the flattened,
    # final path list regardless of internal route representation.
    paths = set(app.openapi()["paths"])
    assert not any("signup" in p or "register" in p for p in paths)
