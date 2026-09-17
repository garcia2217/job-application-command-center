from app.schemas.application import ApplicationSummary
from app.schemas.company import CompanyResponse
from app.schemas.contact import ContactResponse


class CompanyDetailResponse(CompanyResponse):
    applications: list[ApplicationSummary]
    contacts: list[ContactResponse]
