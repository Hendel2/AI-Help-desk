import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearTokens, saveTokens } from '@/features/auth/tokenStorage'
import { makeUser, TEST_TOKENS } from '@/test/fixtures'
import { renderWithProviders } from '@/test/utils'

import { ReportsPage } from './ReportsPage'

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

beforeEach(() => {
  vi.clearAllMocks()
  saveTokens(TEST_TOKENS)
  vi.mocked(getMeWithRefresh).mockResolvedValue(makeUser('TECHNICIAN'))
  vi.mocked(dashboardService.tickets).mockResolvedValue({
    period_days: 30,
    by_priority: [],
    by_category: [{ label: 'VPN', count: 7 }],
    daily_volume: [],
    recent: [],
    activity: [],
    technicians: null,
  })
  vi.mocked(dashboardService.ai).mockResolvedValue({
    period_days: 30,
    conversations: 12,
    conversations_resolved: 6,
    conversations_escalated: 2,
    assistant_resolution_pct: 75,
    feedback_count: 4,
    positive_feedback_pct: 50,
    usage: [
      { action_type: 'CHAT_RESPONSE', total: 18, success: 18 },
      { action_type: 'CLASSIFY_TICKET', total: 5, success: 4 },
    ],
    insights: [],
  })
})

afterEach(() => {
  clearTokens()
})

describe('ReportsPage', () => {
  it('mostra o desempenho do assistente, o uso da IA e o estado sem insights', async () => {
    renderWithProviders(<ReportsPage />, { withAuth: true })

    const tiles = await screen.findByRole('region', { name: 'Assistente de TI' })
    expect(await within(tiles).findByText('75%')).toBeInTheDocument()
    expect(within(tiles).getByText('4 avaliação(ões)')).toBeInTheDocument()
    expect(screen.getByText('Respostas do assistente')).toBeInTheDocument()
    expect(screen.getByText(/Ainda não há volume suficiente/)).toBeInTheDocument()
  })

  it('consulta de novo ao trocar o período', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReportsPage />, { withAuth: true })

    await user.selectOptions(await screen.findByLabelText('Período'), '90')

    await waitFor(() => {
      expect(dashboardService.ai).toHaveBeenLastCalledWith(90, expect.anything())
    })
  })
})
