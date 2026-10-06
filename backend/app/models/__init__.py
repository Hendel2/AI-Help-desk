"""Modelos SQLAlchemy. Importar este pacote registra todas as tabelas em `Base.metadata`."""

from app.models.ai_action import AIAction
from app.models.ai_feedback import AIFeedback
from app.models.audit_log import AuditLog
from app.models.base import Base, CompanyScopedMixin, CreatedAtMixin, TimestampMixin
from app.models.category import Category
from app.models.company import Company
from app.models.conversation import Conversation
from app.models.department import Department
from app.models.knowledge_article import KnowledgeArticle
from app.models.knowledge_chunk import KnowledgeChunk
from app.models.message import Message
from app.models.notification import Notification
from app.models.role import Role
from app.models.sla_policy import SLAPolicy
from app.models.ticket import Ticket
from app.models.ticket_attachment import TicketAttachment
from app.models.ticket_comment import TicketComment
from app.models.ticket_history import TicketHistory
from app.models.ticket_rating import TicketRating
from app.models.user import User

__all__ = [
    "AIAction",
    "AIFeedback",
    "AuditLog",
    "Base",
    "Category",
    "Company",
    "CompanyScopedMixin",
    "Conversation",
    "CreatedAtMixin",
    "Department",
    "KnowledgeArticle",
    "KnowledgeChunk",
    "Message",
    "Notification",
    "Role",
    "SLAPolicy",
    "Ticket",
    "TicketAttachment",
    "TicketComment",
    "TicketHistory",
    "TicketRating",
    "TimestampMixin",
    "User",
]
