import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { ThemeProvider } from '../ThemeProvider'
import { THEME_STORAGE_KEY } from '../themeStorage'
import { ThemeMenu } from './ThemeMenu'

function renderMenu() {
  return render(
    <ThemeProvider>
      <ThemeMenu />
    </ThemeProvider>,
  )
}

afterEach(() => {
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('ThemeMenu', () => {
  it('troca para o tema escuro, salva a escolha e devolve o foco ao botão', async () => {
    const user = userEvent.setup()
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Tema' })

    await user.click(trigger)
    expect(screen.getByRole('menuitemradio', { name: 'Do sistema' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await user.click(screen.getByRole('menuitemradio', { name: 'Escuro' }))

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('funciona pelo teclado: setas percorrem as opções e Esc fecha', async () => {
    const user = userEvent.setup()
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Tema' })

    trigger.focus()
    await user.keyboard('{ArrowDown}')
    // Abre com o foco na opção marcada ("Do sistema", a última).
    expect(screen.getByRole('menuitemradio', { name: 'Do sistema' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitemradio', { name: 'Claro' })).toHaveFocus()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })
})
