import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearTokens, saveTokens } from '@/features/auth/tokenStorage'
import type { RoleName } from '@/features/auth/types'
import type { Ticket } from '@/features/tickets/types'
import { ApiError } from '@/services/api/errors'
import { makeComment, makeHistory, makeTicket, makeUser, TEST_TOKENS } from '@/test/fixtures'
import { renderWithProviders } from '@/test/utils'

import { TicketDetailsPage } from './TicketDetailsPage'

vi.mock('@/features/auth/services/auth.service', () => ({
  getMeWithRefresh: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}))
vi.mock('@/features/tickets/services/tickets.service', () => ({
  getTicket: vi.fn(),
  listComments: vi.fn(),
  listHistory: vi.fn(),
  addComment: vi.fn(),
  assignTicket: vi.fn(),
  changeTicketStatus: vi.fn(),
  resolveTicket: vi.fn(),
  closeTicket: vi.fn(),
  updateTicket: vi.fn(),
  listAttachments: vi.fn(),
  uploadAttachment: vi.fn(),
  downloadAttachment: vi.fn(),
  listTechnicians: vi.fn(),
}))
vi.mock('@/utils/download', () => ({ saveBlob: vi.fn() }))
vi.mock('@/features/ai/services/ai.service', () => ({
  aiService: { classify: vi.fn(), copilot: vi.fn(), findArticles: vi.fn() },
}))

const { getMeWithRefresh } = await import('@/features/auth/services/auth.service')
const service = await import('@/features/tickets/services/tickets.service')
const { saveBlob } = await import('@/utils/download')
const { aiService } = await import('@/features/ai/services/ai.service')

function renderPage(role: RoleName, ticket: Ticket) {
  saveTokens(TEST_TOKENS)
  vi.mocked(getMeWithRefresh).mockResolvedValue(makeUser(role))
  vi.mocked(service.getTicket).mockResolvedValue(ticket)
  return renderWithProviders(<div />, {
    withAuth: true,
    route: `/chamados/${ticket.id}`,
    routes: [{ path: '/chamados/:ticketId', element: <TicketDetailsPage /> }],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(service.listAttachments).mockResolvedValue([
    {
      id: 7,
      file_name: 'print-erro.png',
      file_type: 'image/png',
      file_size: 2048,
      created_at: new Date().toISOString(),
      uploader: { id: 10, name: 'Ana Solicitante', email: 'ana@empresa.com' },
    },
  ])
  vi.mocked(service.listComments).mockResolvedValue([
    makeComment({ id: 1, content: 'Verificar o RADIUS.', is_internal: true }),
    makeComment({ id: 2, content: 'Já estamos verificando.' }),
  ])
  vi.mocked(service.listHistory).mockResolvedValue([
    makeHistory(),
    makeHistory({
      id: 201,
      action: 'STATUS_CHANGED',
      field: 'status',
      old_value: 'ASSIGNED',
      new_value: 'IN_PROGRESS',
      user: { id: 20, name: 'Téo Técnico', email: 'teo@empresa.com' },
    }),
  ])
})

afterEach(() => {
  clearTokens()
})

describe('TicketDetailsPage', () => {
  it('mostra cabeçalho, descrição, conversa e informações', async () => {
    renderPage('TECHNICIAN', makeTicket())

    expect(await screen.findByRole('heading', { level: 1, name: 'VPN não conecta' })).toBeInTheDocument()
    expect(screen.getByText('HD-000001')).toBeInTheDocument()
    expect(screen.getByText('Desde as 08:30 a VPN recusa minhas credenciais.')).toBeInTheDocument()
    expect(await screen.findByText('Verificar o RADIUS.')).toBeInTheDocument()
    expect(screen.getByText('Comentário interno')).toBeInTheDocument()

    const info = screen.getByRole('region', { name: 'Informações' })
    expect(within(info).getByText('Ana Solicitante')).toBeInTheDocument()
    expect(within(info).getByText('Não atribuído')).toBeInTheDocument()
    expect(within(info).getByText('Primeira resposta')).toBeInTheDocument()
  })

  it('oferece ao técnico apenas as ações permitidas pelo backend', async () => {
    renderPage('TECHNICIAN', makeTicket({ allowed_transitions: ['TRIAGE', 'IN_PROGRESS', 'CANCELLED'] }))

    const actions = await screen.findByRole('region', { name: 'Ações' })
    expect(within(actions).getByRole('button', { name: 'Assumir chamado' })).toBeInTheDocument()
    expect(within(actions).getByRole('button', { name: 'Iniciar atendimento' })).toBeInTheDocument()
    expect(within(actions).getByRole('button', { name: 'Enviar para triagem' })).toBeInTheDocument()
    expect(within(actions).getByRole('button', { name: 'Cancelar chamado' })).toBeInTheDocument()
    expect(within(actions).queryByRole('button', { name: 'Resolver' })).not.toBeInTheDocument()
    // Técnico pode marcar comentários como internos.
    expect(screen.getByLabelText(/Comentário interno/)).toBeInTheDocument()
  })

  it('não mostra ações nem comentário interno para o solicitante', async () => {
    renderPage('USER', makeTicket({ allowed_transitions: [] }))

    await screen.findByRole('heading', { level: 1, name: 'VPN não conecta' })
    expect(screen.queryByRole('region', { name: 'Ações' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Comentário interno/)).not.toBeInTheDocument()
  })

  it('permite ao solicitante fechar o chamado resolvido', async () => {
    const user = userEvent.setup()
    const resolved = makeTicket({ status: 'RESOLVED', allowed_transitions: ['CLOSED'] })
    vi.mocked(service.closeTicket).mockResolvedValue({ ...resolved, status: 'CLOSED', allowed_transitions: [] })
    renderPage('USER', resolved)

    await user.click(await screen.findByRole('button', { name: 'Confirmar solução e fechar' }))

    expect(service.closeTicket).toHaveBeenCalledWith(1, undefined)
    expect(await screen.findByText('Chamado fechado.')).toBeInTheDocument()
  })

  it('exige a solução ao resolver e envia pelo endpoint de resolução', async () => {
    const user = userEvent.setup()
    const ticket = makeTicket({
      status: 'IN_PROGRESS',
      technician: { id: 20, name: 'Téo Técnico', email: 'teo@empresa.com' },
      allowed_transitions: ['WAITING_USER', 'RESOLVED', 'CANCELLED'],
    })
    vi.mocked(service.resolveTicket).mockResolvedValue({ ...ticket, status: 'RESOLVED' })
    renderPage('TECHNICIAN', ticket)

    await user.click(await screen.findByRole('button', { name: 'Resolver' }))
    const dialog = screen.getByRole('dialog', { name: 'Resolver chamado' })
    await user.click(within(dialog).getByRole('button', { name: 'Resolver chamado' }))
    expect(await within(dialog).findByText('Descreva a solução aplicada.')).toBeInTheDocument()
    expect(service.resolveTicket).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText('Solução'), 'Credenciais renovadas.')
    await user.click(within(dialog).getByRole('button', { name: 'Resolver chamado' }))

    await waitFor(() => {
      expect(service.resolveTicket).toHaveBeenCalledWith(1, 'Credenciais renovadas.')
    })
    expect(await screen.findByText('Chamado resolvido.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('envia comentário interno e avisa com toast', async () => {
    const user = userEvent.setup()
    vi.mocked(service.addComment).mockResolvedValue(makeComment({ id: 3, is_internal: true }))
    renderPage('TECHNICIAN', makeTicket())

    await user.type(await screen.findByLabelText('Responder'), 'Checar logs do firewall.')
    await user.click(screen.getByLabelText(/Comentário interno/))
    await user.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => {
      expect(service.addComment).toHaveBeenCalledWith(1, 'Checar logs do firewall.', true)
    })
    expect(await screen.findByText('Comentário interno adicionado.')).toBeInTheDocument()
    expect(screen.getByLabelText('Responder')).toHaveValue('')
  })

  it('não aceita mensagens em chamado encerrado', async () => {
    renderPage('USER', makeTicket({ status: 'CLOSED' }))

    expect(await screen.findByText('Este chamado está encerrado e não aceita novas mensagens.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Responder')).not.toBeInTheDocument()
  })

  it('mostra o histórico com valores traduzidos', async () => {
    const user = userEvent.setup()
    renderPage('TECHNICIAN', makeTicket())

    await user.click(await screen.findByRole('tab', { name: 'Histórico' }))

    expect(await screen.findByText('alterou o status')).toBeInTheDocument()
    expect(screen.getByText('Atribuído')).toBeInTheDocument()
    expect(screen.getByText('Em andamento')).toBeInTheDocument()
  })

  it('trata chamado inexistente ou de outra empresa como não encontrado', async () => {
    saveTokens(TEST_TOKENS)
    vi.mocked(getMeWithRefresh).mockResolvedValue(makeUser('USER'))
    vi.mocked(service.getTicket).mockRejectedValue(
      new ApiError({ status: 404, code: 'TICKET_NOT_FOUND', message: 'Chamado não encontrado.' }),
    )
    renderWithProviders(<div />, {
      withAuth: true,
      route: '/chamados/999',
      routes: [{ path: '/chamados/:ticketId', element: <TicketDetailsPage /> }],
    })

    expect(await screen.findByText('Chamado não encontrado.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument()
  })

  it('lista anexos, baixa com autenticação e envia novos arquivos', async () => {
    const user = userEvent.setup()
    const blob = new Blob(['conteudo'])
    vi.mocked(service.downloadAttachment).mockResolvedValue(blob)
    vi.mocked(service.uploadAttachment).mockResolvedValue({
      id: 8,
      file_name: 'log.txt',
      file_type: 'text/plain',
      file_size: 10,
      created_at: new Date().toISOString(),
      uploader: { id: 10, name: 'Ana Solicitante', email: 'ana@empresa.com' },
    })
    renderPage('USER', makeTicket())

    const panel = await screen.findByRole('region', { name: 'Anexos' })
    expect(await within(panel).findByText('print-erro.png')).toBeInTheDocument()
    expect(within(panel).getByText(/2 KB/)).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Baixar print-erro.png' }))
    await waitFor(() => {
      expect(saveBlob).toHaveBeenCalledWith(blob, 'print-erro.png')
    })
    expect(service.downloadAttachment).toHaveBeenCalledWith(1, 7)

    const file = new File(['linha de log'], 'log.txt', { type: 'text/plain' })
    await user.upload(within(panel).getByLabelText('Anexar arquivos'), file)

    await waitFor(() => {
      expect(service.uploadAttachment).toHaveBeenCalledWith(1, file)
    })
    expect(await screen.findByText('"log.txt" anexado.')).toBeInTheDocument()
  })

  it('Copilot gera rascunho editável e só o leva para a resposta, sem enviar', async () => {
    const user = userEvent.setup()
    vi.mocked(aiService.copilot).mockResolvedValue({
      action: 'generate_response',
      text: 'Olá, Ana! Atualize o cliente VPN.',
      sources: [{ article_id: 3, title: 'Falha de autenticação na VPN' }],
      mode: 'heuristic',
    })
    renderPage('TECHNICIAN', makeTicket())

    await user.click(await screen.findByRole('button', { name: 'Gerar resposta' }))

    expect(aiService.copilot).toHaveBeenCalledWith('generate_response', 1)
    const draft = await screen.findByLabelText('Rascunho de resposta')
    expect(screen.getByRole('link', { name: 'Falha de autenticação na VPN' })).toHaveAttribute(
      'href',
      '/base-de-conhecimento/3',
    )
    await user.type(draft, ' Abraço.')
    await user.click(screen.getByRole('button', { name: 'Adicionar ao comentário' }))

    expect(screen.getByLabelText('Responder')).toHaveValue(
      'Olá, Ana! Atualize o cliente VPN. Abraço.',
    )
    expect(service.addComment).not.toHaveBeenCalled()
  })

  it('Copilot lista artigos relacionados e permite tentar de novo após erro', async () => {
    const user = userEvent.setup()
    vi.mocked(aiService.findArticles)
      .mockRejectedValueOnce(new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Falha interna.' }))
      .mockResolvedValueOnce([{ article_id: 4, title: 'VPN no Windows', excerpt: 'Passo 1' }])
    renderPage('TECHNICIAN', makeTicket())

    await user.click(await screen.findByRole('button', { name: 'Encontrar artigos' }))
    expect(await screen.findByText('O Copilot não conseguiu responder.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('link', { name: 'VPN no Windows' })).toBeInTheDocument()
  })

  it('não mostra o Copilot ao solicitante', async () => {
    renderPage('USER', makeTicket())

    expect(await screen.findByText('Já estamos verificando.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resumir chamado' })).not.toBeInTheDocument()
  })

  it('permite ao administrador atribuir o chamado a outro técnico', async () => {
    const user = userEvent.setup()
    const ticket = makeTicket({ allowed_transitions: ['IN_PROGRESS', 'CANCELLED'] })
    vi.mocked(service.listTechnicians).mockResolvedValue([
      { id: 20, name: 'Téo Técnico' },
      { id: 21, name: 'Tânia Técnica' },
    ])
    vi.mocked(service.assignTicket).mockResolvedValue({
      ...ticket,
      technician: { id: 21, name: 'Tânia Técnica', email: 'tania@empresa.com' },
    })
    renderPage('ADMIN', ticket)

    await user.selectOptions(await screen.findByLabelText('Técnico responsável'), '21')

    expect(service.assignTicket).toHaveBeenCalledWith(1, 21)
    expect(await screen.findByText('Chamado atribuído a Tânia Técnica.')).toBeInTheDocument()
  })
})
