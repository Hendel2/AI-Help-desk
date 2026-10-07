import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { clearTokens } from '@/features/auth/tokenStorage'
import type { CurrentUser, TokenResponse } from '@/features/auth/types'
import { ApiError } from '@/services/api/errors'
import { renderWithProviders } from '@/test/utils'

import { LoginPage } from './LoginPage'

vi.mock('@/features/auth/services/auth.service', () => ({
  getMeWithRefresh: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}))

const { getMeWithRefresh, login } = await import('@/features/auth/services/auth.service')

const TOKENS: TokenResponse = {
  access_token: 'access',
  refresh_token: 'refresh',
  token_type: 'bearer',
  expires_in: 1800,
}

const USER: CurrentUser = {
  id: 1,
  company_id: 2,
  name: 'Maria Admin',
  email: 'maria@empresa.com',
  role: 'ADMIN',
  department_id: null,
  avatar: null,
  is_active: true,
}

const routes = [
  { path: '/login', element: <LoginPage /> },
  {
    // Sem rota de origem, o login leva para a home autenticada.
    path: '/',
    element: (
      <ProtectedRoute>
        <h1>Meu perfil</h1>
      </ProtectedRoute>
    ),
  },
]

function renderLogin() {
  return renderWithProviders(<div />, { routes, route: '/login', withAuth: true })
}

beforeEach(() => {
  vi.mocked(login).mockReset()
  vi.mocked(getMeWithRefresh).mockReset()
})

afterEach(() => {
  clearTokens()
})

describe('LoginPage', () => {
  it('valida o formulário antes de chamar a API', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Informe seu e-mail.')).toBeInTheDocument()
    expect(screen.getByText('Informe sua senha.')).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true')
    expect(login).not.toHaveBeenCalled()
  })

  it('recusa e-mail inválido', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('E-mail'), 'não-é-email')
    await user.type(screen.getByLabelText('Senha'), 'senha-secreta')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })

  it('autentica e redireciona para a página protegida', async () => {
    const user = userEvent.setup()
    vi.mocked(login).mockResolvedValue(TOKENS)
    vi.mocked(getMeWithRefresh).mockResolvedValue(USER)
    renderLogin()

    await user.type(screen.getByLabelText('E-mail'), 'maria@empresa.com')
    await user.type(screen.getByLabelText('Senha'), 'senha-secreta')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { name: 'Meu perfil' })).toBeInTheDocument()
    expect(login).toHaveBeenCalledWith({
      email: 'maria@empresa.com',
      password: 'senha-secreta',
    })
    expect(window.localStorage.getItem('ai-helpdesk.access_token')).toBe('access')
  })

  it('mostra a mensagem do backend quando as credenciais são inválidas', async () => {
    const user = userEvent.setup()
    vi.mocked(login).mockRejectedValue(
      new ApiError({
        status: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha inválidos.',
      }),
    )
    renderLogin()

    await user.type(screen.getByLabelText('E-mail'), 'maria@empresa.com')
    await user.type(screen.getByLabelText('Senha'), 'senha-errada')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
    expect(window.localStorage.getItem('ai-helpdesk.access_token')).toBeNull()
  })
})
