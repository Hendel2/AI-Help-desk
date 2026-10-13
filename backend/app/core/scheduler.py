"""Tarefas periódicas da API (monitor de SLA).

Roda dentro do processo da API para dispensar infraestrutura extra. Com mais de
uma instância, cada alerta continua único: o serviço verifica se já foi enviado.
Defina `SLA_MONITOR_INTERVAL_SECONDS=0` para desligar (ex.: testes, workers).
"""

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI

from app.core.database import SessionLocal
from app.services.notifications import NotificationService

logger = logging.getLogger("app.scheduler")


def run_sla_scan() -> int:
    with SessionLocal() as session:
        return NotificationService(session).scan_sla_alerts()


async def _sla_monitor(interval: int) -> None:
    while True:
        await asyncio.sleep(interval)
        try:
            # Consulta síncrona fora do event loop.
            await asyncio.to_thread(run_sla_scan)
        except Exception:
            logger.exception("Falha no monitor de SLA")


def rebuild_memory_index(app: FastAPI) -> int:
    """Banco vetorial em memória começa vazio: reindexa os artigos publicados."""
    from sqlalchemy import select

    from app.models import Company
    from app.services.ai.rag import RAGService

    with SessionLocal() as session:
        rag = RAGService(session, app.state.vector_store, app.state.embedder)
        total = sum(
            rag.reindex_company(company_id) for company_id in session.scalars(select(Company.id))
        )
        session.commit()
        return total


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = app.state.settings
    if settings.VECTOR_STORE_PROVIDER == "memory" and settings.ENVIRONMENT != "test":
        try:
            await asyncio.to_thread(rebuild_memory_index, app)
        except Exception:
            logger.exception("Falha ao reconstruir o índice em memória")
    interval = settings.SLA_MONITOR_INTERVAL_SECONDS
    task = asyncio.create_task(_sla_monitor(interval)) if interval > 0 else None
    try:
        yield
    finally:
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
