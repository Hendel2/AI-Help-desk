"""Base de conhecimento (§29): artigos, upload, avaliação e indexação no RAG.

Permissões (§7): todos consultam artigos publicados; a equipe (técnico e
admin) também vê rascunhos e arquivados; somente ADMIN cria, edita, exclui,
importa e reindexa. Publicar indexa no RAG; despublicar ou excluir remove.
"""

# As classes têm um método `list`: sem isto, no Python < 3.14 as anotações
# `list[...]` seguintes seriam resolvidas como o método, não como o tipo.
from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.models import Category, KnowledgeArticle, User
from app.models.enums import ArticleSourceType, ArticleStatus, AuditAction, RoleName
from app.repositories.audit_log import AuditLogRepository
from app.repositories.knowledge import ArticleSort, KnowledgeArticleRepository
from app.repositories.ticket import CategoryRepository
from app.services.ai.rag import RAGService, RetrievedSource
from app.services.knowledge_text import ExtractionError, extract_text
from app.services.tickets import is_staff


class KnowledgeService:
    def __init__(self, session: Session, rag: RAGService) -> None:
        self.session = session
        self.rag = rag
        self.audit = AuditLogRepository(session)
        self.articles = KnowledgeArticleRepository(session)

    # --- Leitura ------------------------------------------------------------

    def list(
        self,
        user: User,
        *,
        search: str | None,
        category_id: int | None,
        status: ArticleStatus | None,
        sort: ArticleSort,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[KnowledgeArticle], int]:
        staff = is_staff(user)
        # Quem não é da equipe só enxerga publicados: pedir rascunhos devolve vazio.
        if status is not None and not staff and status is not ArticleStatus.PUBLISHED:
            return [], 0
        return self.articles.search(
            user.company_id,
            published_only=not staff,
            search=search,
            category_id=category_id,
            status=status,
            sort=sort,
            offset=offset,
            limit=limit,
        )

    def get(self, user: User, article_id: int, *, count_view: bool = False) -> KnowledgeArticle:
        article = self.articles.get(user.company_id, article_id, published_only=not is_staff(user))
        if article is None:
            raise NotFoundError("Artigo não encontrado.", code="ARTICLE_NOT_FOUND")
        if count_view and article.status is ArticleStatus.PUBLISHED:
            self.articles.increment_views(article.id)
            self.session.commit()
            self.session.refresh(article)
        return article

    def suggest(self, user: User, query: str, *, k: int = 5) -> list[RetrievedSource]:
        """Artigos relevantes por similaridade (RAG) — usados pelo chat e pelo Copilot."""
        return self.rag.search(user.company_id, query, k=k)

    # --- Escrita (ADMIN) ----------------------------------------------------

    def _require_admin(self, user: User) -> None:
        if user.role.name is not RoleName.ADMIN:
            raise ForbiddenError(
                "Somente administradores gerenciam a base de conhecimento.",
                code="KNOWLEDGE_FORBIDDEN",
            )

    def _category(self, user: User, category_id: int | None) -> Category | None:
        if category_id is None:
            return None
        category = CategoryRepository(self.session).get(user.company_id, category_id)
        if category is None:
            raise BadRequestError("Categoria inválida.", code="INVALID_CATEGORY")
        return category

    def create(
        self,
        user: User,
        *,
        title: str,
        content: str,
        summary: str | None,
        category_id: int | None,
        status: ArticleStatus,
        is_featured: bool = False,
        source_type: ArticleSourceType = ArticleSourceType.MANUAL,
        source_file_name: str | None = None,
        ip_address: str | None = None,
    ) -> KnowledgeArticle:
        self._require_admin(user)
        category = self._category(user, category_id)
        article = KnowledgeArticle(
            company_id=user.company_id,
            author_id=user.id,
            category_id=category.id if category else None,
            title=title,
            summary=summary,
            content=content,
            status=status,
            is_featured=is_featured,
            source_type=source_type,
            source_file_name=source_file_name,
        )
        self.session.add(article)
        self.session.flush()
        if status is ArticleStatus.PUBLISHED:
            self.rag.index_article(article)
        self._audit(user, AuditAction.KNOWLEDGE_CREATED, article, ip_address)
        self.session.commit()
        return self.get(user, article.id)

    def update(
        self,
        user: User,
        article_id: int,
        changes: dict[str, object],
        *,
        ip_address: str | None = None,
    ) -> KnowledgeArticle:
        self._require_admin(user)
        article = self.get(user, article_id)
        if "category_id" in changes:
            category = self._category(user, changes.pop("category_id"))  # type: ignore[arg-type]
            article.category_id = category.id if category else None
        for field in ("title", "summary", "content", "status", "is_featured"):
            if field in changes and changes[field] is not None:
                setattr(article, field, changes[field])
        self.session.flush()

        if article.status is ArticleStatus.PUBLISHED:
            self.rag.index_article(article)  # conteúdo pode ter mudado: reindexa
        else:
            self.rag.remove_article(article)
        self._audit(user, AuditAction.KNOWLEDGE_UPDATED, article, ip_address)
        self.session.commit()
        return self.get(user, article.id)

    def delete(self, user: User, article_id: int, *, ip_address: str | None = None) -> None:
        self._require_admin(user)
        article = self.get(user, article_id)
        self.rag.remove_article(article)
        self._audit(user, AuditAction.KNOWLEDGE_DELETED, article, ip_address)
        self.session.delete(article)
        self.session.commit()

    def reindex(self, user: User, article_id: int) -> KnowledgeArticle:
        self._require_admin(user)
        article = self.get(user, article_id)
        if article.status is not ArticleStatus.PUBLISHED:
            raise BadRequestError(
                "Somente artigos publicados são indexados.", code="ARTICLE_NOT_PUBLISHED"
            )
        self.rag.index_article(article)
        self.session.commit()
        return self.get(user, article.id)

    def import_file(
        self,
        user: User,
        *,
        file_name: str,
        data: bytes,
        category_id: int | None,
        ip_address: str | None,
    ) -> KnowledgeArticle:
        """Upload de PDF/DOCX/TXT/MD → artigo em RASCUNHO para revisão antes de publicar."""
        self._require_admin(user)
        try:
            document = extract_text(file_name, data)
        except ExtractionError as exc:
            raise BadRequestError(exc.message, code=exc.code) from exc
        return self.create(
            user,
            title=document.title,
            content=document.text,
            summary=None,
            category_id=category_id,
            status=ArticleStatus.DRAFT,
            source_type=ArticleSourceType.UPLOAD,
            source_file_name=file_name[:255],
            ip_address=ip_address,
        )

    # --- Avaliação ("Este artigo ajudou?") --------------------------------

    def feedback(self, user: User, article_id: int, *, helpful: bool) -> KnowledgeArticle:
        article = self.get(user, article_id)
        if article.status is not ArticleStatus.PUBLISHED:
            raise BadRequestError(
                "Somente artigos publicados podem ser avaliados.", code="ARTICLE_NOT_PUBLISHED"
            )
        self.articles.increment_feedback(article.id, helpful=helpful)
        self.session.commit()
        self.session.refresh(article)
        return article

    def _audit(
        self, user: User, action: AuditAction, article: KnowledgeArticle, ip_address: str | None
    ) -> None:
        self.audit.record(
            action=action,
            entity="knowledge_article",
            entity_id=article.id,
            company_id=user.company_id,
            user_id=user.id,
            metadata={"title": article.title[:100], "status": article.status.value},
            ip_address=ip_address,
        )
