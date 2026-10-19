import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppNotification } from '@/features/notifications/types'
import { renderWithProviders } from '@/test/utils'

import { NotificationsPage } from './NotificationsPage'

vi.mock('@/features/notifications/services/notifications.service', () => ({
  notificationsService: {
    list: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}))

const { notificationsService } =
  await import('@/features/notifications/services/notifications.service')

function notification(overrides: Partial<AppNotification>): AppNotification {
  return {
    id: 1,
    type: 'COMMENT_ADDED',
    title: 'Nova resposta no chamado HD-000012',
    message: 'O técnico respondeu ao seu chamado.',
    ticket_id: 12,
    is_read: false,
    read_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function renderPage() {
  return renderWithProviders(<div />, {
    route: '/notificacoes',
    routes: [
      { path: '/notificacoes', element: <NotificationsPage /> },
      { path: '/chamados/:id', element: <h1>Detalhe do chamado</h1> },
    ],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NotificationsPage', () => {
  it('lista as notificações, destaca as não lidas e marca todas como lidas', async () => {
    const user = userEvent.setup()
    vi.mocked(notificationsService.list).mockResolvedValue({
      items: [
        notification({ id: 1 }),
        notification({ id: 2, type: 'SLA_BREACHED', title: 'SLA vencido', is_read: true }),
      ],
      total: 2,
      page: 1,
      page_size: 15,
      pages: 1,
    })
    vi.mocked(notificationsService.unreadCount).mockResolvedValue({ unread: 1 })
    vi.mocked(notificationsService.markAllRead).mockResolvedValue({ updated: 1 })
    renderPage()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Notificações' }),
    ).toBeInTheDocument()
    expect(await screen.findByText(/1 não lida\./)).toBeInTheDocument()
    const list = screen.getByRole('region', { name: 'Mais recentes' })
    expect(
      await within(list).findByRole('button', {
        name: /Nova resposta no chamado HD-000012 \(não lida\)/,
      }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }))

    expect(notificationsService.markAllRead).toHaveBeenCalled()
    expect(
      await screen.findByText('Todas as notificações foram marcadas como lidas.'),
    ).toBeInTheDocument()
  })

  it('abre o chamado da notificação e a marca como lida', async () => {
    const user = userEvent.setup()
    vi.mocked(notificationsService.list).mockResolvedValue({
      items: [notification({ id: 7 })],
      total: 1,
      page: 1,
      page_size: 15,
      pages: 1,
    })
    vi.mocked(notificationsService.unreadCount).mockResolvedValue({ unread: 1 })
    vi.mocked(notificationsService.markRead).mockResolvedValue(
      notification({ id: 7, is_read: true }),
    )
    renderPage()

    await user.click(await screen.findByRole('button', { name: /Nova resposta no chamado/ }))

    expect(notificationsService.markRead).toHaveBeenCalledWith(7)
    expect(await screen.findByRole('heading', { name: 'Detalhe do chamado' })).toBeInTheDocument()
  })

  it('mostra o estado vazio', async () => {
    vi.mocked(notificationsService.list).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 15,
      pages: 0,
    })
    vi.mocked(notificationsService.unreadCount).mockResolvedValue({ unread: 0 })
    renderPage()

    expect(await screen.findByText('Nenhuma notificação.')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Marcar todas como lidas' }),
    ).not.toBeInTheDocument()
  })
})
