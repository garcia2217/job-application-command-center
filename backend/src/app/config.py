from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "Job Application Command Center API"
    app_version: str = "0.1.0"

    database_url: str
    auto_create_tables: bool = False  # tests/dev only; production uses Alembic

    session_ttl_days: int = 7
    lockout_max_attempts: int = 5
    lockout_window_minutes: int = 15
    lockout_duration_minutes: int = 15

    # Milestone 3 — jobs, email, rate limit. Placeholders keep the app bootable
    # without secrets (stub-and-defer); real values come from MANUAL_STEPS.md.
    public_base_url: str = "http://localhost:8000"  # this API, as QStash reaches it
    app_base_url: str = "http://localhost:3000"  # the frontend, for links in emails
    qstash_token: str = "REPLACE_ME"
    qstash_current_signing_key: str = "REPLACE_ME"
    qstash_next_signing_key: str = "REPLACE_ME"
    resend_api_key: str = "REPLACE_ME"
    email_from: str = "Job Application Command Center <onboarding@resend.dev>"
    upstash_redis_rest_url: str = "REPLACE_ME"
    upstash_redis_rest_token: str = "REPLACE_ME"
    email_daily_limit: int = 5


@lru_cache
def get_settings() -> Settings:
    return Settings()
