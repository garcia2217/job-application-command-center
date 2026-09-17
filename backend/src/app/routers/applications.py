from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.dependencies import CurrentAccountDep, DbDep
from app.models.enums import ApplicationStatus
from app.schemas.application import (
    ApplicationCreate,
    ApplicationDetailResponse,
    ApplicationSort,
    ApplicationSummary,
    ApplicationUpdate,
    SortOrder,
)
from app.services.application_service import ApplicationService

router = APIRouter(prefix="/applications", tags=["applications"])


def get_application_service(db: DbDep) -> ApplicationService:
    return ApplicationService(db)


ApplicationServiceDep = Annotated[ApplicationService, Depends(get_application_service)]


@router.get("", response_model=list[ApplicationSummary])
async def list_applications(
    account: CurrentAccountDep,
    service: ApplicationServiceDep,
    status_filter: Annotated[ApplicationStatus | None, Query(alias="status")] = None,
    sort: ApplicationSort = "last_activity",
    order: SortOrder = "desc",
):
    return await service.list(account.id, status=status_filter, sort=sort, order=order)


@router.post(
    "", response_model=ApplicationDetailResponse, status_code=status.HTTP_201_CREATED
)
async def create_application(
    payload: ApplicationCreate,
    account: CurrentAccountDep,
    service: ApplicationServiceDep,
):
    return await service.create(account, payload)


@router.get("/{application_id}", response_model=ApplicationDetailResponse)
async def get_application(
    application_id: int, account: CurrentAccountDep, service: ApplicationServiceDep
):
    return await service.get_detail(account.id, application_id)


@router.patch("/{application_id}", response_model=ApplicationDetailResponse)
async def update_application(
    application_id: int,
    payload: ApplicationUpdate,
    account: CurrentAccountDep,
    service: ApplicationServiceDep,
):
    return await service.update(account, application_id, payload)


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_application(
    application_id: int, account: CurrentAccountDep, service: ApplicationServiceDep
) -> Response:
    await service.delete(account.id, application_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
