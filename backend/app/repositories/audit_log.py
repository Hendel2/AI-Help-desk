"""Registro da trilha de auditoria (append-only)."""

from typing import Any

from app.models import AuditLog
from app.models.enums import AuditAction


class AuditLogRepository:
    """Não usa `BaseRepository`: `audit_logs` só aceita inserção.

    `company_id` é opcional porque algumas ações (ex.: login falho) ocorrem fora
    do contexto de uma empresa conhecida.
    """

    def __init__(self, session: Any) -> None:
        self.session = session

    def record(
        self,
        *,
        action: AuditAction,
        entity: str,
        entity_id: str | int | None = None,
        company_id: int | None = None,
        user_id: int | None = None,
        metadata: dict[str, Any] | None = None,
        ip_address: str | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            action=action,
            entity=entity,
            entity_id=None if entity_id is None else str(entity_id),
            company_id=company_id,
            user_id=user_id,
            metadata_=metadata,
            ip_address=ip_address,
        )
        self.session.add(entry)
        self.session.flush()
        return entry
