"""Categorias da empresa. O CRUD administrativo completo chega na etapa 17."""

from fastapi import APIRouter

from app.api.deps import CurrentUser, SessionDep
from app.repositories.ticket import CategoryRepository
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
