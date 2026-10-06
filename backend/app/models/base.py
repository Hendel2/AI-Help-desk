"""Base declarativa e mixins compartilhados pelos modelos."""

from datetime import datetime

from sqlalchemy import ForeignKey, MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.models.types import UTCDateTime, utcnow

# Nomes determinísticos (necessários para migrations) e curtos: o MySQL limita
# identificadores a 64 caracteres (verificado em tests/test_models.py).
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Base de todos os modelos. Toda tabela tem PK inteira autoincremental `id`.

    INTEGER (e não BIGINT) porque o SQLite só autoincrementa `INTEGER PRIMARY KEY`.
    """

    metadata = MetaData(naming_convention=NAMING_CONVENTION)

    id: Mapped[int] = mapped_column(primary_key=True, sort_order=-10)

    def __repr__(self) -> str:
        return f"<{type(self).__name__} id={self.id!r}>"


class CreatedAtMixin:
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, sort_order=100)


class TimestampMixin(CreatedAtMixin):
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, onupdate=utcnow, sort_order=101
    )


class CompanyScopedMixin:
    """Dados empresariais: toda consulta deve filtrar por `company_id` (multiempresa)."""

    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="RESTRICT"), index=True, sort_order=-5
    )
