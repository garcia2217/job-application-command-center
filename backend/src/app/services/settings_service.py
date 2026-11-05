from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.models import Account
from app.schemas.settings import SettingsUpdate


class SettingsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def update(self, account: Account, payload: SettingsUpdate) -> Account:
        changes = payload.model_dump(exclude_unset=True)
        if "resume_tex" in changes:
            resume = changes.pop("resume_tex")
            resume = resume if resume.strip() else None
            if resume != account.resume_tex:
                account.resume_tex = resume
                account.resume_updated_at = utcnow()
        for field, value in changes.items():
            setattr(account, field, value)
        await self.db.commit()
        return account
