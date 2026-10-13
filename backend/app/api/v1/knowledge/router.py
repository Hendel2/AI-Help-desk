"""Rotas da base de conhecimento (§32)."""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile, status

from app.api.deps import ClientIpDep, CurrentUser, SessionDep, SettingsDep, UploadLimit
from app.core.exceptions import AppError
from app.models.enums import ArticleStatus
from app.schemas.common import ErrorResponse, Page, PageParams
from app.schemas.knowledge import (
    ArticleCreate,
    ArticleFeedback,
    ArticleListItem,
    ArticleRead,
    ArticleSuggestion,
    ArticleUpdate,
)
from app.services.ai.rag import RAGService
from app.services.knowledge import ArticleSort, KnowledgeService
from app.services.knowledge_text import KNOWLEDGE_EXTENSIONS

router = APIRouter(prefix="/knowledge", tags=["knowledge"])

NOT_FOUND = {404: {"model": ErrorResponse, "description": "Artigo não encontrado"}}


def get_rag(request: Request, session: SessionDep) -> RAGService:
    state = request.app.state
    return RAGService(session, state.vector_store, state.embedder)


def get_knowledge_service(
    session: SessionDep, rag: Annotated[RAGService, Depends(get_rag)]
) -> KnowledgeService:
    return KnowledgeService(session, rag)


ServiceDep = Annotated[KnowledgeService, Depends(get_knowledge_service)]


@router.get("", response_model=Page[ArticleListItem], summary="Lista e pesquisa artigos")
def list_articles(
    user: CurrentUser,
    service: ServiceDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
    search: Annotated[str | None, Query(max_length=200)] = None,
    category_id: Annotated[int | None, Query(ge=1)] = None,
    article_status: Annotated[ArticleStatus | None, Query(alias="status")] = None,
    sort: Annotated[ArticleSort, Query()] = "recent",
) -> Page[ArticleListItem]:
    params = PageParams(page=page, page_size=page_size)
    items, total = service.list(
        user,
        search=search,
        category_id=category_id,
        status=article_status,
        sort=sort,
        offset=params.offset,
        limit=params.limit,
    )
    return Page[ArticleListItem].build(
        [ArticleListItem.model_validate(item) for item in items], total, params
    )


@router.get(
    "/suggest",
    response_model=list[ArticleSuggestion],
    summary="Artigos relevantes para um problema (busca semântica)",
)
def suggest(
    user: CurrentUser,
    service: ServiceDep,
    q: Annotated[str, Query(min_length=3, max_length=1000)],
) -> list[ArticleSuggestion]:
    return [ArticleSuggestion(**vars(source)) for source in service.suggest(user, q)]


@router.post(
    "",
    response_model=ArticleRead,
    status_code=status.HTTP_201_CREATED,
    summary="Cria um artigo (ADMIN)",
)
def create_article(
    data: ArticleCreate, user: CurrentUser, service: ServiceDep, ip: ClientIpDep
) -> ArticleRead:
    article = service.create(user, **data.model_dump(), ip_address=ip)
    return ArticleRead.model_validate(article)


@router.post(
    "/upload",
    dependencies=[UploadLimit],
    response_model=ArticleRead,
    status_code=status.HTTP_201_CREATED,
    summary="Importa PDF, DOCX, TXT ou MD como rascunho (ADMIN)",
    responses={400: {"model": ErrorResponse}, 413: {"model": ErrorResponse}},
)
def upload_article(
    user: CurrentUser,
    service: ServiceDep,
    settings: SettingsDep,
    ip: ClientIpDep,
    file: Annotated[UploadFile, File(description=f"Formatos: {', '.join(KNOWLEDGE_EXTENSIONS)}")],
    category_id: Annotated[int | None, Form()] = None,
) -> ArticleRead:
    limit = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise AppError(
            f"O arquivo excede o limite de {settings.MAX_UPLOAD_SIZE_MB} MB.",
            code="FILE_TOO_LARGE",
        ) from None
    article = service.import_file(
        user,
        file_name=file.filename or "documento.txt",
        data=data,
        category_id=category_id,
        ip_address=ip,
    )
    return ArticleRead.model_validate(article)


@router.get("/{article_id}", response_model=ArticleRead, responses=NOT_FOUND, summary="Artigo")
def get_article(article_id: int, user: CurrentUser, service: ServiceDep) -> ArticleRead:
    return ArticleRead.model_validate(service.get(user, article_id, count_view=True))


@router.put(
    "/{article_id}", response_model=ArticleRead, responses=NOT_FOUND, summary="Edita (ADMIN)"
)
def update_article(
    article_id: int, data: ArticleUpdate, user: CurrentUser, service: ServiceDep, ip: ClientIpDep
) -> ArticleRead:
    changes = data.model_dump(exclude_unset=True)
    return ArticleRead.model_validate(service.update(user, article_id, changes, ip_address=ip))


@router.delete(
    "/{article_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
    summary="Exclui (ADMIN)",
)
def delete_article(
    article_id: int, user: CurrentUser, service: ServiceDep, ip: ClientIpDep
) -> None:
    service.delete(user, article_id, ip_address=ip)


@router.post(
    "/{article_id}/index",
    response_model=ArticleRead,
    responses=NOT_FOUND,
    summary="Reindexa no RAG (ADMIN)",
)
def index_article(article_id: int, user: CurrentUser, service: ServiceDep) -> ArticleRead:
    return ArticleRead.model_validate(service.reindex(user, article_id))


@router.post(
    "/{article_id}/feedback",
    response_model=ArticleRead,
    responses=NOT_FOUND,
    summary='"Este artigo ajudou?"',
)
def article_feedback(
    article_id: int, data: ArticleFeedback, user: CurrentUser, service: ServiceDep
) -> ArticleRead:
    return ArticleRead.model_validate(service.feedback(user, article_id, helpful=data.helpful))
