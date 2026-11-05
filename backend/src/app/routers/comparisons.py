from typing import Annotated

from fastapi import APIRouter, Depends

from app.dependencies import CurrentAccountDep, DbDep
from app.schemas.comparison import ComparisonStateResponse
from app.schemas.problem import problem_responses
from app.services.comparison_service import ComparisonService

router = APIRouter(prefix="/applications", tags=["applications"])


def get_comparison_service(db: DbDep) -> ComparisonService:
    return ComparisonService(db)


ComparisonServiceDep = Annotated[ComparisonService, Depends(get_comparison_service)]


@router.get(
    "/{application_id}/comparison",
    response_model=ComparisonStateResponse,
    responses=problem_responses(401, 404),
)
async def get_comparison(
    application_id: int, account: CurrentAccountDep, service: ComparisonServiceDep
):
    """The saved comparison (if any) and why Compare is disabled (if it is)."""
    return await service.state(account, application_id)


@router.post(
    "/{application_id}/comparison",
    response_model=ComparisonStateResponse,
    responses=problem_responses(401, 404, 409),
)
async def run_comparison(
    application_id: int, account: CurrentAccountDep, service: ComparisonServiceDep
):
    """Run the comparison now, replacing any saved one (AC-06.7)."""
    return await service.run(account, application_id)
