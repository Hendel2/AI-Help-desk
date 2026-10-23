import { useId } from 'react'

import { cx } from './styles'

export interface SegmentedOption {
  value: string
  label: string
}

interface SegmentedControlProps {
  /** Nome do grupo (legenda; visível só para leitores de tela). */
  label: string
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}

/**
 * Escolha única entre poucas opções curtas (ex.: período 7/30/90). São radios
 * nativos: as setas trocam a opção e só a marcada entra na ordem de tabulação.
 */
export function SegmentedControl({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps) {
  const name = useId()
  return (
    <fieldset className={cx('inline-flex', className)}>
      <legend className="sr-only">{label}</legend>
      <div className="inline-flex rounded-xl border border-border bg-surface-sunken p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className="relative cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-secondary transition-colors has-checked:bg-surface has-checked:font-semibold has-checked:text-text has-checked:shadow-card has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-primary hover:text-text"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
