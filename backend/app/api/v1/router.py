"""Agrega os routers da API v1 (montada em /api/v1 por `app.main`)."""

from fastapi import APIRouter

from app.api.v1.auth.router import router as auth_router
from app.api.v1.categories.router import router as categories_router
from app.api.v1.health.router import router as health_router
from app.api.v1.tickets.router import router as tickets_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(tickets_router)
api_router.include_router(categories_router)
