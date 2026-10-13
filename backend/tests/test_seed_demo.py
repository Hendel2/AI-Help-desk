"""O seed de demonstração precisa gerar dados coerentes e ser idempotente."""

from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.cli.seed_demo import DEMO_COMPANY, seed
from app.models import Company, KnowledgeArticle, KnowledgeChunk, Ticket, TicketHistory, User
from app.models.enums import RoleName, TicketStatus
from app.services.ai.embeddings import HashingEmbedder
from app.services.ai.rag import RAGService
from app.services.ai.vector_store import InMemoryVectorStore


def test_seed_creates_a_consistent_demo_company(
    db_session: Session, seed_roles: dict[RoleName, Any]
) -> None:
    assert seed(db_session, InMemoryVectorStore()) is True

    company = db_session.scalars(select(Company).where(Company.name == DEMO_COMPANY)).one()
    tickets = db_session.scalars(select(Ticket).where(Ticket.company_id == company.id)).all()
    users = db_session.scalars(select(User).where(User.company_id == company.id)).all()

    assert {user.role.name for user in users} == set(RoleName)
    assert len(tickets) >= 30
    numbers = sorted(ticket.ticket_number for ticket in tickets)
    assert numbers[0] == "HD-000001"
    assert len(set(numbers)) == len(numbers)
    for ticket in tickets:
        # Todo chamado tem histórico de criação e prazos coerentes.
        assert ticket.history[0].action.value == "CREATED"
        assert ticket.response_deadline is not None
        assert ticket.response_deadline <= ticket.resolution_deadline  # type: ignore[operator]
        if ticket.status in {TicketStatus.RESOLVED, TicketStatus.CLOSED}:
            assert ticket.technician_id is not None
            assert ticket.resolved_at is not None and ticket.resolved_at >= ticket.created_at
        if ticket.status is TicketStatus.OPEN:
            assert ticket.technician_id is None


def test_seed_is_idempotent(db_session: Session, seed_roles: dict[RoleName, Any]) -> None:
    assert seed(db_session, InMemoryVectorStore()) is True
    count = db_session.scalar(select(func.count()).select_from(TicketHistory))

    assert seed(db_session, InMemoryVectorStore()) is False
    assert db_session.scalar(select(func.count()).select_from(TicketHistory)) == count


def test_demo_users_can_log_in(
    client: Any, db_session: Session, seed_roles: dict[RoleName, Any]
) -> None:
    seed(db_session, InMemoryVectorStore())

    response = client.post(
        "/api/v1/auth/login", json={"email": "tecnico@demo.helpdesk", "password": "demo12345"}
    )

    assert response.status_code == 200
    listing = client.get(
        "/api/v1/tickets",
        headers={"Authorization": f"Bearer {response.json()['access_token']}"},
    ).json()
    assert listing["total"] >= 30


def test_seed_numbers_follow_the_opening_order(
    db_session: Session, seed_roles: dict[RoleName, Any]
) -> None:
    seed(db_session, InMemoryVectorStore())

    tickets = db_session.scalars(select(Ticket).order_by(Ticket.created_at)).all()

    assert [t.ticket_number for t in tickets] == sorted(t.ticket_number for t in tickets)


def test_seed_creates_searchable_knowledge(
    app: Any, client: Any, db_session: Session, seed_roles: dict[RoleName, Any]
) -> None:
    # Mesmo banco vetorial da API (como o Chroma compartilhado em produção).
    seed(db_session, app.state.vector_store)
    token = client.post(
        "/api/v1/auth/login", json={"email": "usuario@demo.helpdesk", "password": "demo12345"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    listing = client.get("/api/v1/knowledge", headers=headers).json()
    suggestions = client.get(
        "/api/v1/knowledge/suggest?q=minha vpn diz falha de autenticação", headers=headers
    ).json()

    assert listing["total"] == 8
    assert suggestions[0]["title"] == "Falha de autenticação na VPN"


def test_seed_completes_knowledge_missing_from_an_older_demo(
    db_session: Session, seed_roles: dict[RoleName, Any]
) -> None:
    store = InMemoryVectorStore()
    assert seed(db_session, store=store)
    # Simula um banco populado antes de existir a base de conhecimento.
    db_session.execute(delete(KnowledgeChunk))
    db_session.execute(delete(KnowledgeArticle))
    db_session.commit()

    assert seed(db_session, store=store) is True
    company = db_session.scalars(select(Company).where(Company.name == DEMO_COMPANY)).one()
    rag = RAGService(db_session, store, HashingEmbedder())
    assert rag.search(company.id, "VPN não conecta, falha de autenticação")
    assert seed(db_session, store=store) is False  # agora está completa
