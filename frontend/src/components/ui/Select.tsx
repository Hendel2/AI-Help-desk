import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useId } from 'react'

import { Field } from './Field'
import { fieldIds } from './fieldIds'
import { FIELD_BASE, cx } from './styles'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends Omit<ComponentProps<'select'>, 'id' | 'children'> {
  label: string
  options: SelectOption[]
  /** Primeira opção neutra (ex.: "Todos os status"). */
  placeholder?: string
  hint?: string
  error?: string
  optional?: boolean
  containerClassName?: string
  id?: string
}

/** Select nativo estilizado — acessível e com suporte a teclado do navegador. */
export function Select({
  label,
  options,
  placeholder,
  hint,
  error,
  optional,
  containerClassName,
  className,
  id,
  ...rest
}: SelectProps) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const { hintId, errorId } = fieldIds(selectId)

  return (
    <Field
      htmlFor={selectId}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      className={containerClassName}
    >
      {/* Seta própria (appearance-none): igual nos dois temas e em todos os navegadores. */}
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cx(FIELD_BASE, 'appearance-none pr-9', className)}
          {...rest}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-secondary"
        />
      </div>
    </Field>
  )
}
