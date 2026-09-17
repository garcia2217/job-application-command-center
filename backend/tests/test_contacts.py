from datetime import timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.models import Account, Contact
from tests.conftest import make_application, make_company


async def test_create_minimal_shows_on_company(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-03.1
    company = await make_company(db_session, owner_account, "Acme")
    response = await owner_client.post(
        "/contacts", json={"company_id": company.id, "name": "Ann"}
    )
    assert response.status_code == 201
    assert response.json()["company_id"] == company.id
    detail = await owner_client.get(f"/companies/{company.id}")
    assert [c["name"] for c in detail.json()["contacts"]] == ["Ann"]


async def test_invalid_email_and_url(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-03.7
    company = await make_company(db_session, owner_account)
    bad_email = await owner_client.post(
        "/contacts",
        json={"company_id": company.id, "name": "Ann", "email": "not-an-email"},
    )
    assert bad_email.status_code == 422
    assert bad_email.json()["errors"][0]["field"] == "email"
    bad_url = await owner_client.post(
        "/contacts",
        json={
            "company_id": company.id,
            "name": "Ann",
            "linkedin_url": "linkedin.com/in/ann",
        },
    )
    assert bad_url.status_code == 422
    assert bad_url.json()["errors"][0]["field"] == "linkedin_url"


async def test_foreign_company_is_404(
    owner_client: AsyncClient, other_account: Account, db_session: AsyncSession
) -> None:  # AC-01.7
    foreign = await make_company(db_session, other_account, "Foreign")
    response = await owner_client.post(
        "/contacts", json={"company_id": foreign.id, "name": "Ann"}
    )
    assert response.status_code == 404


async def test_get_patch_delete(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:
    company = await make_company(db_session, owner_account)
    created = (
        await owner_client.post(
            "/contacts", json={"company_id": company.id, "name": "Ann"}
        )
    ).json()
    got = await owner_client.get(f"/contacts/{created['id']}")
    assert got.status_code == 200
    patched = await owner_client.patch(
        f"/contacts/{created['id']}",
        json={"title": "Recruiter", "email": "ann@example.com"},
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Recruiter"
    null_name = await owner_client.patch(
        f"/contacts/{created['id']}", json={"name": None}
    )
    assert null_name.status_code == 422
    deleted = await owner_client.delete(f"/contacts/{created['id']}")
    assert deleted.status_code == 204
    assert (await owner_client.get(f"/contacts/{created['id']}")).status_code == 404


async def test_link_is_idempotent_and_same_company_only(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-03.2, AC-03.3
    acme = await make_company(db_session, owner_account, "Acme")
    beta = await make_company(db_session, owner_account, "Beta")
    app_acme = await make_application(db_session, owner_account, acme)
    app_beta = await make_application(db_session, owner_account, beta)
    contact = Contact(account_id=owner_account.id, company_id=acme.id, name="Ann")
    db_session.add(contact)
    await db_session.commit()

    link_url = f"/applications/{app_acme.id}/contacts/{contact.id}"
    assert (await owner_client.put(link_url)).status_code == 204
    assert (await owner_client.put(link_url)).status_code == 204
    detail = (await owner_client.get(f"/applications/{app_acme.id}")).json()
    assert [c["id"] for c in detail["contacts"]] == [contact.id]

    mismatch = await owner_client.put(
        f"/applications/{app_beta.id}/contacts/{contact.id}"
    )
    assert mismatch.status_code == 409
    assert mismatch.json()["code"] == "CONTACT_COMPANY_MISMATCH"

    assert (await owner_client.delete(link_url)).status_code == 204
    assert (await owner_client.delete(link_url)).status_code == 204
    detail = (await owner_client.get(f"/applications/{app_acme.id}")).json()
    assert detail["contacts"] == []


async def test_delete_contact_unlinks_but_keeps_applications(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-03.6
    acme = await make_company(db_session, owner_account, "Acme")
    app1 = await make_application(db_session, owner_account, acme, "One")
    app2 = await make_application(db_session, owner_account, acme, "Two")
    contact = Contact(account_id=owner_account.id, company_id=acme.id, name="Ann")
    db_session.add(contact)
    await db_session.commit()
    for app_id in (app1.id, app2.id):
        assert (
            await owner_client.put(f"/applications/{app_id}/contacts/{contact.id}")
        ).status_code == 204

    assert (await owner_client.delete(f"/contacts/{contact.id}")).status_code == 204
    for app_id in (app1.id, app2.id):
        detail = await owner_client.get(f"/applications/{app_id}")
        assert detail.status_code == 200
        assert detail.json()["contacts"] == []


async def test_contact_changes_do_not_count_as_activity(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-04.5
    acme = await make_company(db_session, owner_account, "Acme")
    stale = utcnow() - timedelta(days=10)
    app_row = await make_application(
        db_session, owner_account, acme, last_activity_at=stale, is_quiet=True
    )
    contact = (
        await owner_client.post(
            "/contacts", json={"company_id": acme.id, "name": "Ann"}
        )
    ).json()
    await owner_client.put(f"/applications/{app_row.id}/contacts/{contact['id']}")
    await owner_client.patch(f"/contacts/{contact['id']}", json={"title": "Lead"})
    detail = (await owner_client.get(f"/applications/{app_row.id}")).json()
    assert detail["is_quiet"] is True
    assert detail["last_activity_at"].startswith(stale.isoformat()[:19])


async def test_foreign_contact_is_404(
    owner_client: AsyncClient, other_account: Account, db_session: AsyncSession
) -> None:  # AC-01.7
    foreign_co = await make_company(db_session, other_account, "Foreign")
    contact = Contact(account_id=other_account.id, company_id=foreign_co.id, name="X")
    db_session.add(contact)
    await db_session.commit()
    assert (await owner_client.get(f"/contacts/{contact.id}")).status_code == 404
    assert (await owner_client.delete(f"/contacts/{contact.id}")).status_code == 404
