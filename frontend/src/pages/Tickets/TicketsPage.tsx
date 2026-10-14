import { Plus } from 'lucide-react'

import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Pagination } from '@/components/ui/Pagination'
import { useAuth } from '@/features/auth/useAuth'
import { TicketFilters } from '@/features/tickets/components/TicketFilters'
import { TicketTable, TicketTableSkeleton } from '@/features/tickets/components/TicketTable'
import { useTicketListParams } from '@/features/tickets/hooks/useTicketListParams'
import type { TicketScope } from '@/features/tickets/hooks/useTicketListParams'
import { useCategories, useTicketList } from '@/features/tickets/hooks/useTickets'
import { getErrorMessage } from '@/services/api/errors'

const TITLES: Record<TicketScope, { title: string; description: string }> = {
  all: { title: 'Chamados', description: 'Todos os chamados da sua empresa.' },
  mine: { title: 'Meus chamados', description: 'Chamados que você abriu.' },
  unassigned: {
    title: 'Não atribuídos',
    description: 'Chamados aguardando um técnico responsável.',
  },
}

/** Listagem de chamados (§42): busca, filtros, tabela e paginação. */
export function TicketsPage({ scope }: { scope: TicketScope }) {
  const { hasRole } = useAuth()
  const isStaff = hasRole('TECHNICIAN', 'ADMIN')
  const { params, setFilters, setPage, clearFilters, hasFilters } = useTicketListParams(scope)
  const tickets = useTicketList(params)
  const categories = useCategories()
  const { title, description } = TITLES[scope]

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <ButtonLink to="/chamados/novo" icon={<Plus aria-hidden="true" className="size-4" />}>
            Novo chamado
          </ButtonLink>
        }
      />

      <TicketFilters
        params={params}
        categories={categories.data ?? []}
        hasFilters={hasFilters}
        onChange={setFilters}
        onClear={clearFilters}
      />

      <section aria-label="Resultados" aria-busy={tickets.isFetching} className="space-y-4">
        {tickets.isPending ? (
          <TicketTableSkeleton />
        ) : tickets.isError ? (
          <ErrorState
            title="Não foi possível carregar os chamados."
            description={getErrorMessage(tickets.error)}
            onRetry={() => void tickets.refetch()}
            isRetrying={tickets.isFetching}
          />
        ) : tickets.data.items.length === 0 ? (
          hasFilters ? (
            <EmptyState
              title="Nenhum chamado encontrado."
              description="Nenhum chamado corresponde aos filtros aplicados."
              action={
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              title={scope === 'unassigned' ? 'Nenhum chamado aguardando técnico.' : 'Nenhum chamado ainda.'}
              description={
                scope === 'unassigned'
                  ? 'Todos os chamados abertos já têm um responsável.'
                  : 'Quando um chamado for aberto, ele aparecerá aqui.'
              }
            />
          )
        ) : (
          <>
            <TicketTable tickets={tickets.data.items} showRequester={isStaff && scope !== 'mine'} />
            <Pagination
              page={tickets.data.page}
              pages={tickets.data.pages}
              total={tickets.data.total}
              onPageChange={setPage}
            />
          </>
        )}
      </section>
    </div>
  )
}
