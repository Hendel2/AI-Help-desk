"""Schemas da administração (§50): usuários, departamentos, categorias, SLA,
empresa, auditoria e configuração de IA."""

from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, EmailStr, Field, StringConstraints, field_validator, model_validator

from app.models.enums import AuditAction, RoleName, TicketPriority
from app.schemas.auth import Name, Password
from app.schemas.common import ORMModel, normalize_cnpj

ShortName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)]
Minutes = Annotated[int, Field(gt=0, le=60 * 24 * 365)]


def _blank_to_none(value: object) -> object:
    if isinstance(value, str) and not value.strip():
        return None
    return value


# --- Usuários -----------------------------------------------------------------


class DepartmentRef(ORMModel):
    id: int
    name: str


class UserAdminRead(ORMModel):
    id: int
    name: str
    email: str
    role: RoleName
    department: DepartmentRef | None
    is_active: bool
    created_at: datetime

    @field_validator("role", mode="before")
    @classmethod
    def _role_name(cls, value: object) -> object:
        return getattr(value, "name", value)


class UserCreate(BaseModel):
    name: Name
    email: EmailStr
    password: Password
    role: RoleName = RoleName.USER
    department_id: int | None = None


class UserUpdate(BaseModel):
    """Campos ausentes não mudam. `password` redefine a senha."""

    name: Name | None = None
    email: EmailStr | None = None
    password: Password | None = None
    role: RoleName | None = None
    department_id: int | None = None
    is_active: bool | None = None


class TechnicianOption(ORMModel):
    id: int
    name: str


# --- Departamentos ------------------------------------------------------------


class DepartmentRead(ORMModel):
    id: int
    name: str
    description: str | None
    user_count: int = 0


class DepartmentWrite(BaseModel):
    name: ShortName
    description: Description | None = None

    _blank = field_validator("description", mode="before")(_blank_to_none)


# --- Categorias ---------------------------------------------------------------


class CategoryAdminRead(ORMModel):
    id: int
    name: str
    description: str | None
    default_priority: TicketPriority
    default_sla_policy_id: int | None
    is_active: bool


class CategoryWrite(BaseModel):
    name: ShortName
    description: Description | None = None
    default_priority: TicketPriority = TicketPriority.MEDIUM
    default_sla_policy_id: int | None = None
    is_active: bool = True

    _blank = field_validator("description", mode="before")(_blank_to_none)


# --- SLA ----------------------------------------------------------------------


class SLAPolicyRead(ORMModel):
    id: int
    name: str
    description: str | None
    priority: TicketPriority | None
    response_time_minutes: int
    resolution_time_minutes: int
    is_active: bool


class SLAPolicyWrite(BaseModel):
    name: ShortName
    description: Description | None = None
    priority: TicketPriority | None = None
    response_time_minutes: Minutes
    resolution_time_minutes: Minutes
    is_active: bool = True

    _blank = field_validator("description", mode="before")(_blank_to_none)

    @model_validator(mode="after")
    def _resolution_after_response(self) -> "SLAPolicyWrite":
        if self.resolution_time_minutes < self.response_time_minutes:
            raise ValueError("O prazo de resolução não pode ser menor que o de primeira resposta.")
        return self


# --- Empresa ------------------------------------------------------------------


class CompanyRead(ORMModel):
    id: int
    name: str
    cnpj: str | None
    email: str | None
    phone: str | None


class CompanyUpdate(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=150)]
    cnpj: str | None = Field(default=None, description="Somente dígitos (14).")
    email: EmailStr | None = None
    phone: Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)] | None = None

    @field_validator("email", "phone", mode="before")
    @classmethod
    def _blank(cls, value: object) -> object:
        return _blank_to_none(value)

    @field_validator("cnpj", mode="before")
    @classmethod
    def _normalize_cnpj(cls, value: object) -> object:
        return normalize_cnpj(value)


# --- Auditoria ----------------------------------------------------------------


class AuditUserRef(ORMModel):
    id: int
    name: str


class AuditLogRead(ORMModel):
    id: int
    action: AuditAction
    entity: str
    entity_id: str | None
    user: AuditUserRef | None
    metadata: dict[str, Any] | None = Field(default=None, validation_alias="metadata_")
    ip_address: str | None
    created_at: datetime


# --- IA -----------------------------------------------------------------------


class AISettingsRead(BaseModel):
    """Configuração da IA (definida por variáveis de ambiente; somente leitura)."""

    provider: str
    model: str | None
    #: Reserva quando o principal falha ou a cota acaba (ex.: IA local).
    fallback_provider: str | None = None
    fallback_model: str | None = None
    generative_enabled: bool
    vector_store: str
    actions_last_30_days: int
    success_rate: float | None
    positive_feedback_rate: float | None
