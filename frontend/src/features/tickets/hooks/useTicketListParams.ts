import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { TICKET_PRIORITIES, TICKET_STATUSES } from '../types'
import type { TicketListParams, TicketPriority, TicketStatus } from '../types'

export type TicketScope = 'all' | 'mine' | 'unassigned'

export const DEFAULT_PAGE_SIZE = 20

/** Filtros editáveis pela interface (a paginação é controlada à parte). */
export type TicketFilterValues = Pick<TicketListParams, 'status' | 'priority' | 'categoryId' | 'search'>

function parseList<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return values.filter((value): value is T => (allowed as readonly string[]).includes(value))
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

/**
 * Filtros da listagem guardados na URL: a tela pode ser compartilhada,
 * recarregada e navegada com o botão voltar sem perder o estado (§42).
 */
export function useTicketListParams(scope: TicketScope) {
  const [searchParams, setSearchParams] = useSearchParams()

  const params = useMemo<TicketListParams>(
    () => ({
      page: parsePositiveInt(searchParams.get('page')) ?? 1,
      pageSize: DEFAULT_PAGE_SIZE,
      status: parseList<TicketStatus>(searchParams.getAll('status'), TICKET_STATUSES),
      priority: parseList<TicketPriority>(searchParams.getAll('priority'), TICKET_PRIORITIES),
      categoryId: parsePositiveInt(searchParams.get('category')),
      search: searchParams.get('q') ?? '',
      mine: scope === 'mine',
      unassigned: scope === 'unassigned',
    }),
    [searchParams, scope],
  )

  const setFilters = useCallback(
    (changes: Partial<TicketFilterValues>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (changes.status) {
            next.delete('status')
            changes.status.forEach((status) => next.append('status', status))
          }
          if (changes.priority) {
            next.delete('priority')
            changes.priority.forEach((priority) => next.append('priority', priority))
          }
          if (changes.categoryId !== undefined) {
            if (changes.categoryId === null) next.delete('category')
            else next.set('category', String(changes.categoryId))
          }
          if (changes.search !== undefined) {
            if (changes.search.trim()) next.set('q', changes.search)
            else next.delete('q')
          }
          // Qualquer mudança de filtro volta para a primeira página.
          next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setPage = useCallback(
    (page: number) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        if (page <= 1) next.delete('page')
        else next.set('page', String(page))
        return next
      })
    },
    [setSearchParams],
  )

  const clearFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true })
  }, [setSearchParams])

  const hasFilters =
    params.status.length > 0 ||
    params.priority.length > 0 ||
    params.categoryId !== null ||
    params.search.trim() !== ''

  return { params, setFilters, setPage, clearFilters, hasFilters }
}
