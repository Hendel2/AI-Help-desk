import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { paginated } from '@/test/fixtures'
import { renderWithProviders } from '@/test/utils'

import type { AppNotification } from '../types'
import { NotificationBell } from './NotificationBell'

vi.mock('../services/notifications.service', () => ({
  notificationsService: {
    unreadCount: vi.fn(),
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}))

const { notificationsService } = await import('../services/notifications.service')

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 1,
    type: 'SLA_BREACHED',
    title: 'SLA vencido: HD-000012',
    message: 'VPN não conecta',
    ticket_id: 12,
    is_read: false,
    read_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function renderBell() {
  return renderWithProviders(<div />, {
    routes: [
      { path: '/', element: <NotificationBell /> },
      { path: '/chamados/:id', element: <h1>Detalhe do chamado</h1> },
    ],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(notificationsService.unreadCount).mockResolvedValue({ unread: 2 })
  vi.mocked(notificationsService.list).mockResolvedValue(
    paginated([
      notification(),
      notification({ id: 2, type: 'TICKET_RESOLVED', title: 'Chamado HD-000003 resolvido', is_read: true }),
    ]),
  )
  vi.mocked(notificationsService.markRead).mockResolvedValue(notification({ is_read: true }))
  vi.mocked(notificationsService.markAllRead).mockResolvedValue({ updated: 1 })
})

describe('NotificationBell', () => {
  it('anuncia a quantidade de não lidas', async () => {
    renderBell()

    expect(await screen.findByRole('button', { name: 'Notificações, 2 não lidas' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('abre o painel, lista e leva ao chamado marcando como lida', async () => {
    const user = userEvent.setup()
    renderBell()

    await user.click(await screen.findByRole('button', { name: /Notificações/ }))
    const panel = await screen.findByRole('region', { name: 'Notificações' })
    expect(await within(panel).findByText('SLA vencido: HD-000012')).toBeInTheDocument()
    expect(within(panel).getByText('(não lida)')).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: /SLA vencido/ }))

    expect(notificationsService.markRead).toHaveBeenCalledWith(1)
    expect(await screen.findByRole('heading', { name: 'Detalhe do chamado' })).toBeInTheDocument()
  })

  it('marca todas como lidas', async () => {
    const user = userEvent.setup()
    renderBell()

    await user.click(await screen.findByRole('button', { name: /Notificações/ }))
    await user.click(await screen.findByRole('button', { name: 'Marcar todas como lidas' }))

    await waitFor(() => {
      expect(notificationsService.markAllRead).toHaveBeenCalled()
    })
  })

  it('fecha com Esc devolvendo o foco ao sino', async () => {
    const user = userEvent.setup()
    renderBell()
    const bell = await screen.findByRole('button', { name: /Notificações/ })

    await user.click(bell)
    expect(await screen.findByRole('region', { name: 'Notificações' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('region', { name: 'Notificações' })).not.toBeInTheDocument()
    expect(bell).toHaveFocus()
  })

  it('mostra estado vazio', async () => {
    const user = userEvent.setup()
    vi.mocked(notificationsService.unreadCount).mockResolvedValue({ unread: 0 })
    vi.mocked(notificationsService.list).mockResolvedValue(paginated([]))
    renderBell()

    await user.click(await screen.findByRole('button', { name: 'Notificações' }))

    expect(await screen.findByText('Nenhuma notificação.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marcar todas como lidas' })).not.toBeInTheDocument()
  })
})
