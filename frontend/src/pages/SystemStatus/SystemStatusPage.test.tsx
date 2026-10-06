import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/services/api/errors'
import { getHealth } from '@/services/health.service'
import { renderWithProviders } from '@/test/utils'
import type { HealthResponse } from '@/types/health'

import { SystemStatusPage } from './SystemStatusPage'

vi.mock('@/services/health.service')

const getHealthMock = vi.mocked(getHealth)

const healthy: HealthResponse = { status: 'ok', database: 'ok', version: '0.1.0' }
const degraded: HealthResponse = { status: 'degraded', database: 'unavailable', version: '0.1.0' }

beforeEach(() => {
  getHealthMock.mockReset()
})

describe('SystemStatusPage', () => {
  it('shows the product name and a loading state while the API is checked', () => {
    getHealthMock.mockReturnValue(new Promise<HealthResponse>(() => {}))

    renderWithProviders(<SystemStatusPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'AI Help Desk' })).toBeInTheDocument()
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('Verificando o status da API…')
  })

  it('shows the API status and version when the API is healthy', async () => {
    getHealthMock.mockResolvedValue(healthy)

    renderWithProviders(<SystemStatusPage />)

    expect(await screen.findByText('API operacional')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByText('Disponível')).toBeInTheDocument()
    expect(screen.getByText('0.1.0')).toBeInTheDocument()
    // O TanStack Query repassa o AbortSignal para o service.
    expect(getHealthMock).toHaveBeenCalledWith(expect.any(AbortSignal))
  })

  it('shows a degraded API as a warning', async () => {
    getHealthMock.mockResolvedValue(degraded)

    renderWithProviders(<SystemStatusPage />)

    expect(await screen.findByText('API com funcionamento degradado')).toBeInTheDocument()
    expect(screen.getByText('Indisponível')).toBeInTheDocument()
    expect(screen.queryByText('API operacional')).not.toBeInTheDocument()
  })

  it('shows the error and refetches when "Tentar novamente" is clicked', async () => {
    getHealthMock
      .mockRejectedValueOnce(
        new ApiError({
          status: 500,
          code: 'INTERNAL_ERROR',
          message: 'Ocorreu um erro interno. Tente novamente mais tarde.',
        }),
      )
      .mockResolvedValueOnce(healthy)
    const user = userEvent.setup()

    renderWithProviders(<SystemStatusPage />)

    expect(
      await screen.findByText('Não foi possível verificar o status da API.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Ocorreu um erro interno. Tente novamente mais tarde.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByText('API operacional')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument()
    expect(getHealthMock).toHaveBeenCalledTimes(2)
  })

  it('shows a generic pt-BR message for unexpected errors', async () => {
    getHealthMock.mockRejectedValue(new Error('unexpected'))

    renderWithProviders(<SystemStatusPage />)

    expect(
      await screen.findByText('Não foi possível concluir a ação. Tente novamente.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('unexpected')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled()
  })
})
