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


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    interval = app.state.settings.SLA_MONITOR_INTERVAL_SECONDS
    task = asyncio.create_task(_sla_monitor(interval)) if interval > 0 else None
    try:
        yield
    finally:
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
