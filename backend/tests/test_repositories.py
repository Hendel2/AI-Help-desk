"""Isolamento multiempresa do CompanyScopedRepository."""

from collections.abc import Callable

import pytest
from sqlalchemy.orm import Session

from app.models import Company, Department, Role
from app.models.enums import RoleName
from app.repositories.base import BaseRepository, CompanyScopedRepository


class DepartmentRepository(CompanyScopedRepository[Department]):
    model = Department


class RoleRepository(BaseRepository[Role]):
    model = Role


@pytest.fixture
def companies(make_company: Callable[..., Company]) -> tuple[Company, Company]:
    return make_company("Empresa A"), make_company("Empresa B")


@pytest.fixture
def repo(db_session: Session) -> DepartmentRepository:
    return DepartmentRepository(db_session)


@pytest.fixture
def departments(
    repo: DepartmentRepository, companies: tuple[Company, Company]
) -> tuple[Department, Department]:
    company_a, company_b = companies
    dept_a = repo.add(company_a.id, Department(name="TI"))
    dept_b = repo.add(company_b.id, Department(name="TI"))
    repo.add(company_a.id, Department(name="RH"))
    return dept_a, dept_b


def test_get_never_returns_another_companys_row(
    repo: DepartmentRepository,
    companies: tuple[Company, Company],
    departments: tuple[Department, Department],
) -> None:
    company_a, company_b = companies
    dept_a, dept_b = departments

    assert repo.get(company_a.id, dept_a.id) is dept_a
    assert repo.get(company_a.id, dept_b.id) is None
    assert repo.get(company_b.id, dept_a.id) is None


def test_list_and_count_are_scoped(
    repo: DepartmentRepository,
    companies: tuple[Company, Company],
    departments: tuple[Department, Department],
) -> None:
    company_a, company_b = companies

    assert {d.company_id for d in repo.list(company_a.id)} == {company_a.id}
    assert [d.name for d in repo.list(company_a.id)] == ["TI", "RH"]
    assert [d.name for d in repo.list(company_a.id, offset=1, limit=1)] == ["RH"]
    assert repo.count(company_a.id) == 2
    assert repo.count(company_b.id) == 1


def test_delete_ignores_another_companys_row(
    repo: DepartmentRepository,
    companies: tuple[Company, Company],
    departments: tuple[Department, Department],
) -> None:
    company_a, company_b = companies
    _, dept_b = departments

    assert repo.delete(company_a.id, dept_b.id) is False
    assert repo.get(company_b.id, dept_b.id) is dept_b
    assert repo.count(company_b.id) == 1

    assert repo.delete(company_b.id, dept_b.id) is True
    assert repo.count(company_b.id) == 0


def test_update_ignores_another_companys_row(
    repo: DepartmentRepository,
    companies: tuple[Company, Company],
    departments: tuple[Department, Department],
) -> None:
    company_a, company_b = companies
    dept_a, dept_b = departments

    assert repo.update(company_a.id, dept_b.id, {"name": "Invadido"}) is None
    assert dept_b.name == "TI"

    updated = repo.update(company_a.id, dept_a.id, {"description": "Tecnologia"})
    assert updated is dept_a and dept_a.description == "Tecnologia"


@pytest.mark.parametrize("field", ["company_id", "id"])
def test_update_cannot_change_scope_or_identity(
    repo: DepartmentRepository,
    companies: tuple[Company, Company],
    departments: tuple[Department, Department],
    field: str,
) -> None:
    company_a, company_b = companies
    dept_a, _ = departments

    with pytest.raises(ValueError):
        repo.update(company_a.id, dept_a.id, {field: company_b.id})
    assert dept_a.company_id == company_a.id


@pytest.mark.parametrize("field", ["metadata", "company", "not_a_column"])
def test_update_rejects_unknown_fields(
    repo: DepartmentRepository,
    companies: tuple[Company, Company],
    departments: tuple[Department, Department],
    field: str,
) -> None:
    company_a, _ = companies
    dept_a, _ = departments

    with pytest.raises(ValueError):
        repo.update(company_a.id, dept_a.id, {field: "x"})


def test_add_rejects_entity_from_another_company(
    repo: DepartmentRepository, companies: tuple[Company, Company]
) -> None:
    company_a, company_b = companies

    with pytest.raises(ValueError):
        repo.add(company_a.id, Department(company_id=company_b.id, name="Financeiro"))


@pytest.mark.parametrize("company_id", [None, 0, -1, True, "1"])
def test_scoped_methods_require_a_valid_company_id(
    repo: DepartmentRepository, company_id: object
) -> None:
    with pytest.raises(ValueError):
        repo.get(company_id, 1)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        repo.list(company_id)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        repo.count(company_id)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        repo.delete(company_id, 1)  # type: ignore[arg-type]


def test_scoped_lookup_without_company_id_is_impossible(repo: DepartmentRepository) -> None:
    with pytest.raises(TypeError):
        repo.get(1)  # type: ignore[call-arg]
    with pytest.raises(TypeError):
        repo.count()  # type: ignore[call-arg]


def test_pagination_limits(repo: DepartmentRepository, companies: tuple[Company, Company]) -> None:
    company_a, _ = companies
    with pytest.raises(ValueError):
        repo.list(company_a.id, limit=101)
    with pytest.raises(ValueError):
        repo.list(company_a.id, offset=-1)


def test_repository_type_guards(db_session: Session) -> None:
    class WrongScoped(CompanyScopedRepository[Role]):
        model = Role

    class WrongGlobal(BaseRepository[Department]):
        model = Department

    with pytest.raises(TypeError):
        WrongScoped(db_session)
    with pytest.raises(TypeError):
        WrongGlobal(db_session)


def test_base_repository_for_global_tables(
    db_session: Session, get_role: Callable[[RoleName], Role]
) -> None:
    repo = RoleRepository(db_session)
    admin = get_role(RoleName.ADMIN)
    get_role(RoleName.USER)

    assert repo.get(admin.id) is admin
    assert repo.count() == 2
    assert len(repo.list(limit=1)) == 1
