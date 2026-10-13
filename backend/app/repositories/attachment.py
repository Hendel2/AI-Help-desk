"""Anexos de chamados. O chamado chega já validado (empresa + permissão) pelo serviço."""

from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models import TicketAttachment


class TicketAttachmentRepository:
    """Como os comentários: sempre por `ticket_id` de um chamado já escopado."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def list_for_ticket(self, ticket_id: int) -> Sequence[TicketAttachment]:
        stmt = (
            select(TicketAttachment)
            .where(TicketAttachment.ticket_id == ticket_id)
            .options(joinedload(TicketAttachment.uploader))
            .order_by(TicketAttachment.created_at, TicketAttachment.id)
        )
        return self.session.scalars(stmt).unique().all()

    def count_for_ticket(self, ticket_id: int) -> int:
        stmt = (
            select(func.count())
            .select_from(TicketAttachment)
            .where(TicketAttachment.ticket_id == ticket_id)
        )
        return self.session.scalar(stmt) or 0

    def get_for_ticket(self, ticket_id: int, attachment_id: int) -> TicketAttachment | None:
        stmt = select(TicketAttachment).where(
            TicketAttachment.id == attachment_id, TicketAttachment.ticket_id == ticket_id
        )
        return self.session.scalars(stmt).one_or_none()

    def add(self, attachment: TicketAttachment) -> TicketAttachment:
        self.session.add(attachment)
        self.session.flush()
        return attachment
