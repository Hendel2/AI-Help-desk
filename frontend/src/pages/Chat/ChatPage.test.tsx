import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearTokens, saveTokens } from '@/features/auth/tokenStorage'
import type { ChatMessageData, Conversation } from '@/features/chat/types'
import { makeUser, TEST_TOKENS } from '@/test/fixtures'
import { renderWithProviders } from '@/test/utils'

import { ChatPage } from './ChatPage'

vi.mock('@/features/auth/services/auth.service', () => ({
  getMeWithRefresh: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}))
vi.mock('@/features/chat/services/chat.service', () => ({
  chatService: {
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

function message(overrides: Partial<ChatMessageData>): ChatMessageData {
  return {
    id: 1,
    role: 'USER',
    content: 'Minha VPN não conecta',
    intent: null,
    sources: null,
    suggest_ticket: false,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 5,
    title: null,
    status: 'ACTIVE',
    ticket_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    messages: [],
    ...overrides,
  }
}

function renderChat(route = '/assistente') {
  saveTokens(TEST_TOKENS)
  vi.mocked(getMeWithRefresh).mockResolvedValue(makeUser('USER'))
  return renderWithProviders(<div />, {
    withAuth: true,
    route,
    routes: [
      { path: '/assistente', element: <ChatPage /> },
      { path: '/chamados/:id', element: <h1>Detalhe do chamado</h1> },
    ],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(chatService.list).mockResolvedValue([])
  vi.mocked(chatService.create).mockResolvedValue(conversation())
  vi.mocked(chatService.get).mockResolvedValue(conversation())
})

afterEach(() => {
  clearTokens()
})

describe('ChatPage', () => {
  it('mostra a saudação e responde a um exemplo citando a fonte', async () => {
    const user = userEvent.setup()
    vi.mocked(chatService.send).mockResolvedValue({
      user_message: message({ id: 10, content: 'Minha VPN não conecta' }),
      assistant_message: message({
        id: 11,
        role: 'ASSISTANT',
        content: 'Confirme se a sua senha não expirou.',
        sources: [{ article_id: 3, title: 'Falha de autenticação na VPN' }],
      }),
    })
    renderChat()

    expect(await screen.findByText('Olá! Como posso ajudar?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Minha VPN não conecta' }))

    expect(await screen.findByText('Confirme se a sua senha não expirou.')).toBeInTheDocument()
    expect(chatService.create).toHaveBeenCalled()
    expect(chatService.send).toHaveBeenCalledWith(5, 'Minha VPN não conecta')
    expect(screen.getByRole('link', { name: /Falha de autenticação na VPN/ })).toHaveAttribute(
      'href',
      '/base-de-conhecimento/3',
    )
  })

  it('envia com Enter e mantém Shift+Enter para nova linha', async () => {
    const user = userEvent.setup()
    vi.mocked(chatService.send).mockResolvedValue({
      user_message: message({ id: 10, content: 'linha 1\nlinha 2' }),
      assistant_message: message({ id: 11, role: 'ASSISTANT', content: 'Ok' }),
    })
    renderChat()

    const input = await screen.findByLabelText('Mensagem para o Assistente de TI')
    await user.type(input, 'linha 1{Shift>}{Enter}{/Shift}linha 2{Enter}')

    await waitFor(() => {
      expect(chatService.send).toHaveBeenCalledWith(5, 'linha 1\nlinha 2')
    })
  })

  it('oferece abrir chamado quando não consegue resolver e escala', async () => {
    const user = userEvent.setup()
    vi.mocked(chatService.get).mockResolvedValue(
      conversation({
        messages: [
          message({ id: 1, content: 'O ar-condicionado pinga' }),
          message({
            id: 2,
            role: 'ASSISTANT',
            content: 'Não consegui resolver esse problema com segurança.',
            suggest_ticket: true,
          }),
        ],
      }),
    )
    vi.mocked(chatService.escalate).mockResolvedValue({ ticket_id: 42, ticket_number: 'HD-000042' })
    renderChat('/assistente?conversa=5')

    await user.click(await screen.findByRole('button', { name: 'Sim, abrir chamado' }))

    expect(chatService.escalate).toHaveBeenCalledWith(5)
    expect(await screen.findByRole('heading', { name: 'Detalhe do chamado' })).toBeInTheDocument()
  })

  it('avalia a resposta do assistente', async () => {
    const user = userEvent.setup()
    vi.mocked(chatService.get).mockResolvedValue(
      conversation({
        messages: [
          message({ id: 1 }),
          message({ id: 2, role: 'ASSISTANT', content: 'Tente reiniciar o cliente VPN.' }),
        ],
      }),
    )
    vi.mocked(chatService.feedback).mockResolvedValue(undefined)
    renderChat('/assistente?conversa=5')

    await user.click(await screen.findByRole('button', { name: 'Resposta não ajudou' }))

    expect(chatService.feedback).toHaveBeenCalledWith(2, 'NEGATIVE')
    expect(await screen.findByText('Obrigado pela avaliação.')).toBeInTheDocument()
  })

  it('não permite enviar em conversa encerrada', async () => {
    vi.mocked(chatService.get).mockResolvedValue(
      conversation({
        status: 'ESCALATED',
        messages: [message({ id: 1, role: 'SYSTEM', content: 'Chamado HD-000042 aberto.' })],
      }),
    )
    renderChat('/assistente?conversa=5')

    expect(await screen.findByText('Chamado HD-000042 aberto.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Mensagem para o Assistente de TI')).not.toBeInTheDocument()
    expect(screen.getByText(/Esta conversa foi encerrada/)).toBeInTheDocument()
  })
})
