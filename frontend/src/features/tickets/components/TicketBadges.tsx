import { Badge } from '@/components/ui/Badge'

import { PRIORITY_LABELS, PRIORITY_TONES, STATUS_LABELS, STATUS_TONES } from '../labels'
import type { TicketPriority, TicketStatus } from '../types'

/** Status do chamado com rótulo pt-BR e cor do mapa único (§16). */
export function StatusBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>
}

/** Prioridade do chamado (§16: Baixa, Média, Alta, Crítica). */
export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <Badge tone={PRIORITY_TONES[priority]}>
      <span className="sr-only">Prioridade </span>
      {PRIORITY_LABELS[priority]}
    </Badge>
  )
}
