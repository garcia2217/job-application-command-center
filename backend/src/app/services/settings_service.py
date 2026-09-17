from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account
from app.schemas.settings import SettingsUpdate


class SettingsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def update(self, account: Account, payload: SettingsUpdate) -> Account:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(account, field, value)
        await self.db.commit()
        return account
