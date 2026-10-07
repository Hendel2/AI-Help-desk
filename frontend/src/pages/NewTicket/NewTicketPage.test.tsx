import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearTokens, saveTokens } from '@/features/auth/tokenStorage'
import { ApiError } from '@/services/api/errors'
import { CATEGORIES, makeTicket, makeUser, TEST_TOKENS } from '@/test/fixtures'
import { renderWithProviders } from '@/test/utils'

import { NewTicketPage } from './NewTicketPage'

vi.mock('@/features/auth/services/auth.service', () => ({
  getMeWithRefresh: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}))
vi.mock('@/features/tickets/services/tickets.service', () => ({
  listCategories: vi.fn(),
  createTicket: vi.fn(),
  uploadAttachment: vi.fn(),
}))

const { getMeWithRefresh } = await import('@/features/auth/services/auth.service')
vi.mock('@/features/ai/services/ai.service', () => ({
  aiService: { classify: vi.fn() },
}))

const { listCategories, createTicket, uploadAttachment } = await import(
  '@/features/tickets/services/tickets.service'
)
const { aiService } = await import('@/features/ai/services/ai.service')

function renderPage() {
  saveTokens(TEST_TOKENS)
  vi.mocked(getMeWithRefresh).mockResolvedValue(makeUser('USER'))
  return renderWithProviders(<div />, {
    withAuth: true,
    route: '/chamados/novo',
    routes: [
      { path: '/chamados/novo', element: <NewTicketPage /> },
      { path: '/chamados/:id', element: <h1>Detalhe do chamado</h1> },
    ],
  })
}

async function fillDescription(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Título'), 'VPN não conecta')
  await user.type(screen.getByLabelText('Descrição'), 'Falha de autenticação desde as 08:30.')
  await user.click(screen.getByRole('button', { name: 'Continuar' }))
}

beforeEach(() => {
  vi.mocked(listCategories).mockResolvedValue(CATEGORIES)
  vi.mocked(createTicket).mockReset()
  vi.mocked(uploadAttachment).mockReset()
  // Padrão: IA indisponível — o fluxo precisa funcionar sem ela.
  vi.mocked(aiService.classify).mockReset().mockRejectedValue(new Error('IA fora do ar'))
})

afterEach(() => {
  clearTokens()
})

describe('NewTicketPage', () => {
  it('não avança sem descrever o problema', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Continuar' }))

    expect(await screen.findByText('Use pelo menos 5 caracteres no título.')).toBeInTheDocument()
    expect(screen.getByText('Descreva o problema com pelo menos 10 caracteres.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Descreva o problema/ })).toBeInTheDocument()
  })

  it('sugere a prioridade da categoria e abre o chamado após a revisão', async () => {
    const user = userEvent.setup()
    vi.mocked(createTicket).mockResolvedValue(makeTicket({ id: 42, ticket_number: 'HD-000042' }))
    renderPage()

    await fillDescription(user)
    expect(screen.getByRole('heading', { name: /Classificação/ })).toBeInTheDocument()

    await user.selectOptions(await screen.findByLabelText(/Categoria/), 'VPN')
    expect(screen.getByText(/Sugerida: Alta/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByRole('heading', { name: /Anexos/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(screen.getByRole('heading', { name: /Revisão/ })).toBeInTheDocument()
    expect(screen.getByText('VPN não conecta')).toBeInTheDocument()
    expect(screen.getByText('Alta')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Abrir chamado' }))

    await waitFor(() => {
      expect(createTicket).toHaveBeenCalledWith({
        title: 'VPN não conecta',
        description: 'Falha de autenticação desde as 08:30.',
        category_id: 3,
        // Sem escolha manual, vai a prioridade sugerida pela categoria.
        priority: 'HIGH',
      })
    })
    expect(await screen.findByRole('heading', { name: 'Detalhe do chamado' })).toBeInTheDocument()
  })

  it('envia a prioridade quando o usuário a altera', async () => {
    const user = userEvent.setup()
    vi.mocked(createTicket).mockResolvedValue(makeTicket())
    renderPage()

    await fillDescription(user)
    await user.selectOptions(await screen.findByLabelText('Prioridade'), 'CRITICAL')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Abrir chamado' }))

    await waitFor(() => {
      expect(createTicket).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: null, priority: 'CRITICAL' }),
      )
    })
  })

  it('volta etapas preservando o que foi digitado', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillDescription(user)
    await user.click(screen.getByRole('button', { name: 'Voltar' }))

    expect(screen.getByLabelText('Título')).toHaveValue('VPN não conecta')
  })

  it('mostra o erro da API sem perder o formulário', async () => {
    const user = userEvent.setup()
    vi.mocked(createTicket).mockRejectedValue(
      new ApiError({ status: 400, code: 'INVALID_CATEGORY', message: 'Categoria inválida.' }),
    )
    renderPage()

    await fillDescription(user)
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Abrir chamado' }))

    expect(await screen.findByText('Categoria inválida.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir chamado' })).toBeEnabled()
  })

  it('anexa arquivos após abrir o chamado e recusa tipos não permitidos', async () => {
    const user = userEvent.setup({ applyAccept: false })
    vi.mocked(createTicket).mockResolvedValue(makeTicket({ id: 42 }))
    vi.mocked(uploadAttachment).mockResolvedValue({
      id: 1,
      file_name: 'erro.png',
      file_type: 'image/png',
      file_size: 4,
      created_at: new Date().toISOString(),
      uploader: { id: 10, name: 'Ana', email: 'ana@empresa.com' },
    })
    renderPage()

    await fillDescription(user)
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    const image = new File(['png!'], 'erro.png', { type: 'image/png' })
    const program = new File(['MZ'], 'setup.exe', { type: 'application/octet-stream' })
    await user.upload(screen.getByLabelText('Escolher arquivos'), [image, program])

    expect(screen.getByRole('alert')).toHaveTextContent('"setup.exe": tipo não permitido.')
    expect(screen.getByText('erro.png')).toBeInTheDocument()
    expect(screen.queryByText('setup.exe')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Abrir chamado' }))

    await waitFor(() => {
      expect(uploadAttachment).toHaveBeenCalledWith(42, image)
    })
    expect(uploadAttachment).toHaveBeenCalledTimes(1)
  })

  it('pré-preenche a sugestão da IA e respeita a escolha do usuário', async () => {
    const user = userEvent.setup()
    vi.mocked(aiService.classify).mockResolvedValue({
      intent: 'VPN_PROBLEM',
      category_id: 3,
      category_name: 'VPN',
      priority: 'CRITICAL',
      confidence: 0.9,
      source: 'llm',
    })
    vi.mocked(createTicket).mockResolvedValue(makeTicket())
    renderPage()

    await fillDescription(user)

    expect(aiService.classify).toHaveBeenCalledWith(
      'VPN não conecta\n\nFalha de autenticação desde as 08:30.',
    )
    expect(await screen.findByText(/Sugestão da IA/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Categoria/)).toHaveValue('3')
    expect(screen.getByText(/Sugerida: Crítica/)).toBeInTheDocument()

    // Trocar a categoria faz valer a prioridade padrão da nova categoria.
    await user.selectOptions(screen.getByLabelText(/Categoria/), 'Impressora')
    expect(screen.getByText(/Sugerida: Baixa/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    await user.click(screen.getByRole('button', { name: 'Abrir chamado' }))

    await waitFor(() => {
      expect(createTicket).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: 4, priority: 'LOW' }),
      )
    })
  })

  it('segue sem sugestão quando a IA falha', async () => {
    const user = userEvent.setup()
    renderPage()

    await fillDescription(user)

    expect(await screen.findByRole('heading', { name: /Classificação/ })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText(/Analisando o seu relato/)).not.toBeInTheDocument()
    })
    expect(screen.queryByText(/Sugestão/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Categoria/)).toHaveValue('')
  })
})

