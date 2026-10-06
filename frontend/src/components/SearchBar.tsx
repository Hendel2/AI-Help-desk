import { Search } from 'lucide-react'
import type { ComponentProps } from 'react'

import { FIELD_BASE, cx } from '@/components/ui/styles'

export interface SearchBarProps extends Omit<ComponentProps<'input'>, 'type'> {
  /** Nome acessível do campo (ex.: "Buscar chamados"). */
  label: string
}

/**
 * Campo de busca com ícone. O debounce fica no hook de quem consome
 * (`useDebouncedValue`), não aqui.
 */
export function SearchBar({ label, className, ...rest }: SearchBarProps) {
  return (
    <div className={cx('relative', className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-secondary"
      />
      <input type="search" aria-label={label} className={cx(FIELD_BASE, 'pl-9')} {...rest} />
    </div>
  )
}
