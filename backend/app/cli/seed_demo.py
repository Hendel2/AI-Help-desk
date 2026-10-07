"""Dados de demonstração (§92): `python -m app.cli.seed_demo`.

Cria a "Empresa Demo" com usuários dos três perfis, departamentos, categorias
(§12), políticas de SLA (§21) e chamados distribuídos nos últimos 30 dias, com
comentários, histórico e avaliações. É idempotente: se a empresa demo já
existir, nada é alterado. Recusa-se a rodar em produção.

Credenciais (somente para demonstração local):
    admin@demo.helpdesk    / demo12345   (ADMIN)
    tecnico@demo.helpdesk  / demo12345   (TECHNICIAN)
    tecnica@demo.helpdesk  / demo12345   (TECHNICIAN)
    usuario@demo.helpdesk  / demo12345   (USER)
"""

import random
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models import (
    Category,
    Company,
    Department,
    Role,
    SLAPolicy,
    Ticket,
    TicketComment,
    TicketHistory,
    TicketRating,
    User,
)
from app.models.enums import (
    RoleName,
    TicketHistoryAction,
    TicketPriority,
    TicketSource,
    TicketStatus,
)
from app.models.types import utcnow
from app.repositories.ticket import format_ticket_number
from app.services import sla

DEMO_COMPANY = "Empresa Demo"
DEMO_PASSWORD = "demo12345"

# §21 — prazos por prioridade (minutos): resposta, resolução.
SLA_TABLE = {
    TicketPriority.LOW: (8 * 60, 48 * 60),
    TicketPriority.MEDIUM: (4 * 60, 24 * 60),
    TicketPriority.HIGH: (60, 8 * 60),
    TicketPriority.CRITICAL: (15, 2 * 60),
}
SLA_NAMES = {
    TicketPriority.LOW: "Padrão — Baixa",
    TicketPriority.MEDIUM: "Padrão — Média",
    TicketPriority.HIGH: "Padrão — Alta",
    TicketPriority.CRITICAL: "Padrão — Crítica",
}

# §12 — categorias com prioridade padrão.
CATEGORIES = {
    "Hardware": TicketPriority.MEDIUM,
    "Software": TicketPriority.MEDIUM,
    "Rede": TicketPriority.HIGH,
    "E-mail": TicketPriority.MEDIUM,
    "VPN": TicketPriority.HIGH,
    "Acesso": TicketPriority.MEDIUM,
    "Impressora": TicketPriority.LOW,
    "Sistema": TicketPriority.HIGH,
}

DEPARTMENTS = ["TI", "Financeiro", "RH", "Comercial", "Administrativo"]

# (categoria, título, descrição)
SAMPLE_TICKETS = [
    (
        "VPN",
        "VPN não conecta",
        "Ao conectar na VPN aparece 'falha de autenticação' desde as 08:30.",
    ),
    (
        "VPN",
        "VPN cai a cada 10 minutos",
        "A conexão da VPN derruba com frequência durante reuniões.",
    ),
    ("E-mail", "E-mail bloqueado", "Minha caixa de e-mail está bloqueada após várias tentativas."),
    ("E-mail", "Não recebo e-mails externos", "Clientes dizem que os e-mails voltam com erro."),
    (
        "Impressora",
        "Impressora do 2º andar atolando",
        "A impressora atola papel em toda impressão.",
    ),
    (
        "Impressora",
        "Impressora não aparece na rede",
        "Não consigo adicionar a impressora no notebook.",
    ),
    (
        "Rede",
        "Internet lenta no setor comercial",
        "Páginas demoram mais de 30 segundos para abrir.",
    ),
    ("Rede", "Wi-Fi da sala de reunião não funciona", "O Wi-Fi conecta mas não navega."),
    (
        "Acesso",
        "Sem acesso à pasta do financeiro",
        "Preciso de acesso de leitura à pasta Financeiro/2026.",
    ),
    ("Acesso", "Senha expirada no ERP", "O ERP pede troca de senha e recusa a nova."),
    ("Hardware", "Notebook não liga", "O notebook não liga mesmo carregado."),
    ("Hardware", "Monitor piscando", "O monitor secundário pisca a cada poucos segundos."),
    (
        "Software",
        "Excel travando ao abrir planilhas",
        "O Excel trava ao abrir planilhas com macros.",
    ),
    (
        "Software",
        "Instalar software de design",
        "Preciso do software de design instalado na máquina.",
    ),
    ("Sistema", "Erro ao emitir nota fiscal", "O sistema retorna erro 500 ao emitir NF-e."),
    ("Sistema", "Relatório de vendas vazio", "O relatório mensal de vendas aparece sem dados."),
]

SOLUTIONS = {
    "VPN": "Credenciais da VPN renovadas e cliente atualizado para a versão mais recente.",
    "E-mail": "Conta desbloqueada e regras de spam ajustadas.",
    "Impressora": "Rolete de alimentação substituído e driver reinstalado.",
    "Rede": "Ponto de acesso reiniciado e canal Wi-Fi alterado.",
    "Acesso": "Permissões ajustadas conforme aprovação do gestor.",
    "Hardware": "Equipamento substituído por um reserva até o conserto.",
    "Software": "Software reinstalado e atualizado.",
    "Sistema": "Correção aplicada pela equipe de sistemas; emissão normalizada.",
}


@dataclass
class DemoUsers:
    admin: User
    technicians: list[User]
    requesters: list[User]


def _ensure_roles(session: Session) -> dict[RoleName, Role]:
    roles = {role.name: role for role in session.scalars(select(Role))}
    missing = set(RoleName) - set(roles)
    if missing:
        raise SystemExit(
            f"Perfis ausentes ({', '.join(sorted(missing))}). Execute 'alembic upgrade head' antes."
        )
    return roles


def _create_users(session: Session, company: Company, roles: dict[RoleName, Role]) -> DemoUsers:
    password_hash = hash_password(DEMO_PASSWORD)
    departments = {name: Department(company_id=company.id, name=name) for name in DEPARTMENTS}
    session.add_all(departments.values())
    session.flush()

    def user(name: str, email: str, role: RoleName, department: str) -> User:
        return User(
            company_id=company.id,
            role_id=roles[role].id,
            department_id=departments[department].id,
            name=name,
            email=email,
            password_hash=password_hash,
        )

    admin = user("Alice Administradora", "admin@demo.helpdesk", RoleName.ADMIN, "TI")
    technicians = [
        user("Téo Técnico", "tecnico@demo.helpdesk", RoleName.TECHNICIAN, "TI"),
        user("Tânia Técnica", "tecnica@demo.helpdesk", RoleName.TECHNICIAN, "TI"),
    ]
    requesters = [
        user("Ulisses Usuário", "usuario@demo.helpdesk", RoleName.USER, "Comercial"),
        user("Fernanda Financeiro", "fernanda@demo.helpdesk", RoleName.USER, "Financeiro"),
        user("Rafael RH", "rafael@demo.helpdesk", RoleName.USER, "RH"),
        user("Carla Comercial", "carla@demo.helpdesk", RoleName.USER, "Comercial"),
    ]
    session.add_all([admin, *technicians, *requesters])
    session.flush()
    return DemoUsers(admin=admin, technicians=technicians, requesters=requesters)


def _create_sla_and_categories(
    session: Session, company: Company
) -> tuple[dict[str, Category], list[SLAPolicy]]:
    policies = [
        SLAPolicy(
            company_id=company.id,
            name=SLA_NAMES[priority],
            priority=priority,
            response_time_minutes=response,
            resolution_time_minutes=resolution,
        )
        for priority, (response, resolution) in SLA_TABLE.items()
    ]
    session.add_all(policies)
    session.flush()
    categories = {
        name: Category(company_id=company.id, name=name, default_priority=priority)
        for name, priority in CATEGORIES.items()
    }
    session.add_all(categories.values())
    session.flush()
    return categories, policies


def _history(
    ticket: Ticket,
    user: User | None,
    action: TicketHistoryAction,
    at: datetime,
    *,
    field: str | None = None,
    old: str | None = None,
    new: str | None = None,
) -> TicketHistory:
    return TicketHistory(
        ticket_id=ticket.id,
        user_id=user.id if user else None,
        action=action,
        field=field,
        old_value=old,
        new_value=new,
        created_at=at,
    )


def _create_tickets(
    session: Session,
    company: Company,
    users: DemoUsers,
    categories: dict[str, Category],
    policies: list[SLAPolicy],
) -> int:
    rng = random.Random(42)  # determinístico: a demo é sempre igual
    now = utcnow()
    created = 0

    # Mais chamados recentes; alguns abertos, vários resolvidos/fechados.
    # (minutos desde a abertura, status)
    plan: list[tuple[int, TicketStatus]] = []
    for _ in range(38):
        days_ago = rng.choice([0, 0, 1, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 21, 25, 29])
        if days_ago <= 1:
            status = rng.choice(
                [
                    TicketStatus.OPEN,
                    TicketStatus.OPEN,
                    TicketStatus.ASSIGNED,
                    TicketStatus.IN_PROGRESS,
                ]
            )
        elif days_ago <= 4:
            status = rng.choice(
                [
                    TicketStatus.IN_PROGRESS,
                    TicketStatus.WAITING_USER,
                    TicketStatus.RESOLVED,
                    TicketStatus.ASSIGNED,
                ]
            )
        else:
            status = rng.choice(
                [
                    TicketStatus.CLOSED,
                    TicketStatus.CLOSED,
                    TicketStatus.RESOLVED,
                    TicketStatus.CANCELLED,
                ]
            )
        minutes_ago = days_ago * 1440 + rng.randint(0, 8) * 60 + rng.randint(0, 59)
        plan.append((minutes_ago, status))
    # Numeração em ordem cronológica de abertura (HD-000001 é o mais antigo).
    plan.sort(key=lambda item: -item[0])

    for sequence, (minutes_ago, status) in enumerate(plan, start=1):
        category_name, title, description = rng.choice(SAMPLE_TICKETS)
        category = categories[category_name]
        priority = rng.choice(
            [category.default_priority] * 3
            + [
                TicketPriority.CRITICAL
                if category.default_priority is TicketPriority.HIGH
                else TicketPriority.HIGH
            ]
        )
        opened_at = now - timedelta(minutes=minutes_ago)
        policy = sla.resolve_policy(category, priority, policies)
        response_deadline, resolution_deadline = sla.compute_deadlines(policy, opened_at)
        requester = rng.choice(users.requesters)
        technician = (
            rng.choice(users.technicians)
            if status not in {TicketStatus.OPEN, TicketStatus.CANCELLED}
            else None
        )

        ticket = Ticket(
            company_id=company.id,
            ticket_number=format_ticket_number(sequence),
            user_id=requester.id,
            technician_id=technician.id if technician else None,
            category_id=category.id,
            sla_policy_id=policy.id if policy else None,
            title=title,
            description=description,
            priority=priority,
            status=status,
            source=rng.choice([TicketSource.WEB] * 4 + [TicketSource.CHATBOT, TicketSource.EMAIL]),
            created_at=opened_at,
            updated_at=opened_at,
            response_deadline=response_deadline,
            resolution_deadline=resolution_deadline,
        )
        session.add(ticket)
        session.flush()
        events = [_history(ticket, requester, TicketHistoryAction.CREATED, opened_at)]

        if technician is not None:
            # Primeira resposta: em geral dentro do prazo, às vezes atrasada (SLA violado).
            response_window = (
                (response_deadline - opened_at) if response_deadline else timedelta(hours=2)
            )
            factor = rng.choice([0.2, 0.4, 0.6, 0.9, 1.4])
            responded_at = min(opened_at + response_window * factor, now - timedelta(minutes=5))
            events.append(
                _history(
                    ticket,
                    technician,
                    TicketHistoryAction.ASSIGNED,
                    responded_at,
                    field="technician",
                    new=technician.name,
                )
            )
            session.add(
                TicketComment(
                    ticket_id=ticket.id,
                    user_id=technician.id,
                    content="Olá! Já estamos analisando o seu chamado.",
                    created_at=responded_at,
                    updated_at=responded_at,
                )
            )
            ticket.first_response_at = responded_at

            if status in {TicketStatus.RESOLVED, TicketStatus.CLOSED}:
                resolution_window = (
                    (resolution_deadline - opened_at)
                    if resolution_deadline
                    else timedelta(hours=24)
                )
                resolved_at = min(
                    opened_at + resolution_window * rng.choice([0.3, 0.5, 0.8, 1.3]),
                    now - timedelta(minutes=1),
                )
                resolved_at = max(resolved_at, responded_at + timedelta(minutes=5))
                ticket.resolved_at = resolved_at
                session.add(
                    TicketComment(
                        ticket_id=ticket.id,
                        user_id=technician.id,
                        content=SOLUTIONS[category_name],
                        created_at=resolved_at,
                        updated_at=resolved_at,
                    )
                )
                events.append(
                    _history(
                        ticket,
                        technician,
                        TicketHistoryAction.RESOLVED,
                        resolved_at,
                        field="status",
                        old="IN_PROGRESS",
                        new="RESOLVED",
                    )
                )
                if status is TicketStatus.CLOSED:
                    closed_at = min(resolved_at + timedelta(hours=rng.randint(1, 30)), now)
                    ticket.closed_at = closed_at
                    events.append(
                        _history(
                            ticket,
                            requester,
                            TicketHistoryAction.CLOSED,
                            closed_at,
                            field="status",
                            old="RESOLVED",
                            new="CLOSED",
                        )
                    )
                    if rng.random() < 0.75:
                        session.add(
                            TicketRating(
                                ticket_id=ticket.id,
                                user_id=requester.id,
                                rating=rng.choice([3, 4, 4, 5, 5, 5]),
                                comment=rng.choice(
                                    [None, "Atendimento rápido.", "Resolveu o problema."]
                                ),
                                created_at=closed_at,
                            )
                        )
                ticket.updated_at = ticket.closed_at or resolved_at
            else:
                ticket.updated_at = responded_at
        elif status is TicketStatus.CANCELLED:
            cancelled_at = opened_at + timedelta(hours=rng.randint(1, 12))
            events.append(
                _history(
                    ticket,
                    users.admin,
                    TicketHistoryAction.CANCELLED,
                    cancelled_at,
                    field="status",
                    old="OPEN",
                    new="CANCELLED",
                )
            )
            ticket.updated_at = cancelled_at

        session.add_all(events)
        created += 1

    return created


def seed(session: Session) -> bool:
    """Cria os dados. Retorna False se a empresa demo já existir."""
    if session.scalars(select(Company).where(Company.name == DEMO_COMPANY)).first():
        return False
    roles = _ensure_roles(session)
    company = Company(name=DEMO_COMPANY, email="contato@demo.helpdesk")
    session.add(company)
    session.flush()
    users = _create_users(session, company, roles)
    categories, policies = _create_sla_and_categories(session, company)
    total = _create_tickets(session, company, users, categories, policies)
    session.commit()
    print(f"Empresa demo criada com {total} chamados.")
    return True


def main() -> None:
    settings = get_settings()
    if settings.is_production:
        sys.exit("O seed de demonstração não pode ser executado em produção.")
    with SessionLocal() as session:
        if not seed(session):
            print("A empresa demo já existe; nada foi alterado.")
            return
    print("Usuários: admin@demo.helpdesk, tecnico@demo.helpdesk, usuario@demo.helpdesk")
    print(f"Senha de todos: {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()
