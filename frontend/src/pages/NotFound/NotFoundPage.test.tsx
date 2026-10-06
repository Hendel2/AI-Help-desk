import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '@/test/utils'

import { NotFoundPage } from './NotFoundPage'

describe('NotFoundPage', () => {
  it('explains the page does not exist and links back to the home page', () => {
    renderWithProviders(<NotFoundPage />, { route: '/rota-inexistente' })

    expect(
      screen.getByRole('heading', { level: 1, name: 'Página não encontrada' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar para o início' })).toHaveAttribute('href', '/')
  })
})
