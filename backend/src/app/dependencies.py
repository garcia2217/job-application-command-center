from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Cookie, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.errors import AuthenticationError
from app.models import Account
from app.services.auth_service import AuthService


async def get_db(request: Request) -> AsyncGenerator[AsyncSession]:
    async with request.app.state.sessionmaker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


DbDep = Annotated[AsyncSession, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_auth_service(db: DbDep, settings: SettingsDep) -> AuthService:
    return AuthService(db, settings)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


async def get_current_account(
    service: AuthServiceDep,
    session: Annotated[str | None, Cookie()] = None,
) -> Account:
    if not session:
        raise AuthenticationError("Not signed in")
    account = await service.get_account_for_token(session)
    if account is None:
        raise AuthenticationError("Session is invalid or expired")
    return account


CurrentAccountDep = Annotated[Account, Depends(get_current_account)]
