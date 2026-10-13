"""Consultas da administração. Todas exigem `company_id`."""

from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    AIAction,
    AIFeedback,
    AuditLog,
    Category,
    Department,
    KnowledgeArticle,
    Role,
    SLAPolicy,
    Ticket,
    User,
)
from app.models.enums import AIFeedbackRating, AuditAction, RoleName
from app.repositories.ticket import ACTIVE_STATUSES
from app.repositories.user import UserRepository


class AdminRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    # --- Usuários ---------------------------------------------------------------

    def list_users(
        self,
        company_id: int,
        *,
        search: str | None,
        role: RoleName | None,
        is_active: bool | None,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[User], int]:
        stmt = select(User).join(Role).where(User.company_id == company_id)
        if search:
            pattern = f"%{search.strip().lower()}%"
            stmt = stmt.where(
                or_(func.lower(User.name).like(pattern), func.lower(User.email).like(pattern))
            )
        if role is not None:
            stmt = stmt.where(Role.name == role)
        if is_active is not None:
            stmt = stmt.where(User.is_active == is_active)
        total = self.session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        items = self.session.scalars(
            stmt.options(joinedload(User.role), joinedload(User.department))
            .order_by(User.name, User.id)
            .offset(offset)
            .limit(limit)
        ).all()
        return items, total

    def get_user(self, company_id: int, user_id: int) -> User | None:
        return self.session.scalars(
            select(User)
            .where(User.company_id == company_id, User.id == user_id)
            .options(joinedload(User.role), joinedload(User.department))
        ).one_or_none()

    def count_active_admins(self, company_id: int) -> int:
        stmt = (
            select(func.count())
            .select_from(User)
            .join(Role)
            .where(User.company_id == company_id, User.is_active.is_(True))
            .where(Role.name == RoleName.ADMIN)
        )
        return self.session.scalar(stmt) or 0

    def count_active_assigned(self, company_id: int, technician_id: int) -> int:
        """Chamados ainda em aberto atribuídos ao técnico."""
        stmt = (
            select(func.count())
            .select_from(Ticket)
            .where(
                Ticket.company_id == company_id,
                Ticket.technician_id == technician_id,
                Ticket.status.in_(ACTIVE_STATUSES),
            )
        )
        return self.session.scalar(stmt) or 0

    def list_technicians(self, company_id: int) -> Sequence[User]:
        return UserRepository(self.session).active_with_roles(
            company_id, (RoleName.TECHNICIAN, RoleName.ADMIN)
        )

    # --- Departamentos, categorias e SLA ---------------------------------------

    def list_departments(self, company_id: int) -> list[tuple[Department, int]]:
        users = (
            select(User.department_id, func.count().label("total"))
            .where(User.company_id == company_id)
            .group_by(User.department_id)
            .subquery()
        )
        rows = self.session.execute(
            select(Department, func.coalesce(users.c.total, 0))
            .outerjoin(users, users.c.department_id == Department.id)
            .where(Department.company_id == company_id)
            .order_by(Department.name)
        ).all()
        return [(department, int(total)) for department, total in rows]

    def list_categories(self, company_id: int) -> Sequence[Category]:
        return self.session.scalars(
            select(Category).where(Category.company_id == company_id).order_by(Category.name)
        ).all()

    def list_sla_policies(self, company_id: int) -> Sequence[SLAPolicy]:
        return self.session.scalars(
            select(SLAPolicy).where(SLAPolicy.company_id == company_id).order_by(SLAPolicy.name)
        ).all()

    def get_scoped[T: (Department, Category, SLAPolicy)](
        self, model: type[T], company_id: int, entity_id: int
    ) -> T | None:
        return self.session.scalars(
            select(model).where(model.company_id == company_id, model.id == entity_id)
        ).one_or_none()

    def name_taken(
        self,
        model: type[Department | Category | SLAPolicy],
        company_id: int,
        name: str,
        *,
        exclude_id: int | None = None,
    ) -> bool:
        stmt = select(model.id).where(
            model.company_id == company_id, func.lower(model.name) == name.lower()
        )
        if exclude_id is not None:
            stmt = stmt.where(model.id != exclude_id)
        return self.session.scalars(stmt).first() is not None

    def category_usage(self, company_id: int, category_id: int) -> int:
        tickets = self.session.scalar(
            select(func.count())
            .select_from(Ticket)
            .where(Ticket.company_id == company_id, Ticket.category_id == category_id)
        )
        articles = self.session.scalar(
            select(func.count())
            .select_from(KnowledgeArticle)
            .where(
                KnowledgeArticle.company_id == company_id,
                KnowledgeArticle.category_id == category_id,
            )
        )
        return (tickets or 0) + (articles or 0)

    def sla_usage(self, company_id: int, policy_id: int) -> int:
        tickets = self.session.scalar(
            select(func.count())
            .select_from(Ticket)
            .where(Ticket.company_id == company_id, Ticket.sla_policy_id == policy_id)
        )
        categories = self.session.scalar(
            select(func.count())
            .select_from(Category)
            .where(Category.company_id == company_id, Category.default_sla_policy_id == policy_id)
        )
        return (tickets or 0) + (categories or 0)

    def clear_department(self, company_id: int, department_id: int) -> None:
        for user in self.session.scalars(
            select(User).where(User.company_id == company_id, User.department_id == department_id)
        ):
            user.department_id = None

    # --- Auditoria e IA ----------------------------------------------------------

    def list_audit(
        self,
        company_id: int,
        *,
        action: AuditAction | None,
        entity: str | None,
        user_id: int | None,
        since: datetime | None,
        until: datetime | None,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[AuditLog], int]:
        stmt = select(AuditLog).where(AuditLog.company_id == company_id)
        if action is not None:
            stmt = stmt.where(AuditLog.action == action)
        if entity:
            stmt = stmt.where(AuditLog.entity == entity)
        if user_id is not None:
            stmt = stmt.where(AuditLog.user_id == user_id)
        if since is not None:
            stmt = stmt.where(AuditLog.created_at >= since)
        if until is not None:
            stmt = stmt.where(AuditLog.created_at < until)
        total = self.session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        items = self.session.scalars(
            stmt.options(joinedload(AuditLog.user))
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .offset(offset)
            .limit(limit)
        ).all()
        return items, total

    def ai_usage(self, company_id: int, since: datetime) -> tuple[int, int]:
        """(total de ações, ações bem-sucedidas) desde `since`."""
        row = self.session.execute(
            select(
                func.count(),
                func.coalesce(func.sum(case((AIAction.success.is_(True), 1), else_=0)), 0),
            ).where(AIAction.company_id == company_id, AIAction.created_at >= since)
        ).one()
        return int(row[0]), int(row[1])

    def ai_feedback(self, company_id: int, since: datetime) -> tuple[int, int]:
        """(total de avaliações, positivas) desde `since`."""
        rows = self.session.execute(
            select(AIFeedback.rating, func.count())
            .where(AIFeedback.company_id == company_id, AIFeedback.created_at >= since)
            .group_by(AIFeedback.rating)
        ).all()
        counts = {rating: int(total) for rating, total in rows}
        return sum(counts.values()), counts.get(AIFeedbackRating.POSITIVE, 0)
