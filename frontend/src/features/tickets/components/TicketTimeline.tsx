import { ErrorState } from '@/components/ErrorState'
import { SkeletonText } from '@/components/ui/Skeleton'
import { getErrorMessage } from '@/services/api/errors'
import { formatDateTime, formatRelative } from '@/utils/format'

import { useTicketHistory } from '../hooks/useTickets'
import { formatHistoryValue, HISTORY_LABELS } from '../labels'
import type { TicketHistoryEntry } from '../types'

/** Linha do tempo do chamado (§20): quem fez o quê e quando. */
export function TicketTimeline({ ticketId }: { ticketId: number }) {
  const history = useTicketHistory(ticketId)

  if (history.isPending) return <SkeletonText lines={4} />
  if (history.isError) {
    return (
      <ErrorState
        title="Não foi possível carregar o histórico."
        description={getErrorMessage(history.error)}
        onRetry={() => void history.refetch()}
        isRetrying={history.isFetching}
      />
    )
  }

  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {history.data.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            aria-hidden="true"
            className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full border-2 border-surface bg-secondary"
          />
          <p className="text-sm text-text">
            <span className="font-medium">{entry.user?.name ?? 'Sistema'}</span>{' '}
            {HISTORY_LABELS[entry.action]}
            <HistoryChange entry={entry} />
          </p>
          <time
            dateTime={entry.created_at}
            title={formatDateTime(entry.created_at)}
            className="text-xs text-secondary"
          >
            {formatRelative(entry.created_at)}
          </time>
        </li>
      ))}
    </ol>
  )
}

function HistoryChange({ entry }: { entry: TicketHistoryEntry }) {
  const oldValue = formatHistoryValue(entry.field, entry.old_value)
  const newValue = formatHistoryValue(entry.field, entry.new_value)
  if (!newValue) return null
  return (
    <span className="text-secondary">
      {': '}
      {oldValue ? (
        <>
          <span className="text-text">{oldValue}</span> →{' '}
        </>
      ) : null}
      <span className="text-text">{newValue}</span>
    </span>
  )
}
