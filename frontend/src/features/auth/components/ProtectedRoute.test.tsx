import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/utils'

import { clearTokens, saveTokens } from '../tokenStorage'
import type { CurrentUser, TokenResponse } from '../types'
import { ProtectedRoute } from './ProtectedRoute'

vi.mock('../services/auth.service', () => ({
  getMeWithRefresh: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}))

const { getMeWithRefresh } = await import('../services/auth.service')

const TOKENS: TokenResponse = {
  access_token: 'access',
  refresh_token: 'refresh',
  token_type: 'bearer',
  expires_in: 1800,
}

const USER: CurrentUser = {
  id: 1,
  company_id: 2,
  name: 'João Técnico',
  email: 'joao@empresa.com',
  role: 'TECHNICIAN',
  department_id: null,
  avatar: null,
  is_active: true,
}

const routes = (roles?: CurrentUser['role'][]) => [
  {
    path: '/perfil',
    element: (
      <ProtectedRoute roles={roles}>
        <h1>Área protegida</h1>
      </ProtectedRoute>
    ),
  },
  { path: '/login', element: <h1>Entrar</h1> },
  { path: '/', element: <h1>Início</h1> },
]

beforeEach(() => {
  vi.mocked(getMeWithRefresh).mockReset()
})

afterEach(() => {
  clearTokens()
})

describe('ProtectedRoute', () => {
  it('redireciona para o login quando não há sessão', async () => {
    renderWithProviders(<div />, { routes: routes(), route: '/perfil', withAuth: true })

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.queryByText('Área protegida')).not.toBeInTheDocument()
    expect(getMeWithRefresh).not.toHaveBeenCalled()
  })

  it('mostra o conteúdo quando a sessão é válida', async () => {
    saveTokens(TOKENS)
    vi.mocked(getMeWithRefresh).mockResolvedValue(USER)

    renderWithProviders(<div />, { routes: routes(), route: '/perfil', withAuth: true })

    // Enquanto o usuário é carregado a rota não pisca o login.
    expect(screen.getByText(/carregando sua sessão/i)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Área protegida' })).toBeInTheDocument()
  })

  it('redireciona para o login quando o token é recusado pelo backend', async () => {
    saveTokens(TOKENS)
    vi.mocked(getMeWithRefresh).mockRejectedValue(new Error('401'))

    renderWithProviders(<div />, { routes: routes(), route: '/perfil', withAuth: true })

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    await waitFor(() => {
      expect(window.localStorage.getItem('ai-helpdesk.access_token')).toBeNull()
    })
  })

  it('bloqueia perfis não autorizados sem chamar a rota', async () => {
    saveTokens(TOKENS)
    vi.mocked(getMeWithRefresh).mockResolvedValue(USER) // TECHNICIAN

    renderWithProviders(<div />, { routes: routes(['ADMIN']), route: '/perfil', withAuth: true })

    expect(await screen.findByRole('heading', { name: 'Início' })).toBeInTheDocument()
    expect(screen.queryByText('Área protegida')).not.toBeInTheDocument()
  })
})
