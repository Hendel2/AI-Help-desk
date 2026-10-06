"""Ambiente do Alembic.

URL do banco, em ordem de prioridade:
1. `alembic -x dburl=<url> ...`
2. opção `sqlalchemy.url` definida programaticamente (testes);
3. `DATABASE_URL` das configurações da aplicação (.env / variáveis de ambiente).
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool
from sqlalchemy.engine import make_url

from app.core.config import get_settings
from app.models import Base

config = context.config

if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def get_url() -> str:
    x_args = context.get_x_argument(as_dictionary=True)
    return (
        x_args.get("dburl")
        or config.get_main_option("sqlalchemy.url")
        or get_settings().DATABASE_URL
    )


def _is_sqlite(url: str) -> bool:
    return make_url(url).get_backend_name() == "sqlite"


def run_migrations_offline() -> None:
    """Gera o SQL sem conectar ao banco (`alembic upgrade head --sql`)."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        render_as_batch=_is_sqlite(url),
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Engine "cru", sem o PRAGMA foreign_keys do app: no SQLite, o modo batch
    # recria tabelas e um DROP TABLE com FKs ativas dispararia ON DELETE CASCADE.
    connectable = create_engine(get_url(), poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
