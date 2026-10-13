"""Anexos de chamados (§19): permissões, validação e armazenamento."""

import logging
import uuid
from collections.abc import Sequence
from pathlib import Path, PurePath
from typing import BinaryIO

from sqlalchemy.orm import Session

from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.models import TicketAttachment, User
from app.models.enums import AuditAction, TicketStatus
from app.repositories.attachment import TicketAttachmentRepository
from app.repositories.audit_log import AuditLogRepository
from app.services.file_validation import (
    SNIFF_SIZE,
    InvalidFileError,
    sanitize_file_name,
    validate_file,
)
from app.services.storage import FileStorage, FileTooLargeError
from app.services.tickets import TicketService

logger = logging.getLogger("app.attachments")

#: Limite de anexos por chamado (evita abuso de armazenamento).
MAX_ATTACHMENTS_PER_TICKET = 20


class PayloadTooLargeError(AppError):
    status_code = 413
    code = "FILE_TOO_LARGE"


class AttachmentService:
    def __init__(self, session: Session, storage: FileStorage, *, max_size_mb: int) -> None:
        self.session = session
        self.storage = storage
        self.max_bytes = max_size_mb * 1024 * 1024
        self.max_size_mb = max_size_mb
        self.tickets = TicketService(session)
        self.attachments = TicketAttachmentRepository(session)
        self.audit = AuditLogRepository(session)

    def list(self, user: User, ticket_id: int) -> Sequence[TicketAttachment]:
        ticket = self.tickets.get(user, ticket_id)  # aplica escopo e permissão
        return self.attachments.list_for_ticket(ticket.id)

    def upload(
        self,
        user: User,
        ticket_id: int,
        *,
        file_name: str | None,
        stream: BinaryIO,
        ip_address: str | None = None,
    ) -> TicketAttachment:
        ticket = self.tickets.get(user, ticket_id)
        if ticket.status in {TicketStatus.CLOSED, TicketStatus.CANCELLED}:
            raise ConflictError(
                "Este chamado está encerrado e não aceita novos anexos.", code="TICKET_CLOSED"
            )
        if self.attachments.count_for_ticket(ticket.id) >= MAX_ATTACHMENTS_PER_TICKET:
            raise ConflictError(
                f"Limite de {MAX_ATTACHMENTS_PER_TICKET} anexos por chamado atingido.",
                code="ATTACHMENT_LIMIT_REACHED",
            )

        safe_name = sanitize_file_name(file_name)
        head = stream.read(SNIFF_SIZE)
        try:
            kind = validate_file(safe_name, head)
        except InvalidFileError as exc:
            raise AppError(exc.message, code=exc.code) from exc
        stream.seek(0)

        # Chave interna: nunca derivada do nome enviado (evita path traversal e colisões).
        extension = PurePath(safe_name).suffix.lower()
        key = f"{ticket.company_id}/{ticket.id}/{uuid.uuid4().hex}{extension}"
        try:
            size = self.storage.save(key, stream, max_bytes=self.max_bytes)
        except FileTooLargeError as exc:
            raise PayloadTooLargeError(
                f"O arquivo excede o limite de {self.max_size_mb} MB."
            ) from exc

        try:
            attachment = TicketAttachment(
                ticket_id=ticket.id,
                uploaded_by=user.id,
                file_name=safe_name,
                file_path=key,
                file_type=kind.mime,
                file_size=size,
            )
            self.attachments.add(attachment)
            self.audit.record(
                action=AuditAction.TICKET_UPDATED,
                entity="ticket",
                entity_id=ticket.id,
                company_id=ticket.company_id,
                user_id=user.id,
                metadata={"attachment_id": attachment.id, "file_type": kind.mime, "size": size},
                ip_address=ip_address,
            )
            self.session.commit()
        except Exception:
            # Sem registro no banco o arquivo ficaria órfão.
            self.session.rollback()
            self.storage.delete(key)
            raise

        self.session.refresh(attachment)
        return attachment

    def get_for_download(
        self, user: User, ticket_id: int, attachment_id: int
    ) -> tuple[TicketAttachment, Path]:
        ticket = self.tickets.get(user, ticket_id)
        attachment = self.attachments.get_for_ticket(ticket.id, attachment_id)
        if attachment is None:
            raise NotFoundError("Anexo não encontrado.", code="ATTACHMENT_NOT_FOUND")
        path = self.storage.path(attachment.file_path)
        if not path.is_file():
            logger.error(
                "Arquivo de anexo ausente no armazenamento",
                extra={"attachment_id": attachment.id},
            )
            raise NotFoundError("O arquivo deste anexo não está disponível.", code="FILE_MISSING")
        return attachment, path
