from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.models import Account, Application, InterviewStage
from app.routers import stages as stages_router_module
from app.services import activity as activity_module
from tests.conftest import make_application, make_company


@pytest.fixture
async def application(owner_account: Account, db_session: AsyncSession) -> Application:
    company = await make_company(db_session, owner_account)
    return await make_application(
        db_session,
        owner_account,
        company,
        last_activity_at=utcnow() - timedelta(days=10),
        is_quiet=True,
    )


async def _names(client: AsyncClient, application_id: int) -> list[str]:
    detail = await client.get(f"/applications/{application_id}")
    return [s["name"] for s in detail.json()["stages"]]


async def test_create_defaults_pending_and_appends(
    owner_client: AsyncClient, application: Application
) -> None:  # AC-03.5
    url = f"/applications/{application.id}/stages"
    first = await owner_client.post(url, json={"name": "Phone screen"})
    assert first.status_code == 201
    assert first.json()["outcome"] == "pending"
    assert first.json()["position"] == 0
    second = await owner_client.post(url, json={"name": "Onsite", "outcome": "passed"})
    assert second.json()["position"] == 1
    assert await _names(owner_client, application.id) == ["Phone screen", "Onsite"]


async def test_missing_name_rejected(
    owner_client: AsyncClient, application: Application
) -> None:
    response = await owner_client.post(
        f"/applications/{application.id}/stages", json={"name": "  "}
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "name"


async def test_bad_outcome_rejected(
    owner_client: AsyncClient, application: Application
) -> None:
    response = await owner_client.post(
        f"/applications/{application.id}/stages", json={"name": "X", "outcome": "maybe"}
    )
    assert response.status_code == 422


async def test_naive_scheduled_at_uses_account_timezone(
    owner_client: AsyncClient, application: Application
) -> None:  # NFR-08
    await owner_client.patch("/settings", json={"timezone": "Asia/Bangkok"})
    response = await owner_client.post(
        f"/applications/{application.id}/stages",
        json={"name": "Screen", "scheduled_at": "2026-09-20T09:00:00"},
    )
    assert response.status_code == 201
    assert response.json()["scheduled_at"].startswith("2026-09-20T02:00:00")
    aware = await owner_client.post(
        f"/applications/{application.id}/stages",
        json={"name": "Aware", "scheduled_at": "2026-09-20T09:00:00+02:00"},
    )
    assert aware.json()["scheduled_at"].startswith("2026-09-20T07:00:00")


async def test_move_up(
    owner_client: AsyncClient, application: Application
) -> None:  # AC-03.4
    url = f"/applications/{application.id}/stages"
    ids = [
        (await owner_client.post(url, json={"name": n})).json()["id"]
        for n in ("1", "2", "3")
    ]
    moved = await owner_client.post(f"{url}/{ids[2]}/move", json={"direction": "up"})
    assert moved.status_code == 200
    assert [s["name"] for s in moved.json()] == ["1", "3", "2"]
    assert [s["position"] for s in moved.json()] == [0, 1, 2]
    assert await _names(owner_client, application.id) == ["1", "3", "2"]

    noop = await owner_client.post(f"{url}/{ids[0]}/move", json={"direction": "up"})
    assert noop.status_code == 200
    assert [s["name"] for s in noop.json()] == ["1", "3", "2"]
    down = await owner_client.post(f"{url}/{ids[0]}/move", json={"direction": "down"})
    assert [s["name"] for s in down.json()] == ["3", "1", "2"]
    bad = await owner_client.post(f"{url}/{ids[0]}/move", json={"direction": "left"})
    assert bad.status_code == 422


async def test_update_and_delete_renumber(
    owner_client: AsyncClient, application: Application
) -> None:
    url = f"/applications/{application.id}/stages"
    ids = [
        (await owner_client.post(url, json={"name": n})).json()["id"]
        for n in ("a", "b", "c")
    ]
    updated = await owner_client.patch(
        f"{url}/{ids[1]}", json={"outcome": "failed", "notes": "tough"}
    )
    assert updated.status_code == 200
    assert updated.json()["outcome"] == "failed"
    null_name = await owner_client.patch(f"{url}/{ids[1]}", json={"name": None})
    assert null_name.status_code == 422

    deleted = await owner_client.delete(f"{url}/{ids[0]}")
    assert deleted.status_code == 204
    detail = (await owner_client.get(f"/applications/{application.id}")).json()
    assert [(s["name"], s["position"]) for s in detail["stages"]] == [
        ("b", 0),
        ("c", 1),
    ]


async def test_stage_changes_record_activity(
    owner_client: AsyncClient,
    application: Application,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # AC-04.4
    later = utcnow() + timedelta(hours=1)
    monkeypatch.setattr(activity_module, "utcnow", lambda: later)
    url = f"/applications/{application.id}/stages"
    await owner_client.post(url, json={"name": "Screen"})
    detail = (await owner_client.get(f"/applications/{application.id}")).json()
    assert detail["is_quiet"] is False
    assert detail["last_activity_at"].startswith(later.isoformat()[:19])


async def test_foreign_or_missing_application_is_404(
    owner_client: AsyncClient,
    other_account: Account,
    db_session: AsyncSession,
    application: Application,
) -> None:  # AC-01.7
    foreign_co = await make_company(db_session, other_account, "Foreign")
    foreign = await make_application(db_session, other_account, foreign_co)
    response = await owner_client.post(
        f"/applications/{foreign.id}/stages", json={"name": "X"}
    )
    assert response.status_code == 404
    missing_stage = await owner_client.delete(
        f"/applications/{application.id}/stages/999"
    )
    assert missing_stage.status_code == 404


@pytest.mark.parametrize("action", ["update", "move", "delete"])
async def test_stage_edit_reorder_delete_record_activity(
    owner_client: AsyncClient,
    application: Application,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    action: str,
) -> None:  # AC-04.4 — every stage change counts as activity
    url = f"/applications/{application.id}/stages"
    first = (await owner_client.post(url, json={"name": "Screen"})).json()
    await owner_client.post(url, json={"name": "Onsite"})

    # Re-quiet the application so the action under test must clear it again.
    await db_session.refresh(application)
    application.is_quiet = True
    application.last_activity_at = utcnow() - timedelta(days=10)
    await db_session.commit()

    later = utcnow() + timedelta(hours=1)
    monkeypatch.setattr(activity_module, "utcnow", lambda: later)
    if action == "update":
        response = await owner_client.patch(
            f"{url}/{first['id']}", json={"name": "Phone screen"}
        )
    elif action == "move":
        response = await owner_client.post(
            f"{url}/{first['id']}/move", json={"direction": "down"}
        )
    else:
        response = await owner_client.delete(f"{url}/{first['id']}")
    assert response.status_code in (200, 204), response.text

    detail = (await owner_client.get(f"/applications/{application.id}")).json()
    assert detail["is_quiet"] is False
    assert detail["last_activity_at"].startswith(later.isoformat()[:19])


NOW = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)


@pytest.fixture
def frozen_now(monkeypatch: pytest.MonkeyPatch) -> datetime:
    monkeypatch.setattr(stages_router_module, "utcnow", lambda: NOW)
    return NOW


async def _stage(
    db_session: AsyncSession,
    application: Application,
    name: str,
    at: datetime | None,
) -> InterviewStage:
    stage = InterviewStage(
        application_id=application.id, name=name, scheduled_at=at, position=0
    )
    db_session.add(stage)
    await db_session.commit()
    await db_session.refresh(stage)
    return stage


async def test_upcoming_requires_session(client: AsyncClient) -> None:
    response = await client.get("/stages/upcoming")
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"


async def test_upcoming_window_and_order(
    owner_client: AsyncClient,
    application: Application,
    db_session: AsyncSession,
    frozen_now: datetime,
) -> None:
    now = frozen_now
    await _stage(
        db_session, application, "late", now + timedelta(days=6, hours=23, minutes=59)
    )
    await _stage(db_session, application, "soon", now + timedelta(hours=1))
    await _stage(db_session, application, "past", now - timedelta(minutes=1))
    await _stage(db_session, application, "edge", now + timedelta(days=7))
    await _stage(db_session, application, "unscheduled", None)
    await _stage(db_session, application, "now", now)

    response = await owner_client.get("/stages/upcoming")
    assert response.status_code == 200
    items = response.json()
    assert [i["stage_name"] for i in items] == ["now", "soon", "late"]
    assert items[1] == {
        "application_id": application.id,
        "company": "Acme",
        "role_title": "Backend Engineer",
        "stage_name": "soon",
        "scheduled_at": items[1]["scheduled_at"],
    }
    parsed = datetime.fromisoformat(items[1]["scheduled_at"])
    assert parsed.utcoffset() == timedelta(0)
    assert parsed == now + timedelta(hours=1)


async def test_upcoming_ties_order_by_id(
    owner_client: AsyncClient,
    application: Application,
    db_session: AsyncSession,
    frozen_now: datetime,
) -> None:
    at = frozen_now + timedelta(days=1)
    first = await _stage(db_session, application, "first", at)
    second = await _stage(db_session, application, "second", at)
    assert first.id < second.id
    response = await owner_client.get("/stages/upcoming")
    assert [i["stage_name"] for i in response.json()] == ["first", "second"]


async def test_upcoming_excludes_other_accounts(
    owner_client: AsyncClient,
    application: Application,
    other_account: Account,
    db_session: AsyncSession,
    frozen_now: datetime,
) -> None:  # AC-01.7
    foreign_company = await make_company(db_session, other_account, "Foreign")
    foreign_app = await make_application(db_session, other_account, foreign_company)
    at = frozen_now + timedelta(hours=2)
    await _stage(db_session, application, "mine", at)
    await _stage(db_session, foreign_app, "theirs", at)
    response = await owner_client.get("/stages/upcoming")
    assert [i["stage_name"] for i in response.json()] == ["mine"]
