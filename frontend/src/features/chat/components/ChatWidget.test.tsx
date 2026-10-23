import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearTokens, saveTokens } from '@/features/auth/tokenStorage'
import type { ChatMessageData, Conversation, ConversationSummary } from '@/features/chat/types'
import type { DashboardMetrics } from '@/features/dashboard/types'
import { makeUser, TEST_TOKENS } from '@/test/fixtures'
import { renderWithProviders } from '@/test/utils'

import { AssistantWidgetProvider } from '../widget/AssistantWidgetProvider'

import { ChatWidget } from './ChatWidget'

vi.mock('@/features/auth/services/auth.service', () => ({
  getMeWithRefresh: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
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
vi.mock('@/features/dashboard/services/dashboard.service', () => ({
  dashboardService: { metrics: vi.fn(), tickets: vi.fn(), sla: vi.fn(), ai: vi.fn() },
}))

const { getMeWithRefresh } = await import('@/features/auth/services/auth.service')
const { chatService } = await import('@/features/chat/services/chat.service')
const { dashboardService } = await import('@/features/dashboard/services/dashboard.service')

const NOW = new Date().toISOString()

function summary(overrides: Partial<ConversationSummary>): ConversationSummary {
  return {
    id: 5,
    title: 'Minha VPN não conecta',
    status: 'ACTIVE',
    ticket_id: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  }
}

function message(overrides: Partial<ChatMessageData>): ChatMessageData {
  return {
    id: 1,
    role: 'USER',
    content: 'Minha VPN não conecta',
    intent: null,
    sources: null,
    suggest_ticket: false,
    created_at: NOW,
    ...overrides,
  }
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return { ...summary({}), messages: [], ...overrides }
}

function metrics(overrides: Partial<DashboardMetrics> = {}): DashboardMetrics {
  return {
    scope: 'USER',
    period_days: 30,
    open: 1,
    in_progress: 0,
    waiting_user: 0,
    resolved: 0,
    created_in_period: 1,
    sla_warning: 0,
    sla_breached: 0,
    assigned_to_me: null,
    avg_resolution_minutes: null,
    satisfaction_avg: null,
    satisfaction_count: null,
    sla_compliance_pct: null,
    ...overrides,
  }
}

/** Mostra onde o roteador está (para conferir o "abrir em tela cheia"). */
function Where() {
  const location = useLocation()
  return <h1>{`${location.pathname}${location.search}`}</h1>
}

function renderWidget(route = '/') {
  saveTokens(TEST_TOKENS)
  vi.mocked(getMeWithRefresh).mockResolvedValue(makeUser('USER'))
  return renderWithProviders(<div />, {
    withAuth: true,
    route,
    routes: [
      {
        path: '/',
        element: (
          <AssistantWidgetProvider>
            <ChatWidget />
          </AssistantWidgetProvider>
        ),
      },
      {
        path: '/assistente',
        element: (
          <AssistantWidgetProvider>
            <Where />
            <ChatWidget />
          </AssistantWidgetProvider>
        ),
      },
      { path: '/chamados/:id', element: <Where /> },
    ],
  })
}

async function openWidget(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Abrir o Assistente de TI' }))
  return screen.getByRole('dialog', { name: 'Assistente de TI' })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(chatService.assistant).mockResolvedValue({ ai_enabled: true, slow_responses: false })
  vi.mocked(chatService.list).mockResolvedValue([])
  vi.mocked(dashboardService.metrics).mockResolvedValue(metrics())
})

afterEach(() => {
  clearTokens()
})

describe('ChatWidget', () => {
  it('abre com a pergunta inicial, assuntos comuns e conversas em andamento', async () => {
    const user = userEvent.setup()
    vi.mocked(chatService.list).mockResolvedValue([
      summary({}),
      summary({ id: 7, title: 'Impressora sem toner', status: 'RESOLVED' }),
    ])
    vi.mocked(dashboardService.metrics).mockResolvedValue(metrics({ waiting_user: 1 }))
    renderWidget()

    const dialog = await openWidget(user)

    expect(screen.getByRole('button', { name: 'Minimizar o Assistente de TI' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(within(dialog).getByText(/, Ana\./)).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: 'Qual é o problema hoje?' })).toHaveFocus()
    const topics = within(dialog).getByRole('region', { name: 'Assuntos comuns' })
    expect(within(topics).getAllByRole('button')).toHaveLength(6)
    // Só as conversas em andamento aparecem em "Continue de onde parou".
    const ongoing = await within(dialog).findByRole('region', { name: 'Continue de onde parou' })
    expect(
      within(ongoing).getByRole('button', { name: /Minha VPN não conecta: Em andamento/ }),
    ).toBeInTheDocument()
    expect(within(ongoing).queryByText('Impressora sem toner')).not.toBeInTheDocument()
    // O assistente conhece os chamados: avisa o que espera a pessoa.
    expect(
      await within(dialog).findByRole('link', { name: '1 chamado aguarda sua resposta' }),
    ).toHaveAttribute('href', '/chamados/meus?status=WAITING_USER')
    expect(within(dialog).getByText('IA ativa: respostas em segundos')).toBeInTheDocument()
  })

  it('começa a conversa pela pergunta inicial e oferece respostas rápidas', async () => {
    const user = userEvent.setup()
    const userMessage = message({ id: 20, content: 'Minha internet está lenta' })
    const reply = message({ id: 21, role: 'ASSISTANT', content: 'É no cabo ou no Wi-Fi?' })
    vi.mocked(chatService.create).mockResolvedValue(conversation({ id: 9 }))
    // O que o servidor devolve depois do envio (a busca pode chegar depois da resposta).
    vi.mocked(chatService.get).mockResolvedValue(
      conversation({ id: 9, messages: [userMessage, reply] }),
    )
    vi.mocked(chatService.send).mockResolvedValue({
      user_message: userMessage,
      assistant_message: reply,
    })
    renderWidget()

    const dialog = await openWidget(user)
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Qual é o problema hoje?' }),
      'Minha internet está lenta{Enter}',
    )

    expect(await within(dialog).findByText('É no cabo ou no Wi-Fi?')).toBeInTheDocument()
    expect(chatService.create).toHaveBeenCalledTimes(1)
    expect(chatService.send).toHaveBeenCalledWith(9, 'Minha internet está lenta')
    const replies = await within(dialog).findByRole('group', { name: 'Respostas rápidas' })
    expect(within(replies).getByRole('button', { name: 'Resolvido' })).toBeInTheDocument()
    expect(within(replies).getByRole('button', { name: 'Falar com a equipe' })).toBeInTheDocument()

    vi.mocked(chatService.send).mockResolvedValue({
      user_message: message({ id: 22, content: 'Não resolveu.' }),
      assistant_message: message({
        id: 23,
        role: 'ASSISTANT',
        content: 'Vamos tentar outra coisa.',
      }),
    })
    await user.click(within(replies).getByRole('button', { name: 'Não resolveu' }))
    await waitFor(() => expect(chatService.send).toHaveBeenLastCalledWith(9, 'Não resolveu.'))
  })

  it('começa pelo assunto comum escolhido', async () => {
    const user = userEvent.setup()
    vi.mocked(chatService.create).mockResolvedValue(conversation({ id: 9 }))
    vi.mocked(chatService.get).mockResolvedValue(conversation({ id: 9 }))
    vi.mocked(chatService.send).mockResolvedValue({
      user_message: message({ id: 30, content: 'Minha VPN não conecta.' }),
      assistant_message: message({
        id: 31,
        role: 'ASSISTANT',
        content: 'Qual a mensagem de erro?',
      }),
    })
    renderWidget()

    const dialog = await openWidget(user)
    await user.click(within(dialog).getByRole('button', { name: 'VPN' }))

    await waitFor(() => expect(chatService.send).toHaveBeenCalledWith(9, 'Minha VPN não conecta.'))
    expect(
      await within(dialog).findByLabelText('Mensagem para o Assistente de TI'),
    ).toBeInTheDocument()
  })

  it('lista as conversas anteriores e abre a escolhida', async () => {
    const user = userEvent.setup()
    vi.mocked(chatService.list).mockResolvedValue([
      summary({}),
      summary({ id: 7, title: 'Impressora sem toner', status: 'RESOLVED' }),
    ])
    vi.mocked(chatService.get).mockResolvedValue(
      conversation({
        id: 7,
        title: 'Impressora sem toner',
        status: 'RESOLVED',
        messages: [
          message({ id: 1, content: 'Impressora sem toner' }),
          message({ id: 2, role: 'ASSISTANT', content: 'Já pedi a troca do toner.' }),
        ],
      }),
    )
    renderWidget()

    const dialog = await openWidget(user)
    await user.click(within(dialog).getByRole('button', { name: 'Conversas anteriores' }))
    await user.click(await within(dialog).findByRole('button', { name: /Impressora sem toner/ }))

    expect(await within(dialog).findByText('Já pedi a troca do toner.')).toBeInTheDocument()
    expect(chatService.get).toHaveBeenCalledWith(7, expect.anything())
    // Conversa encerrada: sem caixa de mensagem nem respostas rápidas.
    expect(
      within(dialog).queryByLabelText('Mensagem para o Assistente de TI'),
    ).not.toBeInTheDocument()
    expect(
      within(dialog).queryByRole('group', { name: 'Respostas rápidas' }),
    ).not.toBeInTheDocument()
  })

  it('fecha com Esc e devolve o foco ao botão do assistente', async () => {
    const user = userEvent.setup()
    renderWidget()

    await openWidget(user)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir o Assistente de TI' })).toHaveFocus()
  })

  it('abre a conversa em tela cheia e some na página do assistente', async () => {
    const user = userEvent.setup()
    vi.mocked(chatService.list).mockResolvedValue([summary({})])
    vi.mocked(chatService.get).mockResolvedValue(conversation())
    renderWidget()

    const dialog = await openWidget(user)
    await user.click(
      await within(dialog).findByRole('button', { name: /Minha VPN não conecta: Em andamento/ }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Abrir em tela cheia' }))

    expect(
      await screen.findByRole('heading', { name: '/assistente?conversa=5' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Assistente de TI/ })).not.toBeInTheDocument()
  })
})
