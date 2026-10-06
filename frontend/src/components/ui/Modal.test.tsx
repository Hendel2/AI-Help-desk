import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './Button'
import { Modal } from './Modal'

function renderModal(onClose = vi.fn()) {
  render(
    <>
      <button type="button">Fora do modal</button>
      <Modal
        isOpen
        onClose={onClose}
        title="Encerrar chamado"
        description="Esta ação não pode ser desfeita."
        footer={<Button onClick={onClose}>Confirmar</Button>}
      >
        <p>Conteúdo do modal</p>
      </Modal>
    </>,
  )
  return onClose
}

describe('Modal', () => {
  it('não renderiza nada quando fechado', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} title="Encerrar chamado">
        <p>Conteúdo do modal</p>
      </Modal>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('expõe nome e descrição acessíveis', () => {
    renderModal()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Encerrar chamado')
    expect(dialog).toHaveAccessibleDescription('Esta ação não pode ser desfeita.')
  })

  it('fecha com Esc', async () => {
    const user = userEvent.setup()
    const onClose = renderModal()

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('mantém o foco dentro do painel', async () => {
    const user = userEvent.setup()
    renderModal()

    const dialog = screen.getByRole('dialog')
    const focused = () => document.activeElement as HTMLElement | null
    // O foco inicial vai para o primeiro elemento interativo do painel.
    expect(dialog).toContainElement(focused())

    await user.tab()
    await user.tab()
    await user.tab()

    expect(dialog).toContainElement(focused())
    expect(screen.getByRole('button', { name: 'Fora do modal' })).not.toHaveFocus()
  })

  it('fecha ao clicar fora e pelo botão de fechar', async () => {
    const user = userEvent.setup()
    const onClose = renderModal()

    await user.click(screen.getAllByRole('button', { name: 'Fechar' })[0]!)
    expect(onClose).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
