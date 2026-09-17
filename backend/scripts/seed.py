"""Create or update the owner and demo accounts (PRD F-01: exactly two accounts).

Idempotent: re-running updates passwords in place. Demo sample data is seeded
in milestone 2 once application/contact semantics exist.

Usage: uv run python scripts/seed.py  (reads .env)
"""

import asyncio
import os
import sys

from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import build_engine, build_sessionmaker
from app.models import Account
from app.security import hash_password


async def upsert_account(
    session: AsyncSession, email: str, password: str, *, is_demo: bool
) -> str:
    result = await session.execute(select(Account).where(Account.email == email))
    account = result.scalar_one_or_none()
    hashed = await hash_password(password)
    if account is None:
        session.add(Account(email=email, hashed_password=hashed, is_demo=is_demo))
        return f"created {email}"
    account.hashed_password = hashed
    account.is_demo = is_demo
    return f"updated {email}"


async def main() -> None:
    # Seed-time inputs, not app config, so they're read directly from os.environ
    # (this is the one sanctioned os.environ site) rather than added to Settings.
    load_dotenv()

    required = ["OWNER_EMAIL", "OWNER_PASSWORD", "DEMO_EMAIL", "DEMO_PASSWORD"]
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        sys.exit(f"Missing env vars: {', '.join(missing)} (see .env.example)")

    engine = build_engine(get_settings().database_url)
    async with build_sessionmaker(engine)() as session:
        print(
            await upsert_account(
                session,
                os.environ["OWNER_EMAIL"],
                os.environ["OWNER_PASSWORD"],
                is_demo=False,
            )
        )
        print(
            await upsert_account(
                session,
                os.environ["DEMO_EMAIL"],
                os.environ["DEMO_PASSWORD"],
                is_demo=True,
            )
        )
        await session.commit()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
