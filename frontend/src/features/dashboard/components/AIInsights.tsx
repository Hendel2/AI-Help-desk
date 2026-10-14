import { CircleCheck, Lightbulb, TriangleAlert } from 'lucide-react'
import { useId } from 'react'

import { ErrorState } from '@/components/ErrorState'
import { SkeletonText } from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/styles'
import { getErrorMessage } from '@/services/api/errors'

import type { useDashboardAI } from '../hooks/useDashboard'
import type { AIInsight } from '../types'

const TONES: Record<AIInsight['tone'], { icon: typeof Lightbulb; className: string; label: string }> =
  {
    info: { icon: Lightbulb, className: 'text-primary', label: 'Observação' },
    success: { icon: CircleCheck, className: 'text-success', label: 'Ponto positivo' },
    warning: { icon: TriangleAlert, className: 'text-warning', label: 'Atenção' },
  }

interface AIInsightsCardProps {
  query: ReturnType<typeof useDashboardAI>
  className?: string
}

/**
 * AI Insights (§41): observações calculadas a partir dos dados da empresa.
 * Layout editorial (título à esquerda, leituras à direita) para não virar
 * mais um card igual aos painéis de gráfico.
 */
export function AIInsightsCard({ query, className }: AIInsightsCardProps) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className={cx(
        'grid gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5 lg:grid-cols-[14rem_1fr] lg:gap-8',
        className,
      )}
    >
      <div className="space-y-1">
        <h2 id={titleId} className="text-sm font-semibold text-text">
          AI Insights
        </h2>
        <p className="text-xs text-secondary">
          Leituras automáticas do período, calculadas a partir dos chamados e das conversas.
        </p>
      </div>
      <div className="min-w-0">
        {query.isPending ? (
          <SkeletonText lines={3} />
        ) : query.isError ? (
          <ErrorState
            title="Não foi possível carregar os insights."
            description={getErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
            isRetrying={query.isFetching}
            className="py-6"
          />
        ) : query.data.insights.length === 0 ? (
          <p className="text-sm text-secondary">
            Ainda não há volume suficiente no período para gerar observações.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {query.data.insights.map((insight) => {
              const tone = TONES[insight.tone]
              const Icon = tone.icon
              return (
                <li
                  key={insight.kind}
                  className="flex gap-3 py-2.5 text-sm text-text first:pt-0 last:pb-0"
                >
                  <Icon
                    aria-hidden="true"
                    className={cx('mt-0.5 size-4 shrink-0', tone.className)}
                  />
                  <span>
                    <span className="sr-only">{tone.label}: </span>
                    {insight.text}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
