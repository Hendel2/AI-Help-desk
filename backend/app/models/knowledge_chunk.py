from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CompanyScopedMixin, CreatedAtMixin

if TYPE_CHECKING:
    from app.models.knowledge_article import KnowledgeArticle


class KnowledgeChunk(CompanyScopedMixin, CreatedAtMixin, Base):
    """Trecho de um artigo indexado para o RAG.

    `company_id` é desnormalizado DE PROPÓSITO (cópia de `knowledge_articles.company_id`):
    a busca do RAG filtra por empresa sem joins. O serviço de indexação deve sempre
    copiar o company_id do artigo.
    """

    __tablename__ = "knowledge_chunks"
    __table_args__ = (
        UniqueConstraint("article_id", "chunk_index"),
        CheckConstraint("chunk_index >= 0", name="chunk_index_non_negative"),
    )

    article_id: Mapped[int] = mapped_column(ForeignKey("knowledge_articles.id", ondelete="CASCADE"))
    chunk_index: Mapped[int]
    content: Mapped[str] = mapped_column(Text)
    token_count: Mapped[int | None]
    # Id do vetor no banco vetorial (ChromaDB).
    embedding_id: Mapped[str | None] = mapped_column(String(64))

    article: Mapped["KnowledgeArticle"] = relationship(back_populates="chunks")
