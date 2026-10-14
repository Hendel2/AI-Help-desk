import type { ReactNode } from 'react'

import { cx } from './styles'

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

/**
 * Etiqueta neutra com ponto colorido: o tom vive no ponto, não no fundo — numa
 * tabela, fundos coloridos em toda linha diluem o sinal. Só `danger` ganha fundo
 * (o que é crítico precisa saltar aos olhos). O texto fica sempre em `text-text`.
 */
const NEUTRAL = { border: 'border-border', background: 'bg-surface' }
const TONES: Record<BadgeTone, { border: string; background: string; dot: string }> = {
  neutral: { ...NEUTRAL, dot: 'bg-secondary' },
  info: { ...NEUTRAL, dot: 'bg-primary' },
  success: { ...NEUTRAL, dot: 'bg-success' },
  warning: { ...NEUTRAL, dot: 'bg-warning' },
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
        'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-text',
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
