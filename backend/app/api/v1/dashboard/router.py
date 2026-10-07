"""Rotas do dashboard (§32). O recorte por perfil é decidido no serviço."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, SessionDep
from app.schemas.dashboard import DashboardMetrics, DashboardSLA, DashboardTickets
from app.services.dashboard import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

Days = Annotated[int, Query(ge=1, le=90, description="Período em dias")]


def get_dashboard_service(session: SessionDep) -> DashboardService:
    return DashboardService(session)


ServiceDep = Annotated[DashboardService, Depends(get_dashboard_service)]


@router.get("/metrics", response_model=DashboardMetrics, summary="Indicadores do período")
def metrics(user: CurrentUser, service: ServiceDep, days: Days = 30) -> DashboardMetrics:
    return service.metrics(user, days=days)


@router.get(
    "/tickets",
    response_model=DashboardTickets,
    summary="Distribuições, chamados recentes e atividade",
)
def tickets(user: CurrentUser, service: ServiceDep, days: Days = 30) -> DashboardTickets:
    return service.tickets(user, days=days)


@router.get("/sla", response_model=DashboardSLA, summary="Evolução semanal do cumprimento de SLA")
def sla_evolution(
    user: CurrentUser,
    service: ServiceDep,
    weeks: Annotated[int, Query(ge=1, le=26)] = 8,
) -> DashboardSLA:
    return service.sla_evolution(user, weeks=weeks)
