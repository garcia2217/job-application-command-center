from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.dependencies import CurrentAccountDep, DbDep
from app.schemas.interview_stage import (
    StageCreate,
    StageMove,
    StageResponse,
    StageUpdate,
)
from app.services.stage_service import StageService

router = APIRouter(prefix="/applications/{application_id}/stages", tags=["stages"])


def get_stage_service(db: DbDep) -> StageService:
    return StageService(db)


StageServiceDep = Annotated[StageService, Depends(get_stage_service)]


@router.post("", response_model=StageResponse, status_code=status.HTTP_201_CREATED)
async def create_stage(
    application_id: int,
    payload: StageCreate,
    account: CurrentAccountDep,
    service: StageServiceDep,
):
    return await service.create(account, application_id, payload)


@router.patch("/{stage_id}", response_model=StageResponse)
async def update_stage(
    application_id: int,
    stage_id: int,
    payload: StageUpdate,
    account: CurrentAccountDep,
    service: StageServiceDep,
):
    return await service.update(account, application_id, stage_id, payload)


@router.delete("/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_stage(
    application_id: int,
    stage_id: int,
    account: CurrentAccountDep,
    service: StageServiceDep,
) -> Response:
    await service.delete(account.id, application_id, stage_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{stage_id}/move", response_model=list[StageResponse])
async def move_stage(
    application_id: int,
    stage_id: int,
    payload: StageMove,
    account: CurrentAccountDep,
    service: StageServiceDep,
):
    return await service.move(account.id, application_id, stage_id, payload.direction)
