from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import Settings, get_settings
from app.database import Base, build_engine, build_sessionmaker
from app.error_handlers import register_exception_handlers
from app.integrations import build_email_sender, build_rate_limiter
from app.routers import (
    applications,
    auth,
    companies,
    comparisons,
    contacts,
    jobs,
    stages,
)
from app.routers import settings as settings_router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = build_engine(settings.database_url)
        app.state.engine = engine
        app.state.sessionmaker = build_sessionmaker(engine)
        app.state.email_sender = build_email_sender(settings)
        app.state.rate_limiter = build_rate_limiter(settings)
        if settings.auto_create_tables:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        yield
        await app.state.rate_limiter.redis.close()
        await engine.dispose()

    app = FastAPI(
        title=settings.app_name, version=settings.app_version, lifespan=lifespan
    )
    register_exception_handlers(app)
    app.include_router(auth.router)
    app.include_router(settings_router.router)
    app.include_router(companies.router)
    app.include_router(applications.router)
    app.include_router(comparisons.router)
    app.include_router(stages.router)
    app.include_router(stages.upcoming_router)
    app.include_router(contacts.router)
    app.include_router(contacts.links_router)
    app.include_router(jobs.router)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
