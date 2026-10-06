import type { ReactNode } from 'react'

import { fieldIds } from './fieldIds'
import { cx } from './styles'

export interface FieldProps {
  /** `id` do controle que o rótulo descreve. */
  htmlFor: string
  label: string
  /** Texto de apoio, exibido quando não há erro. */
  hint?: string
  error?: string
  /** Marca o campo como opcional na interface (o obrigatório é o padrão). */
  optional?: boolean
  className?: string
  children: ReactNode
}

/**
 * Moldura de um campo de formulário: rótulo real, texto de apoio e mensagem de
 * erro acessível. O controle é passado como `children` (Input, Select, Textarea).
 */
export function Field({
  htmlFor,
  label,
  hint,
  error,
  optional = false,
  className,
  children,
}: FieldProps) {
  const { hintId, errorId } = fieldIds(htmlFor)

  return (
    <div className={cx('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-text">
        {label}
        {optional ? <span className="ml-1 font-normal text-secondary">(opcional)</span> : null}
      </label>
      {children}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
