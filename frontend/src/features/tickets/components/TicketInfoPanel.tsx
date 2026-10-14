import type { ReactNode } from 'react'

import { Card } from '@/components/ui/Card'
import { formatDateTime, formatDuration } from '@/utils/format'

import { SLA_LABELS, SOURCE_LABELS } from '../labels'
import type { SLAClock, Ticket } from '../types'
import { SLAIndicator } from './SLAIndicator'
import { SLALine } from './SLALine'
import { PriorityBadge, StatusBadge } from './TicketBadges'

/** Painel "Informações" do detalhe do chamado (§43). */
export function TicketInfoPanel({ ticket }: { ticket: Ticket }) {
  return (
    <Card title="Informações">
      <dl className="space-y-3 text-sm">
        <Row label="Status">
          <StatusBadge status={ticket.status} />
        </Row>
        <Row label="Prioridade">
          <PriorityBadge priority={ticket.priority} />
        </Row>
        <Row label="Solicitante">{ticket.requester.name}</Row>
        <Row label="Técnico">
          {ticket.technician?.name ?? <span className="text-secondary">Não atribuído</span>}
        </Row>
        <Row label="Categoria">
          {ticket.category?.name ?? <span className="text-secondary">Sem categoria</span>}
        </Row>
        <Row label="Origem">{SOURCE_LABELS[ticket.source]}</Row>
        <Row label="Aberto em">
          <time dateTime={ticket.created_at}>{formatDateTime(ticket.created_at)}</time>
        </Row>
      </dl>

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-text">SLA</h3>
          <SLAIndicator sla={ticket.sla} status={ticket.status} />
        </div>
        {ticket.sla.status === null ? (
          <p className="text-xs text-secondary">
            Nenhuma política de SLA se aplica a este chamado.
          </p>
        ) : (
          <dl className="space-y-2 text-sm">
            <ClockRow
              label="Primeira resposta"
              clock={ticket.sla.response}
              createdAt={ticket.created_at}
            />
            <ClockRow
              label="Resolução"
              clock={ticket.sla.resolution}
              createdAt={ticket.created_at}
            />
          </dl>
        )}
      </div>
    </Card>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-secondary">{label}</dt>
      <dd className="text-right font-medium text-text">{children}</dd>
    </div>
  )
}

function ClockRow({
  label,
  clock,
  createdAt,
}: {
  label: string
  clock: SLAClock
  createdAt: string
}) {
  if (!clock.deadline) return null
  const remaining = clock.remaining_seconds ?? 0

  let detail: string
  if (clock.completed_at) {
    detail = clock.status === 'BREACHED' ? 'Cumprido com atraso' : 'Cumprido no prazo'
  } else if (remaining < 0) {
    detail = `Vencido há ${formatDuration(remaining)}`
  } else {
    detail = `${formatDuration(remaining)} restantes`
  }

  return (
    // Um único nível de <div> entre <dl> e dt/dd (exigência do HTML para listas de definição).
    <div className="flex items-start justify-between gap-3">
      <dt className="text-secondary">{label}</dt>
      <dd className="min-w-0 flex-1 text-right">
        <span className="block font-medium text-text">{detail}</span>
        <SLALine clock={clock} createdAt={createdAt} className="mt-1.5 ml-auto w-full max-w-40" />
        <span className="mt-1 block text-xs text-secondary">
          Prazo <time dateTime={clock.deadline}>{formatDateTime(clock.deadline)}</time>
          {/* O estado só é escrito quando há risco; no prazo, a linha neutra já diz tudo. */}
          {clock.status && clock.status !== 'ON_TIME' && !clock.completed_at
            ? ` (${SLA_LABELS[clock.status].toLowerCase()})`
            : ''}
        </span>
      </dd>
    </div>
  )
}
