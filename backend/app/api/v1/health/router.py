from fastapi import APIRouter, Response, status

from app.api.deps import SessionDep
from app.core.config import APP_VERSION
from app.schemas.health import HealthResponse
from app.services import health as health_service

router = APIRouter(prefix="/health", tags=["health"])


@router.get(
    "",
    response_model=HealthResponse,
    summary="Verifica a saúde da API e do banco de dados",
    responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": HealthResponse}},
)
def health_check(session: SessionDep, response: Response) -> HealthResponse:
    if health_service.check_database(session):
        return HealthResponse(status="ok", database="ok", version=APP_VERSION)
    response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(status="degraded", database="unavailable", version=APP_VERSION)
