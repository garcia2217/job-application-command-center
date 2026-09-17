from typing import Annotated

from fastapi import APIRouter, Cookie, Response, status

from app.dependencies import AuthServiceDep, CurrentAccountDep
from app.schemas.auth import AccountResponse, LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, service: AuthServiceDep):
    token, expires_at = await service.login(payload.email, payload.password)
    return LoginResponse(token=token, expires_at=expires_at)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    service: AuthServiceDep,
    _account: CurrentAccountDep,
    session: Annotated[str | None, Cookie()] = None,
) -> Response:
    if session:
        await service.logout(session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=AccountResponse)
async def me(account: CurrentAccountDep):
    return account
