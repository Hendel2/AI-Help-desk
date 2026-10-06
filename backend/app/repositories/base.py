"""Repositórios genéricos.

- `BaseRepository`: tabelas globais (sem `company_id`, ex.: roles).
- `CompanyScopedRepository`: dados empresariais. TODO método de leitura, alteração
  ou exclusão exige `company_id` e filtra por ele — é a principal proteção
  multiempresa. Um registro de outra empresa se comporta como inexistente
  (a camada de serviço converte em 404, nunca 403).

Os repositórios fazem `flush`, nunca `commit`: a transação pertence ao serviço.
"""

from collections.abc import Mapping, Sequence
from typing import Any, ClassVar

from sqlalchemy import func, inspect, select
from sqlalchemy.orm import Session

from app.models.base import Base, CompanyScopedMixin

DEFAULT_LIMIT = 20
MAX_LIMIT = 100

# Nunca alterados via `update()`: identidade e escopo do registro.
_PROTECTED_FIELDS = frozenset({"id", "company_id"})


def _check_pagination(offset: int, limit: int) -> None:
    if offset < 0:
        raise ValueError("offset não pode ser negativo")
    if not 1 <= limit <= MAX_LIMIT:
        raise ValueError(f"limit deve estar entre 1 e {MAX_LIMIT}")


def _require_company_id(company_id: int) -> int:
    # bool é subclasse de int: rejeitado explicitamente.
    if isinstance(company_id, bool) or not isinstance(company_id, int) or company_id <= 0:
        raise ValueError("company_id obrigatório para acessar dados de uma empresa")
    return company_id


class BaseRepository[ModelT: Base]:
    """CRUD básico para tabelas globais. Subclasses definem `model`."""

    model: ClassVar[type[Any]]

    def __init__(self, session: Session) -> None:
        if issubclass(self.model, CompanyScopedMixin):
            raise TypeError(
                f"{self.model.__name__} pertence a uma empresa: use CompanyScopedRepository"
            )
        self.session = session

    def get(self, entity_id: int) -> ModelT | None:
        return self.session.get(self.model, entity_id)

    def list(self, *, offset: int = 0, limit: int = DEFAULT_LIMIT) -> Sequence[ModelT]:
        _check_pagination(offset, limit)
        stmt = select(self.model).order_by(self.model.id).offset(offset).limit(limit)
        return self.session.scalars(stmt).all()

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(self.model)) or 0

    def add(self, entity: ModelT) -> ModelT:
        self.session.add(entity)
        self.session.flush()
        return entity

    def delete(self, entity: ModelT) -> None:
        self.session.delete(entity)
        self.session.flush()


class CompanyScopedRepository[ModelT: Base]:
    """CRUD para entidades com `company_id`. Não existe consulta sem empresa."""

    model: ClassVar[type[Any]]

    def __init__(self, session: Session) -> None:
        if not issubclass(self.model, CompanyScopedMixin):
            raise TypeError(f"{self.model.__name__} não possui company_id obrigatório")
        self.session = session

    def _scoped_select(self, company_id: int) -> Any:
        return select(self.model).where(self.model.company_id == _require_company_id(company_id))

    def get(self, company_id: int, entity_id: int) -> ModelT | None:
        stmt = self._scoped_select(company_id).where(self.model.id == entity_id)
        return self.session.scalars(stmt).one_or_none()

    def list(
        self, company_id: int, *, offset: int = 0, limit: int = DEFAULT_LIMIT
    ) -> Sequence[ModelT]:
        _check_pagination(offset, limit)
        stmt = self._scoped_select(company_id).order_by(self.model.id).offset(offset).limit(limit)
        return self.session.scalars(stmt).all()

    def count(self, company_id: int) -> int:
        stmt = (
            select(func.count())
            .select_from(self.model)
            .where(self.model.company_id == _require_company_id(company_id))
        )
        return self.session.scalar(stmt) or 0

    def add(self, company_id: int, entity: ModelT) -> ModelT:
        company_id = _require_company_id(company_id)
        current = getattr(entity, "company_id", None)
        if current is not None and current != company_id:
            raise ValueError("A entidade pertence a outra empresa")
        entity.company_id = company_id  # type: ignore[attr-defined]
        self.session.add(entity)
        self.session.flush()
        return entity

    def update(self, company_id: int, entity_id: int, values: Mapping[str, Any]) -> ModelT | None:
        protected = _PROTECTED_FIELDS.intersection(values)
        if protected:
            raise ValueError(f"Campos não podem ser alterados: {', '.join(sorted(protected))}")
        # Apenas colunas mapeadas (nunca relacionamentos ou atributos arbitrários).
        unknown = set(values) - {attr.key for attr in inspect(self.model).column_attrs}
        if unknown:
            raise ValueError(f"Campos desconhecidos: {', '.join(sorted(unknown))}")
        entity = self.get(company_id, entity_id)
        if entity is None:
            return None
        for field, value in values.items():
            setattr(entity, field, value)
        self.session.flush()
        return entity

    def delete(self, company_id: int, entity_id: int) -> bool:
        """Remove o registro somente se pertencer à empresa. Retorna se removeu."""
        entity = self.get(company_id, entity_id)
        if entity is None:
            return False
        self.session.delete(entity)
        self.session.flush()
        return True
