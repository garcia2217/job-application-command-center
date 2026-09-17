"""Demo account sample data (PRD AC-01.8). Rebuilt on every seed run (R-07).

Written with the ORM directly (not the services) so timestamps can be
back-dated: some applications are deliberately quiet for the daily check.
"""

from datetime import timedelta

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.clock import utcnow
from app.models import (
    Account,
    Application,
    ApplicationStatus,
    Company,
    Contact,
    InterviewStage,
    StageOutcome,
    WorkArrangement,
    application_contacts,
)
from app.services.company_service import normalize_company_name


async def _clear(session: AsyncSession, account_id: int) -> None:
    # Applications first (stages/comparison/links cascade), then companies
    # (contacts cascade). Application.company_id has no ON DELETE, so order matters.
    await session.execute(
        delete(Application).where(Application.account_id == account_id)
    )
    await session.execute(delete(Company).where(Company.account_id == account_id))
    await session.flush()


def _company(account_id: int, name: str, website: str | None = None) -> Company:
    return Company(
        account_id=account_id,
        name=name,
        name_normalized=normalize_company_name(name),
        website=website,
    )


async def reset_demo_data(session: AsyncSession, account: Account) -> dict[str, int]:
    await _clear(session, account.id)
    now = utcnow()
    today = now.date()

    acme = _company(account.id, "Acme Robotics", "https://acme.example")
    nimbus = _company(account.id, "Nimbus Cloud", "https://nimbus.example")
    ledger = _company(account.id, "Ledgerly", "https://ledgerly.example")
    orbit = _company(account.id, "Orbit Health")
    session.add_all([acme, nimbus, ledger, orbit])
    await session.flush()

    def app(
        company: Company,
        role: str,
        status: ApplicationStatus,
        *,
        days_quiet: int,
        applied_days_ago: int | None,
        **fields: object,
    ) -> Application:
        return Application(
            account_id=account.id,
            company_id=company.id,
            role_title=role,
            status=status,
            last_activity_at=now - timedelta(days=days_quiet),
            date_applied=(
                today - timedelta(days=applied_days_ago)
                if applied_days_ago is not None
                else None
            ),
            **fields,
        )

    applications = [
        app(
            acme,
            "Backend Engineer",
            ApplicationStatus.INTERVIEWING,
            days_quiet=1,
            applied_days_ago=20,
            location="Berlin",
            work_arrangement=WorkArrangement.HYBRID,
            salary_min=85000,
            salary_max=105000,
            salary_currency="EUR",
            source="LinkedIn",
            posting_url="https://acme.example/jobs/backend",
            job_description=(
                "We are hiring a Backend Engineer with strong Python and FastAPI "
                "experience. You will design PostgreSQL schemas, build background "
                "jobs, and own our REST API. Docker and CI/CD experience required; "
                "Kubernetes and Redis are a plus."
            ),
        ),
        app(
            nimbus,
            "Platform Engineer",
            ApplicationStatus.APPLIED,
            days_quiet=9,
            applied_days_ago=9,
            work_arrangement=WorkArrangement.REMOTE,
            source="Referral",
            job_description=(
                "Platform Engineer to build internal tooling in Go and Python on "
                "Kubernetes. Terraform, AWS, and observability (Prometheus, Grafana) "
                "experience expected."
            ),
        ),
        app(
            ledger,
            "Full-stack Developer",
            ApplicationStatus.INTERVIEWING,
            days_quiet=2,
            applied_days_ago=15,
            location="Remote",
            work_arrangement=WorkArrangement.REMOTE,
            salary_min=70000,
            salary_max=90000,
            salary_currency="USD",
            job_description=(
                "Full-stack Developer working across a Next.js and TypeScript frontend "
                "and a Python backend. React, Tailwind, SQL, and REST API design "
                "required. GraphQL is nice to have."
            ),
        ),
        app(
            orbit,
            "Software Engineer",
            ApplicationStatus.WISHLIST,
            days_quiet=12,
            applied_days_ago=None,
            notes="Reach out to Dana before applying.",
        ),
        app(
            acme,
            "Data Engineer",
            ApplicationStatus.REJECTED,
            days_quiet=30,
            applied_days_ago=45,
            notes="Rejected after take-home.",
        ),
        app(
            nimbus,
            "Site Reliability Engineer",
            ApplicationStatus.OFFER,
            days_quiet=3,
            applied_days_ago=40,
            salary_min=95000,
            salary_max=95000,
            salary_currency="USD",
        ),
        app(
            ledger,
            "Backend Engineer",
            ApplicationStatus.WITHDRAWN,
            days_quiet=20,
            applied_days_ago=25,
        ),
    ]
    session.add_all(applications)
    await session.flush()
    backend_acme, platform_nimbus, fullstack_ledger = (
        applications[0],
        applications[1],
        applications[2],
    )

    stages = [
        InterviewStage(
            application_id=backend_acme.id,
            name="Recruiter screen",
            position=0,
            outcome=StageOutcome.PASSED,
            scheduled_at=now - timedelta(days=10),
        ),
        InterviewStage(
            application_id=backend_acme.id,
            name="Technical interview",
            position=1,
            outcome=StageOutcome.PASSED,
            scheduled_at=now - timedelta(days=4),
        ),
        InterviewStage(
            application_id=backend_acme.id,
            name="System design",
            position=2,
            outcome=StageOutcome.PENDING,
            scheduled_at=now + timedelta(days=3),
        ),
        InterviewStage(
            application_id=fullstack_ledger.id,
            name="Phone screen",
            position=0,
            outcome=StageOutcome.PASSED,
            scheduled_at=now - timedelta(days=6),
        ),
        InterviewStage(
            application_id=fullstack_ledger.id,
            name="Pair programming",
            position=1,
            outcome=StageOutcome.PENDING,
            scheduled_at=now + timedelta(days=5),
        ),
    ]
    session.add_all(stages)

    contacts = [
        Contact(
            account_id=account.id,
            company_id=acme.id,
            name="Priya Nair",
            title="Technical Recruiter",
            email="priya@acme.example",
        ),
        Contact(
            account_id=account.id,
            company_id=acme.id,
            name="Tom Weber",
            title="Engineering Manager",
            linkedin_url="https://www.linkedin.com/in/tom-weber-example",
        ),
        Contact(
            account_id=account.id,
            company_id=nimbus.id,
            name="Lena Fischer",
            title="Talent Partner",
            email="lena@nimbus.example",
        ),
        Contact(
            account_id=account.id,
            company_id=orbit.id,
            name="Dana Ortiz",
            title="Head of Engineering",
        ),
    ]
    session.add_all(contacts)
    await session.flush()

    links = [
        (backend_acme, contacts[0]),
        (backend_acme, contacts[1]),
        (platform_nimbus, contacts[2]),
    ]
    await session.execute(
        application_contacts.insert(),
        [{"application_id": a.id, "contact_id": c.id} for a, c in links],
    )

    return {
        "companies": 4,
        "applications": len(applications),
        "stages": len(stages),
        "contacts": len(contacts),
        "links": len(links),
    }
