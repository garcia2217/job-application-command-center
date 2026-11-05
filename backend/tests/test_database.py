from pathlib import Path

from sqlalchemy import event, text

from app.database import _enable_sqlite_foreign_keys, build_engine


async def test_sqlite_engine_enables_foreign_keys(tmp_path: Path) -> None:
    engine = build_engine(f"sqlite+aiosqlite:///{tmp_path / 'fk.db'}")
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("PRAGMA foreign_keys"))
            assert result.scalar_one() == 1
    finally:
        await engine.dispose()


async def test_postgres_engine_has_no_sqlite_pragma_hook() -> None:
    # Building the engine doesn't connect, so no server is needed.
    engine = build_engine("postgresql+asyncpg://user:pw@localhost/db")
    try:
        assert not event.contains(
            engine.sync_engine, "connect", _enable_sqlite_foreign_keys
        )
    finally:
        await engine.dispose()
