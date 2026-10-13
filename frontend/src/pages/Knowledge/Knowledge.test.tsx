import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearTokens, saveTokens } from '@/features/auth/tokenStorage'
import type { RoleName } from '@/features/auth/types'
import type { Article, ArticleListItem } from '@/features/knowledge/types'
import { KnowledgeArticlePage } from '@/pages/KnowledgeArticle/KnowledgeArticlePage'
import { KnowledgeEditorPage } from '@/pages/KnowledgeEditor/KnowledgeEditorPage'
import { ApiError } from '@/services/api/errors'
import { CATEGORIES, makeUser, paginated, TEST_TOKENS } from '@/test/fixtures'
import { renderWithProviders } from '@/test/utils'

import { KnowledgePage } from './KnowledgePage'

vi.mock('@/features/auth/services/auth.service', () => ({
  getMeWithRefresh: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}))
vi.mock('@/features/tickets/services/tickets.service', () => ({
  listCategories: vi.fn(),
}))
vi.mock('@/features/knowledge/services/knowledge.service', () => ({
  knowledgeService: {
    list: vi.fn(),
    get: vi.fn(),
    suggest: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    feedback: vi.fn(),
    upload: vi.fn(),
  },
}))

const { getMeWithRefresh } = await import('@/features/auth/services/auth.service')
const { listCategories } = await import('@/features/tickets/services/tickets.service')
const { knowledgeService } = await import('@/features/knowledge/services/knowledge.service')

function listItem(overrides: Partial<ArticleListItem> = {}): ArticleListItem {
  return {
    id: 1,
    title: 'Falha de autenticação na VPN',
    summary: 'O que fazer quando a VPN recusa usuário e senha.',
    status: 'PUBLISHED',
    is_featured: true,
    view_count: 10,
    helpful_count: 3,
    not_helpful_count: 0,
    updated_at: new Date().toISOString(),
    category: { id: 3, name: 'VPN' },
    author: { id: 20, name: 'Alice Admin' },
    ...overrides,
  }
}

function article(overrides: Partial<Article> = {}): Article {
  return {
    ...listItem(),
    content: '1. Confirme a senha.\n2. Atualize o cliente VPN.\n\nSe persistir, abra um chamado.',
    source_type: 'MANUAL',
    source_file_name: null,
    indexed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

const ROUTES = [
  { path: '/base-de-conhecimento', element: <KnowledgePage /> },
  { path: '/base-de-conhecimento/novo', element: <KnowledgeEditorPage /> },
  { path: '/base-de-conhecimento/:articleId', element: <KnowledgeArticlePage /> },
  { path: '/base-de-conhecimento/:articleId/editar', element: <KnowledgeEditorPage /> },
  { path: '/chamados/novo', element: <h1>Novo chamado</h1> },
]

function render(role: RoleName, route: string) {
  saveTokens(TEST_TOKENS)
  vi.mocked(getMeWithRefresh).mockResolvedValue(makeUser(role))
  return renderWithProviders(<div />, { withAuth: true, route, routes: ROUTES })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listCategories).mockResolvedValue(CATEGORIES)
  vi.mocked(knowledgeService.list).mockResolvedValue(paginated([listItem()]))
  vi.mocked(knowledgeService.get).mockResolvedValue(article())
})

afterEach(() => {
  clearTokens()
})

describe('KnowledgePage', () => {
  it('mostra artigos populares e recentes, sem botão de criação para o usuário', async () => {
    render('USER', '/base-de-conhecimento')

    expect(await screen.findByRole('heading', { name: 'Base de conhecimento' })).toBeInTheDocument()
    const popular = await screen.findByRole('region', { name: 'Artigos populares' })
    expect(await within(popular).findByRole('link', { name: 'Falha de autenticação na VPN' })).toHaveAttribute(
      'href',
      '/base-de-conhecimento/1',
    )
    expect(screen.getByRole('region', { name: 'Artigos recentes' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Novo artigo/ })).not.toBeInTheDocument()
  })

  it('pesquisa e filtra por categoria', async () => {
    const user = userEvent.setup()
    render('ADMIN', '/base-de-conhecimento')
    expect(await screen.findByRole('link', { name: /Novo artigo/ })).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: /Pesquisar/ }), 'vpn')
    await waitFor(() => {
      expect(vi.mocked(knowledgeService.list).mock.lastCall?.[0]).toMatchObject({ search: 'vpn' })
    })
    expect(await screen.findByRole('region', { name: 'Resultados' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Impressora' }))
    expect(screen.getByRole('button', { name: 'Impressora' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => {
      expect(vi.mocked(knowledgeService.list).mock.lastCall?.[0]).toMatchObject({ categoryId: 4 })
    })
  })

  it('mostra estado vazio da busca', async () => {
    const user = userEvent.setup()
    render('USER', '/base-de-conhecimento')
    await screen.findByRole('region', { name: 'Artigos populares' })
    vi.mocked(knowledgeService.list).mockResolvedValue(paginated([]))

    await user.type(screen.getByRole('searchbox', { name: /Pesquisar/ }), 'xyz')

    expect(await screen.findByText('Nenhum artigo encontrado.')).toBeInTheDocument()
  })
})

describe('KnowledgeArticlePage', () => {
  it('mostra o artigo e registra que ajudou', async () => {
    const user = userEvent.setup()
    vi.mocked(knowledgeService.feedback).mockResolvedValue(article({ helpful_count: 4 }))
    render('USER', '/base-de-conhecimento/1')

    expect(await screen.findByRole('heading', { name: 'Falha de autenticação na VPN' })).toBeInTheDocument()
    expect(screen.getByText(/Atualize o cliente VPN/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Editar/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sim' }))

    expect(knowledgeService.feedback).toHaveBeenCalledWith(1, true)
    expect(await screen.findByText('Obrigado pelo retorno!')).toBeInTheDocument()
  })

  it('oferece abrir chamado quando o artigo não ajudou', async () => {
    const user = userEvent.setup()
    vi.mocked(knowledgeService.feedback).mockResolvedValue(article())
    render('USER', '/base-de-conhecimento/1')

    await user.click(await screen.findByRole('button', { name: 'Não' }))

    expect(await screen.findByRole('link', { name: 'Abrir chamado' })).toHaveAttribute('href', '/chamados/novo')
  })

  it('permite ao admin excluir com confirmação', async () => {
    const user = userEvent.setup()
    vi.mocked(knowledgeService.remove).mockResolvedValue(undefined)
    render('ADMIN', '/base-de-conhecimento/1')

    await user.click(await screen.findByRole('button', { name: 'Excluir' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir artigo' }))

    await waitFor(() => {
      expect(knowledgeService.remove).toHaveBeenCalledWith(1)
    })
    expect(await screen.findByRole('heading', { name: 'Base de conhecimento' })).toBeInTheDocument()
  })

  it('trata artigo inexistente', async () => {
    vi.mocked(knowledgeService.get).mockRejectedValue(
      new ApiError({ status: 404, code: 'ARTICLE_NOT_FOUND', message: 'Artigo não encontrado.' }),
    )
    render('USER', '/base-de-conhecimento/99')

    expect(await screen.findByText('Artigo não encontrado.')).toBeInTheDocument()
  })
})

describe('KnowledgeEditorPage', () => {
  it('valida e publica um novo artigo', async () => {
    const user = userEvent.setup()
    vi.mocked(knowledgeService.create).mockResolvedValue(article({ id: 7, title: 'Novo guia' }))
    render('ADMIN', '/base-de-conhecimento/novo')

    await user.click(await screen.findByRole('button', { name: 'Salvar artigo' }))
    expect(await screen.findByText('Escreva pelo menos 20 caracteres.')).toBeInTheDocument()
    expect(knowledgeService.create).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Título'), 'Novo guia')
    await user.type(screen.getByLabelText('Conteúdo'), 'Passo a passo para configurar o e-mail no celular.')
    await user.selectOptions(screen.getByLabelText('Status'), 'PUBLISHED')
    await user.click(screen.getByRole('button', { name: 'Salvar artigo' }))

    await waitFor(() => {
      expect(knowledgeService.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Novo guia', status: 'PUBLISHED', category_id: null }),
      )
    })
    expect(await screen.findByText(/disponível para o Assistente de TI/)).toBeInTheDocument()
  })

  it('carrega o artigo para edição', async () => {
    render('ADMIN', '/base-de-conhecimento/1/editar')

    expect(await screen.findByDisplayValue('Falha de autenticação na VPN')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Editar artigo' })).toBeInTheDocument()
  })
})
