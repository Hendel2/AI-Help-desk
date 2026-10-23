import { ArrowUpRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { Skeleton } from '@/components/ui/Skeleton'
import { cx, FOCUS_RING } from '@/components/ui/styles'

export type StatTone = 'neutral' | 'success' | 'warning' | 'danger'

/** Canhoto (coluna do ícone): violeta no neutro; cor de estado só quando há sinal. */
const STUB_TONES: Record<StatTone, string> = {
  neutral: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

const METER_TONES: Record<StatTone, string> = {
  neutral: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

export interface StatTileProps {
  label: string
  /** Valor já formatado (ex.: "12", "4h 20min", "92%"). `null` = sem dados. */
  value: string | null
  /** Contexto curto sob o rótulo (ex.: "nos últimos 30 dias"). */
  caption?: string
  icon?: LucideIcon
  /** Estado de alerta: cor no canhoto + texto do rótulo/legenda, nunca só cor. */
  tone?: StatTone
  /** Percentual (0–100) desenhado numa régua sob o número; o valor em texto já o diz. */
  meter?: number | null
  /** Leva à tela que resolve (ex.: lista já filtrada). */
  to?: string
  isLoading?: boolean
  className?: string
}

/**
 * Indicador numérico em forma de canhoto de chamado: a coluna do ícone, o
 * picote tracejado e os dois recortes (`stub`). Um número é métrica, não
 * gráfico (skill dataviz).
 */
export function StatTile({
  label,
  value,
  caption,
  icon: Icon,
  tone = 'neutral',
  meter,
  to,
  isLoading = false,
  className,
}: StatTileProps) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className={cx('flex w-17 shrink-0 items-center justify-center', STUB_TONES[tone])}
      >
        {Icon ? <Icon className="size-5" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 border-l-2 border-dashed border-border px-4 py-3.5">
        {isLoading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <span className="font-display text-3xl leading-none font-semibold tracking-tight text-text tabular-nums">
            {value ?? '—'}
          </span>
        )}
        <span className="text-sm font-medium text-text">{label}</span>
        {caption ? <span className="text-xs text-secondary">{caption}</span> : null}
        {meter != null && !isLoading ? (
          <span
            aria-hidden="true"
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken"
          >
            <span
              className={cx('block h-full rounded-full', METER_TONES[tone])}
              style={{ width: `${Math.max(0, Math.min(100, meter))}%` }}
            />
          </span>
        ) : null}
      </span>
      {to ? (
        <ArrowUpRight
          aria-hidden="true"
          className="absolute top-3 right-3 size-4 text-secondary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-text"
        />
      ) : null}
    </>
  )

  const shape =
    'stub relative flex h-full min-h-28 overflow-hidden rounded-2xl border border-border bg-surface'

  if (to) {
    // A máscara dos recortes cortaria o anel de foco: o foco fica no link, por fora do canhoto.
    return (
      <Link
        to={to}
        aria-label={`${label}: ${value ?? '…'}${caption ? ` (${caption})` : ''}`}
        className={cx('group block rounded-2xl', FOCUS_RING, className)}
      >
        <span className={cx(shape, 'transition-colors group-hover:border-border-strong')}>
          {body}
        </span>
      </Link>
    )
  }
  return <div className={cx(shape, className)}>{body}</div>
}

/** Faixa de indicadores: canhotos lado a lado conforme a largura disponível. */
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
      <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @4xl:grid-cols-4">{children}</div>
    </section>
  )
}
