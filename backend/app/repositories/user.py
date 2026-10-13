"""Repositórios de usuários, perfis e empresas."""

from collections.abc import Iterable, Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.models import Company, Role, User
from app.models.enums import RoleName
from app.repositories.base import BaseRepository, CompanyScopedRepository


class UserRepository(CompanyScopedRepository[User]):
    model = User

    def get_by_email(self, email: str) -> User | None:
        """Busca global por e-mail — o login ocorre antes de conhecer a empresa.

        É a ÚNICA consulta de usuário sem `company_id`: o e-mail é único em toda a
        plataforma e identifica a empresa do usuário. Qualquer outro acesso a
        usuários deve usar os métodos escopados herdados.
        """
        stmt = (
            select(User)
            .where(func.lower(User.email) == email.strip().lower())
            .options(joinedload(User.role))
        )
        return self.session.scalars(stmt).one_or_none()

    def email_exists(self, email: str) -> bool:
        stmt = select(User.id).where(func.lower(User.email) == email.strip().lower())
        return self.session.scalars(stmt).first() is not None

    def get_with_role(self, company_id: int, user_id: int) -> User | None:
        stmt = (
            self._scoped_select(company_id).where(User.id == user_id).options(joinedload(User.role))
        )
        return self.session.scalars(stmt).one_or_none()

    def active_with_roles(self, company_id: int, roles: Iterable[RoleName]) -> Sequence[User]:
        """Usuários ativos da empresa com um dos perfis, em ordem alfabética."""
        stmt = (
            self._scoped_select(company_id)
            .join(Role, Role.id == User.role_id)
            .where(User.is_active.is_(True), Role.name.in_(tuple(roles)))
            .order_by(User.name, User.id)
        )
        return self.session.scalars(stmt).all()


class RoleRepository(BaseRepository[Role]):
    model = Role

    def get_by_name(self, name: RoleName) -> Role | None:
        return self.session.scalars(select(Role).where(Role.name == name)).one_or_none()


class CompanyRepository(BaseRepository[Company]):
    model = Company

    def cnpj_taken(self, cnpj: str, *, exclude_id: int) -> bool:
        """CNPJ é único na plataforma (consulta global, sem dados da outra empresa)."""
        stmt = select(Company.id).where(Company.cnpj == cnpj, Company.id != exclude_id)
        return self.session.scalars(stmt).first() is not None
