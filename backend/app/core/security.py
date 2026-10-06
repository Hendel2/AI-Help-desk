"""Hash de senha (Argon2) e emissão/validação de tokens JWT.

Esta camada é puramente criptográfica: não conhece banco de dados nem HTTP.
Autorização é decidida pelas rotas/serviços — ver `app/api/deps.py`.
"""

import uuid
from datetime import datetime, timedelta
from typing import Any, Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from pydantic import BaseModel, ValidationError

from app.models.types import utcnow

JWT_ALGORITHM = "HS256"

TokenType = Literal["access", "refresh"]

# Parâmetros padrão da argon2-cffi (Argon2id, RFC 9106). Suficientes e portáveis.
_hasher = PasswordHasher()

# Limite do Argon2 usado aqui por robustez; o schema já valida o tamanho da senha.
MAX_PASSWORD_LENGTH = 128


class InvalidTokenError(Exception):
    """Token ausente, expirado, com assinatura inválida ou de tipo inesperado."""


class TokenPayload(BaseModel):
    """Conteúdo verificado de um token. Nunca contém dados sensíveis."""

    sub: int
    company_id: int
    role: str
    type: TokenType
    jti: str
    exp: datetime
    iat: datetime


def hash_password(password: str) -> str:
    return _hasher.hash(password[:MAX_PASSWORD_LENGTH])


# Um hash corrompido no banco não deve derrubar o login: a argon2-cffi exige
# ASCII e levanta UnicodeEncodeError antes de chegar a InvalidHashError.
_HASH_ERRORS = (VerifyMismatchError, VerificationError, InvalidHashError, UnicodeEncodeError)


def verify_password(password: str, password_hash: str) -> bool:
    """Compara em tempo constante. Retorna False em vez de propagar exceções."""
    try:
        return _hasher.verify(password_hash, password[:MAX_PASSWORD_LENGTH])
    except _HASH_ERRORS:
        return False


def needs_rehash(password_hash: str) -> bool:
    """True quando o hash foi gerado com parâmetros mais fracos que os atuais."""
    try:
        return _hasher.check_needs_rehash(password_hash)
    except _HASH_ERRORS:
        return True


def create_token(
    *,
    user_id: int,
    company_id: int,
    role: str,
    token_type: TokenType,
    expires_in: timedelta,
    secret: str,
) -> str:
    issued_at = utcnow()
    payload: dict[str, Any] = {
        "sub": str(user_id),  # o registro do JWT exige string
        "company_id": company_id,
        "role": role,
        "type": token_type,
        "jti": uuid.uuid4().hex,
        "iat": issued_at,
        "exp": issued_at + expires_in,
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def decode_token(token: str, *, secret: str, expected_type: TokenType) -> TokenPayload:
    """Valida assinatura, expiração e tipo. Lança `InvalidTokenError` em qualquer falha."""
    try:
        raw = jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["sub", "exp", "iat", "jti"]},
        )
        payload = TokenPayload.model_validate(raw)
    except (jwt.PyJWTError, ValidationError) as exc:
        raise InvalidTokenError(str(exc)) from exc
    if payload.type != expected_type:
        # Um refresh token não pode ser usado como access token (e vice-versa).
        raise InvalidTokenError(f"esperado token de tipo {expected_type}")
    return payload
