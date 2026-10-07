from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin

if TYPE_CHECKING:
    from app.models.ticket import Ticket
    from app.models.user import User


class TicketAttachment(CreatedAtMixin, Base):
    __tablename__ = "ticket_attachments"
    __table_args__ = (CheckConstraint("file_size >= 0", name="file_size_non_negative"),)

    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    uploaded_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    # Nome original do arquivo, já sanitizado (exibido ao usuário).
    file_name: Mapped[str] = mapped_column(String(255))
    # Chave interna no armazenamento (nunca derivada do nome enviado pelo usuário).
    file_path: Mapped[str] = mapped_column(String(500))
    # MIME type validado no upload.
    file_type: Mapped[str] = mapped_column(String(100))
    # Tamanho em bytes.
    file_size: Mapped[int] = mapped_column(BigInteger)

    ticket: Mapped["Ticket"] = relationship(back_populates="attachments")
    uploader: Mapped["User"] = relationship()
