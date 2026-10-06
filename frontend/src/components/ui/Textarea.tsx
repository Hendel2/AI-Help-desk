import type { ComponentProps } from 'react'
import { useId } from 'react'

import { Field } from './Field'
import { fieldIds } from './fieldIds'
import { FIELD_BASE, cx } from './styles'

export interface TextareaProps extends Omit<ComponentProps<'textarea'>, 'id'> {
  label: string
  hint?: string
  error?: string
  optional?: boolean
  containerClassName?: string
  id?: string
}

/** Área de texto com rótulo, apoio e erro (descrição de chamado, comentários). */
export function Textarea({
  label,
  hint,
  error,
  optional,
  containerClassName,
  className,
  rows = 5,
  id,
  ...rest
}: TextareaProps) {
  const generatedId = useId()
  const textareaId = id ?? generatedId
  const { hintId, errorId } = fieldIds(textareaId)

  return (
    <Field
      htmlFor={textareaId}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      className={containerClassName}
    >
      <textarea
        id={textareaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cx(FIELD_BASE, 'resize-y', className)}
        {...rest}
      />
    </Field>
  )
}
