import type { ComponentProps } from 'react'
import { useId } from 'react'

import { Field } from './Field'
import { fieldIds } from './fieldIds'
import { FIELD_BASE, cx } from './styles'

export interface InputProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: string
  hint?: string
  error?: string
  optional?: boolean
  /** Classe aplicada ao contêiner do campo (layout externo). */
  containerClassName?: string
  /** Informe para controlar o `id`; por padrão é gerado automaticamente. */
  id?: string
}

/** Campo de texto com rótulo, apoio e erro. Compatível com `register()` do RHF. */
export function Input({
  label,
  hint,
  error,
  optional,
  containerClassName,
  className,
  id,
  ...rest
}: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const { hintId, errorId } = fieldIds(inputId)

  return (
    <Field
      htmlFor={inputId}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      className={containerClassName}
    >
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cx(FIELD_BASE, className)}
        {...rest}
      />
    </Field>
  )
}
