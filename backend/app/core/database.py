"""Engine e fábrica de sessões do SQLAlchemy (sem regras de negócio)."""

from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings


def _enable_sqlite_foreign_keys(dbapi_connection: Any, _connection_record: Any) -> None:
    # O SQLite só aplica FKs (e ON DELETE) com este PRAGMA ativo por conexão.
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def create_db_engine(database_url: str, **engine_kwargs: Any) -> Engine:
    """Cria o engine com as opções adequadas ao banco (SQLite em dev/test, MySQL em produção)."""
    url = make_url(database_url)
    if url.get_backend_name() == "sqlite":
        connect_args = {"check_same_thread": False, **engine_kwargs.pop("connect_args", {})}
        engine = create_engine(url, connect_args=connect_args, **engine_kwargs)
        event.listen(engine, "connect", _enable_sqlite_foreign_keys)
        return engine

    engine_kwargs.setdefault("pool_pre_ping", True)
    # Evita usar conexões encerradas pelo wait_timeout do MySQL.
    engine_kwargs.setdefault("pool_recycle", 3600)
    return create_engine(url, **engine_kwargs)


engine = create_db_engine(get_settings().DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
