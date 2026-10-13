"""Administração da empresa (§50). Exclusivo do ADMIN; toda mudança é auditada.

Regras principais:
- usuários não são apagados (chamados e históricos os referenciam): "excluir"
  desativa — o login e os tokens de usuário inativo já são recusados;
- a empresa nunca fica sem um administrador ativo, e o admin não rebaixa nem
  desativa a si mesmo;
- categoria e política de SLA em uso não são excluídas (a FK apagaria a
  referência dos chamados) — a saída é desativá-las.
"""

from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.core.security import hash_password
from app.models import Category, Company, Department, SLAPolicy, User
from app.models.enums import AuditAction, RoleName
from app.models.types import utcnow
from app.repositories.admin import AdminRepository
from app.repositories.audit_log import AuditLogRepository
from app.repositories.user import RoleRepository, UserRepository
from app.schemas.admin import (
    AISettingsRead,
    AuditLogRead,
    CategoryWrite,
    CompanyUpdate,
    DepartmentWrite,
    SLAPolicyWrite,
    UserCreate,
    UserUpdate,
)
from app.schemas.common import Page, PageParams

_ENTITY_LABELS = {Department: "departamento", Category: "categoria", SLAPolicy: "política de SLA"}


class AdminService:
    def __init__(self, session: Session, admin: User, *, ip_address: str | None = None) -> None:
        if admin.role.name is not RoleName.ADMIN:
            raise ForbiddenError("Área exclusiva de administradores.", code="ADMIN_ONLY")
        self.session = session
        self.admin = admin
        self.company_id = admin.company_id
        self.ip_address = ip_address
        self.repo = AdminRepository(session)
        self.audit = AuditLogRepository(session)

    def _record(
        self,
        action: AuditAction,
        entity: str,
        entity_id: int | None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self.audit.record(
            action=action,
            entity=entity,
            entity_id=entity_id,
            company_id=self.company_id,
            user_id=self.admin.id,
            metadata=metadata,
            ip_address=self.ip_address,
        )

    # --- Usuários -----------------------------------------------------------------

    def list_users(
        self,
        params: PageParams,
        *,
        search: str | None = None,
        role: RoleName | None = None,
        is_active: bool | None = None,
    ) -> tuple[list[User], int]:
        items, total = self.repo.list_users(
            self.company_id,
            search=search,
            role=role,
            is_active=is_active,
            offset=params.offset,
            limit=params.limit,
        )
        return list(items), total

    def get_user(self, user_id: int) -> User:
        user = self.repo.get_user(self.company_id, user_id)
        if user is None:
            raise NotFoundError("Usuário não encontrado.", code="USER_NOT_FOUND")
        return user

    def _check_department(self, department_id: int | None) -> None:
        if department_id is not None and not self.repo.get_scoped(
            Department, self.company_id, department_id
        ):
            raise BadRequestError("Departamento inválido.", code="DEPARTMENT_INVALID")

    def _check_email(self, email: str, *, current: User | None = None) -> str:
        email = email.strip().lower()
        if (current is None or current.email != email) and UserRepository(
            self.session
        ).email_exists(email):
            raise ConflictError("Este e-mail já está em uso.", code="EMAIL_IN_USE")
        return email

    def _role(self, name: RoleName) -> Any:
        role = RoleRepository(self.session).get_by_name(name)
        if role is None:  # pragma: no cover - perfis vêm da migration inicial
            raise BadRequestError("Perfil inválido.", code="ROLE_INVALID")
        return role

    def create_user(self, data: UserCreate) -> User:
        email = self._check_email(data.email)
        self._check_department(data.department_id)
        user = User(
            company_id=self.company_id,
            role=self._role(data.role),
            department_id=data.department_id,
            name=data.name,
            email=email,
            password_hash=hash_password(data.password),
        )
        self.session.add(user)
        self.session.flush()
        self._record(AuditAction.USER_CREATED, "user", user.id, {"role": data.role.value})
        self.session.commit()
        return self.get_user(user.id)

    def update_user(self, user_id: int, data: UserUpdate) -> User:
        user = self.get_user(user_id)
        changes = data.model_dump(exclude_unset=True)
        is_self = user.id == self.admin.id
        current_role = user.role.name

        new_role = changes.get("role")
        if new_role is not None and new_role != current_role:
            if is_self:
                raise BadRequestError(
                    "Você não pode alterar o seu próprio perfil.", code="SELF_LOCKOUT"
                )
            if current_role is RoleName.ADMIN:
                self._ensure_other_admin(user)
        if changes.get("is_active") is False and user.is_active:
            if is_self:
                raise BadRequestError("Você não pode desativar a si mesmo.", code="SELF_LOCKOUT")
            if current_role is RoleName.ADMIN:
                self._ensure_other_admin(user)

        if "email" in changes and changes["email"] is not None:
            user.email = self._check_email(changes["email"], current=user)
        if "department_id" in changes:
            self._check_department(changes["department_id"])
            user.department_id = changes["department_id"]
        if changes.get("name"):
            user.name = changes["name"]
        if changes.get("password"):
            user.password_hash = hash_password(changes["password"])
        if changes.get("is_active") is not None:
            user.is_active = changes["is_active"]

        # Nunca registrar valores sensíveis: só os nomes dos campos alterados.
        # Perfil é auditado à parte (PERMISSION_CHANGED).
        fields = sorted(
            k for k, v in changes.items() if k != "role" and (v is not None or k == "department_id")
        )
        if new_role is not None and new_role != current_role:
            user.role = self._role(new_role)
            self._record(
                AuditAction.PERMISSION_CHANGED,
                "user",
                user.id,
                {"from": current_role.value, "to": new_role.value},
            )
        if fields:
            self._record(AuditAction.USER_UPDATED, "user", user.id, {"fields": fields})
        self.session.commit()
        return self.get_user(user.id)

    def deactivate_user(self, user_id: int) -> None:
        user = self.get_user(user_id)
        if user.id == self.admin.id:
            raise BadRequestError("Você não pode desativar a si mesmo.", code="SELF_LOCKOUT")
        if not user.is_active:
            return
        if user.role.name is RoleName.ADMIN:
            self._ensure_other_admin(user)
        user.is_active = False
        self._record(AuditAction.USER_DELETED, "user", user.id, {"soft": True})
        self.session.commit()

    def _ensure_other_admin(self, user: User) -> None:
        active_others = self.repo.count_active_admins(self.company_id) - (
            1 if user.is_active else 0
        )
        if active_others < 1:
            raise ConflictError(
                "A empresa precisa de pelo menos um administrador ativo.", code="LAST_ADMIN"
            )

    # --- Departamentos, categorias e SLA ----------------------------------------------

    def _get[T: (Department, Category, SLAPolicy)](self, model: type[T], entity_id: int) -> T:
        entity = self.repo.get_scoped(model, self.company_id, entity_id)
        if entity is None:
            raise NotFoundError(f"{_ENTITY_LABELS[model].capitalize()} não encontrado(a).")
        return entity

    def _check_name(
        self, model: type[Department | Category | SLAPolicy], name: str, exclude_id: int | None
    ) -> None:
        if self.repo.name_taken(model, self.company_id, name, exclude_id=exclude_id):
            raise ConflictError(
                f"Já existe {_ENTITY_LABELS[model]} com este nome.", code="NAME_IN_USE"
            )

    def _settings_changed(self, entity: str, entity_id: int, operation: str) -> None:
        self._record(AuditAction.SETTINGS_CHANGED, entity, entity_id, {"operation": operation})

    def list_departments(self) -> list[tuple[Department, int]]:
        return self.repo.list_departments(self.company_id)

    def save_department(
        self, data: DepartmentWrite, department_id: int | None = None
    ) -> Department:
        department = (
            self._get(Department, department_id)
            if department_id is not None
            else Department(company_id=self.company_id)
        )
        self._check_name(Department, data.name, department_id)
        department.name = data.name
        department.description = data.description
        self.session.add(department)
        self.session.flush()
        self._settings_changed("department", department.id, "update" if department_id else "create")
        self.session.commit()
        return department

    def delete_department(self, department_id: int) -> None:
        department = self._get(Department, department_id)
        self.repo.clear_department(self.company_id, department.id)
        self._settings_changed("department", department.id, "delete")
        self.session.delete(department)
        self.session.commit()

    def list_categories(self) -> list[Category]:
        return list(self.repo.list_categories(self.company_id))

    def save_category(self, data: CategoryWrite, category_id: int | None = None) -> Category:
        category = (
            self._get(Category, category_id)
            if category_id is not None
            else Category(company_id=self.company_id)
        )
        self._check_name(Category, data.name, category_id)
        if data.default_sla_policy_id is not None:
            self._get_sla_for_reference(data.default_sla_policy_id)
        for field, value in data.model_dump().items():
            setattr(category, field, value)
        self.session.add(category)
        self.session.flush()
        self._settings_changed("category", category.id, "update" if category_id else "create")
        self.session.commit()
        return category

    def delete_category(self, category_id: int) -> None:
        category = self._get(Category, category_id)
        if self.repo.category_usage(self.company_id, category.id):
            raise ConflictError(
                "Categoria em uso por chamados ou artigos. Desative-a em vez de excluir.",
                code="CATEGORY_IN_USE",
            )
        self._settings_changed("category", category.id, "delete")
        self.session.delete(category)
        self.session.commit()

    def _get_sla_for_reference(self, policy_id: int) -> SLAPolicy:
        policy = self.repo.get_scoped(SLAPolicy, self.company_id, policy_id)
        if policy is None:
            raise BadRequestError("Política de SLA inválida.", code="SLA_POLICY_INVALID")
        return policy

    def list_sla_policies(self) -> list[SLAPolicy]:
        return list(self.repo.list_sla_policies(self.company_id))

    def save_sla_policy(self, data: SLAPolicyWrite, policy_id: int | None = None) -> SLAPolicy:
        policy = (
            self._get(SLAPolicy, policy_id)
            if policy_id is not None
            else SLAPolicy(company_id=self.company_id)
        )
        self._check_name(SLAPolicy, data.name, policy_id)
        for field, value in data.model_dump().items():
            setattr(policy, field, value)
        self.session.add(policy)
        self.session.flush()
        self._settings_changed("sla_policy", policy.id, "update" if policy_id else "create")
        self.session.commit()
        return policy

    def delete_sla_policy(self, policy_id: int) -> None:
        policy = self._get(SLAPolicy, policy_id)
        if self.repo.sla_usage(self.company_id, policy.id):
            raise ConflictError(
                "Política em uso por chamados ou categorias. Desative-a em vez de excluir.",
                code="SLA_POLICY_IN_USE",
            )
        self._settings_changed("sla_policy", policy.id, "delete")
        self.session.delete(policy)
        self.session.commit()

    # --- Empresa -----------------------------------------------------------------------

    def get_company(self) -> Company:
        company = self.session.get(Company, self.company_id)
        if company is None:  # pragma: no cover - o usuário sempre tem empresa
            raise NotFoundError()
        return company

    def update_company(self, data: CompanyUpdate) -> Company:
        company = self.get_company()
        if data.cnpj and data.cnpj != company.cnpj:
            taken = self.session.scalars(
                select(Company.id).where(Company.cnpj == data.cnpj, Company.id != company.id)
            ).first()
            if taken is not None:
                raise ConflictError("Este CNPJ já está cadastrado.", code="CNPJ_IN_USE")
        for field, value in data.model_dump().items():
            setattr(company, field, value)
        self._settings_changed("company", company.id, "update")
        self.session.commit()
        return company

    # --- Auditoria e IA ----------------------------------------------------------------

    def list_audit(self, params: PageParams, **filters: Any) -> Page[AuditLogRead]:
        items, total = self.repo.list_audit(
            self.company_id, offset=params.offset, limit=params.limit, **filters
        )
        return Page.build([AuditLogRead.model_validate(i) for i in items], total, params)

    def ai_settings(self, settings: Settings, model: str | None) -> AISettingsRead:
        since = utcnow() - timedelta(days=30)
        total, succeeded = self.repo.ai_usage(self.company_id, since)
        ratings, positive = self.repo.ai_feedback(self.company_id, since)
        generative = settings.AI_PROVIDER != "none"
        return AISettingsRead(
            provider=settings.AI_PROVIDER,
            model=model if generative else None,
            generative_enabled=generative,
            vector_store=settings.VECTOR_STORE_PROVIDER,
            actions_last_30_days=total,
            success_rate=round(succeeded / total, 3) if total else None,
            positive_feedback_rate=round(positive / ratings, 3) if ratings else None,
        )


def list_technicians(session: Session, user: User) -> list[User]:
    """Técnicos e admins ativos da empresa (para atribuir chamados). Equipe apenas."""
    if user.role.name not in (RoleName.TECHNICIAN, RoleName.ADMIN):
        raise ForbiddenError()
    return list(AdminRepository(session).list_technicians(user.company_id))
