"""Dependências compartilhadas pelas rotas."""

from collections.abc import Callable, Iterator
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import SessionLocal
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.models import User
from app.models.enums import RoleName
from app.services.auth import AuthService


def get_db() -> Iterator[Session]:
    """Uma sessão por requisição; a transação é controlada pela camada de serviço."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


SessionDep = Annotated[Session, Depends(get_db)]


def get_app_settings(request: Request) -> Settings:
    """Settings da instância em execução (definidas por `create_app`)."""
    return getattr(request.app.state, "settings", None) or get_settings()


SettingsDep = Annotated[Settings, Depends(get_app_settings)]

# auto_error=False: o erro é formatado pelos nossos handlers, não pelo FastAPI.
_bearer_scheme = HTTPBearer(auto_error=False, description="Token JWT de acesso")
BearerDep = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)]


def get_auth_service(session: SessionDep, settings: SettingsDep) -> AuthService:
    return AuthService(session, settings)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


def get_current_user(credentials: BearerDep, auth: AuthServiceDep) -> User:
    """Usuário autenticado. O `company_id` sempre vem do token, nunca do cliente."""
    if credentials is None or not credentials.credentials.strip():
        raise UnauthorizedError(
            "Autenticação necessária.",
            code="NOT_AUTHENTICATED",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = auth.decode(credentials.credentials, expected_type="access")
    return auth.resolve_token_user(payload)


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*allowed: RoleName) -> Callable[[User], User]:
    """Autorização por perfil. A checagem real é sempre aqui, no backend."""

    def dependency(user: CurrentUser) -> User:
        if user.role.name not in allowed:
            raise ForbiddenError()
        return user

    return dependency


# Atalhos usados pelas rotas das próximas etapas.
AdminUser = Annotated[User, Depends(require_roles(RoleName.ADMIN))]
StaffUser = Annotated[User, Depends(require_roles(RoleName.ADMIN, RoleName.TECHNICIAN))]


def get_client_ip(request: Request) -> str | None:
    """IP do cliente para auditoria (sem confiar em X-Forwarded-For sem proxy)."""
    return request.client.host if request.client else None


ClientIpDep = Annotated[str | None, Depends(get_client_ip)]
