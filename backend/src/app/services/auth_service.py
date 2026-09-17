from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.config import Settings
from app.errors import AuthenticationError, ErrorCode
from app.models import Account, Session
from app.security import (
    DUMMY_HASH,
    generate_session_token,
    hash_session_token,
    verify_password,
)

LOCKED_DETAIL = "Too many attempts. Try again in 15 minutes."
INVALID_DETAIL = "Email or password is incorrect"


class AuthService:
    def __init__(self, db: AsyncSession, settings: Settings) -> None:
        self.db = db
        self.settings = settings

    async def login(self, email: str, password: str) -> tuple[str, datetime]:
        result = await self.db.execute(select(Account).where(Account.email == email))
        account = result.scalar_one_or_none()

        now = utcnow()
        if account is not None and account.locked_until is not None:
            if now < self._aware(account.locked_until):
                raise AuthenticationError(LOCKED_DETAIL, code=ErrorCode.ACCOUNT_LOCKED)
            account.locked_until = None

        # Verify even for unknown emails: comparable timing either way.
        valid = await verify_password(
            password, account.hashed_password if account else DUMMY_HASH
        )
        if account is None:
            raise AuthenticationError(
                INVALID_DETAIL, code=ErrorCode.INVALID_CREDENTIALS
            )
        if not valid:
            await self._record_failure(account, now)
            raise AuthenticationError(
                INVALID_DETAIL, code=ErrorCode.INVALID_CREDENTIALS
            )

        account.failed_login_count = 0
        account.lockout_window_started_at = None
        raw_token = generate_session_token()
        expires_at = now + timedelta(days=self.settings.session_ttl_days)
        self.db.add(
            Session(
                account_id=account.id,
                token_hash=hash_session_token(raw_token),
                expires_at=expires_at,
            )
        )
        await self.db.commit()
        return raw_token, expires_at

    async def logout(self, raw_token: str) -> None:
        await self.db.execute(
            delete(Session).where(Session.token_hash == hash_session_token(raw_token))
        )
        await self.db.commit()

    async def get_account_for_token(self, raw_token: str) -> Account | None:
        result = await self.db.execute(
            select(Session).where(Session.token_hash == hash_session_token(raw_token))
        )
        session = result.scalar_one_or_none()
        if session is None:
            return None
        if utcnow() >= self._aware(session.expires_at):
            await self.db.delete(session)
            await self.db.commit()
            return None
        return await self.db.get(Account, session.account_id)

    async def _record_failure(self, account: Account, now: datetime) -> None:
        window = timedelta(minutes=self.settings.lockout_window_minutes)
        started = account.lockout_window_started_at
        if started is None or now - self._aware(started) > window:
            account.lockout_window_started_at = now
            account.failed_login_count = 1
        else:
            account.failed_login_count += 1

        if account.failed_login_count >= self.settings.lockout_max_attempts:
            account.locked_until = now + timedelta(
                minutes=self.settings.lockout_duration_minutes
            )
            account.failed_login_count = 0
            account.lockout_window_started_at = None
        await self.db.commit()

    @staticmethod
    def _aware(value: datetime) -> datetime:
        # SQLite returns naive datetimes even for timezone=True columns.
        return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
