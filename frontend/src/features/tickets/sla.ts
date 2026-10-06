import type { SLAClock, TicketSLA, TicketStatus } from './types'

/** Status em que o chamado não corre mais prazo. */
export const FINAL_STATUSES: ReadonlySet<TicketStatus> = new Set(['RESOLVED', 'CLOSED', 'CANCELLED'])

/** Prazo que importa agora: resposta enquanto não houve, depois a resolução. */
export function getActiveClock(sla: TicketSLA): { kind: 'response' | 'resolution'; clock: SLAClock } {
  if (sla.response.deadline && !sla.response.completed_at) {
    return { kind: 'response', clock: sla.response }
  }
  return { kind: 'resolution', clock: sla.resolution }
}
