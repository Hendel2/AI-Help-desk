import type { ReactNode } from 'react'
import { useId } from 'react'

import { cx } from './styles'

export interface CardProps {
  /** Título da seção; renderiza o cabeçalho do bloco quando informado. */
  title?: string
  /** Ação no canto do cabeçalho (ex.: link "Ver todos"). */
  action?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * Bloco de superfície com contorno. Uso restrito (skill frontend-design):
 * métricas do dashboard, painéis com título e itens de lista no mobile.
 * Nunca card dentro de card, nem card para envolver a página inteira.
 */
export function Card({ title, action, className, children }: CardProps) {
  const titleId = useId()
  return (
    // Com título, a seção vira uma região nomeada navegável por leitores de tela.
    <section
      aria-labelledby={title ? titleId : undefined}
      className={cx('rounded-lg border border-border bg-surface', className)}
    >
      {title ? (
        <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-text">
            {title}
          </h2>
          {action}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  )
}
