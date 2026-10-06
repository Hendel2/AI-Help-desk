"""Rotas de autenticação: cadastro, login, renovação e usuário atual."""

from fastapi import APIRouter, status

from app.api.deps import AuthServiceDep, ClientIpDep, CurrentUser
from app.schemas.auth import (
    CurrentUserResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)
from app.schemas.common import ErrorResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastra uma empresa e seu primeiro administrador",
    responses={409: {"model": ErrorResponse, "description": "E-mail já cadastrado"}},
)
def register(data: RegisterRequest, auth: AuthServiceDep, ip: ClientIpDep) -> TokenResponse:
    _, tokens = auth.register(data, ip_address=ip)
    return tokens


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Autentica e devolve os tokens",
    responses={401: {"model": ErrorResponse, "description": "Credenciais inválidas"}},
)
def login(data: LoginRequest, auth: AuthServiceDep, ip: ClientIpDep) -> TokenResponse:
    _, tokens = auth.login(str(data.email), data.password, ip_address=ip)
    return tokens


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Renova o access token a partir do refresh token",
    responses={401: {"model": ErrorResponse, "description": "Refresh token inválido"}},
)
def refresh(data: RefreshRequest, auth: AuthServiceDep) -> TokenResponse:
    _, tokens = auth.refresh(data.refresh_token)
    return tokens


@router.get(
    "/me",
    response_model=CurrentUserResponse,
    summary="Dados do usuário autenticado",
    responses={401: {"model": ErrorResponse, "description": "Não autenticado"}},
)
def me(user: CurrentUser) -> CurrentUserResponse:
    return CurrentUserResponse(
        id=user.id,
        company_id=user.company_id,
        name=user.name,
        email=user.email,
        role=user.role.name,
        department_id=user.department_id,
        avatar=user.avatar,
        is_active=user.is_active,
    )
