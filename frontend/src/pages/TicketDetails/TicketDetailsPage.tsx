import { ArrowLeft } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router'

import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { cx, FOCUS_RING } from '@/components/ui/styles'
import { Tabs } from '@/components/ui/Tabs'
import { CopilotPanel } from '@/features/ai/components/CopilotPanel'
import { useAuth } from '@/features/auth/useAuth'
import { TicketActions } from '@/features/tickets/components/TicketActions'
import { TicketAttachments } from '@/features/tickets/components/TicketAttachments'
import { PriorityBadge, StatusBadge } from '@/features/tickets/components/TicketBadges'
import { TicketConversation } from '@/features/tickets/components/TicketConversation'
import { TicketInfoPanel } from '@/features/tickets/components/TicketInfoPanel'
import { TicketTimeline } from '@/features/tickets/components/TicketTimeline'
import { useTicket } from '@/features/tickets/hooks/useTickets'
import { getErrorMessage, isApiError } from '@/services/api/errors'

const CLOSED_STATUSES = new Set(['CLOSED', 'CANCELLED'])

/** Detalhe do chamado (§43): conversa à esquerda, informações e ações à direita. */
export function TicketDetailsPage() {
  const { ticketId } = useParams()
  const id = Number(ticketId)
  const ticket = useTicket(id)
  const { hasRole } = useAuth()
  const isStaff = hasRole('TECHNICIAN', 'ADMIN')
  const [activeTab, setActiveTab] = useState('conversa')
  const [insertText, setInsertText] = useState<string | null>(null)
  const clearInsert = useCallback(() => setInsertText(null), [])

  const backLink = (
    <Link
      to={isStaff ? '/chamados' : '/chamados/meus'}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-sm text-sm text-secondary hover:text-text',
        FOCUS_RING,
      )}
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Voltar para chamados
    </Link>
  )

  if (!Number.isInteger(id) || id <= 0 || (ticket.isError && isApiError(ticket.error) && ticket.error.status === 404)) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {backLink}
        <ErrorState
          title="Chamado não encontrado."
          description="Ele não existe ou você não tem acesso a ele."
        />
      </div>
    )
  }

  if (ticket.isPending) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6" aria-busy="true">
        <span className="sr-only">Carregando chamado…</span>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-2/3" />
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <SkeletonText lines={6} />
          <SkeletonText lines={8} />
        </div>
      </div>
    )
  }

  if (ticket.isError) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {backLink}
        <ErrorState
          title="Não foi possível carregar o chamado."
          description={getErrorMessage(ticket.error)}
          onRetry={() => void ticket.refetch()}
          isRetrying={ticket.isFetching}
        />
      </div>
    )
  }

  const data = ticket.data

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {backLink}
      <PageHeader
        meta={<p className="text-sm text-secondary tabular-nums">{data.ticket_number}</p>}
        title={data.title}
        description={
          <span className="flex flex-wrap gap-2 pt-1">
            <StatusBadge status={data.status} />
            <PriorityBadge priority={data.priority} />
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Tabs
          label="Seções do chamado"
          className="min-w-0"
          activeTabId={activeTab}
          onTabChange={setActiveTab}
          tabs={[
            {
              id: 'conversa',
              label: 'Conversa',
              content: (
                <TicketConversation
                  ticket={data}
                  isStaff={isStaff}
                  insertText={insertText}
                  onTextInserted={clearInsert}
                />
              ),
            },
            { id: 'historico', label: 'Histórico', content: <TicketTimeline ticketId={data.id} /> },
          ]}
        />
        <aside className="space-y-4" aria-label="Informações e ações do chamado">
          <TicketActions ticket={data} isStaff={isStaff} />
          <TicketInfoPanel ticket={data} />
          {isStaff ? (
            <CopilotPanel
              ticketId={data.id}
              onUseText={
                CLOSED_STATUSES.has(data.status)
                  ? undefined
                  : (text) => {
                      setActiveTab('conversa')
                      setInsertText(text)
                    }
              }
            />
          ) : null}
          <TicketAttachments ticket={data} />
        </aside>
      </div>
    </div>
  )
}
