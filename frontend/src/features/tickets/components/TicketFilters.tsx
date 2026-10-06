import { X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { SearchBar } from '@/components/SearchBar'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

import { PRIORITY_LABELS, STATUS_LABELS } from '../labels'
import { TICKET_PRIORITIES, TICKET_STATUSES } from '../types'
import type { Category, TicketListParams, TicketPriority, TicketStatus } from '../types'
import type { TicketFilterValues } from '../hooks/useTicketListParams'

interface TicketFiltersProps {
  params: TicketListParams
  categories: Category[]
  hasFilters: boolean
  onChange: (changes: Partial<TicketFilterValues>) => void
  onClear: () => void
}

const STATUS_OPTIONS = TICKET_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }))
const PRIORITY_OPTIONS = TICKET_PRIORITIES.map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}))

/** Busca e filtros da listagem (§42). A busca só dispara após uma pausa na digitação. */
export function TicketFilters({
  params,
  categories,
  hasFilters,
  onChange,
  onClear,
}: TicketFiltersProps) {
  const [search, setSearch] = useState(params.search)
  const debouncedSearch = useDebouncedValue(search, 350)

  useEffect(() => {
    if (debouncedSearch !== params.search) onChange({ search: debouncedSearch })
    // `params.search` muda como consequência desta chamada; não deve redisparar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  return (
    <div className="space-y-3">
      <SearchBar
        label="Buscar chamados"
        placeholder="Buscar por título, descrição ou número (HD-000102)"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <Select
          label="Status"
          placeholder="Todos os status"
          options={STATUS_OPTIONS}
          value={params.status[0] ?? ''}
          onChange={(event) =>
            onChange({ status: event.target.value ? [event.target.value as TicketStatus] : [] })
          }
        />
        <Select
          label="Prioridade"
          placeholder="Todas as prioridades"
          options={PRIORITY_OPTIONS}
          value={params.priority[0] ?? ''}
          onChange={(event) =>
            onChange({
              priority: event.target.value ? [event.target.value as TicketPriority] : [],
            })
          }
        />
        <Select
          label="Categoria"
          placeholder="Todas as categorias"
          options={categories.map((category) => ({
            value: String(category.id),
            label: category.name,
          }))}
          value={params.categoryId === null ? '' : String(params.categoryId)}
          onChange={(event) =>
            onChange({ categoryId: event.target.value ? Number(event.target.value) : null })
          }
        />
        {hasFilters ? (
          <Button
            variant="ghost"
            icon={<X aria-hidden="true" className="size-4" />}
            onClick={() => {
              setSearch('')
              onClear()
            }}
          >
            Limpar filtros
          </Button>
        ) : null}
      </div>
    </div>
  )
}
