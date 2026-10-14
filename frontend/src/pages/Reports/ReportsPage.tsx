import { Bot, MessageSquare, ThumbsUp, Ticket } from 'lucide-react'
import { useState } from 'react'

import { BarList } from '@/components/charts/BarList'
import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { StatGroup, StatTile } from '@/components/StatTile'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { SkeletonText } from '@/components/ui/Skeleton'
import { AIInsightsCard } from '@/features/dashboard/components/AIInsights'
import { useDashboardAI, useDashboardTickets } from '@/features/dashboard/hooks/useDashboard'
import { PERIOD_OPTIONS } from '@/features/dashboard/periods'
import type { AIActionType } from '@/features/dashboard/types'
import { getErrorMessage } from '@/services/api/errors'
import { formatPercent } from '@/utils/format'

const ACTION_LABELS: Record<AIActionType, string> = {
  CHAT_RESPONSE: 'Respostas do assistente',
  CLASSIFY_TICKET: 'Classificações de chamado',
  SUMMARIZE_TICKET: 'Resumos e análises',
  SUGGEST_SOLUTION: 'Sugestões de solução',
  GENERATE_RESPONSE: 'Rascunhos de resposta',
  RAG_SEARCH: 'Buscas na base',
}

const percent = (value: number | null) => (value === null ? null : formatPercent(value))

/** Indicadores (§41, etapa 18): desempenho do assistente, uso da IA e AI Insights. */
export function ReportsPage() {
  const [days, setDays] = useState(30)
  const ai = useDashboardAI(days)
  const tickets = useDashboardTickets(days)
  const caption = `nos últimos ${days} dias`

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="Indicadores"
        description="Como a IA está ajudando o suporte e onde estão as oportunidades."
        actions={
          <Select
            label="Período"
            options={PERIOD_OPTIONS}
            value={String(days)}
            onChange={(event) => setDays(Number(event.target.value))}
            containerClassName="w-full sm:w-44"
          />
        }
      />

      {ai.isError ? (
        <ErrorState
          title="Não foi possível carregar os indicadores de IA."
          description={getErrorMessage(ai.error)}
          onRetry={() => void ai.refetch()}
          isRetrying={ai.isFetching}
        />
      ) : (
        <StatGroup label="Assistente de TI">
          <StatTile
            label="Conversas com o assistente"
            value={ai.data ? ai.data.conversations.toLocaleString('pt-BR') : null}
            caption={caption}
            icon={MessageSquare}
            isLoading={ai.isPending}
          />
          <StatTile
            label="Resolvidas pelo assistente"
            value={ai.data ? percent(ai.data.assistant_resolution_pct) : null}
            caption="das conversas concluídas"
            icon={Bot}
            isLoading={ai.isPending}
          />
          <StatTile
            label="Viraram chamado"
            value={ai.data ? ai.data.conversations_escalated.toLocaleString('pt-BR') : null}
            caption={caption}
            icon={Ticket}
            isLoading={ai.isPending}
          />
          <StatTile
            label="Avaliações positivas"
            value={ai.data ? percent(ai.data.positive_feedback_pct) : null}
            caption={
              ai.data ? `${ai.data.feedback_count.toLocaleString('pt-BR')} avaliação(ões)` : undefined
            }
            icon={ThumbsUp}
            isLoading={ai.isPending}
          />
        </StatGroup>
      )}

      <AIInsightsCard query={ai} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Uso da IA por ação">
          {ai.isPending ? (
            <SkeletonText lines={4} />
          ) : ai.isError ? (
            <p className="text-sm text-secondary">Indisponível no momento.</p>
          ) : ai.data.usage.length === 0 ? (
            <p className="text-sm text-secondary">Nenhuma ação da IA no período.</p>
          ) : (
            <BarList
              items={ai.data.usage.map((item) => ({
                label: ACTION_LABELS[item.action_type],
                value: item.total,
              }))}
            />
          )}
        </Card>
        <Card title="Chamados por categoria">
          {tickets.isPending ? (
            <SkeletonText lines={4} />
          ) : tickets.isError ? (
            <ErrorState
              title="Não foi possível carregar esta seção."
              description={getErrorMessage(tickets.error)}
              onRetry={() => void tickets.refetch()}
              className="py-6"
            />
          ) : tickets.data.by_category.length === 0 ? (
            <p className="text-sm text-secondary">Nenhum chamado no período.</p>
          ) : (
            <BarList
              items={tickets.data.by_category
                .slice(0, 8)
                .map((item) => ({ label: item.label, value: item.count }))}
            />
          )}
        </Card>
      </div>
    </div>
  )
}
