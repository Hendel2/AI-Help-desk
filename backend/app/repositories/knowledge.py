"""Artigos da base de conhecimento (sempre por empresa)."""

from collections.abc import Sequence
from typing import Any, Literal

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session, joinedload

from app.models import KnowledgeArticle
from app.models.enums import ArticleStatus
from app.repositories.base import _check_pagination, _require_company_id

ArticleSort = Literal["recent", "popular", "title"]

_ORDER: dict[ArticleSort, tuple[Any, ...]] = {
    "recent": (KnowledgeArticle.updated_at.desc(), KnowledgeArticle.id.desc()),
    "popular": (
        KnowledgeArticle.is_featured.desc(),
        KnowledgeArticle.view_count.desc(),
        KnowledgeArticle.helpful_count.desc(),
    ),
    "title": (KnowledgeArticle.title.asc(),),
}
#: Relações exibidas na listagem e no detalhe: evitam N+1.
_DETAIL = (joinedload(KnowledgeArticle.category), joinedload(KnowledgeArticle.author))


class KnowledgeArticleRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    @staticmethod
    def _visible(company_id: int, *, published_only: bool) -> Any:
        stmt = select(KnowledgeArticle).where(
            KnowledgeArticle.company_id == _require_company_id(company_id)
        )
        if published_only:
            stmt = stmt.where(KnowledgeArticle.status == ArticleStatus.PUBLISHED)
        return stmt

    def search(
        self,
        company_id: int,
        *,
        published_only: bool,
        search: str | None,
        category_id: int | None,
        status: ArticleStatus | None,
        sort: ArticleSort,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[KnowledgeArticle], int]:
        _check_pagination(offset, limit)
        stmt = self._visible(company_id, published_only=published_only)
        if search and search.strip():
            like = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    KnowledgeArticle.title.like(like),
                    KnowledgeArticle.summary.like(like),
                    KnowledgeArticle.content.like(like),
                )
            )
        if category_id is not None:
            stmt = stmt.where(KnowledgeArticle.category_id == category_id)
        if status is not None:
            stmt = stmt.where(KnowledgeArticle.status == status)

        total = self.session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        items = (
            self.session.scalars(
                stmt.options(*_DETAIL).order_by(*_ORDER[sort]).offset(offset).limit(limit)
            )
            .unique()
            .all()
        )
        return items, total

    def get(
        self, company_id: int, article_id: int, *, published_only: bool
    ) -> KnowledgeArticle | None:
        stmt = (
            self._visible(company_id, published_only=published_only)
            .where(KnowledgeArticle.id == article_id)
            .options(*_DETAIL)
        )
        return self.session.scalars(stmt).unique().one_or_none()

    def increment_views(self, article_id: int) -> None:
        """Incremento atômico no banco (sem condição de corrida entre leituras)."""
        self.session.execute(
            update(KnowledgeArticle)
            .where(KnowledgeArticle.id == article_id)
            .values(view_count=KnowledgeArticle.view_count + 1)
        )

    def increment_feedback(self, article_id: int, *, helpful: bool) -> None:
        column = KnowledgeArticle.helpful_count if helpful else KnowledgeArticle.not_helpful_count
        self.session.execute(
            update(KnowledgeArticle)
            .where(KnowledgeArticle.id == article_id)
            .values({column: column + 1})
        )
