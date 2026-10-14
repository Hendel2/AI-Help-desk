import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'

import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { SearchBar } from '@/components/SearchBar'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { SkeletonText } from '@/components/ui/Skeleton'
import { cx, FOCUS_RING } from '@/components/ui/styles'
import { useAuth } from '@/features/auth/useAuth'
import { ArticleList } from '@/features/knowledge/components/ArticleList'
import { useArticles } from '@/features/knowledge/hooks/useKnowledge'
import type { ArticleListParams } from '@/features/knowledge/types'
import { useCategories } from '@/features/tickets/hooks/useTickets'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { getErrorMessage } from '@/services/api/errors'

/** Base de conhecimento (§48): busca, categorias, populares e recentes. */
export function KnowledgePage() {
  const { hasRole } = useAuth()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const debouncedSearch = useDebouncedValue(search, 300)
  const categories = useCategories()
  const isFiltering = debouncedSearch.trim() !== '' || categoryId !== null

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="Base de conhecimento"
        description="Soluções para os problemas mais comuns, escritas pela equipe de TI."
        actions={
          hasRole('ADMIN') ? (
            <ButtonLink
              to="/base-de-conhecimento/novo"
              icon={<Plus aria-hidden="true" className="size-4" />}
            >
              Novo artigo
            </ButtonLink>
          ) : null
        }
      />

      <SearchBar
        label="Pesquisar na base de conhecimento"
        placeholder="Pesquisar um problema…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {categories.data && categories.data.length > 0 ? (
        <div role="group" aria-label="Filtrar por categoria" className="flex flex-wrap gap-2">
          {[{ id: null, name: 'Todas' }, ...categories.data].map((category) => {
            const selected = categoryId === category.id
            return (
              <button
                key={category.id ?? 'todas'}
                type="button"
                aria-pressed={selected}
                onClick={() => setCategoryId(category.id)}
                className={cx(
                  'min-h-9 rounded-md border px-3 py-1 text-sm transition-colors',
                  selected
                    ? 'border-primary bg-primary-soft font-medium text-text'
                    : 'border-border bg-surface text-text hover:bg-surface-hover',
                  FOCUS_RING,
                )}
              >
                {category.name}
              </button>
            )
          })}
        </div>
      ) : null}

      {isFiltering ? (
        <ArticleSection
          title="Resultados"
          params={{ search: debouncedSearch, categoryId, sort: 'popular', pageSize: 30 }}
          emptyTitle="Nenhum artigo encontrado."
          emptyDescription="Tente outras palavras ou abra um chamado para a equipe de TI."
        />
      ) : (
        <div className="space-y-8">
          <ArticleSection
            title="Artigos populares"
            params={{ sort: 'popular', pageSize: 5 }}
            emptyTitle="Nenhum artigo publicado ainda."
          />
          <ArticleSection
            title="Artigos recentes"
            params={{ sort: 'recent', pageSize: 6 }}
            emptyTitle="Nenhum artigo publicado ainda."
          />
        </div>
      )}
    </div>
  )
}

function ArticleSection({
  title,
  params,
  emptyTitle,
  emptyDescription,
}: {
  title: string
  params: ArticleListParams
  emptyTitle: string
  emptyDescription?: string
}) {
  const articles = useArticles(params)
  let body: ReactNode
  if (articles.isPending) body = <SkeletonText lines={4} />
  else if (articles.isError)
    body = (
      <ErrorState
        title="Não foi possível carregar os artigos."
        description={getErrorMessage(articles.error)}
        onRetry={() => void articles.refetch()}
        isRetrying={articles.isFetching}
      />
    )
  else if (articles.data.items.length === 0)
    body = <EmptyState title={emptyTitle} description={emptyDescription} />
  else body = <ArticleList articles={articles.data.items} />

  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      {body}
    </section>
  )
}
