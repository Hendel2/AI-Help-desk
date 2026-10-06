"""Migrations: SQLite real em arquivo temporário e geração offline de SQL para o MySQL."""

import io
import re
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.runtime.migration import MigrationContext

from app.core.config import BACKEND_DIR
from app.models import Base

MYSQL_URL = "mysql+pymysql://helpdesk:secret@localhost:3306/helpdesk"


def alembic_config(url: str, output: io.StringIO | None = None) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"), output_buffer=output)
    # Não reconfigurar o logging do processo de testes.
    config.attributes["configure_logger"] = False
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return config


@pytest.fixture
def sqlite_url(tmp_path: Path) -> str:
    return f"sqlite:///{(tmp_path / 'migrations.db').as_posix()}"


def test_upgrade_creates_all_tables_and_seeds_roles(sqlite_url: str) -> None:
    command.upgrade(alembic_config(sqlite_url), "head")

    engine = sa.create_engine(sqlite_url)
    try:
        tables = set(sa.inspect(engine).get_table_names())
        assert tables - {"alembic_version"} == set(Base.metadata.tables)
        assert len(tables - {"alembic_version"}) == 19
        with engine.connect() as connection:
            roles = connection.execute(sa.text("SELECT name FROM roles ORDER BY id")).scalars()
            assert list(roles) == ["USER", "TECHNICIAN", "ADMIN"]
            version = connection.execute(sa.text("SELECT version_num FROM alembic_version"))
            assert version.scalar_one() == "0001"
    finally:
        engine.dispose()


def test_migrated_schema_matches_models(sqlite_url: str) -> None:
    command.upgrade(alembic_config(sqlite_url), "head")

    engine = sa.create_engine(sqlite_url)
    try:
        with engine.connect() as connection:
            context = MigrationContext.configure(connection, opts={"compare_type": True})
            diff = compare_metadata(context, Base.metadata)
    finally:
        engine.dispose()
    assert diff == []


def test_downgrade_to_base_removes_everything(sqlite_url: str) -> None:
    config = alembic_config(sqlite_url)
    command.upgrade(config, "head")
    command.downgrade(config, "base")

    engine = sa.create_engine(sqlite_url)
    try:
        assert set(sa.inspect(engine).get_table_names()) == {"alembic_version"}
    finally:
        engine.dispose()

    # E pode ser aplicada novamente.
    command.upgrade(config, "head")


def test_offline_mysql_sql_generation() -> None:
    output = io.StringIO()
    command.upgrade(alembic_config(MYSQL_URL, output), "head", sql=True)
    sql = output.getvalue()

    assert "CREATE TABLE tickets" in sql
    assert sql.count("CREATE TABLE ") == 20  # 19 tabelas + alembic_version
    assert "INSERT INTO roles" in sql
    # Compatibilidade com o MySQL.
    assert re.search(r"VARCHAR(?!\()", sql) is None, "VARCHAR sem tamanho"
    assert "ENUM(" not in sql.upper()
    assert "DATETIME(6)" in sql
    assert "LONGTEXT" in sql
    for name in re.findall(r"(?:CONSTRAINT|INDEX) (\w+)", sql):
        assert len(name) <= 64, name
