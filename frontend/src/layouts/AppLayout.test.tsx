import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { saveTokens, clearTokens } from '@/features/auth/tokenStorage'
import type { CurrentUser, RoleName, TokenResponse } from '@/features/auth/types'
import { renderWithProviders } from '@/test/utils'

import { AppLayout } from './AppLayout'

vi.mock('@/features/auth/services/auth.service', () => ({
  getMeWithRefresh: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}))

vi.mock('@/features/notifications/services/notifications.service', () => ({
  notificationsService: {
    unreadCount: vi.fn().mockResolvedValue({ unread: 0 }),
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}))

const { getMeWithRefresh } = await import('@/features/auth/services/auth.service')

const TOKENS: TokenResponse = {
  access_token: 'access',
  refresh_token: 'refresh',
  token_type: 'bearer',
  expires_in: 1800,
}

function makeUser(role: RoleName): CurrentUser {
  return {
    id: 1,
    company_id: 2,
    name: 'Maria Souza',
    email: 'maria@empresa.com',
    role,
    department_id: null,
    avatar: null,
    is_active: true,
  }
}

function renderLayout(role: RoleName) {
  saveTokens(TOKENS)
  vi.mocked(getMeWithRefresh).mockResolvedValue(makeUser(role))
  return renderWithProviders(<div />, {
    withAuth: true,
    route: '/perfil',
    routes: [
      {
        element: <AppLayout />,
        children: [{ path: 'perfil', element: <h1>Meu perfil</h1> }],
      },
      { path: '/login', element: <h1>Entrar</h1> },
    ],
  })
}

beforeEach(() => {
  vi.mocked(getMeWithRefresh).mockReset()
})

afterEach(() => {
  clearTokens()
})

describe('AppLayout', () => {
  it('monta a moldura com navegação, usuário e conteúdo da rota', async () => {
    renderLayout('ADMIN')

    expect(await screen.findByRole('heading', { name: 'Meu perfil' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir para o conteúdo' })).toHaveAttribute(
      'href',
      '#conteudo',
    )
    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
    expect(screen.getByText('Administrador')).toBeInTheDocument()
  })

  it('mostra a administração apenas para o perfil ADMIN', async () => {
    renderLayout('ADMIN')
    await screen.findByRole('heading', { name: 'Meu perfil' })

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getByText('Administração')).toBeInTheDocument()
    expect(within(nav).getByText('Usuários')).toBeInTheDocument()
  })

  it('esconde administração e relatórios do perfil USER', async () => {
    renderLayout('USER')
    await screen.findByRole('heading', { name: 'Meu perfil' })

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).queryByText('Administração')).not.toBeInTheDocument()
    expect(within(nav).queryByText('Indicadores')).not.toBeInTheDocument()
    // "Todos" é restrito a técnicos e administradores; "Meus chamados" não.
    expect(within(nav).queryByText('Todos')).not.toBeInTheDocument()
    expect(within(nav).getByText('Meus chamados')).toBeInTheDocument()
  })

  it('marca a rota atual e mostra só os itens permitidos ao perfil', async () => {
    renderLayout('TECHNICIAN')
    await screen.findByRole('heading', { name: 'Meu perfil' })

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getByRole('link', { name: /Perfil/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: /Indicadores/ })).toHaveAttribute(
      'href',
      '/relatorios',
    )
    expect(within(nav).queryByRole('link', { name: /Usuários/ })).not.toBeInTheDocument()
  })

  it('abre e fecha a navegação em drawer no mobile', async () => {
    const user = userEvent.setup()
    renderLayout('USER')
    await screen.findByRole('heading', { name: 'Meu perfil' })

    await user.click(screen.getByRole('button', { name: 'Abrir navegação' }))

    const drawer = screen.getByRole('dialog')
    expect(drawer).toHaveAccessibleName('Navegação')
    // Sidebar fixa + drawer: duas navegações enquanto o drawer está aberto.
    expect(screen.getAllByRole('navigation', { name: 'Navegação principal' })).toHaveLength(2)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('encerra a sessão pelo botão Sair', async () => {
    const user = userEvent.setup()
    renderLayout('USER')
    await screen.findByRole('heading', { name: 'Meu perfil' })

    await user.click(screen.getByRole('button', { name: /Sair/ }))

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(window.localStorage.getItem('ai-helpdesk.access_token')).toBeNull()
  })
})
