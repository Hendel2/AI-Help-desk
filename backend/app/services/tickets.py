"""Regras de negócio dos chamados (§13–21).

Toda operação recebe o usuário autenticado e aplica, nesta ordem:
1. escopo de empresa (um chamado de outra empresa é inexistente → 404);
2. permissão do perfil (§7);
3. validação da transição de status (§15);
4. efeitos: prazos de SLA, histórico (§20) e auditoria (§24).
"""

# As classes têm um método `list`: sem isto, no Python < 3.14 as anotações
# `list[...]` seguintes seriam resolvidas como o método, não como o tipo.
from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.models import Category, Ticket, TicketComment, TicketHistory, User
from app.models.enums import (
    AuditAction,
    RoleName,
    TicketHistoryAction,
    TicketPriority,
    TicketSource,
    TicketStatus,
)
from app.models.types import utcnow
from app.repositories.audit_log import AuditLogRepository
from app.repositories.ticket import (
    INTERNAL_COMMENT_FIELD,
    CategoryRepository,
    SLAPolicyRepository,
    TicketCommentRepository,
    TicketFilters,
    TicketHistoryRepository,
    TicketRepository,
)
from app.repositories.user import UserRepository
from app.schemas.ticket import TicketCreate, TicketUpdate
from app.services import sla
from app.services.notifications import NotificationService

logger = logging.getLogger("app.tickets")

STAFF_ROLES = frozenset({RoleName.TECHNICIAN, RoleName.ADMIN})

#: Transições permitidas (§15). Chaves sem destino são estados finais.
ALLOWED_TRANSITIONS: dict[TicketStatus, frozenset[TicketStatus]] = {
    TicketStatus.OPEN: frozenset(
        {
            TicketStatus.TRIAGE,
            TicketStatus.ASSIGNED,
            TicketStatus.IN_PROGRESS,
            TicketStatus.CANCELLED,
        }
    ),
    TicketStatus.TRIAGE: frozenset(
        {TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, TicketStatus.CANCELLED}
    ),
    TicketStatus.ASSIGNED: frozenset(
        {
            TicketStatus.IN_PROGRESS,
            TicketStatus.WAITING_USER,
            TicketStatus.RESOLVED,
            TicketStatus.CANCELLED,
        }
    ),
    TicketStatus.IN_PROGRESS: frozenset(
        {TicketStatus.WAITING_USER, TicketStatus.RESOLVED, TicketStatus.CANCELLED}
    ),
    TicketStatus.WAITING_USER: frozenset(
        {TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED, TicketStatus.CANCELLED}
    ),
    # RESOLVED volta para IN_PROGRESS quando o chamado é reaberto.
    TicketStatus.RESOLVED: frozenset({TicketStatus.CLOSED, TicketStatus.IN_PROGRESS}),
    TicketStatus.CLOSED: frozenset(),
    TicketStatus.CANCELLED: frozenset(),
}

#: Status de atendimento: exigem um técnico responsável.
WORK_STATUSES = frozenset(
    {TicketStatus.IN_PROGRESS, TicketStatus.WAITING_USER, TicketStatus.RESOLVED}
)

#: Número de tentativas ao gerar `ticket_number` (corrida entre duas aberturas).
_NUMBER_ATTEMPTS = 5


def is_staff(user: User) -> bool:
    return user.role.name in STAFF_ROLES


class TicketService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.tickets = TicketRepository(session)
        self.comments = TicketCommentRepository(session)
        self.history = TicketHistoryRepository(session)
        self.categories = CategoryRepository(session)
        self.sla_policies = SLAPolicyRepository(session)
        self.users = UserRepository(session)
        self.audit = AuditLogRepository(session)
        self.notifications = NotificationService(session)

    # --- Leitura ------------------------------------------------------------

    def get(self, user: User, ticket_id: int) -> Ticket:
        ticket = self.tickets.get_detailed(user.company_id, ticket_id)
        if ticket is None or not self._can_view(user, ticket):
            # Sem permissão também responde 404: não revela a existência.
            raise NotFoundError("Chamado não encontrado.", code="TICKET_NOT_FOUND")
        return ticket

    def list(
        self, user: User, filters: TicketFilters, *, offset: int, limit: int
    ) -> tuple[Sequence[Ticket], int]:
        # USER só enxerga os próprios chamados, independente dos filtros enviados.
        if not is_staff(user):
            filters.requester_id = user.id
        items = self.tickets.search(user.company_id, filters, offset=offset, limit=limit)
        return items, self.tickets.count_filtered(user.company_id, filters)

    def list_comments(self, user: User, ticket_id: int) -> Sequence[TicketComment]:
        ticket = self.get(user, ticket_id)
        return self.comments.list_for_ticket(ticket.id, include_internal=is_staff(user))

    def list_history(self, user: User, ticket_id: int) -> Sequence[TicketHistory]:
        ticket = self.get(user, ticket_id)
        return self.history.list_for_ticket(ticket.id, include_internal=is_staff(user))

    def evaluate_sla(self, ticket: Ticket, *, now: datetime | None = None) -> sla.SLAInfo:
        return sla.evaluate(ticket, now=now)

    def allowed_transitions(self, user: User, ticket: Ticket) -> list[TicketStatus]:
        """Status para os quais ESTE usuário pode levar o chamado agora.

        Exposto na API para a interface oferecer apenas ações válidas; a
        validação real continua em `change_status`/`close`.
        """
        targets = ALLOWED_TRANSITIONS[ticket.status]
        if is_staff(user):
            return sorted(targets, key=list(TicketStatus).index)
        # O solicitante só encerra o próprio chamado já resolvido.
        if ticket.user_id == user.id and TicketStatus.CLOSED in targets:
            return [TicketStatus.CLOSED]
        return []

    # --- Abertura -----------------------------------------------------------

    def create(
        self,
        user: User,
        data: TicketCreate,
        *,
        source: TicketSource = TicketSource.WEB,
        ip_address: str | None = None,
    ) -> Ticket:
        category = self._load_category(user.company_id, data.category_id)
        priority = data.priority or (
            category.default_priority if category else TicketPriority.MEDIUM
        )
        policy = sla.resolve_policy(
            category, priority, self.sla_policies.list_active(user.company_id)
        )
        opened_at = utcnow()
        response_deadline, resolution_deadline = sla.compute_deadlines(policy, opened_at)

        ticket = Ticket(
            user_id=user.id,
            category_id=category.id if category else None,
            sla_policy_id=policy.id if policy else None,
            title=data.title,
            description=data.description,
            priority=priority,
            status=TicketStatus.OPEN,
            source=source,
            created_at=opened_at,
            updated_at=opened_at,
            response_deadline=response_deadline,
            resolution_deadline=resolution_deadline,
        )

        ticket = self._add_with_number(user.company_id, ticket)
        self._record(ticket, user, TicketHistoryAction.CREATED)
        self.notifications.ticket_created(ticket, user)
        self.audit.record(
            action=AuditAction.TICKET_CREATED,
            entity="ticket",
            entity_id=ticket.id,
            company_id=user.company_id,
            user_id=user.id,
            metadata={"ticket_number": ticket.ticket_number, "source": source.value},
            ip_address=ip_address,
        )
        self.session.commit()
        refreshed = self.tickets.get_detailed(user.company_id, ticket.id)
        assert refreshed is not None  # acabou de ser criado nesta transação
        return refreshed

    def _add_with_number(self, company_id: int, ticket: Ticket) -> Ticket:
        """Grava o chamado repetindo a numeração se outra abertura usou o número."""
        for attempt in range(_NUMBER_ATTEMPTS):
            ticket.ticket_number = self.tickets.next_ticket_number(company_id)
            savepoint = self.session.begin_nested()
            try:
                self.tickets.add(company_id, ticket)
                savepoint.commit()
                return ticket
            except IntegrityError:
                savepoint.rollback()
                logger.warning(
                    "Colisão ao gerar ticket_number",
                    extra={"company_id": company_id, "attempt": attempt + 1},
                )
        raise ConflictError(
            "Não foi possível gerar o número do chamado. Tente novamente.",
            code="TICKET_NUMBER_CONFLICT",
        )

    # --- Alterações ---------------------------------------------------------

    def update(
        self, user: User, ticket_id: int, data: TicketUpdate, *, ip_address: str | None = None
    ) -> Ticket:
        ticket = self.get(user, ticket_id)
        self._ensure_open_for_changes(ticket)

        staff = is_staff(user)
        if not staff:
            # O solicitante corrige o próprio relato enquanto ninguém atendeu.
            if ticket.status not in {TicketStatus.OPEN, TicketStatus.TRIAGE}:
                raise ForbiddenError(
                    "O chamado já está em atendimento e não pode mais ser editado.",
                    code="TICKET_NOT_EDITABLE",
                )
            if data.priority is not None or data.category_id is not None:
                raise ForbiddenError(
                    "Somente a equipe de suporte altera categoria e prioridade.",
                    code="TICKET_FIELD_FORBIDDEN",
                )

        if data.title is not None and data.title != ticket.title:
            ticket.title = data.title
        if data.description is not None:
            ticket.description = data.description
        if data.category_id is not None and data.category_id != ticket.category_id:
            category = self._load_category(user.company_id, data.category_id)
            old = ticket.category.name if ticket.category else None
            ticket.category = category
            self._record(
                ticket,
                user,
                TicketHistoryAction.CATEGORY_CHANGED,
                field="category",
                old_value=old,
                new_value=category.name if category else None,
            )
            self._refresh_sla(ticket, user.company_id)
        if data.priority is not None and data.priority != ticket.priority:
            old_priority = ticket.priority
            ticket.priority = data.priority
            self._record(
                ticket,
                user,
                TicketHistoryAction.PRIORITY_CHANGED,
                field="priority",
                old_value=old_priority.value,
                new_value=data.priority.value,
            )
            self._refresh_sla(ticket, user.company_id)

        self._audit_update(ticket, user, ip_address)
        self.session.commit()
        return self.get(user, ticket.id)

    def assign(
        self,
        user: User,
        ticket_id: int,
        technician_id: int | None,
        *,
        ip_address: str | None = None,
    ) -> Ticket:
        ticket = self.get(user, ticket_id)
        if not is_staff(user):
            raise ForbiddenError()
        self._ensure_open_for_changes(ticket)

        if technician_id is None or technician_id == user.id:
            technician = user
        elif user.role.name is not RoleName.ADMIN:
            # Técnico assume para si; atribuir a outra pessoa é do ADMIN.
            raise ForbiddenError(
                "Somente administradores atribuem chamados a outros técnicos.",
                code="ASSIGN_FORBIDDEN",
            )
        else:
            technician = self._load_technician(user.company_id, technician_id)

        if ticket.technician_id == technician.id:
            raise ConflictError(
                "O chamado já está atribuído a este técnico.", code="TICKET_ALREADY_ASSIGNED"
            )

        old = ticket.technician.name if ticket.technician else None
        # Atribui o objeto (não só a FK) para o relacionamento já carregado acompanhar.
        ticket.technician = technician
        self._record(
            ticket,
            user,
            TicketHistoryAction.ASSIGNED,
            field="technician",
            old_value=old,
            new_value=technician.name,
        )
        if ticket.status in {TicketStatus.OPEN, TicketStatus.TRIAGE}:
            self._apply_status(ticket, user, TicketStatus.ASSIGNED)
        self.notifications.ticket_assigned(ticket, user)

        self._audit_update(ticket, user, ip_address)
        self.session.commit()
        return self.get(user, ticket.id)

    def change_status(
        self,
        user: User,
        ticket_id: int,
        status: TicketStatus,
        *,
        comment: str | None = None,
        ip_address: str | None = None,
    ) -> Ticket:
        ticket = self.get(user, ticket_id)
        if not is_staff(user):
            raise ForbiddenError(
                "Somente a equipe de suporte altera o status do chamado.",
                code="STATUS_CHANGE_FORBIDDEN",
            )
        if status is TicketStatus.RESOLVED and not comment:
            raise BadRequestError(
                "Descreva a solução ao resolver o chamado.", code="SOLUTION_REQUIRED"
            )
        # Valida antes de qualquer efeito colateral (ex.: auto-atribuição).
        self._validate_transition(ticket, status)

        # Quem inicia o atendimento de um chamado sem responsável o assume:
        # nenhum chamado é atendido ou resolvido sem técnico (métricas do §41).
        if ticket.technician_id is None and status in WORK_STATUSES:
            ticket.technician = user
            self._record(
                ticket,
                user,
                TicketHistoryAction.ASSIGNED,
                field="technician",
                old_value=None,
                new_value=user.name,
            )
            self.notifications.ticket_assigned(ticket, user)

        self._apply_status(ticket, user, status)
        if comment:
            # Na resolução o aviso é "chamado resolvido", não "nova mensagem".
            self._add_comment(
                ticket, user, comment, is_internal=False, notify=status is not TicketStatus.RESOLVED
            )
        if status is TicketStatus.RESOLVED:
            self.notifications.ticket_resolved(ticket, user)
        self._audit_update(ticket, user, ip_address)
        self.session.commit()
        return self.get(user, ticket.id)

    def resolve(
        self, user: User, ticket_id: int, solution: str, *, ip_address: str | None = None
    ) -> Ticket:
        return self.change_status(
            user, ticket_id, TicketStatus.RESOLVED, comment=solution, ip_address=ip_address
        )

    def close(
        self,
        user: User,
        ticket_id: int,
        *,
        reason: str | None = None,
        ip_address: str | None = None,
    ) -> Ticket:
        ticket = self.get(user, ticket_id)
        # O solicitante pode encerrar o próprio chamado já resolvido.
        if not is_staff(user) and ticket.user_id != user.id:
            raise ForbiddenError()
        self._apply_status(ticket, user, TicketStatus.CLOSED, note=reason)
        self._audit_update(ticket, user, ip_address)
        self.session.commit()
        return self.get(user, ticket.id)

    # --- Comentários --------------------------------------------------------

    def add_comment(
        self,
        user: User,
        ticket_id: int,
        content: str,
        *,
        is_internal: bool = False,
        ip_address: str | None = None,
    ) -> TicketComment:
        ticket = self.get(user, ticket_id)
        if is_internal and not is_staff(user):
            raise ForbiddenError(
                "Comentários internos são restritos à equipe de suporte.",
                code="INTERNAL_COMMENT_FORBIDDEN",
            )
        if ticket.status in {TicketStatus.CLOSED, TicketStatus.CANCELLED}:
            raise ConflictError(
                "Este chamado está encerrado e não aceita novos comentários.",
                code="TICKET_CLOSED",
            )

        comment = self._add_comment(ticket, user, content, is_internal=is_internal)
        self._audit_update(ticket, user, ip_address)
        self.session.commit()
        self.session.refresh(comment)
        return comment

    def _add_comment(
        self,
        ticket: Ticket,
        user: User,
        content: str,
        *,
        is_internal: bool,
        notify: bool = True,
    ) -> TicketComment:
        comment = self.comments.add(
            TicketComment(
                ticket_id=ticket.id, user_id=user.id, content=content, is_internal=is_internal
            )
        )
        if notify:
            self.notifications.comment_added(ticket, user, is_internal=is_internal)
        # Primeira resposta pública de quem não é o solicitante fecha o SLA de resposta (§21).
        if (
            not is_internal
            and ticket.first_response_at is None
            and user.id != ticket.user_id
            and is_staff(user)
        ):
            ticket.first_response_at = utcnow()
        # Comentário interno fica marcado para não aparecer no histórico do solicitante.
        self._record(
            ticket,
            user,
            TicketHistoryAction.COMMENTED,
            field=INTERNAL_COMMENT_FIELD if is_internal else None,
        )
        return comment

    # --- Apoio --------------------------------------------------------------

    def _can_view(self, user: User, ticket: Ticket) -> bool:
        return is_staff(user) or ticket.user_id == user.id

    def _ensure_open_for_changes(self, ticket: Ticket) -> None:
        if ticket.status in {TicketStatus.CLOSED, TicketStatus.CANCELLED}:
            raise ConflictError(
                "Este chamado está encerrado e não pode mais ser alterado.", code="TICKET_CLOSED"
            )

    def _validate_transition(self, ticket: Ticket, status: TicketStatus) -> None:
        if status is ticket.status:
            raise ConflictError(
                f"O chamado já está em '{status.value}'.", code="TICKET_STATUS_UNCHANGED"
            )
        if status not in ALLOWED_TRANSITIONS[ticket.status]:
            raise ConflictError(
                f"Transição de status inválida: {ticket.status.value} → {status.value}.",
                code="INVALID_STATUS_TRANSITION",
            )

    def _apply_status(
        self, ticket: Ticket, user: User, status: TicketStatus, *, note: str | None = None
    ) -> None:
        self._validate_transition(ticket, status)
        previous = ticket.status
        ticket.status = status
        now = utcnow()
        if status is TicketStatus.RESOLVED:
            ticket.resolved_at = now
            if ticket.first_response_at is None:
                ticket.first_response_at = now
        elif status is TicketStatus.CLOSED:
            ticket.closed_at = now
            if ticket.resolved_at is None:
                ticket.resolved_at = now
        elif status is TicketStatus.IN_PROGRESS and previous is TicketStatus.RESOLVED:
            # Reabertura: o chamado volta a não ter resolução.
            ticket.resolved_at = None
            ticket.closed_at = None

        action = {
            TicketStatus.RESOLVED: TicketHistoryAction.RESOLVED,
            TicketStatus.CLOSED: TicketHistoryAction.CLOSED,
            TicketStatus.CANCELLED: TicketHistoryAction.CANCELLED,
        }.get(status, TicketHistoryAction.STATUS_CHANGED)
        if previous is TicketStatus.RESOLVED and status is TicketStatus.IN_PROGRESS:
            action = TicketHistoryAction.REOPENED

        self._record(
            ticket,
            user,
            action,
            field="status",
            old_value=previous.value,
            new_value=(note or status.value)[:255],
        )

    def _refresh_sla(self, ticket: Ticket, company_id: int) -> None:
        """Recalcula os prazos quando categoria ou prioridade mudam (§21)."""
        policy = sla.resolve_policy(
            ticket.category, ticket.priority, self.sla_policies.list_active(company_id)
        )
        ticket.sla_policy = policy
        ticket.response_deadline, ticket.resolution_deadline = sla.compute_deadlines(
            policy, ticket.created_at
        )

    def _record(
        self,
        ticket: Ticket,
        user: User | None,
        action: TicketHistoryAction,
        *,
        field: str | None = None,
        old_value: str | None = None,
        new_value: str | None = None,
    ) -> None:
        self.history.add(
            TicketHistory(
                ticket_id=ticket.id,
                user_id=user.id if user else None,
                action=action,
                field=field,
                old_value=old_value[:255] if old_value else None,
                new_value=new_value[:255] if new_value else None,
            )
        )

    def _audit_update(self, ticket: Ticket, user: User, ip_address: str | None) -> None:
        self.audit.record(
            action=AuditAction.TICKET_UPDATED,
            entity="ticket",
            entity_id=ticket.id,
            company_id=ticket.company_id,
            user_id=user.id,
            metadata={"ticket_number": ticket.ticket_number, "status": ticket.status.value},
            ip_address=ip_address,
        )

    def _load_category(self, company_id: int, category_id: int | None) -> Category | None:
        if category_id is None:
            return None
        category = self.categories.get(company_id, category_id)
        if category is None or not category.is_active:
            raise BadRequestError("Categoria inválida.", code="INVALID_CATEGORY")
        return category

    def _load_technician(self, company_id: int, technician_id: int) -> User:
        technician = self.users.get_with_role(company_id, technician_id)
        if technician is None or not technician.is_active or not is_staff(technician):
            raise BadRequestError("Técnico inválido para este chamado.", code="INVALID_TECHNICIAN")
        return technician
