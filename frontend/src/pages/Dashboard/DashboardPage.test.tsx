import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearTokens, saveTokens } from '@/features/auth/tokenStorage'
import type { RoleName } from '@/features/auth/types'
import type { DashboardMetrics, DashboardTickets } from '@/features/dashboard/types'
import { ApiError } from '@/services/api/errors'
import { makeUser, TEST_TOKENS } from '@/test/fixtures'
import { renderWithProviders } from '@/test/utils'

import { DashboardPage } from './DashboardPage'

vi.mock('@/features/auth/services/auth.service', () => ({
  getMeWithRefresh: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}))
vi.mock('@/features/dashboard/services/dashboard.service', () => ({
  dashboardService: { metrics: vi.fn(), tickets: vi.fn(), sla: vi.fn(), ai: vi.fn() },
}))

const { getMeWithRefresh } = await import('@/features/auth/services/auth.service')
const { dashboardService } = await import('@/features/dashboard/services/dashboard.service')

function metrics(overrides: Partial<DashboardMetrics> = {}): DashboardMetrics {
  return {
    scope: 'USER',
    period_days: 30,
    open: 3,
    in_progress: 1,
    waiting_user: 1,
    resolved: 7,
    created_in_period: 10,
    sla_warning: 2,
    sla_breached: 1,
    assigned_to_me: null,
    avg_resolution_minutes: null,
    satisfaction_avg: null,
    satisfaction_count: null,
    sla_compliance_pct: null,
    ...overrides,
  }
}

const TICKETS: DashboardTickets = {
  period_days: 30,
  by_priority: [
    { label: 'LOW', count: 1 },
    { label: 'MEDIUM', count: 2 },
    { label: 'HIGH', count: 4 },
    { label: 'CRITICAL', count: 0 },
  ],
  by_category: [
    { label: 'VPN', count: 6 },
    { label: 'Impressora', count: 2 },
  ],
  daily_volume: [
    { date: '2026-10-06', count: 2 },
    { date: '2026-10-07', count: 5 },
  ],
  recent: [
    {
      id: 1,
      ticket_number: 'HD-000001',
      title: 'VPN não conecta',
      status: 'OPEN',
      priority: 'HIGH',
      updated_at: new Date().toISOString(),
      requester: { id: 10, name: 'Ana', email: 'ana@empresa.com' },
      technician: null,
      category: { id: 3, name: 'VPN' },
    },
  ],
  activity: [
    {
      id: 5,
      action: 'RESOLVED',
      field: 'status',
      old_value: 'IN_PROGRESS',
      new_value: 'RESOLVED',
      created_at: new Date().toISOString(),
      user: { id: 20, name: 'Téo Técnico', email: 'teo@empresa.com' },
      ticket_id: 1,
      ticket_number: 'HD-000001',
    },
  ],
  technicians: [
    {
      technician: { id: 20, name: 'Téo Técnico', email: 'teo@empresa.com' },
      resolved: 12,
      avg_resolution_minutes: 260,
      satisfaction_avg: 4.6,
    },
  ],
}

function renderDashboard(role: RoleName, metricOverrides: Partial<DashboardMetrics> = {}) {
  saveTokens(TEST_TOKENS)
  vi.mocked(getMeWithRefresh).mockResolvedValue(makeUser(role, { name: 'Maria Souza' }))
  vi.mocked(dashboardService.metrics).mockResolvedValue(metrics({ scope: role, ...metricOverrides }))
  vi.mocked(dashboardService.tickets).mockResolvedValue(
    role === 'ADMIN' ? TICKETS : { ...TICKETS, technicians: null },
  )
  vi.mocked(dashboardService.sla).mockResolvedValue({
    weeks: [
      { week_start: '2026-09-28', resolved: 4, within_sla: 3, compliance_pct: 75 },
      { week_start: '2026-10-05', resolved: 0, within_sla: 0, compliance_pct: null },
    ],
  })
  vi.mocked(dashboardService.ai).mockResolvedValue({
    period_days: 30,
    conversations: 10,
    conversations_resolved: 6,
    conversations_escalated: 2,
    assistant_resolution_pct: 75,
    feedback_count: 0,
    positive_feedback_pct: null,
    usage: [{ action_type: 'CHAT_RESPONSE', total: 12, success: 12 }],
    insights: [
      { kind: 'growth', tone: 'warning', text: 'Chamados de VPN aumentaram 50% nesta semana (4 → 6).' },
    ],
  })
  return renderWithProviders(<DashboardPage />, { withAuth: true })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  clearTokens()
})

describe('DashboardPage', () => {
  it('mostra ao usuário os próprios chamados e o atalho para abrir chamado', async () => {
    renderDashboard('USER')

    expect(await screen.findByRole('heading', { name: 'Olá, Maria' })).toBeInTheDocument()
    const tiles = screen.getByRole('region', { name: 'Indicadores' })
    expect(await within(tiles).findByText('Aguardando você')).toBeInTheDocument()
    expect(await within(tiles).findByText('7')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Novo chamado/ })).toHaveAttribute(
      'href',
      '/chamados/novo',
    )
    expect(await screen.findByRole('link', { name: 'VPN não conecta' })).toBeInTheDocument()
    // Gestão e fila da equipe não aparecem para o usuário.
    expect(screen.queryByText('Desempenho dos técnicos')).not.toBeInTheDocument()
    expect(screen.queryByText('SLA vencido')).not.toBeInTheDocument()
    expect(dashboardService.sla).not.toHaveBeenCalled()
    expect(dashboardService.ai).not.toHaveBeenCalled()
  })

  it('mostra ao técnico a fila, o SLA em risco e a distribuição por prioridade', async () => {
    renderDashboard('TECHNICIAN', { assigned_to_me: 4 })

    const tiles = await screen.findByRole('region', { name: 'Indicadores' })
    expect(await within(tiles).findByText('4')).toBeInTheDocument()
    expect(within(tiles).getByText('Atribuídos a mim')).toBeInTheDocument()
    expect(within(tiles).getByText('SLA vencido')).toBeInTheDocument()

    const byPriority = await screen.findByRole('region', {
      name: 'Chamados em aberto por prioridade',
    })
    expect(await within(byPriority).findByText('Alta')).toBeInTheDocument()
    const activity = screen.getByRole('region', { name: 'Atividade recente' })
    expect(await within(activity).findByText(/resolveu o chamado/)).toBeInTheDocument()
  })

  it('mostra ao administrador indicadores de gestão, gráficos e desempenho', async () => {
    renderDashboard('ADMIN', {
      avg_resolution_minutes: 260,
      satisfaction_avg: 4.5,
      satisfaction_count: 12,
      sla_compliance_pct: 91.7,
    })

    const tiles = await screen.findByRole('region', { name: 'Indicadores' })
    expect(await within(tiles).findByText('4h 20min')).toBeInTheDocument()
    expect(within(tiles).getByText('4,5 / 5')).toBeInTheDocument()
    expect(within(tiles).getByText('92%')).toBeInTheDocument()

    const performance = await screen.findByRole('table', {
      name: 'Desempenho dos técnicos no período',
    })
    expect(within(performance).getByText('Téo Técnico')).toBeInTheDocument()
    expect(within(performance).getByText('4,6 / 5')).toBeInTheDocument()

    // Gráficos têm os dados em tabela para leitores de tela e teclado.
    expect(await screen.findByRole('table', { name: 'Chamados abertos' })).toBeInTheDocument()
    const slaTable = await screen.findByRole('table', { name: 'Resolvidos dentro do prazo (%)' })
    expect(within(slaTable).getByText('75%')).toBeInTheDocument()
    expect(within(slaTable).getByText('—')).toBeInTheDocument()

    const insights = await screen.findByRole('region', { name: 'AI Insights' })
    expect(
      await within(insights).findByText('Chamados de VPN aumentaram 50% nesta semana (4 → 6).'),
    ).toBeInTheDocument()
  })

  it('refaz a consulta ao trocar o período', async () => {
    const user = userEvent.setup()
    renderDashboard('ADMIN')

    await user.selectOptions(await screen.findByLabelText('Período'), '7')

    await waitFor(() => {
      expect(dashboardService.metrics).toHaveBeenLastCalledWith(7, expect.anything())
    })
  })

  it('mostra erro com nova tentativa quando os indicadores falham', async () => {
    const user = userEvent.setup()
    saveTokens(TEST_TOKENS)
    vi.mocked(getMeWithRefresh).mockResolvedValue(makeUser('USER'))
    vi.mocked(dashboardService.metrics)
      .mockRejectedValueOnce(
        new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Falhou.' }),
      )
      .mockResolvedValue(metrics())
    vi.mocked(dashboardService.tickets).mockResolvedValue(TICKETS)
    renderWithProviders(<DashboardPage />, { withAuth: true })

    expect(await screen.findByText('Não foi possível carregar os indicadores.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByRole('region', { name: 'Indicadores' })).toBeInTheDocument()
  })
})
