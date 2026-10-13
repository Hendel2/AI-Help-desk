import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, UserCheck, UserX } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router'
import { z } from 'zod'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { SearchBar } from '@/components/SearchBar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { Select } from '@/components/ui/Select'
import { SkeletonText } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/useToast'
import { AdminHeader } from '@/features/admin/components/AdminHeader'
import { ConfirmDialog } from '@/features/admin/components/ConfirmDialog'
import {
  useAdminUsers,
  useDepartments,
  useSaveUser,
  useSetUserActive,
} from '@/features/admin/hooks/useAdmin'
import type { AdminUser, Department, UserListParams } from '@/features/admin/types'
import { ROLE_LABELS } from '@/features/auth/roleLabels'
import type { RoleName } from '@/features/auth/types'
import { useAuth } from '@/features/auth/useAuth'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { getErrorMessage } from '@/services/api/errors'

const ROLES = Object.keys(ROLE_LABELS) as RoleName[]
const ROLE_OPTIONS = ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }))

/** Usuários da empresa (§10, §50). "Desativar" preserva o histórico dos chamados. */
export function UsersPage() {
  const { user: me } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('busca') ?? '')
  const debouncedSearch = useDebouncedValue(search, 300)
  const params: UserListParams = {
    page: Number(searchParams.get('pagina')) || 1,
    search: debouncedSearch,
    role: (searchParams.get('perfil') ?? '') as RoleName | '',
    status: (searchParams.get('situacao') ?? '') as UserListParams['status'],
  }
  const users = useAdminUsers(params)
  const setActive = useSetUserActive()
  const { showToast } = useToast()
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null)
  const [deactivating, setDeactivating] = useState<AdminUser | null>(null)

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'pagina') next.delete('pagina')
    setSearchParams(next, { replace: true })
  }

  const toggleActive = async (target: AdminUser, active: boolean) => {
    try {
      await setActive.mutateAsync({ id: target.id, active })
      showToast(active ? `${target.name} foi reativado.` : `${target.name} foi desativado.`)
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível alterar o usuário.'), 'error')
    }
    setDeactivating(null)
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <AdminHeader
        title="Usuários"
        description="Contas da empresa, perfis de acesso e departamentos."
        action={
          <Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => setEditing('new')}>
            Novo usuário
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_12rem] sm:items-end">
        <SearchBar
          label="Pesquisar usuários"
          placeholder="Nome ou e-mail…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setFilter('pagina', '')
          }}
        />
        <Select
          label="Perfil"
          placeholder="Todos os perfis"
          options={ROLE_OPTIONS}
          value={params.role}
          onChange={(event) => setFilter('perfil', event.target.value)}
        />
        <Select
          label="Situação"
          placeholder="Todas"
          options={[
            { value: 'active', label: 'Ativos' },
            { value: 'inactive', label: 'Inativos' },
          ]}
          value={params.status}
          onChange={(event) => setFilter('situacao', event.target.value)}
        />
      </div>

      {users.isPending ? (
        <SkeletonText lines={8} />
      ) : users.isError ? (
        <ErrorState
          title="Não foi possível carregar os usuários."
          description={getErrorMessage(users.error)}
          onRetry={() => void users.refetch()}
          isRetrying={users.isFetching}
        />
      ) : users.data.items.length === 0 ? (
        <EmptyState
          title="Nenhum usuário encontrado."
          description="Ajuste a busca ou os filtros."
        />
      ) : (
        <>
          <div className="relative overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Usuários</caption>
              <thead className="border-b border-border text-xs text-secondary">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Nome</th>
                  <th scope="col" className="px-4 py-3 font-medium">Perfil</th>
                  <th scope="col" className="px-4 py-3 font-medium">Departamento</th>
                  <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.data.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-text">{item.name}</p>
                      <p className="text-xs text-secondary">{item.email}</p>
                    </td>
                    <td className="px-4 py-3 text-text">{ROLE_LABELS[item.role]}</td>
                    <td className="px-4 py-3 text-text">{item.department?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={item.is_active ? 'success' : 'neutral'}>
                        {item.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Pencil aria-hidden="true" className="size-4" />}
                          onClick={() => setEditing(item)}
                        >
                          <span className="sr-only">Editar {item.name}</span>
                        </Button>
                        {item.id === me?.id ? null : item.is_active ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<UserX aria-hidden="true" className="size-4" />}
                            onClick={() => setDeactivating(item)}
                          >
                            <span className="sr-only">Desativar {item.name}</span>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<UserCheck aria-hidden="true" className="size-4" />}
                            onClick={() => void toggleActive(item, true)}
                          >
                            <span className="sr-only">Reativar {item.name}</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={users.data.page}
            pages={users.data.pages}
            total={users.data.total}
            onPageChange={(page) => setFilter('pagina', String(page))}
          />
        </>
      )}

      {editing !== null ? (
        <UserForm
          user={editing === 'new' ? null : editing}
          isSelf={editing !== 'new' && editing.id === me?.id}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <ConfirmDialog
        isOpen={deactivating !== null}
        title="Desativar usuário"
        description={`${deactivating?.name ?? ''} não conseguirá mais entrar. Os chamados e o histórico são mantidos.`}
        confirmLabel="Desativar"
        isLoading={setActive.isPending}
        onConfirm={() => deactivating && void toggleActive(deactivating, false)}
        onClose={() => setDeactivating(null)}
      />
    </div>
  )
}

function userSchema(isNew: boolean) {
  return z.object({
    name: z.string().trim().min(2, 'Informe o nome.').max(150, 'Máximo de 150 caracteres.'),
    email: z.email('Informe um e-mail válido.'),
    role: z.enum(ROLES as [RoleName, ...RoleName[]]),
    department_id: z.string(),
    password: isNew
      ? z.string().min(8, 'Mínimo de 8 caracteres.').max(128, 'Máximo de 128 caracteres.')
      : z.union([
          z.literal(''),
          z.string().min(8, 'Mínimo de 8 caracteres.').max(128, 'Máximo de 128 caracteres.'),
        ]),
  })
}

type UserFormValues = z.infer<ReturnType<typeof userSchema>>

function UserForm({
  user,
  isSelf,
  onClose,
}: {
  user: AdminUser | null
  isSelf: boolean
  onClose: () => void
}) {
  const save = useSaveUser()
  const departments = useDepartments()
  const { showToast } = useToast()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema(user === null)),
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      role: user?.role ?? 'USER',
      department_id: user?.department ? String(user.department.id) : '',
      password: '',
    },
  })

  const onSubmit = async ({ password, department_id, ...values }: UserFormValues) => {
    try {
      await save.mutateAsync({
        id: user?.id,
        data: {
          ...values,
          department_id: department_id ? Number(department_id) : null,
          ...(password ? { password } : {}),
        },
      })
      showToast(user ? 'Usuário atualizado.' : 'Usuário criado.')
      onClose()
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível salvar.'), 'error')
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={user ? 'Editar usuário' : 'Novo usuário'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="user-form" isLoading={save.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        id="user-form"
        noValidate
        className="space-y-4"
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
      >
        <Input label="Nome" autoComplete="off" error={errors.name?.message} {...register('name')} />
        <Input
          label="E-mail"
          type="email"
          autoComplete="off"
          error={errors.email?.message}
          {...register('email')}
        />
        <Select
          label="Perfil"
          options={ROLE_OPTIONS}
          disabled={isSelf}
          hint={isSelf ? 'Você não pode alterar o seu próprio perfil.' : undefined}
          {...register('role')}
        />
        <Select
          label="Departamento"
          placeholder="Sem departamento"
          options={(departments.data ?? []).map((item: Department) => ({
            value: String(item.id),
            label: item.name,
          }))}
          {...register('department_id')}
        />
        <Input
          label={user ? 'Nova senha' : 'Senha inicial'}
          type="password"
          autoComplete="new-password"
          optional={user !== null}
          hint={user ? 'Deixe em branco para manter a senha atual.' : 'Mínimo de 8 caracteres.'}
          error={errors.password?.message}
          {...register('password')}
        />
      </form>
    </Modal>
  )
}
