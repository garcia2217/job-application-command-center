from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.dependencies import CurrentAccountDep, DbDep
from app.schemas.company import CompanyCreate, CompanyResponse, CompanyUpdate
from app.schemas.company_detail import CompanyDetailResponse
from app.services.company_service import CompanyService

router = APIRouter(prefix="/companies", tags=["companies"])


def get_company_service(db: DbDep) -> CompanyService:
    return CompanyService(db)


CompanyServiceDep = Annotated[CompanyService, Depends(get_company_service)]


@router.get("", response_model=list[CompanyResponse])
async def list_companies(account: CurrentAccountDep, service: CompanyServiceDep):
    return await service.list(account.id)


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    payload: CompanyCreate, account: CurrentAccountDep, service: CompanyServiceDep
):
    return await service.create(account.id, payload)


@router.get("/{company_id}", response_model=CompanyDetailResponse)
async def get_company(
    company_id: int, account: CurrentAccountDep, service: CompanyServiceDep
):
    return await service.get_detail(account.id, company_id)


@router.patch("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: int,
    payload: CompanyUpdate,
    account: CurrentAccountDep,
    service: CompanyServiceDep,
):
    return await service.update(account.id, company_id, payload)


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company(
    company_id: int, account: CurrentAccountDep, service: CompanyServiceDep
) -> Response:
    await service.delete(account.id, company_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
