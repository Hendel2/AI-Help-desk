"""Rotas de anexos de chamados (§19)."""

from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import FileResponse

from app.api.deps import ClientIpDep, CurrentUser, SessionDep, SettingsDep, UploadLimit
from app.schemas.common import ErrorResponse
from app.schemas.ticket import TicketAttachmentRead
from app.services.attachments import AttachmentService
from app.services.storage import LocalFileStorage

router = APIRouter(prefix="/tickets/{ticket_id}/attachments", tags=["tickets"])


def get_attachment_service(session: SessionDep, settings: SettingsDep) -> AttachmentService:
    return AttachmentService(
        session,
        LocalFileStorage(settings.UPLOAD_DIR),
        max_size_mb=settings.MAX_UPLOAD_SIZE_MB,
    )


ServiceDep = Annotated[AttachmentService, Depends(get_attachment_service)]


@router.get("", response_model=list[TicketAttachmentRead], summary="Anexos do chamado")
def list_attachments(
    ticket_id: int, user: CurrentUser, service: ServiceDep
) -> list[TicketAttachmentRead]:
    return [TicketAttachmentRead.model_validate(item) for item in service.list(user, ticket_id)]


@router.post(
    "",
    dependencies=[UploadLimit],
    response_model=TicketAttachmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Envia um anexo (imagens, PDF, Office ou texto)",
    responses={
        400: {"model": ErrorResponse, "description": "Tipo ou conteúdo não permitido"},
        413: {"model": ErrorResponse, "description": "Arquivo acima do limite"},
    },
)
def upload_attachment(
    ticket_id: int,
    user: CurrentUser,
    service: ServiceDep,
    ip: ClientIpDep,
    file: Annotated[UploadFile, File(description="Arquivo a anexar")],
) -> TicketAttachmentRead:
    attachment = service.upload(
        user, ticket_id, file_name=file.filename, stream=file.file, ip_address=ip
    )
    return TicketAttachmentRead.model_validate(attachment)


@router.get(
    "/{attachment_id}/download",
    response_class=FileResponse,
    summary="Baixa o anexo",
    responses={404: {"model": ErrorResponse, "description": "Anexo não encontrado"}},
)
def download_attachment(
    ticket_id: int, attachment_id: int, user: CurrentUser, service: ServiceDep
) -> FileResponse:
    attachment, path = service.get_for_download(user, ticket_id, attachment_id)
    return FileResponse(
        path,
        media_type=attachment.file_type,
        headers={
            # Sempre download (nunca renderizado inline) e sem "adivinhar" o tipo.
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(attachment.file_name)}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )
