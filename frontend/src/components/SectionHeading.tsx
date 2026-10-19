import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { cx, FOCUS_RING } from '@/components/ui/styles'

interface SectionHeadingProps {
  /** Id do título, para a seção usar em `aria-labelledby`. */
  id: string
  title: string
  /** Ação à direita (ex.: `<SeeAllLink>`, filtro de período). */
  action?: ReactNode
  className?: string
}

/** Título de seção fora de card (ex.: "Situação", "Indicadores" no início). */
export function SectionHeading({ id, title, action, className }: SectionHeadingProps) {
  return (
    <div className={cx('flex flex-wrap items-end justify-between gap-3', className)}>
      <h2 id={id} className="text-lg font-bold tracking-tight text-text">
        {title}
      </h2>
      {action}
    </div>
  )
}

interface SeeAllLinkProps {
  to: string
  /** Texto visível curto; `label` completa o nome para leitores de tela. */
  children?: string
  label?: string
}

/** Link "Ver tudo" de cabeçalhos de seção e de cards. */
export function SeeAllLink({ to, children = 'Ver tudo', label }: SeeAllLinkProps) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={cx(
        'inline-flex items-center gap-0.5 rounded-md text-sm font-semibold text-primary hover:underline',
        FOCUS_RING,
      )}
    >
      {children}
      <ChevronRight aria-hidden="true" className="size-4" />
    </Link>
  )
}
