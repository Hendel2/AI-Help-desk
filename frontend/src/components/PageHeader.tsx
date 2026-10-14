import type { ReactNode } from 'react'

import { cx } from '@/components/ui/styles'

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** Informação acima do título que identifica o item (ex.: número do chamado). */
  meta?: ReactNode
  /** Ações da página, alinhadas à direita no desktop (no máximo uma primária). */
  actions?: ReactNode
  className?: string
}

/** Cabeçalho único das telas: um `h1`, apoio curto e as ações da página. */
export function PageHeader({ title, description, meta, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cx(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {meta}
        <h1 className="text-xl font-semibold tracking-tight break-words text-text sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-prose text-sm text-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-end gap-3">{actions}</div> : null}
    </header>
  )
}
