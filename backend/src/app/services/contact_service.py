from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import ConflictError, ErrorCode, NotFoundError
from app.models import Application, Contact, application_contacts
from app.schemas.contact import ContactCreate, ContactUpdate
from app.services.application_service import ApplicationService
from app.services.company_service import CompanyService

MISMATCH_DETAIL = "Contact belongs to a different company than the application"


class ContactService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.companies = CompanyService(db)
        self.applications = ApplicationService(db)

    async def get(self, account_id: int, contact_id: int) -> Contact:
        result = await self.db.execute(
            select(Contact).where(
                Contact.id == contact_id, Contact.account_id == account_id
            )
        )
        contact = result.scalar_one_or_none()
        if contact is None:
            raise NotFoundError("Contact not found")
        return contact

    async def create(self, account_id: int, payload: ContactCreate) -> Contact:
        company = await self.companies.get(account_id, payload.company_id)
        contact = Contact(
            account_id=account_id,
            company_id=company.id,
            **payload.model_dump(exclude={"company_id"}),
        )
        self.db.add(contact)
        await self.db.commit()
        await self.db.refresh(contact)
        return contact

    async def update(
        self, account_id: int, contact_id: int, payload: ContactUpdate
    ) -> Contact:
        contact = await self.get(account_id, contact_id)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(contact, field, value)
        await self.db.commit()  # contact edits are not application activity (F-04)
        await self.db.refresh(contact)
        return contact

    async def delete(self, account_id: int, contact_id: int) -> None:
        contact = await self.get(account_id, contact_id)
        # expire_on_commit=False: applications already loaded in this session
        # would keep a stale `contacts` collection unless invalidated below.
        linked = (
            (
                await self.db.execute(
                    select(Application)
                    .join(application_contacts)
                    .where(application_contacts.c.contact_id == contact.id)
                )
            )
            .scalars()
            .all()
        )
        await self.db.delete(contact)  # application_contacts rows: ON DELETE CASCADE
        await self.db.commit()
        for application in linked:
            self.db.expire(application, ["contacts"])

    async def link(self, account_id: int, application_id: int, contact_id: int) -> None:
        application = await self.applications.get_detail(account_id, application_id)
        contact = await self.get(account_id, contact_id)
        if contact.company_id != application.company_id:
            raise ConflictError(
                MISMATCH_DETAIL, code=ErrorCode.CONTACT_COMPANY_MISMATCH
            )
        if contact not in application.contacts:
            application.contacts.append(contact)
            await self.db.commit()

    async def unlink(
        self, account_id: int, application_id: int, contact_id: int
    ) -> None:
        application = await self.applications.get_detail(account_id, application_id)
        contact = await self.get(account_id, contact_id)
        if contact in application.contacts:
            application.contacts.remove(contact)
            await self.db.commit()
