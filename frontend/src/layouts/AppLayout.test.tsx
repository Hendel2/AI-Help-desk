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

vi.mock('@/features/dashboard/services/dashboard.service', () => ({
  dashboardService: { metrics: vi.fn(), tickets: vi.fn(), sla: vi.fn(), ai: vi.fn() },
}))

vi.mock('@/features/chat/services/chat.service', () => ({
  chatService: { assistant: vi.fn(), list: vi.fn().mockResolvedValue([]) },
}))

const { getMeWithRefresh } = await import('@/features/auth/services/auth.service')
const { notificationsService } =
  await import('@/features/notifications/services/notifications.service')
const { dashboardService } = await import('@/features/dashboard/services/dashboard.service')
const { chatService } = await import('@/features/chat/services/chat.service')

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
        children: [
          { path: 'perfil', element: <h1>Meu perfil</h1> },
          { path: 'notificacoes', element: <h1>Caixa de notificações</h1> },
        ],
      },
      { path: '/login', element: <h1>Entrar</h1> },
    ],
  })
}

beforeEach(() => {
  vi.mocked(getMeWithRefresh).mockReset()
  window.localStorage.removeItem('ai-helpdesk.sidebar-collapsed')
  vi.mocked(notificationsService.unreadCount).mockResolvedValue({ unread: 0 })
  vi.mocked(dashboardService.metrics).mockResolvedValue({
    scope: 'USER',
    period_days: 30,
    open: 0,
    in_progress: 0,
    waiting_user: 0,
    resolved: 0,
    created_in_period: 0,
    sla_warning: 0,
    sla_breached: 0,
    assigned_to_me: null,
    avg_resolution_minutes: null,
    satisfaction_avg: null,
    satisfaction_count: null,
    sla_compliance_pct: null,
  })
  vi.mocked(chatService.assistant).mockResolvedValue({ ai_enabled: true, slow_responses: false })
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
    // Conta no rodapé da sidebar; onde a pessoa está, no topo da folha.
    const aside = screen.getByRole('complementary', { name: 'Menu lateral' })
    expect(within(aside).getByText('Maria Souza')).toBeInTheDocument()
    expect(within(aside).getByText('Administrador')).toBeInTheDocument()
    const crumb = screen.getByRole('navigation', { name: 'Você está em' })
    expect(within(crumb).getByText('Acesso rápido')).toBeInTheDocument()
    expect(within(crumb).getByText('Meu perfil')).toHaveAttribute('aria-current', 'page')
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
    // "Todos os chamados" é restrito a técnicos e administradores; "Meus chamados" não.
    expect(within(nav).queryByText('Todos os chamados')).not.toBeInTheDocument()
    expect(within(nav).getByText('Meus chamados')).toBeInTheDocument()
  })

  it('marca a rota atual e mostra só os itens permitidos ao perfil', async () => {
    renderLayout('TECHNICIAN')
    await screen.findByRole('heading', { name: 'Meu perfil' })

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getByRole('link', { name: 'Meu perfil' })).toHaveAttribute(
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

  it('encerra a sessão pelo menu da conta', async () => {
    const user = userEvent.setup()
    renderLayout('USER')
    await screen.findByRole('heading', { name: 'Meu perfil' })

    const aside = screen.getByRole('complementary', { name: 'Menu lateral' })
    const account = within(aside).getByRole('button', { name: /Conta de/ })
    expect(account).toHaveAttribute('aria-expanded', 'false')
    await user.click(account)
    expect(account).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('menuitem', { name: 'Sair' }))

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(window.localStorage.getItem('ai-helpdesk.access_token')).toBeNull()
  })

  it('mostra contadores de não lidas e de chamados em aberto no menu', async () => {
    vi.mocked(notificationsService.unreadCount).mockResolvedValue({ unread: 3 })
    vi.mocked(dashboardService.metrics).mockResolvedValueOnce({
      ...(await dashboardService.metrics(30)),
      open: 2,
    })
    renderLayout('USER')

    const nav = await screen.findByRole('navigation', { name: 'Navegação principal' })
    expect(
      await within(nav).findByRole('link', { name: 'Notificações, 3 não lidas' }),
    ).toHaveAttribute('href', '/notificacoes')
    expect(
      await within(nav).findByRole('link', { name: 'Meus chamados, 2 em aberto' }),
    ).toHaveAttribute('href', '/chamados/meus')
  })

  it('mostra no menu como o assistente está respondendo', async () => {
    vi.mocked(chatService.assistant).mockResolvedValue({ ai_enabled: false, slow_responses: false })
    renderLayout('USER')

    const user = userEvent.setup()
    const aside = await screen.findByRole('complementary', { name: 'Menu lateral' })
    expect(await within(aside).findByText('Sem IA')).toBeInTheDocument()

    // Um clique abre o painel flutuante do assistente (sem sair da página).
    await user.click(within(aside).getByRole('button', { name: /Assistente de TI/ }))
    expect(screen.getByRole('dialog', { name: 'Assistente de TI' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Meu perfil' })).toBeInTheDocument()
  })

  it('recolhe o menu lateral e lembra a escolha', async () => {
    const user = userEvent.setup()
    renderLayout('USER')
    await screen.findByRole('heading', { name: 'Meu perfil' })

    const toggle = screen.getByRole('button', { name: 'Recolher menu lateral' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(toggle)

    expect(screen.getByRole('button', { name: 'Expandir menu lateral' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(window.localStorage.getItem('ai-helpdesk.sidebar-collapsed')).toBe('1')
    // Recolhido, o item continua com nome acessível (só o texto visual some).
    const aside = screen.getByRole('complementary', { name: 'Menu lateral' })
    expect(within(aside).getByRole('link', { name: 'Meu perfil' })).toBeInTheDocument()
  })

  it('abre a busca com Ctrl+K e navega pelo teclado', async () => {
    const user = userEvent.setup()
    renderLayout('USER')
    await screen.findByRole('heading', { name: 'Meu perfil' })

    await user.keyboard('{Control>}k{/Control}')
    const dialog = screen.getByRole('dialog', { name: 'Buscar no AI Help Desk' })
    const input = within(dialog).getByRole('combobox')
    expect(input).toHaveFocus()

    await user.type(input, 'notific')
    expect(within(dialog).getByRole('option', { name: 'Notificações' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await user.keyboard('{Enter}')

    expect(
      await screen.findByRole('heading', { name: 'Caixa de notificações' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('oferece buscar o texto digitado nos chamados e na base', async () => {
    const user = userEvent.setup()
    renderLayout('USER')
    await screen.findByRole('heading', { name: 'Meu perfil' })

    const aside = screen.getByRole('complementary', { name: 'Menu lateral' })
    await user.click(within(aside).getByRole('button', { name: /Buscar/ }))
    const dialog = screen.getByRole('dialog', { name: 'Buscar no AI Help Desk' })
    await user.type(within(dialog).getByRole('combobox'), 'impressora')

    expect(
      within(dialog).getByRole('option', { name: 'Buscar chamados por “impressora”' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('option', { name: 'Buscar artigos por “impressora”' }),
    ).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
