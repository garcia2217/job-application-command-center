from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account, Company, Contact
from tests.conftest import make_application, make_company


async def test_create_company_minimal(owner_client: AsyncClient) -> None:
    response = await owner_client.post("/companies", json={"name": "  Acme  "})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Acme"
    assert body["website"] is None
    assert body["id"]


async def test_blank_name_rejected(owner_client: AsyncClient) -> None:
    response = await owner_client.post("/companies", json={"name": "   "})
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "name"


async def test_invalid_website_rejected(owner_client: AsyncClient) -> None:
    response = await owner_client.post(
        "/companies", json={"name": "Acme", "website": "acme.example"}
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "website"


async def test_duplicate_name_offers_existing(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.4
    existing = await make_company(db_session, owner_account, "Acme")
    response = await owner_client.post("/companies", json={"name": " acme "})
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "COMPANY_NAME_TAKEN"
    assert body["existing_id"] == existing.id


async def test_same_name_allowed_across_accounts(
    owner_client: AsyncClient,
    other_client: AsyncClient,
) -> None:
    assert (
        await owner_client.post("/companies", json={"name": "Acme"})
    ).status_code == 201
    assert (
        await other_client.post("/companies", json={"name": "Acme"})
    ).status_code == 201


async def test_list_is_scoped_and_sorted(
    owner_client: AsyncClient,
    owner_account: Account,
    other_account: Account,
    db_session: AsyncSession,
) -> None:  # AC-01.7
    await make_company(db_session, owner_account, "Zeta")
    await make_company(db_session, owner_account, "alpha")
    await make_company(db_session, other_account, "Foreign")
    response = await owner_client.get("/companies")
    assert response.status_code == 200
    assert [c["name"] for c in response.json()] == ["alpha", "Zeta"]


async def test_get_other_accounts_company_is_404(
    owner_client: AsyncClient, other_account: Account, db_session: AsyncSession
) -> None:  # AC-01.7
    foreign = await make_company(db_session, other_account, "Foreign")
    for method, kwargs in (
        ("get", {}),
        ("patch", {"json": {"name": "X"}}),
        ("delete", {}),
    ):
        response = await owner_client.request(
            method, f"/companies/{foreign.id}", **kwargs
        )
        assert response.status_code == 404, method
        assert response.json()["code"] == "NOT_FOUND"


async def test_detail_lists_applications_and_contacts(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:
    company = await make_company(db_session, owner_account, "Acme")
    app_row = await make_application(db_session, owner_account, company, "SRE")
    db_session.add(
        Contact(account_id=owner_account.id, company_id=company.id, name="Ann")
    )
    await db_session.commit()
    response = await owner_client.get(f"/companies/{company.id}")
    assert response.status_code == 200
    body = response.json()
    assert [a["id"] for a in body["applications"]] == [app_row.id]
    assert body["applications"][0]["company"] == {"id": company.id, "name": "Acme"}
    assert [c["name"] for c in body["contacts"]] == ["Ann"]


async def test_rename_conflict_and_success(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:
    acme = await make_company(db_session, owner_account, "Acme")
    beta = await make_company(db_session, owner_account, "Beta")
    conflict = await owner_client.patch(f"/companies/{beta.id}", json={"name": "ACME"})
    assert conflict.status_code == 409
    assert conflict.json()["existing_id"] == acme.id
    same = await owner_client.patch(f"/companies/{acme.id}", json={"name": "ACME"})
    assert same.status_code == 200  # renaming to its own name is fine
    assert same.json()["name"] == "ACME"
    ok = await owner_client.patch(
        f"/companies/{beta.id}", json={"website": "https://beta.example", "notes": None}
    )
    assert ok.status_code == 200
    assert ok.json()["website"] == "https://beta.example"


async def test_patch_name_null_rejected(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:
    acme = await make_company(db_session, owner_account, "Acme")
    response = await owner_client.patch(f"/companies/{acme.id}", json={"name": None})
    assert response.status_code == 422


async def test_delete_refused_with_applications(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:  # AC-02.6
    company = await make_company(db_session, owner_account, "Acme")
    await make_application(db_session, owner_account, company)
    response = await owner_client.delete(f"/companies/{company.id}")
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "COMPANY_HAS_APPLICATIONS"
    assert body["detail"] == "Delete or move this company's applications first."


async def test_delete_removes_company_and_contacts(
    owner_client: AsyncClient, owner_account: Account, db_session: AsyncSession
) -> None:
    company = await make_company(db_session, owner_account, "Acme")
    db_session.add(
        Contact(account_id=owner_account.id, company_id=company.id, name="Ann")
    )
    await db_session.commit()
    response = await owner_client.delete(f"/companies/{company.id}")
    assert response.status_code == 204
    assert (await db_session.get(Company, company.id)) is None
    contacts = (await db_session.execute(select(func.count(Contact.id)))).scalar_one()
    assert contacts == 0


async def test_requires_session(client: AsyncClient) -> None:
    assert (await client.get("/companies")).status_code == 401
