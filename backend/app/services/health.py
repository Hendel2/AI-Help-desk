import logging

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def check_database(session: Session) -> bool:
    """Verifica se o banco responde. Nunca propaga detalhes do erro ao cliente."""
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        # Apenas o tipo do erro: a mensagem do driver pode conter host/usuário.
        logger.warning("Database health check failed", extra={"error_type": type(exc).__name__})
        session.rollback()
        return False
    return True
