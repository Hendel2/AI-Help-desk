import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/Button'

import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'

describe('EmptyState', () => {
  it('mostra a mensagem e a ação sugerida', () => {
    render(
      <EmptyState
        title="Nenhum chamado encontrado."
        description="Ajuste os filtros ou abra um novo chamado."
        action={<Button size="sm">Novo chamado</Button>}
      />,
    )

    expect(screen.getByText('Nenhum chamado encontrado.')).toBeInTheDocument()
    expect(screen.getByText('Ajuste os filtros ou abra um novo chamado.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Novo chamado' })).toBeInTheDocument()
  })
})

describe('ErrorState', () => {
  it('anuncia o erro e chama onRetry', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(
      <ErrorState
        title="Não foi possível carregar os chamados."
        description="Tente novamente em instantes."
        onRetry={onRetry}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os chamados.')

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('omite o botão quando não há como tentar novamente', () => {
    render(<ErrorState />)

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os dados.')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('desabilita o botão enquanto tenta novamente', () => {
    render(<ErrorState onRetry={vi.fn()} isRetrying />)

    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeDisabled()
  })
})
