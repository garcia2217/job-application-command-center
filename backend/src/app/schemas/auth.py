from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class LoginResponse(BaseModel):
    token: str
    expires_at: datetime


class AccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    is_demo: bool
    quiet_threshold_days: int
    timezone: str
    # Read for has_resume only; never serialised (the resume stays off /auth/me).
    resume_tex: str | None = Field(default=None, exclude=True)

    @computed_field
    @property
    def has_resume(self) -> bool:
        return self.resume_tex is not None
