import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearTokens, saveTokens } from '@/features/auth/tokenStorage'
import { ApiError } from '@/services/api/errors'
import { makeUser, TEST_TOKENS } from '@/test/fixtures'
import { renderWithProviders } from '@/test/utils'

import { ProfilePage } from './ProfilePage'

vi.mock('@/features/auth/services/auth.service', () => ({
  getMeWithRefresh: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  changePassword: vi.fn(),
}))

const { getMeWithRefresh, changePassword } = await import('@/features/auth/services/auth.service')

beforeEach(() => {
  vi.clearAllMocks()
  saveTokens(TEST_TOKENS)
  vi.mocked(getMeWithRefresh).mockResolvedValue(makeUser('USER'))
})

afterEach(() => {
  clearTokens()
})

async function fillPasswords(current: string, next: string, confirm: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Senha atual'), current)
  await user.type(screen.getByLabelText('Nova senha'), next)
  await user.type(screen.getByLabelText('Confirmar nova senha'), confirm)
  await user.click(screen.getByRole('button', { name: 'Alterar senha' }))
}

describe('ProfilePage', () => {
  it('mostra os dados da conta', async () => {
    renderWithProviders(<ProfilePage />, { withAuth: true })

    expect(await screen.findByText('Ana Solicitante')).toBeInTheDocument()
    expect(screen.getByText('ana@empresa.com')).toBeInTheDocument()
  })

  it('valida a confirmação antes de enviar', async () => {
    renderWithProviders(<ProfilePage />, { withAuth: true })

    await fillPasswords('senha-atual', 'nova-senha-1', 'outra-senha')

    expect(await screen.findByText('As senhas não coincidem.')).toBeInTheDocument()
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('troca a senha e limpa o formulário', async () => {
    vi.mocked(changePassword).mockResolvedValue(undefined)
    renderWithProviders(<ProfilePage />, { withAuth: true })

    await fillPasswords('senha-atual', 'nova-senha-1', 'nova-senha-1')

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith('senha-atual', 'nova-senha-1')
    })
    expect(await screen.findByText('Senha alterada.')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha atual')).toHaveValue('')
  })

  it('mostra o erro do servidor quando a senha atual está errada', async () => {
    vi.mocked(changePassword).mockRejectedValue(
      new ApiError({
        status: 400,
        code: 'INVALID_PASSWORD',
        message: 'A senha atual está incorreta.',
      }),
    )
    renderWithProviders(<ProfilePage />, { withAuth: true })

    await fillPasswords('errada', 'nova-senha-1', 'nova-senha-1')

    expect(await screen.findByText('A senha atual está incorreta.')).toBeInTheDocument()
  })
})
