import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearTokens, saveTokens } from '@/features/auth/tokenStorage'
import type { RoleName } from '@/features/auth/types'
import type { TicketScope } from '@/features/tickets/hooks/useTicketListParams'
import { ApiError } from '@/services/api/errors'
import { CATEGORIES, makeListItem, makeUser, paginated, TEST_TOKENS } from '@/test/fixtures'
import { renderWithProviders } from '@/test/utils'

import { TicketsPage } from './TicketsPage'

vi.mock('@/features/auth/services/auth.service', () => ({
  getMeWithRefresh: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}))
vi.mock('@/features/tickets/services/tickets.service', () => ({
  listTickets: vi.fn(),
  listCategories: vi.fn(),
}))

const { getMeWithRefresh } = await import('@/features/auth/services/auth.service')
const { listTickets, listCategories } = await import('@/features/tickets/services/tickets.service')

function renderPage({
  role = 'TECHNICIAN',
  scope = 'all',
  route = '/chamados',
}: { role?: RoleName; scope?: TicketScope; route?: string } = {}) {
  saveTokens(TEST_TOKENS)
  vi.mocked(getMeWithRefresh).mockResolvedValue(makeUser(role))
  return renderWithProviders(<div />, {
    withAuth: true,
    route,
    routes: [
      { path: '/chamados', element: <TicketsPage scope={scope} /> },
      { path: '/chamados/:id', element: <h1>Detalhe</h1> },
    ],
  })
}

beforeEach(() => {
  vi.mocked(listTickets).mockReset()
  vi.mocked(listCategories).mockResolvedValue(CATEGORIES)
})

afterEach(() => {
  clearTokens()
})

describe('TicketsPage', () => {
  it('lista os chamados com número, prioridade, status e SLA', async () => {
    vi.mocked(listTickets).mockResolvedValue(
      paginated([
        makeListItem(),
        makeListItem({ id: 2, ticket_number: 'HD-000002', title: 'Impressora atolada', priority: 'LOW' }),
      ]),
    )
    renderPage()

    // A lista mobile também existe no DOM (o CSS a esconde no navegador): consulta na tabela.
    const table = await screen.findByRole('table', { name: 'Chamados' })
    expect(within(table).getByRole('link', { name: 'VPN não conecta' })).toHaveAttribute(
      'href',
      '/chamados/1',
    )
    expect(within(table).getByText('HD-000002')).toBeInTheDocument()
    expect(within(table).getAllByText('Aberto')).toHaveLength(2)
    expect(within(table).getByText('Alta')).toBeInTheDocument()
    // SLA: 30 minutos restantes para a resposta.
    expect(within(table).getAllByText('00:30')[0]).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Novo chamado/ })).toHaveAttribute('href', '/chamados/novo')
  })

  it('mostra o estado vazio sem filtros', async () => {
    vi.mocked(listTickets).mockResolvedValue(paginated([]))
    renderPage({ scope: 'mine', role: 'USER' })

    expect(await screen.findByText('Nenhum chamado ainda.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Meus chamados' })).toBeInTheDocument()
    expect(vi.mocked(listTickets).mock.calls[0]?.[0]).toMatchObject({ mine: true })
  })

  it('distingue "filtro sem resultado" e permite limpar os filtros', async () => {
    const user = userEvent.setup()
    vi.mocked(listTickets).mockResolvedValue(paginated([]))
    renderPage({ route: '/chamados?status=RESOLVED' })

    expect(await screen.findByText('Nenhum chamado corresponde aos filtros aplicados.')).toBeInTheDocument()
    expect(vi.mocked(listTickets).mock.calls[0]?.[0]).toMatchObject({ status: ['RESOLVED'] })

    await user.click(screen.getAllByRole('button', { name: 'Limpar filtros' })[0]!)

    await waitFor(() => {
      expect(vi.mocked(listTickets).mock.lastCall?.[0]).toMatchObject({ status: [] })
    })
  })

  it('aplica filtros e busca refletindo na consulta', async () => {
    const user = userEvent.setup()
    vi.mocked(listTickets).mockResolvedValue(paginated([makeListItem()]))
    renderPage()
    await screen.findByRole('table', { name: 'Chamados' })

    await user.selectOptions(screen.getByLabelText('Prioridade'), 'CRITICAL')
    await waitFor(() => {
      expect(vi.mocked(listTickets).mock.lastCall?.[0]).toMatchObject({ priority: ['CRITICAL'] })
    })

    await user.type(screen.getByRole('searchbox', { name: 'Buscar chamados' }), 'vpn')
    await waitFor(() => {
      expect(vi.mocked(listTickets).mock.lastCall?.[0]).toMatchObject({ search: 'vpn', page: 1 })
    })
  })

  it('mostra erro com opção de tentar novamente', async () => {
    const user = userEvent.setup()
    vi.mocked(listTickets)
      .mockRejectedValueOnce(new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Falha no servidor.' }))
      .mockResolvedValue(paginated([makeListItem()]))
    renderPage()

    expect(await screen.findByText('Não foi possível carregar os chamados.')).toBeInTheDocument()
    expect(screen.getByText('Falha no servidor.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByRole('table', { name: 'Chamados' })).toBeInTheDocument()
  })

  it('pagina pelo contrato da API', async () => {
    const user = userEvent.setup()
    vi.mocked(listTickets).mockResolvedValue(
      paginated([makeListItem()], { total: 45, pages: 3, page: 1 }),
    )
    renderPage()

    await user.click(await screen.findByRole('button', { name: /Próxima/ }))

    await waitFor(() => {
      expect(vi.mocked(listTickets).mock.lastCall?.[0]).toMatchObject({ page: 2 })
    })
  })
})
