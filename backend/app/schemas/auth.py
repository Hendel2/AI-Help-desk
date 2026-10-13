"""Schemas de autenticação e do usuário autenticado."""

from typing import Annotated

from pydantic import BaseModel, EmailStr, Field, StringConstraints, field_validator

from app.models.enums import RoleName
from app.schemas.common import ORMModel, normalize_cnpj

# Limites alinhados às colunas do modelo e ao Argon2.
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128

# Cadastro: aplica a política de senha. Login: apenas não-vazia — validar o
# tamanho mínimo aqui responderia 422 (em vez de 401) para senhas curtas,
# revelando a política e diferenciando a resposta de credenciais inválidas.
Password = Annotated[str, Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)]
SubmittedPassword = Annotated[str, Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=150)]
CompanyName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=150)]


class LoginRequest(BaseModel):
    email: EmailStr
    password: SubmittedPassword


class RegisterRequest(BaseModel):
    """Cadastro self-service: cria a empresa e seu primeiro usuário (ADMIN)."""

    company_name: CompanyName
    name: Name
    email: EmailStr
    password: Password
    cnpj: str | None = Field(default=None, description="Somente dígitos (14).")

    @field_validator("cnpj", mode="before")
    @classmethod
    def _normalize_cnpj(cls, value: object) -> object:
        return normalize_cnpj(value)


class ChangePasswordRequest(BaseModel):
    current_password: SubmittedPassword
    new_password: Password


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Validade do access token em segundos.")


class CurrentUserResponse(ORMModel):
    """Dados do usuário autenticado (`GET /auth/me`). Nunca inclui o hash da senha."""

    id: int
    company_id: int
    name: str
    email: str
    role: RoleName
    department_id: int | None = None
    avatar: str | None = None
    is_active: bool
