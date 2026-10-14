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

export type SLAProgressTone = 'neutral' | 'warning' | 'danger'

/** Quanto de um relógio de SLA já foi consumido (0 a 1); `null` se já foi cumprido. */
export function clockProgress(
  clock: SLAClock,
  createdAt: string,
  now: number = Date.now(),
): { fraction: number; tone: SLAProgressTone } | null {
  if (!clock.deadline || clock.completed_at) return null
  const start = Date.parse(createdAt)
  const end = Date.parse(clock.deadline)
  const total = end - start
  if (!Number.isFinite(total) || total <= 0) return null
  // O servidor já mandou o tempo restante; sem ele, calcula pelo relógio local.
  const remainingMs =
    clock.remaining_seconds !== null ? clock.remaining_seconds * 1000 : end - now
  const fraction = Math.min(1, Math.max(0, 1 - remainingMs / total))
  const tone: SLAProgressTone =
    clock.status === 'BREACHED' || remainingMs < 0
      ? 'danger'
      : clock.status === 'WARNING'
        ? 'warning'
        : 'neutral'
  return { fraction, tone }
}

/**
 * Progresso do prazo que importa agora (linha de prazo da listagem).
 * `null` quando não há prazo correndo (sem SLA ou chamado encerrado).
 */
export function slaProgress(
  sla: TicketSLA,
  status: TicketStatus,
  createdAt: string,
  now: number = Date.now(),
): { fraction: number; tone: SLAProgressTone } | null {
  if (sla.status === null || FINAL_STATUSES.has(status)) return null
  return clockProgress(getActiveClock(sla).clock, createdAt, now)
}
