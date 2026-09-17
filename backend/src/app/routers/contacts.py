from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.dependencies import CurrentAccountDep, DbDep
from app.schemas.contact import ContactCreate, ContactResponse, ContactUpdate
from app.services.contact_service import ContactService

router = APIRouter(prefix="/contacts", tags=["contacts"])
links_router = APIRouter(
    prefix="/applications/{application_id}/contacts", tags=["contacts"]
)


def get_contact_service(db: DbDep) -> ContactService:
    return ContactService(db)


ContactServiceDep = Annotated[ContactService, Depends(get_contact_service)]


@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
async def create_contact(
    payload: ContactCreate, account: CurrentAccountDep, service: ContactServiceDep
):
    return await service.create(account.id, payload)


@router.get("/{contact_id}", response_model=ContactResponse)
async def get_contact(
    contact_id: int, account: CurrentAccountDep, service: ContactServiceDep
):
    return await service.get(account.id, contact_id)


@router.patch("/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: int,
    payload: ContactUpdate,
    account: CurrentAccountDep,
    service: ContactServiceDep,
):
    return await service.update(account.id, contact_id, payload)


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: int, account: CurrentAccountDep, service: ContactServiceDep
) -> Response:
    await service.delete(account.id, contact_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@links_router.put("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def link_contact(
    application_id: int,
    contact_id: int,
    account: CurrentAccountDep,
    service: ContactServiceDep,
) -> Response:
    await service.link(account.id, application_id, contact_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@links_router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_contact(
    application_id: int,
    contact_id: int,
    account: CurrentAccountDep,
    service: ContactServiceDep,
) -> Response:
    await service.unlink(account.id, application_id, contact_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
