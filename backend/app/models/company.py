import sqlalchemy as sa
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Company(TimestampMixin, Base):
    """Empresa (tenant) que utiliza a plataforma."""

    __tablename__ = "companies"

    name: Mapped[str] = mapped_column(String(150))
    # Somente dígitos (a normalização acontece na camada de schema).
    cnpj: Mapped[str | None] = mapped_column(String(14), unique=True)
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(20))
    # Adição: empresas são desativadas, nunca apagadas (preserva histórico).
    is_active: Mapped[bool] = mapped_column(default=True, server_default=sa.true())
