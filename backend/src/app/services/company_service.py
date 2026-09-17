from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import ConflictError, ErrorCode, NotFoundError
from app.models import Application, Company
from app.schemas.company import CompanyCreate, CompanyUpdate

HAS_APPLICATIONS_DETAIL = "Delete or move this company's applications first."


def normalize_company_name(name: str) -> str:
    # PRD F-02: unique per account ignoring case and surrounding whitespace.
    return name.strip().casefold()


class CompanyService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list(self, account_id: int) -> list[Company]:
        result = await self.db.execute(
            select(Company)
            .where(Company.account_id == account_id)
            .order_by(Company.name_normalized, Company.id)
        )
        return list(result.scalars())

    async def get(self, account_id: int, company_id: int) -> Company:
        result = await self.db.execute(
            select(Company).where(
                Company.id == company_id, Company.account_id == account_id
            )
        )
        company = result.scalar_one_or_none()
        if company is None:
            raise NotFoundError("Company not found")
        return company

    async def get_detail(self, account_id: int, company_id: int) -> Company:
        result = await self.db.execute(
            select(Company)
            .where(Company.id == company_id, Company.account_id == account_id)
            .options(
                selectinload(Company.applications).selectinload(Application.company),
                selectinload(Company.contacts),
            )
        )
        company = result.scalar_one_or_none()
        if company is None:
            raise NotFoundError("Company not found")
        return company

    async def add(self, account_id: int, payload: CompanyCreate) -> Company:
        """Add + flush without committing, so callers can extend the transaction."""
        normalized = normalize_company_name(payload.name)
        await self._ensure_name_free(account_id, normalized)
        company = Company(
            account_id=account_id,
            name=payload.name,
            name_normalized=normalized,
            website=payload.website,
            notes=payload.notes,
        )
        self.db.add(company)
        await self._flush_or_conflict(account_id, normalized)
        return company

    async def create(self, account_id: int, payload: CompanyCreate) -> Company:
        company = await self.add(account_id, payload)
        await self.db.commit()
        await self.db.refresh(company)
        return company

    async def update(
        self, account_id: int, company_id: int, payload: CompanyUpdate
    ) -> Company:
        company = await self.get(account_id, company_id)
        changes = payload.model_dump(exclude_unset=True)
        if "name" in changes:
            normalized = normalize_company_name(changes["name"])
            if normalized != company.name_normalized:
                await self._ensure_name_free(account_id, normalized)
            company.name_normalized = normalized
        for field, value in changes.items():
            setattr(company, field, value)
        await self._flush_or_conflict(account_id, company.name_normalized)
        await self.db.commit()
        await self.db.refresh(company)
        return company

    async def delete(self, account_id: int, company_id: int) -> None:
        company = await self.get(account_id, company_id)
        count = (
            await self.db.execute(
                select(func.count(Application.id)).where(
                    Application.company_id == company.id
                )
            )
        ).scalar_one()
        if count:
            raise ConflictError(
                HAS_APPLICATIONS_DETAIL, code=ErrorCode.COMPANY_HAS_APPLICATIONS
            )
        await self.db.delete(company)  # contacts go via ON DELETE CASCADE
        await self.db.commit()

    async def _find_by_normalized(
        self, account_id: int, normalized: str
    ) -> Company | None:
        result = await self.db.execute(
            select(Company).where(
                Company.account_id == account_id,
                Company.name_normalized == normalized,
            )
        )
        return result.scalar_one_or_none()

    async def _ensure_name_free(self, account_id: int, normalized: str) -> None:
        existing = await self._find_by_normalized(account_id, normalized)
        if existing is not None:
            raise ConflictError(
                f'Company "{existing.name}" already exists',
                code=ErrorCode.COMPANY_NAME_TAKEN,
                extra={"existing_id": existing.id},
            )

    async def _flush_or_conflict(self, account_id: int, normalized: str) -> None:
        # The unique constraint is the race-safe check; the pre-check above only
        # exists to return the existing id.
        try:
            await self.db.flush()
        except IntegrityError as exc:
            await self.db.rollback()
            existing = await self._find_by_normalized(account_id, normalized)
            raise ConflictError(
                "Company name already exists",
                code=ErrorCode.COMPANY_NAME_TAKEN,
                extra={"existing_id": existing.id} if existing else None,
            ) from exc
