"""RAG — busca e recuperação de conhecimento (§28, §67).

Pergunta → Embedding → Vector Search (coleção da empresa) → Trechos → Contexto.

Regras (skill ai-helpdesk): a busca é SEMPRE por empresa; só artigos
publicados entram no contexto (rechecado no banco após a busca vetorial); toda
resposta carrega as fontes. Se o banco vetorial falhar, a busca cai para uma
varredura local dos trechos da empresa — mais lenta, mas o assistente continua.
"""

import logging
from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import KnowledgeArticle, KnowledgeChunk
from app.models.enums import ArticleStatus
from app.models.types import utcnow
from app.services.ai.embeddings import Embedder, cosine
from app.services.ai.vector_store import (
    VectorMatch,
    VectorRecord,
    VectorStore,
    VectorStoreError,
)
from app.services.knowledge_text import chunk_text

logger = logging.getLogger("app.ai.rag")

#: Similaridade mínima para um trecho ser considerado relevante.
MIN_SCORE = 0.12
#: Teto de trechos lidos na busca de contingência (sem banco vetorial).
FALLBACK_SCAN_LIMIT = 2000


@dataclass(frozen=True)
class RetrievedSource:
    article_id: int
    title: str
    excerpt: str
    score: float


class RAGService:
    def __init__(self, session: Session, store: VectorStore, embedder: Embedder) -> None:
        self.session = session
        self.store = store
        self.embedder = embedder

    # --- Indexação ------------------------------------------------------------

    def index_article(self, article: KnowledgeArticle) -> int:
        """(Re)indexa o artigo. Quem chama faz o commit. Retorna o nº de trechos."""
        self.remove_article(article)
        # O trecho guardado é só o conteúdo (é o que aparece como citação); título e
        # resumo entram no embedding de CADA trecho para dar contexto à busca.
        chunks = chunk_text(article.content)
        header = ". ".join(part for part in (article.title, article.summary) if part)
        embeddings = self.embedder.embed([f"{header}\n\n{chunk}" for chunk in chunks])
        records = []
        for index, (text, embedding) in enumerate(zip(chunks, embeddings, strict=True)):
            embedding_id = f"a{article.id}-c{index}"
            self.session.add(
                KnowledgeChunk(
                    company_id=article.company_id,  # desnormalizado de propósito (ver modelo)
                    article_id=article.id,
                    chunk_index=index,
                    content=text,
                    token_count=max(1, len(text) // 4),
                    embedding_id=embedding_id,
                )
            )
            records.append(
                VectorRecord(
                    id=embedding_id,
                    embedding=embedding,
                    document=text,
                    article_id=article.id,
                    chunk_index=index,
                )
            )
        self.session.flush()
        try:
            self.store.upsert(article.company_id, records)
            article.indexed_at = utcnow()
        except VectorStoreError:
            # Trechos ficam no banco: a busca de contingência ainda os encontra.
            logger.warning(
                "Banco vetorial indisponível ao indexar", extra={"article_id": article.id}
            )
            article.indexed_at = None
        return len(records)

    def remove_article(self, article: KnowledgeArticle) -> None:
        self.session.execute(delete(KnowledgeChunk).where(KnowledgeChunk.article_id == article.id))
        article.indexed_at = None
        try:
            self.store.delete_article(article.company_id, article.id)
        except VectorStoreError:
            logger.warning(
                "Banco vetorial indisponível ao remover", extra={"article_id": article.id}
            )

    def reindex_company(self, company_id: int) -> int:
        articles = self.session.scalars(
            select(KnowledgeArticle).where(
                KnowledgeArticle.company_id == company_id,
                KnowledgeArticle.status == ArticleStatus.PUBLISHED,
            )
        ).all()
        return sum(self.index_article(article) for article in articles)

    def rebuild_company(self, company_id: int) -> int:
        """Recria a coleção da empresa do zero (ex.: depois de trocar o embedder).

        Levanta `VectorStoreError` se o banco vetorial estiver fora do ar. Quem chama
        faz o commit.
        """
        self.store.reset(company_id)
        return self.reindex_company(company_id)

    # --- Busca ----------------------------------------------------------------

    def search(self, company_id: int, query: str, *, k: int = 4) -> list[RetrievedSource]:
        """Trechos relevantes de artigos PUBLICADOS da empresa, um por artigo."""
        if not query.strip():
            return []
        embedding = self.embedder.embed([query])[0]
        try:
            matches = self.store.query(company_id, embedding, k * 3)
        except VectorStoreError:
            logger.warning(
                "Banco vetorial indisponível; busca de contingência",
                extra={"company_id": company_id},
            )
            matches = self._fallback_matches(company_id, embedding, k * 3)

        relevant = [m for m in matches if m.score >= MIN_SCORE]
        if not relevant:
            return []

        # Defesa em profundidade: confirma no banco empresa e status de cada artigo.
        articles = {
            article.id: article
            for article in self.session.scalars(
                select(KnowledgeArticle).where(
                    KnowledgeArticle.id.in_({m.article_id for m in relevant}),
                    KnowledgeArticle.company_id == company_id,
                    KnowledgeArticle.status == ArticleStatus.PUBLISHED,
                )
            )
        }
        sources: list[RetrievedSource] = []
        seen: set[int] = set()
        for match in sorted(relevant, key=lambda m: m.score, reverse=True):
            article = articles.get(match.article_id)
            if article is None or article.id in seen:
                continue
            seen.add(article.id)
            sources.append(
                RetrievedSource(
                    article_id=article.id,
                    title=article.title,
                    excerpt=match.document,
                    score=round(match.score, 3),
                )
            )
            if len(sources) == k:
                break
        return sources

    def _fallback_matches(
        self, company_id: int, embedding: list[float], k: int
    ) -> list[VectorMatch]:
        rows = self.session.scalars(
            select(KnowledgeChunk)
            .join(KnowledgeArticle, KnowledgeArticle.id == KnowledgeChunk.article_id)
            .where(
                KnowledgeChunk.company_id == company_id,
                KnowledgeArticle.status == ArticleStatus.PUBLISHED,
            )
            .limit(FALLBACK_SCAN_LIMIT)
        ).all()
        if not rows:
            return []
        vectors = self.embedder.embed([row.content for row in rows])
        scored = [
            VectorMatch(
                id=row.embedding_id or f"a{row.article_id}-c{row.chunk_index}",
                article_id=row.article_id,
                chunk_index=row.chunk_index,
                document=row.content,
                score=cosine(embedding, vector),
            )
            for row, vector in zip(rows, vectors, strict=True)
        ]
        return sorted(scored, key=lambda match: match.score, reverse=True)[:k]
