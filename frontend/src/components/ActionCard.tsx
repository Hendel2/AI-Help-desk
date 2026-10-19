import { ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'

import { Skeleton } from '@/components/ui/Skeleton'
import { cx, FOCUS_RING } from '@/components/ui/styles'

export type ActionTone = 'primary' | 'neutral' | 'success' | 'warning' | 'danger'

/** Borda, ícone e título levam a cor do estado; o subtítulo explica em texto. */
const TONES: Record<ActionTone, { border: string; icon: string; title: string }> = {
  primary: {
    border: 'border-l-primary',
    icon: 'border-primary text-primary',
    title: 'text-primary',
  },
  neutral: {
    border: 'border-l-border-strong',
    icon: 'border-border-strong text-secondary',
    title: 'text-text',
  },
  success: {
    border: 'border-l-success',
    icon: 'border-success text-success',
    title: 'text-success',
  },
  warning: {
    border: 'border-l-warning',
    icon: 'border-warning text-warning',
    title: 'text-warning',
  },
  danger: { border: 'border-l-danger', icon: 'border-danger text-danger', title: 'text-danger' },
}

interface ActionCardProps {
  to: string
  title: string
  /** Situação em texto (ex.: "2 chamados precisam de você"). `null` = carregando. */
  description: string | null
  icon: LucideIcon
  tone?: ActionTone
  className?: string
}

/** Atalho com situação: leva à tela onde a pessoa resolve o que o card descreve. */
export function ActionCard({
  to,
  title,
  description,
  icon: Icon,
  tone = 'neutral',
  className,
}: ActionCardProps) {
  const styles = TONES[tone]
  return (
    <Link
      to={to}
      className={cx(
        'group flex items-center gap-4 rounded-xl border border-l-4 border-border bg-surface p-4 shadow-card transition-colors hover:bg-surface-hover sm:p-5',
        styles.border,
        FOCUS_RING,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'flex size-11 shrink-0 items-center justify-center rounded-full border-2',
          styles.icon,
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block text-sm font-bold', styles.title)}>{title}</span>
        {description === null ? (
          <Skeleton className="mt-1.5 h-3.5 w-32" />
        ) : (
          // Sobre o fundo de hover, o texto de apoio passa para `text-text` (contraste).
          <span className="mt-0.5 block text-sm text-secondary group-hover:text-text">
            {description}
          </span>
        )}
      </span>
      <ChevronRight
        aria-hidden="true"
        className="size-5 shrink-0 text-secondary transition-transform group-hover:translate-x-0.5 group-hover:text-text motion-reduce:transition-none"
      />
    </Link>
  )
}
