"""Repositórios de chamados, comentários, histórico, categorias e SLA."""

import re
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import joinedload

from app.models import Category, SLAPolicy, Ticket, TicketComment, TicketHistory
from app.models.enums import TicketPriority, TicketStatus
from app.repositories.base import CompanyScopedRepository, _check_pagination, _require_company_id

TICKET_NUMBER_PREFIX = "HD-"
TICKET_NUMBER_DIGITS = 6
_TICKET_NUMBER_RE = re.compile(rf"^{TICKET_NUMBER_PREFIX}(\d+)$")


def format_ticket_number(sequence: int) -> str:
    """1 -> "HD-000001" (§14)."""
    return f"{TICKET_NUMBER_PREFIX}{sequence:0{TICKET_NUMBER_DIGITS}d}"


class TicketFilters:
    """Filtros da listagem (§42). Instanciado pela camada de serviço."""

    def __init__(
        self,
        *,
        status: Sequence[TicketStatus] | None = None,
        priority: Sequence[TicketPriority] | None = None,
        category_id: int | None = None,
        technician_id: int | None = None,
        unassigned: bool | None = None,
        requester_id: int | None = None,
        search: str | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
    ) -> None:
        self.status = list(status) if status else None
        self.priority = list(priority) if priority else None
        self.category_id = category_id
        self.technician_id = technician_id
        self.unassigned = unassigned
        self.requester_id = requester_id
        self.search = search.strip() if search and search.strip() else None
        self.created_from = created_from
        self.created_to = created_to


class TicketRepository(CompanyScopedRepository[Ticket]):
    model = Ticket

    # Relações exibidas na listagem e no detalhe: evitam N+1.
    _RELATIONS = (
        joinedload(Ticket.requester),
        joinedload(Ticket.technician),
        joinedload(Ticket.category),
        joinedload(Ticket.sla_policy),
    )

    def get_detailed(self, company_id: int, ticket_id: int) -> Ticket | None:
        # populate_existing: recarrega do banco mesmo que o chamado já esteja na
        # sessão (após uma alteração, as relações refletem o estado gravado).
        stmt = (
            self._scoped_select(company_id)
            .where(Ticket.id == ticket_id)
            .options(*self._RELATIONS)
            .execution_options(populate_existing=True)
        )
        return self.session.scalars(stmt).one_or_none()

    def get_by_number(self, company_id: int, ticket_number: str) -> Ticket | None:
        stmt = (
            self._scoped_select(company_id)
            .where(Ticket.ticket_number == ticket_number)
            .options(*self._RELATIONS)
        )
        return self.session.scalars(stmt).one_or_none()

    def _apply_filters(
        self, stmt: Select[tuple[Ticket]], filters: TicketFilters
    ) -> Select[tuple[Ticket]]:
        if filters.status:
            stmt = stmt.where(Ticket.status.in_(filters.status))
        if filters.priority:
            stmt = stmt.where(Ticket.priority.in_(filters.priority))
        if filters.category_id is not None:
            stmt = stmt.where(Ticket.category_id == filters.category_id)
        if filters.unassigned:
            stmt = stmt.where(Ticket.technician_id.is_(None))
        elif filters.technician_id is not None:
            stmt = stmt.where(Ticket.technician_id == filters.technician_id)
        if filters.requester_id is not None:
            stmt = stmt.where(Ticket.user_id == filters.requester_id)
        if filters.search:
            like = f"%{filters.search}%"
            stmt = stmt.where(
                or_(
                    Ticket.title.like(like),
                    Ticket.description.like(like),
                    Ticket.ticket_number.like(like),
                )
            )
        if filters.created_from is not None:
            stmt = stmt.where(Ticket.created_at >= filters.created_from)
        if filters.created_to is not None:
            stmt = stmt.where(Ticket.created_at <= filters.created_to)
        return stmt

    def search(
        self, company_id: int, filters: TicketFilters, *, offset: int = 0, limit: int = 20
    ) -> Sequence[Ticket]:
        _check_pagination(offset, limit)
        stmt = self._apply_filters(self._scoped_select(company_id), filters)
        stmt = stmt.options(*self._RELATIONS).order_by(Ticket.created_at.desc(), Ticket.id.desc())
        return self.session.scalars(stmt.offset(offset).limit(limit)).unique().all()

    def count_filtered(self, company_id: int, filters: TicketFilters) -> int:
        stmt = self._apply_filters(
            select(func.count())
            .select_from(Ticket)
            .where(Ticket.company_id == _require_company_id(company_id)),
            filters,
        )
        return self.session.scalar(stmt) or 0

    def next_ticket_number(self, company_id: int) -> str:
        """Próximo número da empresa. A unicidade real é garantida pelo índice
        `uq_tickets_company_id_ticket_number`; o serviço repete em caso de colisão."""
        stmt = (
            select(Ticket.ticket_number)
            .where(Ticket.company_id == _require_company_id(company_id))
            .order_by(func.length(Ticket.ticket_number).desc(), Ticket.ticket_number.desc())
            .limit(1)
        )
        latest = self.session.scalars(stmt).first()
        if latest is None:
            return format_ticket_number(1)
        match = _TICKET_NUMBER_RE.match(latest)
        return format_ticket_number((int(match.group(1)) if match else 0) + 1)


class TicketCommentRepository:
    """Comentários. O escopo de empresa é garantido pelo chamado dono."""

    def __init__(self, session: object) -> None:
        self.session = session  # type: ignore[assignment]

    def list_for_ticket(self, ticket_id: int, *, include_internal: bool) -> Sequence[TicketComment]:
        stmt = (
            select(TicketComment)
            .where(TicketComment.ticket_id == ticket_id)
            .options(joinedload(TicketComment.author))
            .order_by(TicketComment.created_at, TicketComment.id)
        )
        if not include_internal:
            stmt = stmt.where(TicketComment.is_internal.is_(False))
        return self.session.scalars(stmt).unique().all()  # type: ignore[attr-defined]

    def add(self, comment: TicketComment) -> TicketComment:
        self.session.add(comment)  # type: ignore[attr-defined]
        self.session.flush()  # type: ignore[attr-defined]
        return comment

    def has_public_staff_comment(self, ticket_id: int, *, requester_id: int) -> bool:
        """Já houve resposta pública de alguém que não é o solicitante?"""
        stmt = (
            select(TicketComment.id)
            .where(
                TicketComment.ticket_id == ticket_id,
                TicketComment.is_internal.is_(False),
                TicketComment.user_id != requester_id,
            )
            .limit(1)
        )
        return self.session.scalars(stmt).first() is not None  # type: ignore[attr-defined]


class TicketHistoryRepository:
    def __init__(self, session: object) -> None:
        self.session = session  # type: ignore[assignment]

    def list_for_ticket(self, ticket_id: int) -> Sequence[TicketHistory]:
        stmt = (
            select(TicketHistory)
            .where(TicketHistory.ticket_id == ticket_id)
            .options(joinedload(TicketHistory.user))
            .order_by(TicketHistory.created_at, TicketHistory.id)
        )
        return self.session.scalars(stmt).unique().all()  # type: ignore[attr-defined]

    def add(self, entry: TicketHistory) -> TicketHistory:
        self.session.add(entry)  # type: ignore[attr-defined]
        self.session.flush()  # type: ignore[attr-defined]
        return entry


class CategoryRepository(CompanyScopedRepository[Category]):
    model = Category

    def list_active(self, company_id: int) -> Sequence[Category]:
        stmt = (
            self._scoped_select(company_id)
            .where(Category.is_active.is_(True))
            .order_by(Category.name)
        )
        return self.session.scalars(stmt).all()


class SLAPolicyRepository(CompanyScopedRepository[SLAPolicy]):
    model = SLAPolicy

    def list_active(self, company_id: int) -> list[SLAPolicy]:
        stmt = (
            self._scoped_select(company_id)
            .where(SLAPolicy.is_active.is_(True))
            .order_by(SLAPolicy.id)
        )
        return list(self.session.scalars(stmt).all())
