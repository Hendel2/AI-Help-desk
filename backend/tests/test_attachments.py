"""Anexos (§19): validação de tipo/conteúdo/tamanho, permissões e download."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Company, Ticket, TicketAttachment, User
from app.models.enums import RoleName
from app.services.file_validation import sanitize_file_name

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PDF = b"%PDF-1.7\n" + b"x" * 64


def _error(response: Any) -> dict[str, Any]:
    return response.json()["error"]


@pytest.fixture
def company(make_company: Callable[..., Company]) -> Company:
    return make_company(name="Empresa Alfa")


@pytest.fixture
def requester(company: Company, make_user: Callable[..., User], db_session: Session) -> User:
    user = make_user(company, role=RoleName.USER, name="Ana")
    db_session.commit()
    return user


@pytest.fixture
def technician(company: Company, make_user: Callable[..., User], db_session: Session) -> User:
    user = make_user(company, role=RoleName.TECHNICIAN, name="Téo")
    db_session.commit()
    return user


@pytest.fixture
def ticket(requester: User, make_ticket: Callable[..., Ticket], db_session: Session) -> Ticket:
    created = make_ticket(requester)
    db_session.commit()
    return created


def upload(
    client: TestClient,
    ticket: Ticket,
    headers: dict[str, str],
    name: str,
    content: bytes,
    content_type: str = "application/octet-stream",
) -> Any:
    return client.post(
        f"/api/v1/tickets/{ticket.id}/attachments",
        files={"file": (name, content, content_type)},
        headers=headers,
    )


class TestUpload:
    def test_requester_uploads_an_image_and_downloads_it(
        self,
        client: TestClient,
        db_session: Session,
        ticket: Ticket,
        requester: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        headers = auth_headers(requester)

        response = upload(client, ticket, headers, "print do erro.png", PNG, "image/png")

        assert response.status_code == 201
        body = response.json()
        assert body["file_name"] == "print do erro.png"
        assert body["file_type"] == "image/png"
        assert body["file_size"] == len(PNG)
        assert body["uploader"]["name"] == "Ana"
        stored = db_session.scalars(select(TicketAttachment)).one()
        # A chave interna nunca usa o nome enviado.
        assert "print" not in stored.file_path
        assert stored.file_path.startswith(f"{ticket.company_id}/{ticket.id}/")

        download = client.get(
            f"/api/v1/tickets/{ticket.id}/attachments/{body['id']}/download", headers=headers
        )
        assert download.status_code == 200
        assert download.content == PNG
        assert download.headers["x-content-type-options"] == "nosniff"
        assert download.headers["content-disposition"].startswith("attachment;")

        listing = client.get(f"/api/v1/tickets/{ticket.id}/attachments", headers=headers).json()
        assert [item["id"] for item in listing] == [body["id"]]

    def test_ignores_the_client_content_type(
        self,
        client: TestClient,
        ticket: Ticket,
        requester: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        response = upload(
            client, ticket, auth_headers(requester), "relatorio.pdf", PDF, "image/png"
        )

        assert response.status_code == 201
        assert response.json()["file_type"] == "application/pdf"

    @pytest.mark.parametrize(
        ("name", "content", "code"),
        [
            ("virus.exe", b"MZ\x90\x00", "FILE_TYPE_NOT_ALLOWED"),
            ("script.sh", b"#!/bin/sh\nrm -rf /", "FILE_TYPE_NOT_ALLOWED"),
            ("foto.png", b"MZ\x90\x00disfarcado", "EXECUTABLE_NOT_ALLOWED"),
            ("foto.png", PDF, "FILE_CONTENT_MISMATCH"),
            ("notas.txt", b"texto\x00binario", "FILE_CONTENT_MISMATCH"),
            ("vazio.pdf", b"", "EMPTY_FILE"),
        ],
    )
    def test_rejects_disallowed_or_disguised_files(
        self,
        client: TestClient,
        db_session: Session,
        ticket: Ticket,
        requester: User,
        auth_headers: Callable[[User], dict[str, str]],
        name: str,
        content: bytes,
        code: str,
    ) -> None:
        response = upload(client, ticket, auth_headers(requester), name, content)

        assert response.status_code == 400
        assert _error(response)["code"] == code
        assert db_session.scalars(select(TicketAttachment)).first() is None

    def test_rejects_files_above_the_limit_without_leaving_garbage(
        self,
        client: TestClient,
        db_session: Session,
        ticket: Ticket,
        requester: User,
        settings: Any,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        too_big = PDF + b"x" * (1024 * 1024)  # limite de teste: 1 MB

        response = upload(client, ticket, auth_headers(requester), "grande.pdf", too_big)

        assert response.status_code == 413
        assert _error(response)["code"] == "FILE_TOO_LARGE"
        assert db_session.scalars(select(TicketAttachment)).first() is None
        stored_files = [p for p in settings.UPLOAD_DIR.rglob("*") if p.is_file()]
        assert stored_files == []

    def test_closed_ticket_does_not_accept_attachments(
        self,
        client: TestClient,
        db_session: Session,
        ticket: Ticket,
        requester: User,
        technician: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        client.post(
            f"/api/v1/tickets/{ticket.id}/status",
            json={"status": "CANCELLED"},
            headers=auth_headers(technician),
        )

        response = upload(client, ticket, auth_headers(requester), "a.png", PNG)

        assert response.status_code == 409


class TestPermissions:
    def test_another_user_cannot_list_upload_or_download(
        self,
        client: TestClient,
        db_session: Session,
        company: Company,
        ticket: Ticket,
        requester: User,
        make_user: Callable[..., User],
        make_company: Callable[..., Company],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        attachment = upload(client, ticket, auth_headers(requester), "a.png", PNG).json()
        colleague = make_user(company, role=RoleName.USER)
        foreign_tech = make_user(make_company(name="Beta"), role=RoleName.TECHNICIAN)
        db_session.commit()

        for outsider in (colleague, foreign_tech):
            headers = auth_headers(outsider)
            base = f"/api/v1/tickets/{ticket.id}/attachments"
            assert client.get(base, headers=headers).status_code == 404
            assert upload(client, ticket, headers, "b.png", PNG).status_code == 404
            assert (
                client.get(f"{base}/{attachment['id']}/download", headers=headers).status_code
                == 404
            )

    def test_attachment_id_from_another_ticket_is_not_found(
        self,
        client: TestClient,
        db_session: Session,
        ticket: Ticket,
        requester: User,
        make_ticket: Callable[..., Ticket],
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        headers = auth_headers(requester)
        other = make_ticket(requester, title="Outro chamado do usuário")
        db_session.commit()
        attachment = upload(client, other, headers, "a.png", PNG).json()

        response = client.get(
            f"/api/v1/tickets/{ticket.id}/attachments/{attachment['id']}/download",
            headers=headers,
        )

        assert response.status_code == 404
        assert _error(response)["code"] == "ATTACHMENT_NOT_FOUND"

    def test_technician_downloads_attachments_of_company_tickets(
        self,
        client: TestClient,
        ticket: Ticket,
        requester: User,
        technician: User,
        auth_headers: Callable[[User], dict[str, str]],
    ) -> None:
        attachment = upload(client, ticket, auth_headers(requester), "a.png", PNG).json()

        response = client.get(
            f"/api/v1/tickets/{ticket.id}/attachments/{attachment['id']}/download",
            headers=auth_headers(technician),
        )

        assert response.status_code == 200


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("../../etc/passwd", "passwd"),
        ("C:\\Windows\\system32\\evil.png", "evil.png"),
        ("rel<a>t:o?.pdf", "rel_a_t_o_.pdf"),
        ("   ", "arquivo"),
        (None, "arquivo"),
    ],
)
def test_sanitize_file_name(raw: str | None, expected: str) -> None:
    assert sanitize_file_name(raw) == expected


def test_sanitize_file_name_truncates_keeping_the_extension() -> None:
    name = sanitize_file_name("a" * 300 + ".pdf")

    assert len(name) <= 255
    assert name.endswith(".pdf")
