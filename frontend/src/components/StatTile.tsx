import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/styles'

export type StatTone = 'neutral' | 'success' | 'warning' | 'danger'

/** Quadrado do ícone: azul no neutro; cor de estado só quando há sinal. */
const ICON_TONES: Record<StatTone, string> = {
  neutral: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

export interface StatTileProps {
  label: string
  /** Valor já formatado (ex.: "12", "4h 20min", "92%"). `null` = sem dados. */
  value: string | null
  /** Contexto curto sob o rótulo (ex.: "nos últimos 30 dias"). */
  caption?: string
  icon?: LucideIcon
  /** Estado de alerta: cor no ícone + texto do rótulo/legenda, nunca só cor. */
  tone?: StatTone
  isLoading?: boolean
  className?: string
}

/** Indicador numérico: um número é métrica, não gráfico (skill dataviz). */
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
    <div
      className={cx(
        'flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5',
        className,
      )}
    >
      {Icon ? (
        <span
          aria-hidden="true"
          className={cx('flex size-9 items-center justify-center rounded-lg', ICON_TONES[tone])}
        >
          <Icon className="size-4.5" />
        </span>
      ) : null}
      <div className="min-w-0">
        {isLoading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-2xl font-bold tracking-tight text-text sm:text-3xl">{value ?? '—'}</p>
        )}
        <p className="mt-1 text-sm font-medium text-secondary">{label}</p>
        {caption ? <p className="mt-0.5 text-xs text-secondary">{caption}</p> : null}
      </div>
    </div>
  )
}

/**
 * Faixa de indicadores: os blocos ficam num poço rebaixado, que os agrupa
 * visualmente sem precisar de título em cada um.
 */
export function StatGroup({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    // @container: as colunas seguem a largura disponível (com ou sem a coluna lateral).
    <section aria-label={label} className={cx('@container', className)}>
      <div className="grid grid-cols-1 gap-2 rounded-2xl border border-border bg-surface-sunken p-2 @md:grid-cols-2 @md:gap-3 @md:p-3 @2xl:grid-cols-4">
        {children}
      </div>
    </section>
  )
}
