import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Input } from './Input'

describe('Input', () => {
  it('associa o rótulo ao campo', async () => {
    const user = userEvent.setup()
    render(<Input label="Título" />)

    const input = screen.getByLabelText('Título')
    await user.type(input, 'Problema na VPN')

    expect(input).toHaveValue('Problema na VPN')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('descreve o campo pelo texto de apoio', () => {
    render(<Input label="CNPJ" hint="Somente números." />)

    expect(screen.getByLabelText('CNPJ')).toHaveAccessibleDescription('Somente números.')
  })

  it('anuncia o erro e marca o campo como inválido', () => {
    render(<Input label="E-mail" hint="Use o e-mail corporativo." error="Informe seu e-mail." />)

    const input = screen.getByLabelText('E-mail')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Informe seu e-mail.')
    expect(screen.getByRole('alert')).toHaveTextContent('Informe seu e-mail.')
    // Com erro, o texto de apoio dá lugar à mensagem.
    expect(screen.queryByText('Use o e-mail corporativo.')).not.toBeInTheDocument()
  })

  it('gera ids distintos para cada instância', () => {
    render(
      <>
        <Input label="Nome" />
        <Input label="Sobrenome" />
      </>,
    )

    expect(screen.getByLabelText('Nome').id).not.toBe(screen.getByLabelText('Sobrenome').id)
  })
})
