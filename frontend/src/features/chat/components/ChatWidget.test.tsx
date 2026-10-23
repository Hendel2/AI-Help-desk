import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearTokens, saveTokens } from '@/features/auth/tokenStorage'
import type { ChatMessageData, Conversation, ConversationSummary } from '@/features/chat/types'
import { makeUser, TEST_TOKENS } from '@/test/fixtures'
import { renderWithProviders } from '@/test/utils'

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

const { getMeWithRefresh } = await import('@/features/auth/services/auth.service')
const { chatService } = await import('@/features/chat/services/chat.service')

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
      { path: '/', element: <ChatWidget /> },
      {
        path: '/assistente',
        element: (
          <>
            <Where />
            <ChatWidget />
          </>
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
})

afterEach(() => {
  clearTokens()
})

describe('ChatWidget', () => {
  it('abre pela bolinha com saudação, mensagem recente e atalhos', async () => {
    const user = userEvent.setup()
    vi.mocked(chatService.list).mockResolvedValue([summary({})])
    renderWidget()

    const dialog = await openWidget(user)

    expect(screen.getByRole('button', { name: 'Fechar o Assistente de TI' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(within(dialog).getByRole('heading', { name: /Olá, Ana/ })).toBeInTheDocument()
    expect(
      await within(dialog).findByRole('button', {
        name: /Mensagem recente: Minha VPN não conecta/,
      }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Continuar conversando' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Iniciar nova conversa' }),
    ).toBeInTheDocument()
    expect(await within(dialog).findByText('IA ativa: respostas em segundos')).toBeInTheDocument()
  })

  it('inicia uma conversa e mostra a resposta dentro do painel', async () => {
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
    await user.click(within(dialog).getByRole('button', { name: 'Iniciar nova conversa' }))
    const input = within(dialog).getByLabelText('Mensagem para o Assistente de TI')
    await waitFor(() => expect(input).toHaveFocus())
    await user.type(input, 'Minha internet está lenta{Enter}')

    expect(await within(dialog).findByText('É no cabo ou no Wi-Fi?')).toBeInTheDocument()
    expect(chatService.create).toHaveBeenCalled()
    expect(chatService.send).toHaveBeenCalledWith(9, 'Minha internet está lenta')
    // A conversa continua no painel: dá para encerrar ou falar com a equipe.
    expect(within(dialog).getByRole('button', { name: 'Falar com a equipe' })).toBeInTheDocument()
  })

  it('lista as conversas na aba Mensagens e abre a escolhida', async () => {
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
    await user.click(within(dialog).getByRole('button', { name: 'Mensagens' }))
    await user.click(await within(dialog).findByRole('button', { name: /Impressora sem toner/ }))

    expect(await within(dialog).findByText('Já pedi a troca do toner.')).toBeInTheDocument()
    expect(chatService.get).toHaveBeenCalledWith(7, expect.anything())
    // Conversa encerrada: sem caixa de mensagem.
    expect(
      within(dialog).queryByLabelText('Mensagem para o Assistente de TI'),
    ).not.toBeInTheDocument()
  })

  it('fecha com Esc e devolve o foco à bolinha', async () => {
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
    await user.click(await within(dialog).findByRole('button', { name: 'Continuar conversando' }))
    await user.click(within(dialog).getByRole('button', { name: 'Abrir em tela cheia' }))

    expect(
      await screen.findByRole('heading', { name: '/assistente?conversa=5' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Assistente de TI/ })).not.toBeInTheDocument()
  })
})
