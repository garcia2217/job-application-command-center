from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.models import (
    Account,
    Application,
    ApplicationStatus,
    Comparison,
    InterviewStage,
)
from app.services import activity as activity_module
from tests.conftest import make_application, make_company


async def test_create_minimal_defaults_to_applied(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.1
    company = await make_company(db_session, owner_account, "Acme")
    response = await owner_client.post(
        "/applications",
        json={"company_id": company.id, "role_title": "Backend Engineer"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "applied"
    assert body["company"] == {"id": company.id, "name": "Acme"}
    assert body["stages"] == [] and body["contacts"] == []
    assert body["is_quiet"] is False
    assert body["last_activity_at"]


async def test_create_with_inline_company(
    owner_client: AsyncClient, owner_account: Account
) -> None:
    response = await owner_client.post(
        "/applications",
        json={"company": {"name": "Beta"}, "role_title": "SRE", "status": "wishlist"},
    )
    assert response.status_code == 201
    assert response.json()["company"]["name"] == "Beta"
    companies = await owner_client.get("/companies")
    assert [c["name"] for c in companies.json()] == ["Beta"]


async def test_inline_company_conflict_offers_existing_and_creates_nothing(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.4 via inline path
    existing = await make_company(db_session, owner_account, "Acme")
    response = await owner_client.post(
        "/applications", json={"company": {"name": "acme"}, "role_title": "SRE"}
    )
    assert response.status_code == 409
    assert response.json()["code"] == "COMPANY_NAME_TAKEN"
    assert response.json()["existing_id"] == existing.id
    count = (await db_session.execute(select(func.count(Application.id)))).scalar_one()
    assert count == 0


async def test_company_xor_required(owner_client: AsyncClient) -> None:
    both = await owner_client.post(
        "/applications",
        json={"company_id": 1, "company": {"name": "X"}, "role_title": "SRE"},
    )
    neither = await owner_client.post("/applications", json={"role_title": "SRE"})
    assert both.status_code == 422 and neither.status_code == 422


async def test_foreign_company_id_is_404(
    owner_client: AsyncClient, other_account: Account, db_session: AsyncSession
) -> None:  # AC-01.7
    foreign = await make_company(db_session, other_account, "Foreign")
    response = await owner_client.post(
        "/applications", json={"company_id": foreign.id, "role_title": "SRE"}
    )
    assert response.status_code == 404


async def test_missing_role_title_field_error(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.2
    company = await make_company(db_session, owner_account)
    for payload in (
        {"company_id": company.id},
        {"company_id": company.id, "role_title": " "},
    ):
        response = await owner_client.post("/applications", json=payload)
        assert response.status_code == 422
        assert response.json()["errors"][0]["field"] == "role_title"


async def test_salary_rules(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.3
    company = await make_company(db_session, owner_account)
    base = {"company_id": company.id, "role_title": "SRE"}
    inverted = await owner_client.post(
        "/applications",
        json={**base, "salary_min": 100, "salary_max": 50, "salary_currency": "usd"},
    )
    assert inverted.status_code == 422
    assert inverted.json()["errors"][0]["field"] == "salary_max"
    no_currency = await owner_client.post(
        "/applications", json={**base, "salary_min": 100}
    )
    assert no_currency.status_code == 422
    assert no_currency.json()["errors"][0]["field"] == "salary_currency"
    bad_currency = await owner_client.post(
        "/applications", json={**base, "salary_min": 1, "salary_currency": "dollars"}
    )
    assert bad_currency.status_code == 422
    ok = await owner_client.post(
        "/applications",
        json={**base, "salary_min": 50, "salary_max": 100, "salary_currency": "usd"},
    )
    assert ok.status_code == 201
    assert ok.json()["salary_currency"] == "USD"


async def test_invalid_url_and_future_date_rejected(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:
    company = await make_company(db_session, owner_account)
    base = {"company_id": company.id, "role_title": "SRE"}
    url = await owner_client.post(
        "/applications", json={**base, "posting_url": "ftp://x"}
    )
    assert url.status_code == 422
    assert url.json()["errors"][0]["field"] == "posting_url"
    tomorrow = (utcnow().date() + timedelta(days=2)).isoformat()
    future = await owner_client.post(
        "/applications", json={**base, "date_applied": tomorrow}
    )
    assert future.status_code == 422
    assert future.json()["errors"][0]["field"] == "date_applied"
    today = await owner_client.post(
        "/applications", json={**base, "date_applied": utcnow().date().isoformat()}
    )
    assert today.status_code == 201


async def test_invalid_status_rejected(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.10
    company = await make_company(db_session, owner_account)
    response = await owner_client.post(
        "/applications",
        json={"company_id": company.id, "role_title": "SRE", "status": "ghosted"},
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "status"


async def test_duplicate_warning_then_confirm(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.5
    company = await make_company(db_session, owner_account, "Acme")
    first = await make_application(
        db_session, owner_account, company, "Backend Engineer"
    )
    payload = {"company_id": company.id, "role_title": "backend engineer"}
    warned = await owner_client.post("/applications", json=payload)
    assert warned.status_code == 409
    assert warned.json()["code"] == "DUPLICATE_APPLICATION"
    assert warned.json()["existing_id"] == first.id
    confirmed = await owner_client.post(
        "/applications", json={**payload, "confirm_duplicate": True}
    )
    assert confirmed.status_code == 201
    listing = await owner_client.get("/applications")
    assert len(listing.json()) == 2


async def test_list_filter_sort_and_scope(
    owner_client: AsyncClient,
    owner_account: Account,
    other_account: Account,
    db_session: AsyncSession,
) -> None:  # AC-02.8, AC-02.9, AC-01.7
    assert (await owner_client.get("/applications")).json() == []
    company = await make_company(db_session, owner_account, "Acme")
    foreign_co = await make_company(db_session, other_account, "Foreign")
    now = utcnow()
    older = await make_application(
        db_session,
        owner_account,
        company,
        "Old",
        status=ApplicationStatus.INTERVIEWING,
        last_activity_at=now - timedelta(days=3),
        date_applied=date(2026, 9, 1),
    )
    newer = await make_application(
        db_session,
        owner_account,
        company,
        "New",
        status=ApplicationStatus.APPLIED,
        last_activity_at=now,
        date_applied=None,
    )
    mid = await make_application(
        db_session,
        owner_account,
        company,
        "Mid",
        status=ApplicationStatus.INTERVIEWING,
        last_activity_at=now - timedelta(days=1),
        date_applied=date(2026, 9, 10),
    )
    await make_application(db_session, other_account, foreign_co, "Foreign role")

    default = await owner_client.get("/applications")
    assert [a["id"] for a in default.json()] == [newer.id, mid.id, older.id]

    filtered = await owner_client.get(
        "/applications", params={"status": "interviewing"}
    )
    assert [a["id"] for a in filtered.json()] == [mid.id, older.id]

    by_date = await owner_client.get(
        "/applications", params={"sort": "date_applied", "order": "asc"}
    )
    assert [a["id"] for a in by_date.json()] == [
        older.id,
        mid.id,
        newer.id,
    ]  # nulls last

    bad = await owner_client.get("/applications", params={"sort": "salary"})
    assert bad.status_code == 422


async def test_get_and_patch_records_activity(
    owner_client: AsyncClient,
    owner_account: Account,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    company = await make_company(db_session, owner_account)
    app_row = await make_application(
        db_session,
        owner_account,
        company,
        last_activity_at=utcnow() - timedelta(days=10),
        is_quiet=True,
    )
    detail = await owner_client.get(f"/applications/{app_row.id}")
    assert detail.status_code == 200 and detail.json()["is_quiet"] is True

    later = utcnow() + timedelta(hours=1)
    monkeypatch.setattr(activity_module, "utcnow", lambda: later)
    patched = await owner_client.patch(
        f"/applications/{app_row.id}", json={"status": "offer", "notes": "yay"}
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["status"] == "offer" and body["notes"] == "yay"
    assert body["is_quiet"] is False
    assert body["last_activity_at"].startswith(later.isoformat(timespec="seconds")[:19])


async def test_patch_validation_uses_stored_values(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:
    company = await make_company(db_session, owner_account)
    app_row = await make_application(
        db_session,
        owner_account,
        company,
        salary_min=50,
        salary_max=100,
        salary_currency="USD",
    )
    response = await owner_client.patch(
        f"/applications/{app_row.id}", json={"salary_max": 10}
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "salary_max"
    cleared = await owner_client.patch(
        f"/applications/{app_row.id}",
        json={"salary_min": None, "salary_max": None, "salary_currency": None},
    )
    assert cleared.status_code == 200
    null_role = await owner_client.patch(
        f"/applications/{app_row.id}", json={"role_title": None}
    )
    assert null_role.status_code == 422


async def test_patch_company_must_be_own(
    owner_client: AsyncClient,
    owner_account: Account,
    other_account: Account,
    db_session: AsyncSession,
) -> None:
    company = await make_company(db_session, owner_account)
    foreign = await make_company(db_session, other_account, "Foreign")
    app_row = await make_application(db_session, owner_account, company)
    response = await owner_client.patch(
        f"/applications/{app_row.id}", json={"company_id": foreign.id}
    )
    assert response.status_code == 404


async def test_delete_cascades_stages_and_comparison(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.7
    company = await make_company(db_session, owner_account)
    app_row = await make_application(db_session, owner_account, company)
    db_session.add_all(
        [
            InterviewStage(application_id=app_row.id, name="Screen", position=0),
            Comparison(application_id=app_row.id, ran_at=utcnow()),
        ]
    )
    await db_session.commit()
    response = await owner_client.delete(f"/applications/{app_row.id}")
    assert response.status_code == 204
    stages = (
        await db_session.execute(select(func.count(InterviewStage.id)))
    ).scalar_one()
    comparisons = (
        await db_session.execute(select(func.count(Comparison.id)))
    ).scalar_one()
    assert stages == 0 and comparisons == 0
    assert (await owner_client.get(f"/applications/{app_row.id}")).status_code == 404


async def test_foreign_application_is_404(
    owner_client: AsyncClient, other_account: Account, db_session: AsyncSession
) -> None:  # AC-01.7
    foreign_co = await make_company(db_session, other_account, "Foreign")
    foreign = await make_application(db_session, other_account, foreign_co)
    for method, kwargs in (
        ("get", {}),
        ("patch", {"json": {"notes": "x"}}),
        ("delete", {}),
    ):
        response = await owner_client.request(
            method, f"/applications/{foreign.id}", **kwargs
        )
        assert response.status_code == 404, method
