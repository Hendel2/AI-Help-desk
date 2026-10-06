from typing import Any

from sqlalchemy import JSON, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin
from app.models.enums import AuditAction
from app.models.types import enum_column


class AuditLog(CreatedAtMixin, Base):
    """Trilha de auditoria. Somente inserção (append-only): não há updated_at."""

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index(None, "company_id", "created_at"),
        Index(None, "entity", "entity_id"),
    )

    # NULL = ação da plataforma, fora do contexto de uma empresa.
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id", ondelete="RESTRICT"))
    # SET NULL: o registro de auditoria sobrevive à exclusão do usuário.
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[AuditAction] = mapped_column(enum_column(AuditAction))
    entity: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    # "metadata" é reservado no SQLAlchemy declarativo. Nunca gravar segredos aqui.
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON)
    # 45 caracteres comportam IPv6.
    ip_address: Mapped[str | None] = mapped_column(String(45))
