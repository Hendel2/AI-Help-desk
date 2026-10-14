import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/styles'

export type StatTone = 'neutral' | 'warning' | 'danger'

const ICON_TONES: Record<StatTone, string> = {
  neutral: 'text-secondary',
  warning: 'text-warning',
  danger: 'text-danger',
}

export interface StatTileProps {
  label: string
  /** Valor já formatado (ex.: "12", "4h 20min", "92%"). `null` = sem dados. */
  value: string | null
  /** Contexto curto sob o número (ex.: "nos últimos 30 dias"). */
  caption?: string
  icon?: LucideIcon
  /** Estado de alerta: ícone colorido + texto, nunca só cor. */
  tone?: StatTone
  isLoading?: boolean
  className?: string
}

/** Indicador numérico do dashboard: um número é métrica, não gráfico (skill dataviz). */
export function StatTile({
  label,
  value,
  caption,
  icon: Icon,
  tone = 'neutral',
  isLoading = false,
  className,
}: StatTileProps) {
  return (
    <div className={cx('bg-surface px-4 py-4 sm:px-5', className)}>
      <div className="flex items-center gap-1.5">
        {Icon && tone !== 'neutral' ? (
          <Icon aria-hidden="true" className={cx('size-4', ICON_TONES[tone])} />
        ) : null}
        <p className="text-sm text-secondary">{label}</p>
      </div>
      {isLoading ? (
        <Skeleton className="mt-2 h-8 w-16" />
      ) : (
        // Algarismos proporcionais: tabular só em colunas que precisam alinhar (skill dataviz).
        <p className="mt-1.5 text-2xl font-semibold tracking-tight text-text">
          {value ?? '—'}
        </p>
      )}
      {caption ? <p className="mt-0.5 text-xs text-secondary">{caption}</p> : null}
    </div>
  )
}

/**
 * Faixa de métricas: um único contêiner com divisórias finas entre as células
 * (o `gap-px` deixa a cor da borda aparecer), em vez de uma grade de cards.
 */
export function StatGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      aria-label={label}
      className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4"
    >
      {children}
    </section>
  )
}
