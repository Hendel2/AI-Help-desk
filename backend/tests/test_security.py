"""Testes de hash de senha e tokens JWT (sem banco e sem HTTP)."""

from datetime import timedelta

import pytest

from app.core.security import (
    InvalidTokenError,
    create_token,
    decode_token,
    hash_password,
    needs_rehash,
    verify_password,
)

SECRET = "secret-de-teste-com-mais-de-32-caracteres"
TOKEN_ARGS = {"user_id": 7, "company_id": 3, "role": "ADMIN", "secret": SECRET}


def test_hash_is_salted_and_verifiable() -> None:
    first, second = hash_password("senha-correta"), hash_password("senha-correta")
    assert first != second  # salt aleatório
    assert "senha-correta" not in first
    assert verify_password("senha-correta", first)
    assert not verify_password("senha-errada", first)


def test_verify_password_rejects_invalid_hash_without_raising() -> None:
    assert not verify_password("qualquer", "não-é-um-hash")
    assert needs_rehash("não-é-um-hash")
    assert not needs_rehash(hash_password("senha-correta"))


def test_access_token_round_trip() -> None:
    token = create_token(token_type="access", expires_in=timedelta(minutes=5), **TOKEN_ARGS)
    payload = decode_token(token, secret=SECRET, expected_type="access")
    assert (payload.sub, payload.company_id, payload.role) == (7, 3, "ADMIN")
    assert payload.type == "access"


@pytest.mark.parametrize(
    ("token_type", "expected_type"),
    [("refresh", "access"), ("access", "refresh")],
)
def test_token_type_confusion_is_rejected(token_type: str, expected_type: str) -> None:
    token = create_token(
        token_type=token_type,  # type: ignore[arg-type]
        expires_in=timedelta(minutes=5),
        **TOKEN_ARGS,
    )
    with pytest.raises(InvalidTokenError):
        decode_token(token, secret=SECRET, expected_type=expected_type)  # type: ignore[arg-type]


def test_expired_token_is_rejected() -> None:
    token = create_token(token_type="access", expires_in=timedelta(seconds=-1), **TOKEN_ARGS)
    with pytest.raises(InvalidTokenError):
        decode_token(token, secret=SECRET, expected_type="access")


def test_token_signed_with_another_secret_is_rejected() -> None:
    token = create_token(token_type="access", expires_in=timedelta(minutes=5), **TOKEN_ARGS)
    with pytest.raises(InvalidTokenError):
        decode_token(token, secret="outro-secret-com-mais-de-32-caracteres", expected_type="access")


def test_garbage_token_is_rejected() -> None:
    with pytest.raises(InvalidTokenError):
        decode_token("não.é.jwt", secret=SECRET, expected_type="access")
