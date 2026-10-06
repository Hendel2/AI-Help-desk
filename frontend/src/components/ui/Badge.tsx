import type { ReactNode } from 'react'

import { cx } from './styles'

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

/**
 * Fundo suave + ponto colorido. O texto fica em `text-text` porque Success e
 * Warning não alcançam contraste 4.5:1 sobre branco (§35 / skill accessibility).
 */
const TONES: Record<BadgeTone, { border: string; background: string; dot: string }> = {
  neutral: { border: 'border-border', background: 'bg-surface-hover', dot: 'bg-secondary' },
  info: { border: 'border-primary/30', background: 'bg-primary-soft', dot: 'bg-primary' },
  success: { border: 'border-success/30', background: 'bg-success-soft', dot: 'bg-success' },
  warning: { border: 'border-warning/30', background: 'bg-warning-soft', dot: 'bg-warning' },
  danger: { border: 'border-danger/30', background: 'bg-danger-soft', dot: 'bg-danger' },
}

export interface BadgeProps {
  tone?: BadgeTone
  /** Oculta o ponto quando o rótulo já carrega a cor por outro meio. */
  withDot?: boolean
  className?: string
  children: ReactNode
}

/** Base visual de StatusBadge e PriorityBadge (etapa 08). */
export function Badge({ tone = 'neutral', withDot = true, className, children }: BadgeProps) {
  const { border, background, dot } = TONES[tone]

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium text-text',
        border,
        background,
        className,
      )}
    >
      {withDot ? <span aria-hidden="true" className={cx('size-1.5 rounded-full', dot)} /> : null}
      {children}
    </span>
  )
}
