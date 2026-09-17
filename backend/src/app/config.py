from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Job Application Command Center API"
    app_version: str = "0.1.0"

    database_url: str
    auto_create_tables: bool = False  # tests/dev only; production uses Alembic

    session_ttl_days: int = 7
    lockout_max_attempts: int = 5
    lockout_window_minutes: int = 15
    lockout_duration_minutes: int = 15


@lru_cache
def get_settings() -> Settings:
    return Settings()
