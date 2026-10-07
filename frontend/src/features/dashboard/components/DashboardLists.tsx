import { Link } from 'react-router'

import { EmptyState } from '@/components/EmptyState'
import { cx, FOCUS_RING } from '@/components/ui/styles'
import { PriorityBadge, StatusBadge } from '@/features/tickets/components/TicketBadges'
import { formatHistoryValue, HISTORY_LABELS } from '@/features/tickets/labels'
import { formatDateTime, formatMinutes, formatRelative } from '@/utils/format'

import type { ActivityItem, RecentTicket, TechnicianPerformance } from '../types'

const LINK = cx('rounded-sm font-medium text-text hover:text-primary', FOCUS_RING)

/** Chamados atualizados recentemente (§39/§40). */
export function RecentTicketsList({ tickets }: { tickets: RecentTicket[] }) {
  if (tickets.length === 0) {
    return <EmptyState title="Nenhum chamado ainda." className="py-6" />
  }
  return (
    <ul className="-my-2 divide-y divide-border">
      {tickets.map((ticket) => (
        <li key={ticket.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 flex-1">
            <span className="text-xs text-secondary tabular-nums">{ticket.ticket_number}</span>
            <Link to={`/chamados/${ticket.id}`} className={cx(LINK, 'block truncate text-sm')}>
              {ticket.title}
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <time
              dateTime={ticket.updated_at}
              title={formatDateTime(ticket.updated_at)}
              className="text-xs text-secondary"
            >
              {formatRelative(ticket.updated_at)}
            </time>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Atividade recente nos chamados da empresa (§40). */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="Nenhuma atividade recente." className="py-6" />
  }
  return (
    <ol className="space-y-3">
      {items.map((item) => {
        const newValue = formatHistoryValue(item.field, item.new_value)
        return (
          <li key={item.id} className="text-sm">
            <p className="text-text">
              <span className="font-medium">{item.user?.name ?? 'Sistema'}</span>{' '}
              {HISTORY_LABELS[item.action]}
              {newValue && item.field === 'status' ? (
                <span className="text-secondary">: {newValue}</span>
              ) : null}{' '}
              em{' '}
              <Link to={`/chamados/${item.ticket_id}`} className={cx(LINK, 'tabular-nums')}>
                {item.ticket_number}
              </Link>
            </p>
            <time dateTime={item.created_at} className="text-xs text-secondary">
              {formatRelative(item.created_at)}
            </time>
          </li>
        )
      })}
    </ol>
  )
}

/** Desempenho dos técnicos (§41) — números por pessoa: tabela, não gráfico. */
export function TechnicianTable({ rows }: { rows: TechnicianPerformance[] }) {
  if (rows.length === 0) {
    return <EmptyState title="Nenhum chamado resolvido no período." className="py-6" />
  }
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Desempenho dos técnicos no período</caption>
        <thead className="text-xs text-secondary">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">Técnico</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Resolvidos</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Tempo médio</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Satisfação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.technician.id}>
              <th scope="row" className="px-4 py-2 font-medium text-text">
                {row.technician.name}
              </th>
              <td className="px-4 py-2 text-right text-text tabular-nums">{row.resolved}</td>
              <td className="px-4 py-2 text-right text-text tabular-nums">
                {row.avg_resolution_minutes === null ? '—' : formatMinutes(row.avg_resolution_minutes)}
              </td>
              <td className="px-4 py-2 text-right text-text tabular-nums">
                {row.satisfaction_avg === null ? '—' : `${row.satisfaction_avg.toFixed(1).replace('.', ',')} / 5`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
