"""Modelos: grafo de objetos, constraints, tipos e compatibilidade com o MySQL."""

import re
from collections.abc import Callable
from datetime import UTC, datetime, timedelta, timezone

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError, StatementError
from sqlalchemy.orm import Session

from app.models import (
    AIAction,
    AIFeedback,
    AuditLog,
    Base,
    Category,
    Company,
    Conversation,
    Department,
    KnowledgeArticle,
    KnowledgeChunk,
    Message,
    Notification,
    SLAPolicy,
    Ticket,
    TicketAttachment,
    TicketComment,
    TicketHistory,
    TicketRating,
    User,
)
from app.models.enums import (
    AIActionType,
    AIFeedbackRating,
    AuditAction,
    ChatIntent,
    MessageRole,
    NotificationType,
    RoleName,
    TicketHistoryAction,
    TicketPriority,
    TicketSource,
    TicketStatus,
)

MakeCompany = Callable[..., Company]
MakeUser = Callable[..., User]


def make_ticket(session: Session, company: Company, requester: User, number: str) -> Ticket:
    ticket = Ticket(
        company_id=company.id,
        ticket_number=number,
        user_id=requester.id,
        title="Sem acesso à VPN",
        description="Não consigo conectar na VPN desde ontem.",
    )
    session.add(ticket)
    session.flush()
    return ticket


def test_metadata_has_all_19_tables() -> None:
    assert set(Base.metadata.tables) == {
        "companies",
        "roles",
        "users",
        "departments",
        "categories",
        "sla_policies",
        "tickets",
        "ticket_comments",
        "ticket_attachments",
        "ticket_history",
        "notifications",
        "ticket_ratings",
        "audit_logs",
        "conversations",
        "messages",
        "knowledge_articles",
        "knowledge_chunks",
        "ai_feedback",
        "ai_actions",
    }


def test_full_object_graph(
    db_session: Session, make_company: MakeCompany, make_user: MakeUser
) -> None:
    company = make_company("ACME", cnpj="12345678000199")
    department = Department(company_id=company.id, name="TI")
    db_session.add(department)
    db_session.flush()
    requester = make_user(company, RoleName.USER, department_id=department.id)
    technician = make_user(company, RoleName.TECHNICIAN)

    sla = SLAPolicy(
        company_id=company.id,
        name="Alta",
        priority=TicketPriority.HIGH,
        response_time_minutes=60,
        resolution_time_minutes=480,
    )
    db_session.add(sla)
    db_session.flush()
    category = Category(company_id=company.id, name="VPN", default_sla_policy_id=sla.id)
    db_session.add(category)
    db_session.flush()

    ticket = Ticket(
        company_id=company.id,
        ticket_number="HD-000001",
        user_id=requester.id,
        technician_id=technician.id,
        category_id=category.id,
        sla_policy_id=sla.id,
        title="Sem acesso à VPN",
        description="Erro 809 ao conectar.",
        priority=TicketPriority.HIGH,
        source=TicketSource.CHATBOT,
        response_deadline=datetime(2026, 1, 1, 13, 0, tzinfo=UTC),
    )
    ticket.comments.append(TicketComment(user_id=technician.id, content="Verificando."))
    ticket.attachments.append(
        TicketAttachment(
            uploaded_by=requester.id,
            file_name="erro.png",
            file_path="tickets/1/3f2a.png",
            file_type="image/png",
            file_size=2048,
        )
    )
    ticket.history.append(TicketHistory(user_id=None, action=TicketHistoryAction.CREATED))
    ticket.rating = TicketRating(user_id=requester.id, rating=5, comment="Ótimo")
    db_session.add(ticket)
    db_session.flush()

    conversation = Conversation(company_id=company.id, user_id=requester.id, ticket_id=ticket.id)
    conversation.messages.append(
        Message(
            role=MessageRole.USER,
            content="Minha VPN não conecta",
            intent=ChatIntent.VPN_PROBLEM,
            confidence=0.91,
        )
    )
    conversation.messages.append(
        Message(
            role=MessageRole.ASSISTANT,
            content="Tente reiniciar o cliente.",
            sources=[{"article_id": 1, "title": "VPN"}],
        )
    )
    article = KnowledgeArticle(
        company_id=company.id,
        category_id=category.id,
        author_id=technician.id,
        title="Como configurar a VPN",
        content="Passo a passo...",
    )
    article.chunks.append(KnowledgeChunk(company_id=company.id, chunk_index=0, content="Passo"))
    action = AIAction(
        company_id=company.id,
        user_id=technician.id,
        action_type=AIActionType.SUMMARIZE_TICKET,
        input_reference=f"ticket:{ticket.id}",
        model="test-model",
        success=True,
        latency_ms=120,
    )
    db_session.add_all([conversation, article, action])
    db_session.flush()
    db_session.add_all(
        [
            AIFeedback(
                company_id=company.id,
                user_id=requester.id,
                message_id=conversation.messages[1].id,
                rating=AIFeedbackRating.POSITIVE,
            ),
            Notification(
                company_id=company.id,
                user_id=technician.id,
                type=NotificationType.TICKET_ASSIGNED,
                title="Novo chamado atribuído",
                message="HD-000001 foi atribuído a você.",
                ticket_id=ticket.id,
            ),
            AuditLog(
                company_id=company.id,
                user_id=technician.id,
                action=AuditAction.TICKET_UPDATED,
                entity="ticket",
                entity_id=str(ticket.id),
                metadata_={"field": "status", "old": "OPEN", "new": "IN_PROGRESS"},
                ip_address="2001:db8::1",
            ),
        ]
    )
    db_session.commit()
    db_session.expunge_all()

    loaded = db_session.scalars(sa.select(Ticket).where(Ticket.id == ticket.id)).one()
    assert loaded.status is TicketStatus.OPEN
    assert loaded.priority is TicketPriority.HIGH
    assert loaded.source is TicketSource.CHATBOT
    assert loaded.requester.email == requester.email
    assert loaded.requester.role.name is RoleName.USER
    assert loaded.requester.department is not None
    assert loaded.requester.company.name == "ACME"
    assert loaded.technician is not None and loaded.technician.id == technician.id
    assert loaded.category is not None and loaded.category.name == "VPN"
    assert loaded.sla_policy is not None and loaded.sla_policy.resolution_time_minutes == 480
    assert [comment.content for comment in loaded.comments] == ["Verificando."]
    assert loaded.attachments[0].file_size == 2048
    assert loaded.history[0].action is TicketHistoryAction.CREATED
    assert loaded.rating is not None and loaded.rating.rating == 5
    assert loaded.created_at.tzinfo is UTC
    assert loaded.response_deadline == datetime(2026, 1, 1, 13, 0, tzinfo=UTC)

    loaded_conversation = db_session.get(Conversation, conversation.id)
    assert loaded_conversation is not None
    assert [m.role for m in loaded_conversation.messages] == [
        MessageRole.USER,
        MessageRole.ASSISTANT,
    ]
    assert loaded_conversation.messages[1].sources == [{"article_id": 1, "title": "VPN"}]

    audit = db_session.scalars(sa.select(AuditLog)).one()
    assert audit.metadata_ == {"field": "status", "old": "OPEN", "new": "IN_PROGRESS"}
    loaded_article = db_session.get(KnowledgeArticle, article.id)
    assert loaded_article is not None and loaded_article.chunks[0].chunk_index == 0
    assert loaded_article.view_count == 0 and loaded_article.is_featured is False


def test_ticket_number_unique_per_company(
    db_session: Session, make_company: MakeCompany, make_user: MakeUser
) -> None:
    company_a, company_b = make_company(), make_company()
    user_a, user_b = make_user(company_a), make_user(company_b)

    make_ticket(db_session, company_a, user_a, "HD-000001")
    # O mesmo número é permitido em outra empresa.
    make_ticket(db_session, company_b, user_b, "HD-000001")
    db_session.commit()

    with pytest.raises(IntegrityError):
        make_ticket(db_session, company_a, user_a, "HD-000001")


def test_user_email_is_globally_unique(
    db_session: Session, make_company: MakeCompany, make_user: MakeUser
) -> None:
    make_user(make_company(), email="maria@example.com")
    with pytest.raises(IntegrityError):
        make_user(make_company(), email="maria@example.com")


def test_utc_datetime_round_trip_returns_aware_utc(
    db_session: Session, make_company: MakeCompany, make_user: MakeUser
) -> None:
    company = make_company()
    ticket = make_ticket(db_session, company, make_user(company), "HD-000001")
    brasilia = timezone(timedelta(hours=-3))
    ticket.first_response_at = datetime(2026, 3, 10, 9, 30, 15, 123456, tzinfo=brasilia)
    db_session.commit()

    raw = db_session.execute(
        sa.text("SELECT first_response_at FROM tickets WHERE id = :id"), {"id": ticket.id}
    ).scalar_one()
    # Armazenado como UTC naive.
    assert str(raw).startswith("2026-03-10 12:30:15.123456")

    db_session.expire_all()
    loaded = db_session.get(Ticket, ticket.id)
    assert loaded is not None
    assert loaded.first_response_at == datetime(2026, 3, 10, 12, 30, 15, 123456, tzinfo=UTC)
    assert loaded.first_response_at.tzinfo is UTC
    assert loaded.created_at.tzinfo is UTC


def test_utc_datetime_rejects_naive_datetime(
    db_session: Session, make_company: MakeCompany, make_user: MakeUser
) -> None:
    company = make_company()
    ticket = make_ticket(db_session, company, make_user(company), "HD-000001")
    ticket.resolved_at = datetime(2026, 1, 1, 12, 0)  # sem timezone

    with pytest.raises(StatementError) as exc_info:
        db_session.flush()
    assert isinstance(exc_info.value.orig, ValueError)


def test_enum_persisted_as_plain_string(
    db_session: Session, make_company: MakeCompany, make_user: MakeUser
) -> None:
    company = make_company()
    ticket = make_ticket(db_session, company, make_user(company), "HD-000001")
    ticket.status = TicketStatus.IN_PROGRESS
    db_session.commit()

    row = db_session.execute(
        sa.text("SELECT status, priority, source FROM tickets WHERE id = :id"), {"id": ticket.id}
    ).one()
    assert tuple(row) == ("IN_PROGRESS", "MEDIUM", "WEB")
    assert all(type(value) is str for value in row)


def test_enum_rejects_unknown_value(
    db_session: Session, make_company: MakeCompany, make_user: MakeUser
) -> None:
    company = make_company()
    ticket = make_ticket(db_session, company, make_user(company), "HD-000001")
    ticket.status = "NOT_A_STATUS"  # type: ignore[assignment]

    with pytest.raises(StatementError):
        db_session.flush()


def test_server_defaults_apply_to_raw_inserts(db_session: Session) -> None:
    db_session.execute(
        sa.text(
            "INSERT INTO companies (name, created_at, updated_at) "
            "VALUES ('Raw', '2026-01-01 00:00:00', '2026-01-01 00:00:00')"
        )
    )
    assert db_session.execute(sa.text("SELECT is_active FROM companies")).scalar_one() == 1


@pytest.mark.parametrize("rating", [0, 6])
def test_ticket_rating_check_constraint(
    db_session: Session, make_company: MakeCompany, make_user: MakeUser, rating: int
) -> None:
    company = make_company()
    user = make_user(company)
    ticket = make_ticket(db_session, company, user, "HD-000001")
    db_session.add(TicketRating(ticket_id=ticket.id, user_id=user.id, rating=rating))

    with pytest.raises(IntegrityError):
        db_session.flush()


def test_ticket_rating_one_per_ticket(
    db_session: Session, make_company: MakeCompany, make_user: MakeUser
) -> None:
    company = make_company()
    user = make_user(company)
    ticket = make_ticket(db_session, company, user, "HD-000001")
    db_session.add(TicketRating(ticket_id=ticket.id, user_id=user.id, rating=4))
    db_session.flush()
    db_session.add(TicketRating(ticket_id=ticket.id, user_id=user.id, rating=5))

    with pytest.raises(IntegrityError):
        db_session.flush()


def test_ai_feedback_requires_a_target(
    db_session: Session, make_company: MakeCompany, make_user: MakeUser
) -> None:
    company = make_company()
    user = make_user(company)
    db_session.add(
        AIFeedback(company_id=company.id, user_id=user.id, rating=AIFeedbackRating.NEGATIVE)
    )

    with pytest.raises(IntegrityError):
        db_session.flush()


def test_sla_policy_check_constraints(db_session: Session, make_company: MakeCompany) -> None:
    company = make_company()
    db_session.add(
        SLAPolicy(
            company_id=company.id,
            name="Inválida",
            response_time_minutes=120,
            resolution_time_minutes=60,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_message_confidence_check_constraint(
    db_session: Session, make_company: MakeCompany, make_user: MakeUser
) -> None:
    company = make_company()
    conversation = Conversation(company_id=company.id, user_id=make_user(company).id)
    conversation.messages.append(Message(role=MessageRole.USER, content="oi", confidence=1.5))
    db_session.add(conversation)

    with pytest.raises(IntegrityError):
        db_session.flush()


def test_deleting_ticket_cascades_to_children(
    db_session: Session, make_company: MakeCompany, make_user: MakeUser
) -> None:
    company = make_company()
    user = make_user(company)
    ticket = make_ticket(db_session, company, user, "HD-000001")
    db_session.add(TicketComment(ticket_id=ticket.id, user_id=user.id, content="x"))
    db_session.commit()

    # Exclusão pelo banco (ON DELETE CASCADE), sem o ORM carregar os filhos.
    db_session.execute(sa.delete(Ticket).where(Ticket.id == ticket.id))
    db_session.commit()

    assert db_session.scalar(sa.select(sa.func.count()).select_from(TicketComment)) == 0


def test_foreign_keys_are_enforced(db_session: Session, make_company: MakeCompany) -> None:
    db_session.add(Department(company_id=999_999, name="Fantasma"))
    with pytest.raises(IntegrityError):
        db_session.flush()


# --- Compatibilidade com o MySQL (verificação estática do metadata) ---------

MYSQL_IDENTIFIER_LIMIT = 64


def _all_constraint_and_index_names() -> list[str]:
    names: list[str] = []
    for table in Base.metadata.tables.values():
        names.extend(str(index.name) for index in table.indexes)
        names.extend(str(constraint.name) for constraint in table.constraints)
    return names


def test_constraint_and_index_names_fit_mysql_limit() -> None:
    names = _all_constraint_and_index_names()

    assert all(name and name != "None" for name in names)
    too_long = [name for name in names if len(name) > MYSQL_IDENTIFIER_LIMIT]
    assert too_long == []
    assert len(names) == len(set(names))


def test_every_string_column_has_length() -> None:
    missing = [
        f"{table.name}.{column.name}"
        for table in Base.metadata.tables.values()
        for column in table.columns
        if isinstance(column.type, sa.String)
        and not isinstance(column.type, sa.Text)
        and column.type.length is None
    ]
    assert missing == []


def test_no_index_on_text_or_json_columns() -> None:
    offending = []
    for table in Base.metadata.tables.values():
        indexed = [index.columns for index in table.indexes] + [
            constraint.columns
            for constraint in table.constraints
            if isinstance(constraint, sa.UniqueConstraint)
        ]
        for columns in indexed:
            offending += [
                f"{table.name}.{c.name}" for c in columns if isinstance(c.type, sa.Text | sa.JSON)
            ]
    assert offending == []


def test_enums_are_not_native() -> None:
    for table in Base.metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, sa.Enum):
                assert column.type.native_enum is False, f"{table.name}.{column.name}"
                assert column.type.length >= max(len(v) for v in column.type.enums)


def test_check_constraints_avoid_mysql_fk_action_restriction() -> None:
    """MySQL 8 proíbe CHECK em colunas usadas por FKs com ON DELETE SET NULL/SET DEFAULT
    ou ON UPDATE CASCADE/SET NULL/SET DEFAULT (erro 3823)."""
    for table in Base.metadata.tables.values():
        restricted: set[str] = set()
        for fk in table.foreign_key_constraints:
            if (fk.ondelete or "").upper() in {"SET NULL", "SET DEFAULT"} or (
                fk.onupdate or ""
            ).upper() in {"CASCADE", "SET NULL", "SET DEFAULT"}:
                restricted.update(column.name for column in fk.columns)
                # SET NULL exige coluna anulável (MySQL erro 1830).
                assert all(column.nullable for column in fk.columns), fk.name
        for constraint in table.constraints:
            if isinstance(constraint, sa.CheckConstraint):
                sql = str(constraint.sqltext)
                used = {name for name in restricted if re.search(rf"\b{name}\b", sql)}
                assert used == set(), f"{constraint.name} usa {used}"
