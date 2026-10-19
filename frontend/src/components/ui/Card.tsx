import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useId } from 'react'

import { cx } from './styles'

export interface CardProps {
  /** Título da seção; renderiza o cabeçalho do bloco quando informado. */
  title?: string
  /** Ícone ao lado do título (decorativo: o título já nomeia a seção). */
  icon?: LucideIcon
  /** Ação no canto do cabeçalho (ex.: link "Ver tudo"). */
  action?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * Bloco de superfície com contorno e sombra discreta: painéis com título,
 * métricas e itens de lista no mobile. Nunca card dentro de card, nem card
 * para envolver a página inteira.
 */
export function Card({ title, icon: Icon, action, className, children }: CardProps) {
  const titleId = useId()
  return (
    // Com título, a seção vira uma região nomeada navegável por leitores de tela.
    <section
      aria-labelledby={title ? titleId : undefined}
      className={cx('rounded-xl border border-border bg-surface shadow-card', className)}
    >
      {title ? (
        <header className="flex min-h-14 items-center justify-between gap-4 px-4 pt-4 sm:px-5">
          <h2
            id={titleId}
            className="flex items-center gap-2 text-base font-bold tracking-tight text-text"
          >
            {Icon ? <Icon aria-hidden="true" className="size-4.5 shrink-0 text-primary" /> : null}
            {title}
          </h2>
          {action}
        </header>
      ) : null}
      <div className={cx('px-4 pb-4 sm:px-5 sm:pb-5', title ? 'pt-2' : 'pt-4 sm:pt-5')}>
        {children}
      </div>
    </section>
  )
}
