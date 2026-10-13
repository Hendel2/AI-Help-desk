from datetime import datetime
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CompanyScopedMixin, TimestampMixin
from app.models.types import UTCDateTime

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.department import Department
    from app.models.role import Role


class User(CompanyScopedMixin, TimestampMixin, Base):
    __tablename__ = "users"

    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="RESTRICT"), index=True)
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"), index=True
    )
    name: Mapped[str] = mapped_column(String(150))
    # Único globalmente: o login é feito apenas pelo e-mail (armazenado em minúsculas).
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    avatar: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(default=True, server_default=sa.true())
    # Tokens emitidos antes deste instante são recusados (troca/redefinição de senha).
    password_changed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    company: Mapped["Company"] = relationship()
    role: Mapped["Role"] = relationship()
    department: Mapped["Department | None"] = relationship()
