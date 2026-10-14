import { Link } from 'react-router'

import { Badge } from '@/components/ui/Badge'
import { cx, FOCUS_RING } from '@/components/ui/styles'
import { formatRelative } from '@/utils/format'

import { ARTICLE_STATUS_LABELS } from '../labels'
import type { ArticleListItem } from '../types'

/** Lista de artigos com divisórias (coleção = lista, não grade de cards). */
export function ArticleList({ articles }: { articles: ArticleListItem[] }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {articles.map((article) => (
        <li key={article.id} className="space-y-1 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/base-de-conhecimento/${article.id}`}
              className={cx('rounded-sm font-medium text-text hover:text-primary', FOCUS_RING)}
            >
              {article.title}
            </Link>
            {/* Destaque é informação, não alerta: etiqueta neutra (âmbar fica para prazo). */}
            {article.is_featured ? <Badge withDot={false}>Em destaque</Badge> : null}
            {article.status !== 'PUBLISHED' ? (
              <Badge tone="neutral">{ARTICLE_STATUS_LABELS[article.status]}</Badge>
            ) : null}
          </div>
          {article.summary ? <p className="text-sm text-secondary">{article.summary}</p> : null}
          <p className="flex flex-wrap gap-x-3 text-xs text-secondary">
            {article.category ? (
              <span className="font-medium text-text">{article.category.name}</span>
            ) : null}
            <span>
              Atualizado{' '}
              <time dateTime={article.updated_at}>{formatRelative(article.updated_at)}</time>
            </span>
          </p>
        </li>
      ))}
    </ul>
  )
}
