from datetime import timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

import app.services.auth_service as auth_module
from app.clock import utcnow
from app.config import get_settings
from app.errors import AuthenticationError, ErrorCode
from app.models import Account
from app.services.auth_service import AuthService


@pytest.fixture
def service(db_session: AsyncSession) -> AuthService:
    return AuthService(db_session, get_settings())


async def test_login_returns_token_and_expiry(
    service: AuthService, owner_account: Account
) -> None:
    token, expires_at = await service.login("owner@example.com", "owner-password-1")
    assert token
    assert expires_at - utcnow() > timedelta(days=6)
    account = await service.get_account_for_token(token)
    assert account is not None and account.id == owner_account.id


async def test_wrong_password_is_invalid_credentials(
    service: AuthService, owner_account: Account
) -> None:
    with pytest.raises(AuthenticationError) as exc:
        await service.login("owner@example.com", "nope")
    assert exc.value.code is ErrorCode.INVALID_CREDENTIALS


async def test_unknown_email_same_error(service: AuthService) -> None:
    with pytest.raises(AuthenticationError) as exc:
        await service.login("ghost@example.com", "whatever")
    assert exc.value.code is ErrorCode.INVALID_CREDENTIALS


async def test_lockout_after_5_failures_then_recovery(
    service: AuthService, owner_account: Account, monkeypatch: pytest.MonkeyPatch
) -> None:
    for _ in range(5):
        with pytest.raises(AuthenticationError):
            await service.login("owner@example.com", "nope")

    # AC-01.3: even the correct password is refused while locked.
    with pytest.raises(AuthenticationError) as exc:
        await service.login("owner@example.com", "owner-password-1")
    assert exc.value.code is ErrorCode.ACCOUNT_LOCKED

    # 15 minutes later the correct password succeeds.
    later = utcnow() + timedelta(minutes=15, seconds=1)
    monkeypatch.setattr(auth_module, "utcnow", lambda: later)
    token, _ = await service.login("owner@example.com", "owner-password-1")
    assert token


async def test_failures_outside_window_do_not_lock(
    service: AuthService, owner_account: Account, monkeypatch: pytest.MonkeyPatch
) -> None:
    for _ in range(4):
        with pytest.raises(AuthenticationError):
            await service.login("owner@example.com", "nope")

    # 5th failure lands after the 15-minute window: it starts a new window.
    later = utcnow() + timedelta(minutes=16)
    monkeypatch.setattr(auth_module, "utcnow", lambda: later)
    with pytest.raises(AuthenticationError) as exc:
        await service.login("owner@example.com", "nope")
    assert exc.value.code is ErrorCode.INVALID_CREDENTIALS  # not locked

    token, _ = await service.login("owner@example.com", "owner-password-1")
    assert token  # success also resets the counter


async def test_wrong_password_after_lock_expiry_starts_new_window(
    service: AuthService, owner_account: Account, monkeypatch: pytest.MonkeyPatch
) -> None:
    for _ in range(5):
        with pytest.raises(AuthenticationError):
            await service.login("owner@example.com", "nope")

    # Lock has expired; a wrong password clears the stale lock instead of
    # instantly re-locking, and starts a brand new failure window.
    later = utcnow() + timedelta(minutes=15, seconds=1)
    monkeypatch.setattr(auth_module, "utcnow", lambda: later)

    for _ in range(5):
        with pytest.raises(AuthenticationError) as exc:
            await service.login("owner@example.com", "nope")
        assert exc.value.code is ErrorCode.INVALID_CREDENTIALS

    # The 5th failure in the new window re-locks; the 6th call sees it.
    with pytest.raises(AuthenticationError) as exc:
        await service.login("owner@example.com", "owner-password-1")
    assert exc.value.code is ErrorCode.ACCOUNT_LOCKED


async def test_failure_at_exact_window_boundary_counts_as_inside(
    service: AuthService, owner_account: Account, monkeypatch: pytest.MonkeyPatch
) -> None:
    start = utcnow()
    monkeypatch.setattr(auth_module, "utcnow", lambda: start)
    for _ in range(4):
        with pytest.raises(AuthenticationError):
            await service.login("owner@example.com", "nope")

    # Exactly 15:00 after the window started: strict `>` means this still
    # counts as inside the window, so the 5th failure locks the account.
    boundary = start + timedelta(minutes=15)
    monkeypatch.setattr(auth_module, "utcnow", lambda: boundary)
    with pytest.raises(AuthenticationError):
        await service.login("owner@example.com", "nope")

    with pytest.raises(AuthenticationError) as exc:
        await service.login("owner@example.com", "owner-password-1")
    assert exc.value.code is ErrorCode.ACCOUNT_LOCKED


async def test_expired_session_is_rejected(
    service: AuthService, owner_account: Account, monkeypatch: pytest.MonkeyPatch
) -> None:
    token, _ = await service.login("owner@example.com", "owner-password-1")
    later = utcnow() + timedelta(days=7, seconds=1)
    monkeypatch.setattr(auth_module, "utcnow", lambda: later)
    assert await service.get_account_for_token(token) is None


async def test_logout_revokes_immediately(
    service: AuthService, owner_account: Account
) -> None:
    token, _ = await service.login("owner@example.com", "owner-password-1")
    await service.logout(token)
    assert await service.get_account_for_token(token) is None
