"""Analytics de IA e AI Insights (§41)."""

import itertools
from collections.abc import Callable
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import AIFeedback, Category, Company, Conversation, Message, Ticket, User
from app.models.enums import (
    AIFeedbackRating,
    ConversationStatus,
    MessageRole,
    RoleName,
    TicketPriority,
    TicketStatus,
)
from app.models.types import utcnow
from app.services.insights import InsightsService

_numbers = itertools.count(1)


@pytest.fixture
def company(make_company: Callable[..., Company]) -> Company:
    return make_company(name="Empresa Alfa")


@pytest.fixture
def people(
    company: Company, make_user: Callable[..., User], db_session: Session
) -> dict[str, User]:
    users = {
        "ana": make_user(company, role=RoleName.USER, name="Ana"),
        "teo": make_user(company, role=RoleName.TECHNICIAN, name="Téo"),
    }
    db_session.commit()
    return users


@pytest.fixture
def categories(
    company: Company, make_category: Callable[..., Category], db_session: Session
) -> dict[str, Category]:
    result = {name: make_category(company, name=name) for name in ("VPN", "Impressora", "Acesso")}
    db_session.commit()
    return result


@pytest.fixture
def add_ticket(db_session: Session) -> Callable[..., Ticket]:
    def _add(
        requester: User,
        category: Category,
        *,
        days_ago: float,
        resolved_after_hours: float | None = None,
        deadline_hours: float | None = None,
    ) -> Ticket:
        opened = utcnow() - timedelta(days=days_ago)
        resolved = (
            opened + timedelta(hours=resolved_after_hours)
            if resolved_after_hours is not None
            else None
        )
        ticket = Ticket(
            company_id=requester.company_id,
            ticket_number=f"HD-{next(_numbers):06d}",
            user_id=requester.id,
            category_id=category.id,
            title="Chamado",
            description="Descrição.",
            priority=TicketPriority.MEDIUM,
            status=TicketStatus.RESOLVED if resolved else TicketStatus.OPEN,
            created_at=opened,
            updated_at=opened,
            resolved_at=resolved,
            resolution_deadline=(
                opened + timedelta(hours=deadline_hours) if deadline_hours else None
            ),
        )
        db_session.add(ticket)
        db_session.flush()
        return ticket

    return _add


def _texts(user: User, session: Session) -> list[str]:
    return [i.text for i in InsightsService(session).dashboard(user, days=30).insights]


def test_weekly_growth_share_slowest_and_sla(
    db_session: Session,
    people: dict[str, User],
    categories: dict[str, Category],
    add_ticket: Callable[..., Ticket],
) -> None:
    ana = people["ana"]
    for _ in range(4):  # semana anterior
        add_ticket(ana, categories["VPN"], days_ago=10)
    for _ in range(6):  # esta semana: +50%
        add_ticket(ana, categories["VPN"], days_ago=2)
    for _ in range(2):  # Acesso: lento e fora do SLA
        add_ticket(
            ana, categories["Acesso"], days_ago=20, resolved_after_hours=30, deadline_hours=8
        )
    for _ in range(2):
        add_ticket(ana, categories["Impressora"], days_ago=20, resolved_after_hours=2)
    db_session.commit()

    texts = _texts(people["teo"], db_session)

    assert "Chamados de VPN aumentaram 50% nesta semana (4 → 6)." in texts
    assert "VPN representa 71,4% dos chamados dos últimos 30 dias." in texts
    assert "Os chamados de Acesso têm o maior tempo médio de resolução (1 d 6 h)." in texts
    assert "Acesso concentra 2 chamados resolvidos fora do SLA no período." in texts


def test_no_insights_without_enough_data(
    db_session: Session,
    people: dict[str, User],
    categories: dict[str, Category],
    add_ticket: Callable[..., Ticket],
) -> None:
    add_ticket(people["ana"], categories["VPN"], days_ago=1)
    db_session.commit()

    result = InsightsService(db_session).dashboard(people["teo"], days=30)

    assert result.insights == []
    assert result.assistant_resolution_pct is None


def test_assistant_metrics_and_feedback_alert(
    db_session: Session, people: dict[str, User], company: Company
) -> None:
    ana = people["ana"]
    statuses = [ConversationStatus.RESOLVED] * 3 + [ConversationStatus.ESCALATED] * 2
    for status in [*statuses, ConversationStatus.ACTIVE]:
        conversation = Conversation(company_id=company.id, user_id=ana.id, status=status)
        db_session.add(conversation)
        db_session.flush()
    message = Message(conversation_id=conversation.id, role=MessageRole.ASSISTANT, content="Ok")
    db_session.add(message)
    db_session.flush()
    for rating in [AIFeedbackRating.NEGATIVE] * 3 + [AIFeedbackRating.POSITIVE] * 2:
        db_session.add(
            AIFeedback(company_id=company.id, user_id=ana.id, message_id=message.id, rating=rating)
        )
    db_session.commit()

    result = InsightsService(db_session).dashboard(people["teo"], days=30)

    assert (result.conversations, result.conversations_resolved) == (6, 3)
    assert result.assistant_resolution_pct == 60.0
    assert result.positive_feedback_pct == 40.0
    assert [i.kind for i in result.insights] == ["assistant", "feedback"]
    assert result.insights[0].text == (
        "O assistente resolveu 60% das conversas concluídas sem abrir chamado."
    )


def test_ai_dashboard_is_staff_only(
    client: TestClient, people: dict[str, User], auth_headers: Callable[[User], dict[str, str]]
) -> None:
    assert (
        client.get("/api/v1/dashboard/ai", headers=auth_headers(people["ana"])).status_code == 403
    )
    response = client.get("/api/v1/dashboard/ai?days=7", headers=auth_headers(people["teo"]))
    assert response.status_code == 200
    assert response.json()["period_days"] == 7


def test_small_base_reports_absolute_numbers_not_percent(
    db_session: Session,
    people: dict[str, User],
    categories: dict[str, Category],
    add_ticket: Callable[..., Ticket],
) -> None:
    add_ticket(people["ana"], categories["VPN"], days_ago=10)
    for _ in range(6):
        add_ticket(people["ana"], categories["VPN"], days_ago=1)
    db_session.commit()

    texts = _texts(people["teo"], db_session)

    assert "6 chamados de VPN nesta semana, contra 1 na anterior." in texts
    assert not any("%" in text and "nesta semana" in text for text in texts)
