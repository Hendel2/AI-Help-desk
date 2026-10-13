"""Schemas do dashboard (§39–41)."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

from app.models.enums import (
    AIActionType,
    RoleName,
    TicketHistoryAction,
    TicketPriority,
    TicketStatus,
)
from app.schemas.ticket import CategorySummary, UserSummary


class DashboardMetrics(BaseModel):
    """Indicadores do período. Campos de gestão vêm `None` para quem não é ADMIN."""

    scope: RoleName
    period_days: int
    open: int
    """Chamados em aberto (qualquer status anterior a Resolvido)."""
    in_progress: int
    waiting_user: int
    resolved: int
    """Resolvidos ou fechados (acumulado)."""
    created_in_period: int
    sla_warning: int
    """Chamados em aberto próximos do vencimento do SLA."""
    sla_breached: int
    """Chamados em aberto com SLA vencido."""
    assigned_to_me: int | None = None
    avg_resolution_minutes: float | None = None
    satisfaction_avg: float | None = None
    satisfaction_count: int | None = None
    sla_compliance_pct: float | None = None
    """Percentual de chamados resolvidos dentro do prazo de resolução."""


class CountItem(BaseModel):
    label: str
    count: int


class DailyCount(BaseModel):
    date: date
    count: int


class RecentTicket(BaseModel):
    id: int
    ticket_number: str
    title: str
    status: TicketStatus
    priority: TicketPriority
    updated_at: datetime
    requester: UserSummary
    technician: UserSummary | None
    category: CategorySummary | None


class ActivityItem(BaseModel):
    id: int
    action: TicketHistoryAction
    field: str | None
    old_value: str | None
    new_value: str | None
    created_at: datetime
    user: UserSummary | None
    ticket_id: int
    ticket_number: str


class TechnicianPerformance(BaseModel):
    technician: UserSummary
    resolved: int
    avg_resolution_minutes: float | None
    satisfaction_avg: float | None


class DashboardTickets(BaseModel):
    period_days: int
    by_priority: list[CountItem]
    by_category: list[CountItem]
    daily_volume: list[DailyCount]
    recent: list[RecentTicket]
    activity: list[ActivityItem]
    technicians: list[TechnicianPerformance] | None = None


class SLAWeek(BaseModel):
    week_start: date
    resolved: int
    within_sla: int
    compliance_pct: float | None


class DashboardSLA(BaseModel):
    weeks: list[SLAWeek]


class AIInsight(BaseModel):
    """Observação gerada a partir dos dados (números exatos, sem LLM)."""

    kind: Literal["growth", "drop", "share", "slowest", "sla", "assistant", "feedback"]
    tone: Literal["info", "success", "warning"]
    text: str


class AIUsageItem(BaseModel):
    action_type: AIActionType
    total: int
    success: int


class DashboardAI(BaseModel):
    period_days: int
    conversations: int
    conversations_resolved: int
    conversations_escalated: int
    assistant_resolution_pct: float | None
    """Conversas encerradas pelo assistente sem virar chamado, sobre as concluídas."""
    feedback_count: int
    positive_feedback_pct: float | None
    usage: list[AIUsageItem]
    insights: list[AIInsight]
