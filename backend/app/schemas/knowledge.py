"""Schemas da base de conhecimento (§29, §49)."""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, StringConstraints

from app.models.enums import ArticleSourceType, ArticleStatus
from app.schemas.common import ORMModel
from app.schemas.ticket import CategorySummary

ArticleTitle = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)
]
ArticleSummary = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
ArticleContent = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=20, max_length=200_000)
]


class AuthorSummary(ORMModel):
    id: int
    name: str


class ArticleListItem(ORMModel):
    id: int
    title: str
    summary: str | None
    status: ArticleStatus
    is_featured: bool
    view_count: int
    helpful_count: int
    not_helpful_count: int
    updated_at: datetime
    category: CategorySummary | None
    author: AuthorSummary | None


class ArticleRead(ArticleListItem):
    content: str
    source_type: ArticleSourceType
    source_file_name: str | None
    indexed_at: datetime | None
    created_at: datetime


class ArticleCreate(BaseModel):
    title: ArticleTitle
    summary: ArticleSummary | None = None
    content: ArticleContent
    category_id: int | None = None
    status: ArticleStatus = ArticleStatus.DRAFT
    is_featured: bool = False


class ArticleUpdate(BaseModel):
    title: ArticleTitle | None = None
    summary: ArticleSummary | None = None
    content: ArticleContent | None = None
    category_id: int | None = None
    status: ArticleStatus | None = None
    is_featured: bool | None = None


class ArticleFeedback(BaseModel):
    helpful: bool


class ArticleSuggestion(BaseModel):
    """Trecho de um artigo encontrado pela busca semântica (fonte citável)."""

    article_id: int
    title: str
    excerpt: str
    score: float
