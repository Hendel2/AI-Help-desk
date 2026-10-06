from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.enums import RoleName
from app.models.types import enum_column


class Role(Base):
    """Perfil de acesso. Tabela GLOBAL (sem company_id), populada pela migration inicial."""

    __tablename__ = "roles"

    name: Mapped[RoleName] = mapped_column(enum_column(RoleName), unique=True)
    description: Mapped[str | None] = mapped_column(String(255))
