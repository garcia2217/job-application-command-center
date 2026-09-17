from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import Settings, get_settings
from app.database import Base, build_engine, build_sessionmaker
from app.error_handlers import register_exception_handlers
from app.routers import auth


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = build_engine(settings.database_url)
        app.state.engine = engine
        app.state.sessionmaker = build_sessionmaker(engine)
        if settings.auto_create_tables:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        yield
        await engine.dispose()

    app = FastAPI(
        title=settings.app_name, version=settings.app_version, lifespan=lifespan
    )
    register_exception_handlers(app)
    app.include_router(auth.router)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
