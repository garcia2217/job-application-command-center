from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.clock import utcnow
from app.errors import ConflictError, ErrorCode, NotFoundError, field_error
from app.models import Account, Application, ApplicationStatus
from app.schemas.application import (
    ApplicationCreate,
    ApplicationSort,
    ApplicationUpdate,
    SortOrder,
)
from app.services.activity import record_activity
from app.services.company_service import CompanyService

_SORT_COLUMNS = {
    "last_activity": Application.last_activity_at,
    "date_applied": Application.date_applied,
}


class ApplicationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.companies = CompanyService(db)

    async def list(
        self,
        account_id: int,
        *,
        status: ApplicationStatus | None = None,
        sort: ApplicationSort = "last_activity",
        order: SortOrder = "desc",
    ) -> list[Application]:
        column = _SORT_COLUMNS[sort]
        primary = column.asc() if order == "asc" else column.desc()
        query = (
            select(Application)
            .where(Application.account_id == account_id)
            .options(selectinload(Application.company))
            .order_by(primary.nulls_last(), Application.id.desc())
        )
        if status is not None:
            query = query.where(Application.status == status)
        result = await self.db.execute(query)
        return list(result.scalars())

    async def get(self, account_id: int, application_id: int) -> Application:
        result = await self.db.execute(
            select(Application).where(
                Application.id == application_id,
                Application.account_id == account_id,
            )
        )
        application = result.scalar_one_or_none()
        if application is None:
            raise NotFoundError("Application not found")
        return application

    async def get_detail(self, account_id: int, application_id: int) -> Application:
        result = await self.db.execute(
            select(Application)
            .where(
                Application.id == application_id,
                Application.account_id == account_id,
            )
            .options(
                selectinload(Application.company),
                selectinload(Application.stages),
                selectinload(Application.contacts),
            )
        )
        application = result.scalar_one_or_none()
        if application is None:
            raise NotFoundError("Application not found")
        return application

    async def create(self, account: Account, payload: ApplicationCreate) -> Application:
        if payload.company is not None:
            company = await self.companies.add(account.id, payload.company)
        else:
            company = await self.companies.get(account.id, payload.company_id)  # type: ignore[arg-type]

        if not payload.confirm_duplicate:
            await self._ensure_not_duplicate(account.id, company.id, payload.role_title)

        fields = payload.model_dump(
            exclude={"company", "company_id", "confirm_duplicate"}
        )
        application = Application(
            account_id=account.id,
            company_id=company.id,
            last_activity_at=utcnow(),
            **fields,
        )
        self._validate_rules(application, account)
        self.db.add(application)
        await self.db.commit()
        return await self.get_detail(account.id, application.id)

    async def update(
        self, account: Account, application_id: int, payload: ApplicationUpdate
    ) -> Application:
        application = await self.get(account.id, application_id)
        changes = payload.model_dump(exclude_unset=True)
        if "company_id" in changes:
            await self.companies.get(account.id, changes["company_id"])
        for field, value in changes.items():
            setattr(application, field, value)
        self._validate_rules(application, account)
        record_activity(application)
        await self.db.commit()
        return await self.get_detail(account.id, application.id)

    async def delete(self, account_id: int, application_id: int) -> None:
        application = await self.get(account_id, application_id)
        await self.db.delete(application)  # stages/comparison/links: ON DELETE CASCADE
        await self.db.commit()

    async def _ensure_not_duplicate(
        self, account_id: int, company_id: int, role_title: str
    ) -> None:
        result = await self.db.execute(
            select(Application)
            .where(
                Application.account_id == account_id,
                Application.company_id == company_id,
                func.lower(Application.role_title) == role_title.lower(),
            )
            .order_by(Application.id)
            .limit(1)
        )
        existing = result.scalar_one_or_none()
        if existing is not None:
            raise ConflictError(
                f'An application for "{existing.role_title}" at this company already exists',
                code=ErrorCode.DUPLICATE_APPLICATION,
                extra={"existing_id": existing.id},
            )

    @staticmethod
    def _validate_rules(application: Application, account: Account) -> None:
        """Cross-field rules shared by create and update (PRD F-02 edge cases)."""
        has_salary = (
            application.salary_min is not None or application.salary_max is not None
        )
        if has_salary and application.salary_currency is None:
            raise field_error(
                "salary_currency", "A currency code is required with a salary"
            )
        if (
            application.salary_min is not None
            and application.salary_max is not None
            and application.salary_min > application.salary_max
        ):
            raise field_error(
                "salary_max", "Must be greater than or equal to salary_min"
            )
        if application.date_applied is not None:
            today = datetime.now(ZoneInfo(account.timezone)).date()
            if application.date_applied > today:
                raise field_error("date_applied", "Cannot be in the future")
