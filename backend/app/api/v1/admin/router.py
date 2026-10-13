"""Administração da empresa (§32, §50): usuários, departamentos, SLA, empresa e auditoria.

Categorias ficam em `/categories` e a configuração de IA em `/ai/settings`.
"""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import AdminUser, ClientIpDep, CurrentUser, SessionDep
from app.models.enums import AuditAction, RoleName
from app.schemas.admin import (
    AuditLogRead,
    CompanyRead,
    CompanyUpdate,
    DepartmentRead,
    DepartmentWrite,
    SLAPolicyRead,
    SLAPolicyWrite,
    TechnicianOption,
    UserAdminRead,
    UserCreate,
    UserUpdate,
)
from app.schemas.common import ErrorResponse, Page, PageParams
from app.services.admin import AdminService, list_technicians

NOT_FOUND = {404: {"model": ErrorResponse}}


def get_admin_service(user: AdminUser, session: SessionDep, ip: ClientIpDep) -> AdminService:
    return AdminService(session, user, ip_address=ip)


AdminDep = Annotated[AdminService, Depends(get_admin_service)]
PageQuery = Annotated[int, Query(ge=1)]
PageSizeQuery = Annotated[int, Query(ge=1, le=100)]

# --- Usuários -------------------------------------------------------------------

users_router = APIRouter(prefix="/users", tags=["users"])


@users_router.get("", response_model=Page[UserAdminRead], summary="Usuários da empresa")
def list_users(
    service: AdminDep,
    q: Annotated[str | None, Query(max_length=100)] = None,
    role: RoleName | None = None,
    is_active: bool | None = None,
    page: PageQuery = 1,
    page_size: PageSizeQuery = 20,
) -> Page[UserAdminRead]:
    params = PageParams(page=page, page_size=page_size)
    items, total = service.list_users(params, search=q, role=role, is_active=is_active)
    return Page.build([UserAdminRead.model_validate(u) for u in items], total, params)


@users_router.get(
    "/technicians",
    response_model=list[TechnicianOption],
    summary="Técnicos ativos (para atribuir chamados)",
)
def technicians(user: CurrentUser, session: SessionDep) -> list[TechnicianOption]:
    return [TechnicianOption.model_validate(u) for u in list_technicians(session, user)]


@users_router.get("/{user_id}", response_model=UserAdminRead, responses=NOT_FOUND)
def get_user(user_id: int, service: AdminDep) -> UserAdminRead:
    return UserAdminRead.model_validate(service.get_user(user_id))


@users_router.post("", response_model=UserAdminRead, status_code=status.HTTP_201_CREATED)
def create_user(data: UserCreate, service: AdminDep) -> UserAdminRead:
    return UserAdminRead.model_validate(service.create_user(data))


@users_router.put("/{user_id}", response_model=UserAdminRead, responses=NOT_FOUND)
def update_user(user_id: int, data: UserUpdate, service: AdminDep) -> UserAdminRead:
    return UserAdminRead.model_validate(service.update_user(user_id, data))


@users_router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
    summary="Desativa o usuário (o histórico é preservado)",
)
def delete_user(user_id: int, service: AdminDep) -> Response:
    service.deactivate_user(user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Departamentos ------------------------------------------------------------------

departments_router = APIRouter(prefix="/departments", tags=["departments"])


@departments_router.get("", response_model=list[DepartmentRead])
def list_departments(service: AdminDep) -> list[DepartmentRead]:
    return [
        DepartmentRead(id=d.id, name=d.name, description=d.description, user_count=count)
        for d, count in service.list_departments()
    ]


@departments_router.post("", response_model=DepartmentRead, status_code=status.HTTP_201_CREATED)
def create_department(data: DepartmentWrite, service: AdminDep) -> DepartmentRead:
    return DepartmentRead.model_validate(service.save_department(data))


@departments_router.put("/{department_id}", response_model=DepartmentRead, responses=NOT_FOUND)
def update_department(
    department_id: int, data: DepartmentWrite, service: AdminDep
) -> DepartmentRead:
    return DepartmentRead.model_validate(service.save_department(data, department_id))


@departments_router.delete(
    "/{department_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND
)
def delete_department(department_id: int, service: AdminDep) -> Response:
    service.delete_department(department_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- SLA ------------------------------------------------------------------------------

sla_router = APIRouter(prefix="/sla-policies", tags=["sla"])


@sla_router.get("", response_model=list[SLAPolicyRead])
def list_sla_policies(service: AdminDep) -> list[SLAPolicyRead]:
    return [SLAPolicyRead.model_validate(p) for p in service.list_sla_policies()]


@sla_router.post("", response_model=SLAPolicyRead, status_code=status.HTTP_201_CREATED)
def create_sla_policy(data: SLAPolicyWrite, service: AdminDep) -> SLAPolicyRead:
    return SLAPolicyRead.model_validate(service.save_sla_policy(data))


@sla_router.put("/{policy_id}", response_model=SLAPolicyRead, responses=NOT_FOUND)
def update_sla_policy(policy_id: int, data: SLAPolicyWrite, service: AdminDep) -> SLAPolicyRead:
    return SLAPolicyRead.model_validate(service.save_sla_policy(data, policy_id))


@sla_router.delete("/{policy_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
def delete_sla_policy(policy_id: int, service: AdminDep) -> Response:
    service.delete_sla_policy(policy_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Empresa e auditoria --------------------------------------------------------------

company_router = APIRouter(prefix="/company", tags=["company"])


@company_router.get("", response_model=CompanyRead, summary="Dados da empresa")
def get_company(service: AdminDep) -> CompanyRead:
    return CompanyRead.model_validate(service.get_company())


@company_router.put("", response_model=CompanyRead, summary="Atualiza os dados da empresa")
def update_company(data: CompanyUpdate, service: AdminDep) -> CompanyRead:
    return CompanyRead.model_validate(service.update_company(data))


audit_router = APIRouter(prefix="/audit-logs", tags=["audit"])


@audit_router.get("", response_model=Page[AuditLogRead], summary="Trilha de auditoria")
def list_audit_logs(
    service: AdminDep,
    action: AuditAction | None = None,
    entity: Annotated[str | None, Query(max_length=64)] = None,
    user_id: int | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    page: PageQuery = 1,
    page_size: PageSizeQuery = 20,
) -> Page[AuditLogRead]:
    return service.list_audit(
        PageParams(page=page, page_size=page_size),
        action=action,
        entity=entity,
        user_id=user_id,
        since=_as_utc(since),
        until=_as_utc(until),
    )


def _as_utc(value: datetime | None) -> datetime | None:
    """Datas sem fuso na query string são tratadas como UTC."""
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=UTC)
