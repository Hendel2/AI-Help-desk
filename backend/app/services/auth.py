"""Regras de autenticação: cadastro, login e renovação de tokens.

A rota não decide nada: valida o corpo, chama o serviço e devolve o schema.
"""

import logging
from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import (
    AppError,
    BadRequestError,
    ConflictError,
    ForbiddenError,
    UnauthorizedError,
)
from app.core.security import (
    InvalidTokenError,
    TokenPayload,
    create_token,
    decode_token,
    hash_password,
    issued_before_password_change,
    needs_rehash,
    password_change_timestamp,
    verify_password,
)
from app.models import Company, User
from app.models.enums import AuditAction, RoleName
from app.repositories.audit_log import AuditLogRepository
from app.repositories.user import CompanyRepository, RoleRepository, UserRepository
from app.schemas.auth import RegisterRequest, TokenResponse

logger = logging.getLogger("app.auth")

INVALID_CREDENTIALS_MESSAGE = "E-mail ou senha inválidos."


class AuthService:
    def __init__(self, session: Session, settings: Settings) -> None:
        self.session = session
        self.settings = settings
        self.users = UserRepository(session)
        self.roles = RoleRepository(session)
        self.companies = CompanyRepository(session)
        self.audit = AuditLogRepository(session)

    # --- Tokens -------------------------------------------------------------

    def issue_tokens(self, user: User) -> TokenResponse:
        secret = self.settings.JWT_SECRET.get_secret_value()
        access_ttl = timedelta(minutes=self.settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        common = {
            "user_id": user.id,
            "company_id": user.company_id,
            "role": user.role.name.value,
            "secret": secret,
        }
        return TokenResponse(
            access_token=create_token(token_type="access", expires_in=access_ttl, **common),
            refresh_token=create_token(
                token_type="refresh",
                expires_in=timedelta(days=self.settings.REFRESH_TOKEN_EXPIRE_DAYS),
                **common,
            ),
            expires_in=int(access_ttl.total_seconds()),
        )

    def decode(self, token: str, *, expected_type: str = "access") -> TokenPayload:
        try:
            return decode_token(
                token,
                secret=self.settings.JWT_SECRET.get_secret_value(),
                expected_type=expected_type,  # type: ignore[arg-type]
            )
        except InvalidTokenError as exc:
            raise UnauthorizedError(
                "Sessão inválida ou expirada. Entre novamente.", code="INVALID_TOKEN"
            ) from exc

    def resolve_token_user(self, payload: TokenPayload) -> User:
        """Carrega o usuário do token aplicando o escopo da empresa do próprio token."""
        user = self.users.get_with_role(payload.company_id, payload.sub)
        if user is None:
            # Usuário removido ou token forjado com outra empresa.
            raise UnauthorizedError(
                "Sessão inválida ou expirada. Entre novamente.", code="INVALID_TOKEN"
            )
        if not user.is_active:
            raise ForbiddenError("Esta conta está desativada.", code="ACCOUNT_INACTIVE")
        if issued_before_password_change(payload.iat, user.password_changed_at):
            # Senha trocada/redefinida depois da emissão: a sessão antiga é encerrada.
            raise UnauthorizedError(
                "Sua senha foi alterada. Entre novamente.", code="INVALID_TOKEN"
            )
        return user

    # --- Casos de uso -------------------------------------------------------

    def login(
        self, email: str, password: str, *, ip_address: str | None = None
    ) -> tuple[User, TokenResponse]:
        user = self.users.get_by_email(email)
        if user is None or not verify_password(password, user.password_hash):
            self.audit.record(
                action=AuditAction.LOGIN_FAILED,
                entity="user",
                entity_id=user.id if user else None,
                company_id=user.company_id if user else None,
                user_id=user.id if user else None,
                metadata={"email": email.strip().lower()},
                ip_address=ip_address,
            )
            self.session.commit()
            raise UnauthorizedError(INVALID_CREDENTIALS_MESSAGE, code="INVALID_CREDENTIALS")

        if not user.is_active:
            raise ForbiddenError("Esta conta está desativada.", code="ACCOUNT_INACTIVE")

        # Atualiza o hash se os parâmetros do Argon2 evoluíram (senha em mãos agora).
        if needs_rehash(user.password_hash):
            user.password_hash = hash_password(password)

        tokens = self.issue_tokens(user)
        self.audit.record(
            action=AuditAction.LOGIN_SUCCEEDED,
            entity="user",
            entity_id=user.id,
            company_id=user.company_id,
            user_id=user.id,
            ip_address=ip_address,
        )
        self.session.commit()
        return user, tokens

    def change_password(
        self,
        user: User,
        current_password: str,
        new_password: str,
        *,
        ip_address: str | None = None,
    ) -> TokenResponse:
        """Troca a senha e encerra as outras sessões; devolve tokens novos para esta."""
        if not verify_password(current_password, user.password_hash):
            raise BadRequestError("A senha atual está incorreta.", code="INVALID_PASSWORD")
        if verify_password(new_password, user.password_hash):
            raise BadRequestError(
                "A nova senha precisa ser diferente da atual.", code="PASSWORD_UNCHANGED"
            )
        user.password_hash = hash_password(new_password)
        user.password_changed_at = password_change_timestamp()
        self.audit.record(
            action=AuditAction.USER_UPDATED,
            entity="user",
            entity_id=user.id,
            company_id=user.company_id,
            user_id=user.id,
            metadata={"fields": ["password"], "self_service": True},
            ip_address=ip_address,
        )
        tokens = self.issue_tokens(user)
        self.session.commit()
        return tokens

    def register(
        self, data: RegisterRequest, *, ip_address: str | None = None
    ) -> tuple[User, TokenResponse]:
        """Cria empresa + primeiro usuário (ADMIN). Convites de usuários: etapa 08."""
        email = str(data.email).strip().lower()
        if self.users.email_exists(email):
            raise ConflictError("Este e-mail já está cadastrado.", code="EMAIL_ALREADY_REGISTERED")

        admin_role = self.roles.get_by_name(RoleName.ADMIN)
        if admin_role is None:
            # Os perfis são criados pela migration inicial.
            logger.error("Perfis de acesso ausentes: execute 'alembic upgrade head'")
            raise AppError(
                "Cadastro indisponível no momento.",
                code="ROLES_NOT_INITIALIZED",
            )

        company = self.companies.add(Company(name=data.company_name, cnpj=data.cnpj, email=email))
        user = self.users.add(
            company.id,
            User(
                role_id=admin_role.id,
                name=data.name,
                email=email,
                password_hash=hash_password(data.password),
            ),
        )
        self.audit.record(
            action=AuditAction.USER_CREATED,
            entity="user",
            entity_id=user.id,
            company_id=company.id,
            user_id=user.id,
            metadata={"self_registration": True, "role": RoleName.ADMIN.value},
            ip_address=ip_address,
        )
        self.session.commit()
        self.session.refresh(user)
        return user, self.issue_tokens(user)

    def refresh(self, refresh_token: str) -> tuple[User, TokenResponse]:
        payload = self.decode(refresh_token, expected_type="refresh")
        user = self.resolve_token_user(payload)
        return user, self.issue_tokens(user)
