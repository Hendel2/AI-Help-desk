"""Categorias da empresa: leitura para todos; manutenção pelo ADMIN (§50)."""

from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, SessionDep
from app.api.v1.admin.router import NOT_FOUND, AdminDep
from app.repositories.ticket import CategoryRepository
from app.schemas.admin import CategoryAdminRead, CategoryWrite
from app.schemas.category import CategoryRead

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get(
    "",
    response_model=list[CategoryRead],
    summary="Categorias ativas da empresa (para abrir e filtrar chamados)",
)
def list_categories(user: CurrentUser, session: SessionDep) -> list[CategoryRead]:
    categories = CategoryRepository(session).list_active(user.company_id)
    return [CategoryRead.model_validate(category) for category in categories]


@router.get(
    "/manage",
    response_model=list[CategoryAdminRead],
    summary="Todas as categorias, inclusive inativas (administração)",
)
def list_all_categories(service: AdminDep) -> list[CategoryAdminRead]:
    return [CategoryAdminRead.model_validate(c) for c in service.list_categories()]


@router.post("", response_model=CategoryAdminRead, status_code=status.HTTP_201_CREATED)
def create_category(data: CategoryWrite, service: AdminDep) -> CategoryAdminRead:
    return CategoryAdminRead.model_validate(service.save_category(data))


@router.put("/{category_id}", response_model=CategoryAdminRead, responses=NOT_FOUND)
def update_category(category_id: int, data: CategoryWrite, service: AdminDep) -> CategoryAdminRead:
    return CategoryAdminRead.model_validate(service.save_category(data, category_id))


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
    summary="Exclui categoria sem uso (em uso: desative)",
)
def delete_category(category_id: int, service: AdminDep) -> Response:
    service.delete_category(category_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
