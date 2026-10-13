import { CircleCheck, Lightbulb, TriangleAlert } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { Card } from '@/components/ui/Card'
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

/** AI Insights (§41): observações calculadas a partir dos dados da empresa. */
export function AIInsightsCard({ query, className }: AIInsightsCardProps) {
  return (
    <Card title="AI Insights" className={className}>
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
        <ul className="space-y-3">
          {query.data.insights.map((insight) => {
            const tone = TONES[insight.tone]
            const Icon = tone.icon
            return (
              <li key={insight.kind} className="flex gap-3 text-sm text-text">
                <Icon aria-hidden="true" className={cx('mt-0.5 size-4 shrink-0', tone.className)} />
                <span>
                  <span className="sr-only">{tone.label}: </span>
                  {insight.text}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
