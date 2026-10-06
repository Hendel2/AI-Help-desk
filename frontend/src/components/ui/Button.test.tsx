import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './Button'

describe('Button', () => {
  it('renderiza um button type="button" por padrão', () => {
    render(<Button>Salvar alterações</Button>)

    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toHaveAttribute(
      'type',
      'button',
    )
  })

  it('aceita type="submit" para formulários', () => {
    render(<Button type="submit">Entrar</Button>)

    expect(screen.getByRole('button', { name: 'Entrar' })).toHaveAttribute('type', 'submit')
  })

  it('chama onClick quando acionado pelo teclado', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<Button onClick={onClick}>Confirmar</Button>)

    await user.tab()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('desabilita e marca aria-busy durante o carregamento', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      <Button isLoading onClick={onClick}>
        Entrando...
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Entrando...' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')

    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('aplica a variante escolhida sem duplicar componente', () => {
    render(<Button variant="danger">Excluir</Button>)

    expect(screen.getByRole('button', { name: 'Excluir' }).className).toContain('bg-danger')
  })
})
