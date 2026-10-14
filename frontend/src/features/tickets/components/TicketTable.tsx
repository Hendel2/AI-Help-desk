import { Link } from 'react-router'

import { Skeleton } from '@/components/ui/Skeleton'
import { cx, FOCUS_RING } from '@/components/ui/styles'
import { formatDateTime, formatRelative } from '@/utils/format'

import type { TicketListItem } from '../types'
import { SLAIndicator } from './SLAIndicator'
import { SLALine } from './SLALine'
import { PriorityBadge, StatusBadge } from './TicketBadges'

interface TicketTableProps {
  tickets: TicketListItem[]
  /** Mostra o solicitante (visão da equipe) em vez do técnico. */
  showRequester?: boolean
}

const LINK_CLASS = cx('rounded-sm font-medium text-text hover:text-primary', FOCUS_RING)

/**
 * Listagem de chamados (§42). Tabela semântica a partir de `md`; abaixo disso,
 * lista empilhada — a tabela não é simplesmente espremida (§53).
 */
export function TicketTable({ tickets, showRequester = false }: TicketTableProps) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Chamados</caption>
          <thead className="border-b border-border text-xs text-secondary">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Chamado</th>
              <th scope="col" className="px-4 py-3 font-medium">Prioridade</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">SLA</th>
              <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">
                {showRequester ? 'Solicitante' : 'Técnico'}
              </th>
              <th scope="col" className="hidden px-4 py-3 font-medium xl:table-cell">
                Atualizado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tickets.map((ticket) => (
              <tr key={ticket.id} className="transition-colors hover:bg-background">
                <td className="max-w-md px-4 py-3">
                  <span className="block text-xs text-secondary tabular-nums">
                    {ticket.ticket_number}
                  </span>
                  <Link to={`/chamados/${ticket.id}`} className={cx(LINK_CLASS, 'line-clamp-1')}>
                    {ticket.title}
                  </Link>
                  {ticket.category ? (
                    <span className="block text-xs text-secondary">{ticket.category.name}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <PriorityBadge priority={ticket.priority} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={ticket.status} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <SLAIndicator sla={ticket.sla} status={ticket.status} />
                  <SLALine
                    sla={ticket.sla}
                    status={ticket.status}
                    createdAt={ticket.created_at}
                    className="mt-1.5 w-28"
                  />
                </td>
                <td className="hidden px-4 py-3 text-secondary lg:table-cell">
                  {showRequester
                    ? ticket.requester.name
                    : (ticket.technician?.name ?? 'Não atribuído')}
                </td>
                <td className="hidden px-4 py-3 whitespace-nowrap text-secondary xl:table-cell">
                  <time dateTime={ticket.updated_at} title={formatDateTime(ticket.updated_at)}>
                    {formatRelative(ticket.updated_at)}
                  </time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border bg-surface md:hidden">
        {tickets.map((ticket) => (
          <li key={ticket.id} className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-secondary tabular-nums">{ticket.ticket_number}</span>
              <SLAIndicator sla={ticket.sla} status={ticket.status} className="text-xs" />
            </div>
            <SLALine sla={ticket.sla} status={ticket.status} createdAt={ticket.created_at} />
            <Link to={`/chamados/${ticket.id}`} className={cx(LINK_CLASS, 'block')}>
              {ticket.title}
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
            </div>
            <p className="flex flex-wrap justify-between gap-x-3 text-xs text-secondary">
              <span>
                {showRequester
                  ? ticket.requester.name
                  : (ticket.technician?.name ?? 'Não atribuído')}
              </span>
              <time dateTime={ticket.updated_at}>{formatRelative(ticket.updated_at)}</time>
            </p>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Esqueleto com o formato da tabela (skill frontend-design: loading com a forma do conteúdo). */
export function TicketTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      aria-busy="true"
      className="divide-y divide-border rounded-lg border border-border bg-surface"
    >
      <span className="sr-only">Carregando chamados…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Skeleton className="hidden h-5 w-16 md:block" />
          <Skeleton className="hidden h-5 w-24 md:block" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  )
}
