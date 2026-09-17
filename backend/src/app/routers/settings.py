from typing import Annotated

from fastapi import APIRouter, Depends

from app.dependencies import CurrentAccountDep, DbDep
from app.schemas.auth import AccountResponse
from app.schemas.settings import SettingsUpdate
from app.services.settings_service import SettingsService

router = APIRouter(prefix="/settings", tags=["settings"])


def get_settings_service(db: DbDep) -> SettingsService:
    return SettingsService(db)


SettingsServiceDep = Annotated[SettingsService, Depends(get_settings_service)]


@router.patch("", response_model=AccountResponse)
async def update_settings(
    payload: SettingsUpdate, account: CurrentAccountDep, service: SettingsServiceDep
):
    return await service.update(account, payload)
