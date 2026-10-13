import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminUser } from '@/features/admin/types'
import { clearTokens, saveTokens } from '@/features/auth/tokenStorage'
import { ApiError } from '@/services/api/errors'
import { makeUser, TEST_TOKENS } from '@/test/fixtures'
import { renderWithProviders } from '@/test/utils'

import { AuditPage } from './AuditPage'
import { CategoriesPage } from './CategoriesPage'
import { SLAPage } from './SLAPage'
import { UsersPage } from './UsersPage'

vi.mock('@/features/auth/services/auth.service', () => ({
  getMeWithRefresh: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}))
vi.mock('@/features/admin/services/admin.service', () => ({
  adminService: {
    listUsers: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deactivateUser: vi.fn(),
    listDepartments: vi.fn(),
    saveDepartment: vi.fn(),
    deleteDepartment: vi.fn(),
    listCategories: vi.fn(),
    saveCategory: vi.fn(),
    deleteCategory: vi.fn(),
    listSLAPolicies: vi.fn(),
    saveSLAPolicy: vi.fn(),
    deleteSLAPolicy: vi.fn(),
    getCompany: vi.fn(),
    updateCompany: vi.fn(),
    getAISettings: vi.fn(),
    listAudit: vi.fn(),
  },
}))

const { getMeWithRefresh } = await import('@/features/auth/services/auth.service')
const { adminService } = await import('@/features/admin/services/admin.service')

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, page_size: 20, pages: 1 })

function adminUser(overrides: Partial<AdminUser>): AdminUser {
  return {
    id: 30,
    name: 'Bia Souza',
    email: 'bia@empresa.com',
    role: 'USER',
    department: null,
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function renderAdmin(element: ReactNode, route = '/admin') {
  saveTokens(TEST_TOKENS)
  vi.mocked(getMeWithRefresh).mockResolvedValue(makeUser('ADMIN'))
  return renderWithProviders(<div />, {
    withAuth: true,
    route,
    routes: [{ path: '/admin', element }],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(adminService.listDepartments).mockResolvedValue([
    { id: 1, name: 'Financeiro', description: null, user_count: 2 },
  ])
  vi.mocked(adminService.listSLAPolicies).mockResolvedValue([])
})

afterEach(() => {
  clearTokens()
})

describe('UsersPage', () => {
  it('lista usuários e não oferece desativar a própria conta', async () => {
    vi.mocked(adminService.listUsers).mockResolvedValue(
      page([
        adminUser({ id: 20, name: 'Téo Técnico', role: 'ADMIN' }),
        adminUser({ id: 30, name: 'Bia Souza' }),
      ]),
    )
    renderAdmin(<UsersPage />)

    const table = await screen.findByRole('table', { name: 'Usuários' })
    expect(within(table).getByText('Administrador')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desativar Bia Souza' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desativar Téo Técnico' })).not.toBeInTheDocument()
  })

  it('cria usuário com departamento e senha inicial', async () => {
    const user = userEvent.setup()
    vi.mocked(adminService.listUsers).mockResolvedValue(page([]))
    vi.mocked(adminService.createUser).mockResolvedValue(adminUser({}))
    renderAdmin(<UsersPage />)

    await user.click(await screen.findByRole('button', { name: 'Novo usuário' }))
    const dialog = screen.getByRole('dialog', { name: 'Novo usuário' })
    await user.type(within(dialog).getByLabelText('Nome'), 'Bia Souza')
    await user.type(within(dialog).getByLabelText('E-mail'), 'bia@empresa.com')
    await user.selectOptions(within(dialog).getByLabelText('Perfil'), 'TECHNICIAN')
    await user.selectOptions(within(dialog).getByLabelText('Departamento'), '1')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialog).findByText('Mínimo de 8 caracteres.')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/Senha inicial/), 'senha-forte-1')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => {
      expect(adminService.createUser).toHaveBeenCalledWith({
        name: 'Bia Souza',
        email: 'bia@empresa.com',
        role: 'TECHNICIAN',
        department_id: 1,
        password: 'senha-forte-1',
      })
    })
    expect(await screen.findByText('Usuário criado.')).toBeInTheDocument()
  })

  it('desativa após confirmação', async () => {
    const user = userEvent.setup()
    vi.mocked(adminService.listUsers).mockResolvedValue(page([adminUser({})]))
    vi.mocked(adminService.deactivateUser).mockResolvedValue(undefined)
    renderAdmin(<UsersPage />)

    await user.click(await screen.findByRole('button', { name: 'Desativar Bia Souza' }))
    const dialog = screen.getByRole('dialog', { name: 'Desativar usuário' })
    await user.click(within(dialog).getByRole('button', { name: 'Desativar' }))

    expect(adminService.deactivateUser).toHaveBeenCalledWith(30)
    expect(await screen.findByText('Bia Souza foi desativado.')).toBeInTheDocument()
  })
})

describe('CategoriesPage', () => {
  it('mostra o motivo quando a categoria em uso não pode ser excluída', async () => {
    const user = userEvent.setup()
    vi.mocked(adminService.listCategories).mockResolvedValue([
      {
        id: 4,
        name: 'Rede',
        description: null,
        default_priority: 'HIGH',
        default_sla_policy_id: null,
        is_active: true,
      },
    ])
    vi.mocked(adminService.deleteCategory).mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'CATEGORY_IN_USE',
        message: 'Categoria em uso por chamados ou artigos. Desative-a em vez de excluir.',
      }),
    )
    renderAdmin(<CategoriesPage />)

    await user.click(await screen.findByRole('button', { name: 'Excluir Rede' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Excluir categoria' })).getByRole('button', {
        name: 'Excluir',
      }),
    )

    expect(await screen.findByText(/Desative-a em vez de excluir/)).toBeInTheDocument()
  })
})

describe('SLAPage', () => {
  it('valida que a resolução não é menor que a primeira resposta', async () => {
    const user = userEvent.setup()
    renderAdmin(<SLAPage />)

    await user.click(await screen.findByRole('button', { name: 'Nova política' }))
    const dialog = screen.getByRole('dialog', { name: 'Nova política de SLA' })
    await user.type(within(dialog).getByLabelText('Nome'), 'Crítico')
    const resolution = within(dialog).getByLabelText('Resolução (minutos)')
    await user.clear(resolution)
    await user.type(resolution, '30')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(
      await within(dialog).findByText('A resolução não pode ser menor que a primeira resposta.'),
    ).toBeInTheDocument()
    expect(adminService.saveSLAPolicy).not.toHaveBeenCalled()
  })
})

describe('AuditPage', () => {
  it('traduz ações e resume mudanças de perfil', async () => {
    vi.mocked(adminService.listAudit).mockResolvedValue(
      page([
        {
          id: 1,
          action: 'PERMISSION_CHANGED' as const,
          entity: 'user',
          entity_id: '30',
          user: { id: 20, name: 'Téo Técnico' },
          metadata: { from: 'USER', to: 'TECHNICIAN' },
          ip_address: '10.0.0.1',
          created_at: new Date().toISOString(),
        },
      ]),
    )
    renderAdmin(<AuditPage />)

    const table = await screen.findByRole('table', { name: 'Registros de auditoria' })
    expect(within(table).getByText('Perfil alterado')).toBeInTheDocument()
    expect(within(table).getByText('Usuário → Técnico')).toBeInTheDocument()
    expect(within(table).getByText('Usuário #30')).toBeInTheDocument()
  })
})
