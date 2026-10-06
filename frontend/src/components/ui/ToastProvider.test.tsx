import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Button } from './Button'
import { ToastProvider } from './ToastProvider'
import { useToast } from './useToast'

function Demo() {
  const { showToast } = useToast()
  return (
    <>
      <Button onClick={() => showToast('Chamado atualizado com sucesso.')}>Salvar</Button>
      <Button onClick={() => showToast('Não foi possível salvar.', 'error')}>Falhar</Button>
    </>
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('ToastProvider', () => {
  it('exibe o aviso em uma região anunciada e permite fechar', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    const message = await screen.findByText('Chamado atualizado com sucesso.')
    expect(message.closest('[aria-live="polite"]')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Fechar aviso' }))

    expect(screen.queryByText('Chamado atualizado com sucesso.')).not.toBeInTheDocument()
  })

  it('remove o aviso automaticamente depois do tempo de exibição', () => {
    // fireEvent em vez de user-event: com timers falsos o user-event aguarda
    // temporizadores reais e o teste trava.
    vi.useFakeTimers()
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByText('Chamado atualizado com sucesso.')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4000)
    })

    expect(screen.queryByText('Chamado atualizado com sucesso.')).not.toBeInTheDocument()
  })

  it('empilha vários avisos', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Demo />
      </ToastProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    await user.click(screen.getByRole('button', { name: 'Falhar' }))

    expect(screen.getByText('Chamado atualizado com sucesso.')).toBeInTheDocument()
    expect(screen.getByText('Não foi possível salvar.')).toBeInTheDocument()
  })

  it('useToast exige o provider', () => {
    // Evita o log de erro esperado do React ao renderizar com exceção.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<Demo />)).toThrow(/ToastProvider/)

    consoleError.mockRestore()
  })
})
