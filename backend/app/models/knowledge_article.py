from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CompanyScopedMixin, TimestampMixin
from app.models.enums import ArticleSourceType, ArticleStatus
from app.models.types import LongText, UTCDateTime, enum_column

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.knowledge_chunk import KnowledgeChunk
    from app.models.user import User


class KnowledgeArticle(CompanyScopedMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_articles"
    __table_args__ = (Index(None, "company_id", "status"),)

    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    # SET NULL: o artigo continua disponível se o autor for removido.
    author_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str | None] = mapped_column(String(500))
    content: Mapped[str] = mapped_column(LongText)
    status: Mapped[ArticleStatus] = mapped_column(
        enum_column(ArticleStatus),
        default=ArticleStatus.DRAFT,
        server_default=ArticleStatus.DRAFT.value,
    )
    # Artigos criados no editor ou importados de upload (PDF, DOCX, TXT, MD).
    source_type: Mapped[ArticleSourceType] = mapped_column(
        enum_column(ArticleSourceType),
        default=ArticleSourceType.MANUAL,
        server_default=ArticleSourceType.MANUAL.value,
    )
    source_file_name: Mapped[str | None] = mapped_column(String(255))
    # Contadores para "avaliar artigos" e "artigos populares" (seção 29).
    view_count: Mapped[int] = mapped_column(default=0, server_default="0")
    helpful_count: Mapped[int] = mapped_column(default=0, server_default="0")
    not_helpful_count: Mapped[int] = mapped_column(default=0, server_default="0")
    # "Marcar artigos populares" (seção 29).
    is_featured: Mapped[bool] = mapped_column(default=False, server_default=sa.false())
    # Última indexação no banco vetorial (NULL = ainda não indexado).
    indexed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    category: Mapped["Category | None"] = relationship()
    author: Mapped["User | None"] = relationship()
    chunks: Mapped[list["KnowledgeChunk"]] = relationship(
        back_populates="article",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="KnowledgeChunk.chunk_index",
    )
