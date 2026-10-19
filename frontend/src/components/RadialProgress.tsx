import { Skeleton } from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/styles'

export type RadialTone = 'primary' | 'success' | 'warning'

const TONES: Record<RadialTone, string> = {
  primary: 'stroke-primary',
  success: 'stroke-success',
  warning: 'stroke-warning',
}

interface RadialProgressProps {
  /** 0–100; `null` = sem dados (anel vazio e "—"). */
  value: number | null
  /** O que o percentual mede, sob o anel (ex.: "resolvidos no prazo"). */
  label: string
  tone?: RadialTone
  isLoading?: boolean
  className?: string
}

const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Bloco com anel de progresso: um percentual com contexto (o texto carrega o valor). */
export function RadialProgress({
  value,
  label,
  tone = 'primary',
  isLoading = false,
  className,
}: RadialProgressProps) {
  const clamped = value === null ? 0 : Math.min(100, Math.max(0, value))
  const text = value === null ? '—' : `${Math.round(clamped)}%`

  return (
    <div
      className={cx(
        'flex items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5 @2xl:flex-col @2xl:justify-center @2xl:text-center',
        className,
      )}
    >
      {isLoading ? (
        <Skeleton className="size-24 shrink-0 rounded-full" />
      ) : (
        <div className="relative size-24 shrink-0">
          <svg viewBox="0 0 100 100" aria-hidden="true" className="size-full -rotate-90">
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              strokeWidth="9"
              className="stroke-border"
            />
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - clamped / 100)}
              className={cx(
                TONES[tone],
                'transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none',
              )}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xl font-bold tracking-tight text-text">
            {text}
          </span>
        </div>
      )}
      <p className="text-sm font-medium text-secondary">{label}</p>
    </div>
  )
}
