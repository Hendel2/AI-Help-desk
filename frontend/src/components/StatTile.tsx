import type { LucideIcon } from 'lucide-react'

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
    <div className={cx('rounded-lg border border-border bg-surface p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-secondary">{label}</p>
        {Icon ? <Icon aria-hidden="true" className={cx('size-4', ICON_TONES[tone])} /> : null}
      </div>
      {isLoading ? (
        <Skeleton className="mt-2 h-8 w-16" />
      ) : (
        <p className="mt-1 text-2xl font-semibold text-text tabular-nums">{value ?? '—'}</p>
      )}
      {caption ? <p className="mt-1 text-xs text-secondary">{caption}</p> : null}
    </div>
  )
}
