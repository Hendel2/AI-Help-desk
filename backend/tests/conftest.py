"""Fixtures compartilhadas. Banco SQLite em memória (StaticPool), novo a cada teste."""

from collections.abc import Callable, Iterator
from itertools import count
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.core.config import Settings
from app.core.database import create_db_engine
from app.core.security import hash_password
from app.main import create_app
from app.models import Base, Category, Company, Role, SLAPolicy, Ticket, User
from app.models.enums import RoleName, TicketPriority
from app.schemas.ticket import TicketCreate
from app.services.auth import AuthService
from app.services.tickets import TicketService

TEST_JWT_SECRET = "test-jwt-secret-with-at-least-32-characters"


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        UPLOAD_DIR=tmp_path / "uploads",
        MAX_UPLOAD_SIZE_MB=1,
        SLA_MONITOR_INTERVAL_SECONDS=0,
        VECTOR_STORE_PROVIDER="memory",
        ENVIRONMENT="test",
        DATABASE_URL="sqlite://",
        JWT_SECRET=TEST_JWT_SECRET,
        CORS_ORIGINS="http://localhost:5173",
        LOG_LEVEL="WARNING",
    )


@pytest.fixture
def engine() -> Iterator[Engine]:
    # Mesmo factory da aplicação (inclui PRAGMA foreign_keys=ON no SQLite).
    test_engine = create_db_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(test_engine)
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture
def db_session(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    session = session_factory()
    yield session
    session.rollback()
    session.close()


@pytest.fixture
def app(settings: Settings, session_factory: sessionmaker[Session]) -> FastAPI:
    application = create_app(settings)

    def override_get_db() -> Iterator[Session]:
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    application.dependency_overrides[get_db] = override_get_db
    return application


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


# --- Helpers de dados -------------------------------------------------------

_sequence = count(1)


@pytest.fixture
def make_company(db_session: Session) -> Callable[..., Company]:
    def _make(name: str | None = None, **fields: object) -> Company:
        company = Company(name=name or f"Empresa {next(_sequence)}", **fields)
        db_session.add(company)
        db_session.flush()
        return company

    return _make


@pytest.fixture
def get_role(db_session: Session) -> Callable[[RoleName], Role]:
    """Retorna o perfil, criando-o se ainda não existir (create_all não popula roles)."""

    def _get(name: RoleName) -> Role:
        role = db_session.scalars(select(Role).where(Role.name == name)).one_or_none()
        if role is None:
            role = Role(name=name, description=name.value.title())
            db_session.add(role)
            db_session.flush()
        return role

    return _get


@pytest.fixture
def seed_roles(get_role: Callable[[RoleName], Role]) -> dict[RoleName, Role]:
    """Perfis criados pela migration inicial (create_all não os popula)."""
    return {name: get_role(name) for name in RoleName}


@pytest.fixture
def make_user(db_session: Session, get_role: Callable[[RoleName], Role]) -> Callable[..., User]:
    def _make(company: Company, role: RoleName = RoleName.USER, **fields: object) -> User:
        number = next(_sequence)
        user = User(
            company_id=company.id,
            role_id=get_role(role).id,
            name=fields.pop("name", f"Usuário {number}"),
            email=fields.pop("email", f"user{number}@example.com"),
            password_hash=(
                hash_password(str(password))
                if (password := fields.pop("password", None)) is not None
                else fields.pop("password_hash", "not-a-real-hash")
            ),
            **fields,
        )
        db_session.add(user)
        db_session.flush()
        return user

    return _make


@pytest.fixture
def auth_headers(db_session: Session, settings: Settings) -> Callable[[User], dict[str, str]]:
    """Cabeçalho Authorization com um access token válido para o usuário."""

    def _headers(user: User) -> dict[str, str]:
        tokens = AuthService(db_session, settings).issue_tokens(user)
        return {"Authorization": f"Bearer {tokens.access_token}"}

    return _headers


# --- Helpers de chamados ----------------------------------------------------


@pytest.fixture
def make_sla_policy(db_session: Session) -> Callable[..., SLAPolicy]:
    """Política de SLA da empresa; com `priority` vira o fallback daquela prioridade."""

    def _make(
        company: Company,
        *,
        priority: TicketPriority | None = None,
        response_minutes: int = 60,
        resolution_minutes: int = 480,
        name: str | None = None,
        **fields: object,
    ) -> SLAPolicy:
        policy = SLAPolicy(
            company_id=company.id,
            name=name or f"SLA {priority.value if priority else next(_sequence)}",
            priority=priority,
            response_time_minutes=response_minutes,
            resolution_time_minutes=resolution_minutes,
            **fields,
        )
        db_session.add(policy)
        db_session.flush()
        return policy

    return _make


@pytest.fixture
def make_category(db_session: Session) -> Callable[..., Category]:
    def _make(company: Company, name: str | None = None, **fields: object) -> Category:
        category = Category(
            company_id=company.id, name=name or f"Categoria {next(_sequence)}", **fields
        )
        db_session.add(category)
        db_session.flush()
        return category

    return _make


@pytest.fixture
def make_ticket(db_session: Session) -> Callable[..., Ticket]:
    """Cria um chamado pelo serviço (gera número, prazos e histórico como em produção)."""

    def _make(
        requester: User,
        *,
        title: str = "Problema de conexão VPN",
        description: str = "A VPN não conecta desde as 08:30 de hoje.",
        category: Category | None = None,
        priority: TicketPriority | None = None,
    ) -> Ticket:
        service = TicketService(db_session)
        return service.create(
            requester,
            TicketCreate(
                title=title,
                description=description,
                category_id=category.id if category else None,
                priority=priority,
            ),
        )

    return _make
