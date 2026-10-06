import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react'

import { cx } from '@/components/ui/styles'
import { formatDuration } from '@/utils/format'

import { FINAL_STATUSES, getActiveClock } from '../sla'
import type { TicketSLA, TicketStatus } from '../types'

interface SLAIndicatorProps {
  sla: TicketSLA
  status: TicketStatus
  className?: string
}

/**
 * SLA compacto da listagem (§42) — cor + ícone + texto, nunca só cor (§21:
 * "próximo do vencimento" precisa saltar aos olhos).
 */
export function SLAIndicator({ sla, status, className }: SLAIndicatorProps) {
  const base = cx('inline-flex items-center gap-1.5 text-sm tabular-nums', className)

  if (sla.status === null) {
    return <span className={cx(base, 'text-secondary')}>Sem SLA</span>
  }

  if (FINAL_STATUSES.has(status)) {
    const breached = sla.status === 'BREACHED'
    return (
      <span className={cx(base, 'text-text')}>
        {breached ? (
          <XCircle aria-hidden="true" className="size-4 text-danger" />
        ) : (
          <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
        )}
        {breached ? 'Fora do prazo' : 'Cumprido'}
      </span>
    )
  }

  const { kind, clock } = getActiveClock(sla)
  const remaining = clock.remaining_seconds ?? 0
  const label = kind === 'response' ? 'resposta' : 'resolução'

  if (clock.status === 'BREACHED' || remaining < 0) {
    return (
      <span className={cx(base, 'font-medium text-danger')}>
        <XCircle aria-hidden="true" className="size-4" />
        <span>
          Vencido há {formatDuration(remaining)}
          <span className="sr-only"> (prazo de {label})</span>
        </span>
      </span>
    )
  }

  const warning = clock.status === 'WARNING'
  return (
    <span className={cx(base, warning ? 'font-medium text-text' : 'text-text')}>
      {warning ? (
        <AlertTriangle aria-hidden="true" className="size-4 text-warning" />
      ) : (
        <Clock aria-hidden="true" className="size-4 text-secondary" />
      )}
      <span>
        {formatDuration(remaining)}
        <span className="sr-only">
          {' '}
          restantes para a {label}
          {warning ? ', próximo do vencimento' : ''}
        </span>
      </span>
    </span>
  )
}
