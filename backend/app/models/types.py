"""Tipos de coluna compartilhados pelos modelos."""

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects import mysql
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeEngine


def utcnow() -> datetime:
    """Data/hora atual em UTC, sempre timezone-aware."""
    return datetime.now(UTC)


class UTCDateTime(sa.TypeDecorator[datetime]):
    """Armazena datetimes como UTC "naive" e devolve sempre datetimes aware em UTC.

    Datetimes naive são rejeitados no bind para evitar ambiguidade de fuso horário.
    No MySQL usa DATETIME(6) para preservar microssegundos (ordenação de eventos).
    """

    impl = sa.DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect) -> TypeEngine[Any]:
        if dialect.name == "mysql":
            return dialect.type_descriptor(mysql.DATETIME(fsp=6))
        return dialect.type_descriptor(sa.DateTime())

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if not isinstance(value, datetime):
            raise TypeError(f"UTCDateTime espera datetime, recebeu {type(value).__name__}")
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("UTCDateTime não aceita datetime naive; informe um timezone (UTC).")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


# TEXT (64 KB) em geral; LONGTEXT no MySQL para conteúdo potencialmente grande
# (artigos da base de conhecimento e saídas da IA).
LongText = sa.Text().with_variant(mysql.LONGTEXT(), "mysql")


def enum_column[E: StrEnum](enum_cls: type[E]) -> sa.Enum:
    """Enum persistido como VARCHAR (nunca ENUM nativo do MySQL), validado no Python.

    Sem CHECK constraint: novos valores não exigem alterar constraints no banco.
    """
    values = [member.value for member in enum_cls]
    return sa.Enum(
        enum_cls,
        name=enum_cls.__name__.lower(),
        native_enum=False,
        create_constraint=False,
        length=max(len(value) for value in values),
        values_callable=lambda members: [member.value for member in members],
        validate_strings=True,
    )
