"""Analytics de IA e AI Insights (§41).

Os insights são frases calculadas a partir dos dados da empresa — números
exatos, sem LLM, para que nenhuma estatística seja inventada. Cada regra só
gera uma frase quando há volume mínimo para ela ser significativa.
"""

from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenError
from app.models import Ticket, User
from app.models.enums import AIFeedbackRating, ConversationStatus
from app.models.types import utcnow
from app.repositories.dashboard import DashboardRepository, Scope
from app.schemas.dashboard import AIInsight, AIUsageItem, DashboardAI
from app.services.tickets import is_staff

#: Volume mínimo para cada regra.
MIN_WEEK_TICKETS = 3
MIN_TREND_PCT = 25
MIN_SHARE_TOTAL = 5
MIN_RESOLVED_PER_CATEGORY = 2
MIN_SLA_BREACHES = 2
MIN_CONVERSATIONS = 5
MIN_FEEDBACK = 5
NEGATIVE_FEEDBACK_ALERT_PCT = 40


def _pct(part: int, total: int) -> float:
    return round(part * 100 / total, 1)


def _duration(minutes: float) -> str:
    total = round(minutes)
    if total < 60:
        return f"{total} min"
    days, rest = divmod(total, 1440)
    hours, mins = divmod(rest, 60)
    if days:
        return f"{days} d {hours} h" if hours else f"{days} d"
    return f"{hours} h {mins} min" if mins else f"{hours} h"


def _fmt(value: float) -> str:
    return f"{value:.0f}" if value == int(value) else f"{value:.1f}".replace(".", ",")


class InsightsService:
    def __init__(self, session: Session) -> None:
        self.repo = DashboardRepository(session)

    def dashboard(self, user: User, *, days: int, now: datetime | None = None) -> DashboardAI:
        if not is_staff(user):
            raise ForbiddenError("Indicadores de IA são exclusivos da equipe de suporte.")
        now = now or utcnow()
        since = now - timedelta(days=days)
        company_id = user.company_id

        conversations = self.repo.conversations_by_status(company_id, since)
        resolved = conversations.get(ConversationStatus.RESOLVED, 0)
        escalated = conversations.get(ConversationStatus.ESCALATED, 0)
        finished = resolved + escalated
        feedback = self.repo.feedback_counts(company_id, since)
        ratings = sum(feedback.values())
        positive = feedback.get(AIFeedbackRating.POSITIVE, 0)
        usage = [
            AIUsageItem(action_type=kind, total=total, success=ok)
            for kind, (total, ok) in sorted(
                self.repo.ai_actions_by_type(company_id, since).items(),
                key=lambda item: item[1][0],
                reverse=True,
            )
        ]

        insights = [
            *self._ticket_insights(Scope(company_id=company_id), days=days, now=now),
            *self._assistant_insights(finished, resolved, ratings, positive),
        ]
        return DashboardAI(
            period_days=days,
            conversations=sum(conversations.values()),
            conversations_resolved=resolved,
            conversations_escalated=escalated,
            assistant_resolution_pct=_pct(resolved, finished) if finished else None,
            feedback_count=ratings,
            positive_feedback_pct=_pct(positive, ratings) if ratings else None,
            usage=usage,
            insights=insights,
        )

    # --- Regras ---------------------------------------------------------------------

    def _ticket_insights(self, scope: Scope, *, days: int, now: datetime) -> list[AIInsight]:
        insights: list[AIInsight] = []
        week_ago = now - timedelta(days=7)
        current = self.repo.count_by_category_between(scope, week_ago, now)
        previous = self.repo.count_by_category_between(
            scope, week_ago - timedelta(days=7), week_ago
        )

        # Maior variação semanal (alta ou queda) com volume relevante.
        trends: list[tuple[float, str, int, int]] = []
        for name in set(current) | set(previous):
            cur, prev = current.get(name, 0), previous.get(name, 0)
            # Percentual só sobre uma base relevante: "1 → 6" não é "+500%".
            if prev < MIN_WEEK_TICKETS:
                continue
            change = (cur - prev) * 100 / prev
            if abs(change) >= MIN_TREND_PCT:
                trends.append((change, name, prev, cur))
        if trends:
            change, name, prev, cur = max(trends, key=lambda item: abs(item[0]))
            verb = "aumentaram" if change > 0 else "caíram"
            insights.append(
                AIInsight(
                    kind="growth" if change > 0 else "drop",
                    tone="warning" if change > 0 else "success",
                    text=(
                        f"Chamados de {name} {verb} {abs(change):.0f}% nesta semana "
                        f"({prev} → {cur})."
                    ),
                )
            )
        else:
            # Salto a partir de base pequena: números absolutos.
            jumps = [
                (cur - previous.get(name, 0), name, cur, previous.get(name, 0))
                for name, cur in current.items()
                if cur >= MIN_WEEK_TICKETS
                and cur >= 2 * previous.get(name, 0)
                and previous.get(name, 0) < MIN_WEEK_TICKETS
            ]
            if jumps:
                _, name, cur, prev = max(jumps)
                before = f"contra {prev} na anterior" if prev else "sem nenhum na anterior"
                insights.append(
                    AIInsight(
                        kind="growth",
                        tone="warning",
                        text=f"{cur} chamados de {name} nesta semana, {before}.",
                    )
                )

        # Participação da maior categoria no período.
        since = now - timedelta(days=days)
        by_category = self.repo.count_by_category_between(scope, since, now)
        total = sum(by_category.values())
        if total >= MIN_SHARE_TOTAL:
            name, count = max(by_category.items(), key=lambda item: item[1])
            insights.append(
                AIInsight(
                    kind="share",
                    tone="info",
                    text=(
                        f"{name} representa {_fmt(_pct(count, total))}% dos chamados "
                        f"dos últimos {days} dias."
                    ),
                )
            )

        # Resolução mais lenta e concentração de SLA vencido, entre os resolvidos.
        durations: dict[str, list[float]] = defaultdict(list)
        breaches: dict[str, int] = defaultdict(int)
        for ticket in self.repo.resolved_since(scope, since):
            if ticket.category is None or ticket.resolved_at is None:
                continue
            name = ticket.category.name
            durations[name].append((ticket.resolved_at - ticket.created_at).total_seconds() / 60)
            if _breached(ticket):
                breaches[name] += 1
        averages = {
            name: sum(values) / len(values)
            for name, values in durations.items()
            if len(values) >= MIN_RESOLVED_PER_CATEGORY
        }
        if len(averages) >= 2:
            name, minutes = max(averages.items(), key=lambda item: item[1])
            insights.append(
                AIInsight(
                    kind="slowest",
                    tone="info",
                    text=(
                        f"Os chamados de {name} têm o maior tempo médio de resolução "
                        f"({_duration(minutes)})."
                    ),
                )
            )
        if breaches:
            name, count = max(breaches.items(), key=lambda item: item[1])
            if count >= MIN_SLA_BREACHES:
                insights.append(
                    AIInsight(
                        kind="sla",
                        tone="warning",
                        text=(
                            f"{name} concentra {count} chamados resolvidos fora do SLA no período."
                        ),
                    )
                )
        return insights

    def _assistant_insights(
        self, finished: int, resolved: int, ratings: int, positive: int
    ) -> list[AIInsight]:
        insights: list[AIInsight] = []
        if finished >= MIN_CONVERSATIONS:
            pct = _pct(resolved, finished)
            insights.append(
                AIInsight(
                    kind="assistant",
                    tone="success" if pct >= 50 else "info",
                    text=(
                        f"O assistente resolveu {_fmt(pct)}% das conversas concluídas "
                        "sem abrir chamado."
                    ),
                )
            )
        if ratings >= MIN_FEEDBACK:
            negative = _pct(ratings - positive, ratings)
            if negative >= NEGATIVE_FEEDBACK_ALERT_PCT:
                insights.append(
                    AIInsight(
                        kind="feedback",
                        tone="warning",
                        text=(
                            f"{_fmt(negative)}% das respostas da IA foram avaliadas como não "
                            "úteis — vale revisar a base de conhecimento."
                        ),
                    )
                )
        return insights


def _breached(ticket: Ticket) -> bool:
    return (
        ticket.resolution_deadline is not None
        and ticket.resolved_at is not None
        and ticket.resolved_at > ticket.resolution_deadline
    )
