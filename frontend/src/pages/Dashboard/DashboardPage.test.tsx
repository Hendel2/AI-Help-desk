import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearTokens, saveTokens } from '@/features/auth/tokenStorage'
import type { RoleName } from '@/features/auth/types'
import { ChatWidget } from '@/features/chat/components/ChatWidget'
import { AssistantWidgetProvider } from '@/features/chat/widget/AssistantWidgetProvider'
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
vi.mock('@/features/chat/services/chat.service', () => ({
  chatService: {
    assistant: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    send: vi.fn(),
    escalate: vi.fn(),
    resolve: vi.fn(),
    feedback: vi.fn(),
  },
}))
vi.mock('@/features/notifications/services/notifications.service', () => ({
  notificationsService: {
    list: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}))

const { getMeWithRefresh } = await import('@/features/auth/services/auth.service')
const { dashboardService } = await import('@/features/dashboard/services/dashboard.service')
const { chatService } = await import('@/features/chat/services/chat.service')
const { notificationsService } =
  await import('@/features/notifications/services/notifications.service')

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
  vi.mocked(dashboardService.metrics).mockResolvedValue(
    metrics({ scope: role, ...metricOverrides }),
  )
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
      {
        kind: 'growth',
        tone: 'warning',
        text: 'Chamados de VPN aumentaram 50% nesta semana (4 → 6).',
      },
    ],
  })
  return renderHome()
}

/** O início com o assistente flutuante (como no AppLayout). */
function renderHome() {
  return renderWithProviders(
    <AssistantWidgetProvider>
      <DashboardPage />
      <ChatWidget />
    </AssistantWidgetProvider>,
    { withAuth: true },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(chatService.assistant).mockResolvedValue({ ai_enabled: true, slow_responses: false })
  vi.mocked(chatService.list).mockResolvedValue([])
  vi.mocked(notificationsService.list).mockResolvedValue({
    items: [
      {
        id: 3,
        type: 'COMMENT_ADDED',
        title: 'Nova resposta no HD-000001',
        message: 'Téo respondeu ao seu chamado.',
        ticket_id: 1,
        is_read: false,
        read_at: null,
        created_at: new Date().toISOString(),
      },
    ],
    total: 1,
    page: 1,
    page_size: 15,
    pages: 1,
  })
})

afterEach(() => {
  clearTokens()
})

describe('DashboardPage', () => {
  it('mostra ao usuário os próprios chamados, os atalhos e as novidades', async () => {
    renderDashboard('USER')

    expect(await screen.findByRole('heading', { level: 1, name: /, Maria\.$/ })).toBeInTheDocument()
    // Abertura: resumo com números reais e os atalhos do perfil.
    expect(await screen.findByText(/1 chamado aguarda a sua resposta/)).toBeInTheDocument()
    const shortcuts = screen.getByRole('navigation', { name: 'Atalhos' })
    expect(within(shortcuts).getByRole('link', { name: 'Abrir chamado' })).toHaveAttribute(
      'href',
      '/chamados/novo',
    )
    // Indicadores: o canhoto leva à lista já filtrada; 7 de 10 chamados resolvidos.
    const tiles = screen.getByRole('region', { name: 'Indicadores' })
    expect(within(tiles).getByRole('link', { name: /Aguardando você/ })).toHaveAttribute(
      'href',
      '/chamados/meus?status=WAITING_USER',
    )
    expect(within(tiles).getByText('70% dos seus 10 chamados')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'VPN não conecta' })).toBeInTheDocument()
    // Novidades: as notificações recentes, com a não lida anunciada.
    const news = screen.getByRole('region', { name: 'Novidades' })
    expect(
      await within(news).findByRole('button', { name: 'Nova resposta no HD-000001 (não lida)' }),
    ).toHaveAccessibleDescription(/Téo respondeu ao seu chamado/)
    // Gestão e fila da equipe não aparecem para o usuário.
    expect(screen.queryByText('Desempenho dos técnicos')).not.toBeInTheDocument()
    expect(screen.queryByText('SLA vencido')).not.toBeInTheDocument()
    expect(dashboardService.sla).not.toHaveBeenCalled()
    expect(dashboardService.ai).not.toHaveBeenCalled()
  })

  it('leva a pergunta digitada no início para o assistente flutuante', async () => {
    const user = userEvent.setup()
    const question = {
      id: 1,
      role: 'USER' as const,
      content: 'A impressora não imprime',
      intent: null,
      sources: null,
      suggest_ticket: false,
      created_at: new Date().toISOString(),
    }
    const answer = { ...question, id: 2, role: 'ASSISTANT' as const, content: 'Qual impressora?' }
    const created = {
      id: 9,
      title: null,
      status: 'ACTIVE' as const,
      ticket_id: null,
      created_at: question.created_at,
      updated_at: question.created_at,
      messages: [],
    }
    vi.mocked(chatService.create).mockResolvedValue(created)
    vi.mocked(chatService.get).mockResolvedValue({ ...created, messages: [question, answer] })
    vi.mocked(chatService.send).mockResolvedValue({
      user_message: question,
      assistant_message: answer,
    })
    renderDashboard('USER')

    const card = await screen.findByRole('region', { name: 'Assistente de TI' })
    await user.type(
      within(card).getByRole('textbox', { name: 'Qual é o problema?' }),
      'A impressora não imprime',
    )
    await user.click(within(card).getByRole('button', { name: 'Perguntar ao assistente' }))

    const dialog = screen.getByRole('dialog', { name: 'Assistente de TI' })
    expect(await within(dialog).findByText('Qual impressora?')).toBeInTheDocument()
    expect(chatService.send).toHaveBeenCalledWith(9, 'A impressora não imprime')
  })

  it('mostra ao técnico a fila, o SLA em risco e a distribuição por prioridade', async () => {
    renderDashboard('TECHNICIAN', { assigned_to_me: 4 })

    const tiles = await screen.findByRole('region', { name: 'Indicadores' })
    expect(
      await within(tiles).findByRole('link', { name: /^Atribuídos a mim: 4/ }),
    ).toHaveAttribute('href', '/chamados/meus')
    expect(within(tiles).getByText('SLA vencido')).toBeInTheDocument()
    // 3 em aberto, 2 perto do prazo e 1 vencido: nenhum no prazo.
    expect(within(tiles).getByText('0%')).toBeInTheDocument()
    expect(within(tiles).getByText('dos 3 chamados em aberto')).toBeInTheDocument()

    const byPriority = await screen.findByRole('region', {
      name: 'Em aberto por prioridade',
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

    const period = await screen.findByRole('group', { name: 'Período' })
    expect(within(period).getByRole('radio', { name: '30 dias' })).toBeChecked()
    await user.click(within(period).getByRole('radio', { name: '7 dias' }))

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
    renderHome()

    expect(await screen.findByText('Não foi possível carregar os indicadores.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByRole('region', { name: 'Indicadores' })).toBeInTheDocument()
  })
})
