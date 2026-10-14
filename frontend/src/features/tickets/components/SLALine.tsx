import { cx } from '@/components/ui/styles'

import { clockProgress, slaProgress } from '../sla'
import type { SLAProgressTone } from '../sla'
import type { SLAClock, TicketSLA, TicketStatus } from '../types'

// Preenchimento = gravidade; trilho = tom suave do mesmo estado (lê o estado na barra inteira).
// No prazo a linha é neutra: cor só aparece quando há risco.
const TONES: Record<SLAProgressTone, { track: string; fill: string }> = {
  neutral: { track: 'bg-border', fill: 'bg-secondary' },
  warning: { track: 'bg-warning-soft', fill: 'bg-warning' },
  danger: { track: 'bg-danger-soft', fill: 'bg-danger' },
}

type SLALineProps = {
  createdAt: string
  className?: string
} & (
  | { sla: TicketSLA; status: TicketStatus; clock?: never }
  | { clock: SLAClock; sla?: never; status?: never }
)

/**
 * Linha de prazo: quanto do SLA ativo o chamado já consumiu. É reforço visual
 * do texto ao lado (SLAIndicator), por isso fica oculta de leitores de tela.
 */
export function SLALine({ sla, status, clock, createdAt, className }: SLALineProps) {
  // Um relógio específico (detalhe do chamado) ou o prazo ativo (listagem).
  const progress = clock
    ? clockProgress(clock, createdAt)
    : slaProgress(sla, status, createdAt)
  if (!progress) return null
  return (
    <span
      aria-hidden="true"
      className={cx('block h-1 overflow-hidden rounded-full', TONES[progress.tone].track, className)}
    >
      <span
        className={cx('block h-full rounded-full', TONES[progress.tone].fill)}
        style={{ width: `${Math.max(progress.fraction * 100, 4)}%` }}
      />
    </span>
  )
}
