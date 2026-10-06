import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from './Button'
import { cx } from './styles'

export interface PaginationProps {
  page: number
  /** Total de páginas (`pages` do contrato de paginação da API). */
  pages: number
  total: number
  onPageChange: (page: number) => void
  className?: string
}

/** Paginação compatível com o contrato `{items, total, page, page_size, pages}`. */
export function Pagination({ page, pages, total, onPageChange, className }: PaginationProps) {
  if (pages <= 1) {
    return (
      <p className={cx('text-sm text-secondary', className)}>
        {total === 1 ? '1 resultado' : `${total} resultados`}
      </p>
    )
  }

  return (
    <nav
      aria-label="Paginação"
      className={cx('flex flex-wrap items-center justify-between gap-3', className)}
    >
      <p className="text-sm text-secondary">
        Página <span className="font-medium text-text">{page}</span> de {pages} · {total}{' '}
        resultados
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<ChevronLeft aria-hidden="true" className="size-4" />}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Próxima
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </nav>
  )
}
