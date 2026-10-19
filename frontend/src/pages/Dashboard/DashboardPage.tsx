import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  Plus,
  Smile,
  Timer,
  UserCheck,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { PageHeader } from '@/components/PageHeader'
import { BarList } from '@/components/charts/BarList'
import { ColumnChart } from '@/components/charts/ColumnChart'
import { ErrorState } from '@/components/ErrorState'
import { StatGroup, StatTile } from '@/components/StatTile'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { SkeletonText } from '@/components/ui/Skeleton'
import { useAuth } from '@/features/auth/useAuth'
import { AIInsightsCard } from '@/features/dashboard/components/AIInsights'
import {
  ActivityFeed,
  RecentTicketsList,
  TechnicianTable,
} from '@/features/dashboard/components/DashboardLists'
import {
  useDashboardAI,
  useDashboardMetrics,
  useDashboardSLA,
  useDashboardTickets,
} from '@/features/dashboard/hooks/useDashboard'
import { PERIOD_OPTIONS } from '@/features/dashboard/periods'
import type { DashboardMetrics, DashboardTickets } from '@/features/dashboard/types'
import { PRIORITY_LABELS } from '@/features/tickets/labels'
import type { TicketPriority } from '@/features/tickets/types'
import { getErrorMessage } from '@/services/api/errors'
import { formatMinutes, formatPercent } from '@/utils/format'

const SUBTITLES = {
  USER: 'Acompanhe seus chamados.',
  TECHNICIAN: 'Sua fila de atendimento e os prazos em risco.',
  ADMIN: 'Visão geral do suporte da empresa.',
} as const

/** "2026-10-07" -> "07/10" sem conversão de fuso (a data já vem em UTC do backend). */
function shortDate(iso: string): { short: string; full: string } {
  const [year, month, day] = iso.split('-')
  return { short: `${day}/${month}`, full: `${day}/${month}/${year}` }
}

/** Dashboard por perfil (§39–41). */
export function DashboardPage() {
  const { user } = useAuth()
  const [days, setDays] = useState(30)
  const metrics = useDashboardMetrics(days)
  const tickets = useDashboardTickets(days)
  const isAdmin = user?.role === 'ADMIN'
  const sla = useDashboardSLA(8, isAdmin)
  const ai = useDashboardAI(days, isAdmin)

  if (!user) return null
  const firstName = user.name.split(' ')[0]
  const periodCaption = `nos últimos ${days} dias`

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title={`Olá, ${firstName}`}
        description={SUBTITLES[user.role]}
        actions={
          <>
            <Select
              label="Período"
              options={PERIOD_OPTIONS}
              value={String(days)}
              onChange={(event) => setDays(Number(event.target.value))}
              containerClassName="w-full sm:w-44"
            />
            <ButtonLink to="/chamados/novo" icon={<Plus aria-hidden="true" className="size-4" />}>
              Novo chamado
            </ButtonLink>
          </>
        }
      />

      {metrics.isError ? (
        <ErrorState
          title="Não foi possível carregar os indicadores."
          description={getErrorMessage(metrics.error)}
          onRetry={() => void metrics.refetch()}
          isRetrying={metrics.isFetching}
        />
      ) : (
        <StatGroup label="Indicadores">
          <Tiles role={user.role} metrics={metrics.data} periodCaption={periodCaption} />
        </StatGroup>
      )}

      {user.role === 'USER' ? (
        <Panel title="Chamados recentes" query={tickets}>
          {(data) => <RecentTicketsList tickets={data.recent} />}
        </Panel>
      ) : null}

      {user.role === 'TECHNICIAN' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel title="Chamados em aberto por prioridade" query={tickets}>
            {(data) => (
              <BarList
                items={data.by_priority.map((item) => ({
                  label: PRIORITY_LABELS[item.label as TicketPriority],
                  value: item.count,
                }))}
              />
            )}
          </Panel>
          <Panel title="Atividade recente" query={tickets}>
            {(data) => <ActivityFeed items={data.activity} />}
          </Panel>
          <Panel title="Chamados recentes" query={tickets}>
            {(data) => <RecentTicketsList tickets={data.recent} />}
          </Panel>
          <Panel title="Distribuição por categoria" query={tickets}>
            {(data) => <CategoryBars data={data} />}
          </Panel>
        </div>
      ) : null}

      {isAdmin ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AIInsightsCard query={ai} className="lg:col-span-2" />
          <Panel title="Volume de chamados" query={tickets} className="lg:col-span-2">
            {(data) => (
              <ColumnChart
                valueLabel="Chamados abertos"
                data={data.daily_volume.map((day) => {
                  const { short, full } = shortDate(day.date)
                  return { label: short, fullLabel: full, value: day.count }
                })}
              />
            )}
          </Panel>
          <Panel title="Chamados por categoria" query={tickets}>
            {(data) => <CategoryBars data={data} />}
          </Panel>
          <Panel title="Atividade recente" query={tickets}>
            {(data) => <ActivityFeed items={data.activity} />}
          </Panel>
          <Card
            title="Evolução do SLA"
            action={
              metrics.data ? (
                <span className="text-xs text-secondary">
                  {metrics.data.sla_breached === 0
                    ? 'nenhum vencido agora'
                    : `${metrics.data.sla_breached} ${metrics.data.sla_breached === 1 ? 'vencido' : 'vencidos'} agora`}
                </span>
              ) : null
            }
          >
            {sla.isPending ? (
              <SkeletonText lines={4} />
            ) : sla.isError ? (
              <ErrorState
                title="Não foi possível carregar a evolução do SLA."
                onRetry={() => void sla.refetch()}
                className="py-6"
              />
            ) : (
              <ColumnChart
                valueLabel="Resolvidos dentro do prazo (%)"
                maxValue={100}
                formatValue={formatPercent}
                data={sla.data.weeks.map((week) => {
                  const { short, full } = shortDate(week.week_start)
                  return {
                    label: short,
                    fullLabel: `Semana de ${full} (${week.within_sla}/${week.resolved})`,
                    value: week.compliance_pct,
                  }
                })}
              />
            )}
          </Card>
          <Panel title="Desempenho dos técnicos" query={tickets}>
            {(data) => <TechnicianTable rows={data.technicians ?? []} />}
          </Panel>
        </div>
      ) : null}
    </div>
  )
}

function Tiles({
  role,
  metrics,
  periodCaption,
}: {
  role: 'USER' | 'TECHNICIAN' | 'ADMIN'
  metrics: DashboardMetrics | undefined
  periodCaption: string
}) {
  const loading = metrics === undefined
  const value = (key: keyof DashboardMetrics) => (metrics ? String(metrics[key] ?? '—') : null)

  if (role === 'USER') {
    return (
      <>
        <StatTile label="Abertos" value={value('open')} icon={Inbox} isLoading={loading} />
        <StatTile
          label="Em andamento"
          value={value('in_progress')}
          icon={Clock}
          isLoading={loading}
        />
        <StatTile
          label="Aguardando você"
          value={value('waiting_user')}
          icon={AlertTriangle}
          tone={metrics && metrics.waiting_user > 0 ? 'warning' : 'neutral'}
          isLoading={loading}
        />
        <StatTile
          label="Resolvidos"
          value={value('resolved')}
          icon={CheckCircle2}
          isLoading={loading}
        />
      </>
    )
  }

  if (role === 'TECHNICIAN') {
    return (
      <>
        <StatTile label="Chamados abertos" value={value('open')} icon={Inbox} isLoading={loading} />
        <StatTile
          label="Atribuídos a mim"
          value={value('assigned_to_me')}
          icon={UserCheck}
          isLoading={loading}
        />
        <StatTile
          label="Próximos do SLA"
          value={value('sla_warning')}
          caption="prazo quase vencendo"
          icon={AlertTriangle}
          tone={metrics && metrics.sla_warning > 0 ? 'warning' : 'neutral'}
          isLoading={loading}
        />
        <StatTile
          label="SLA vencido"
          value={value('sla_breached')}
          caption="em aberto e fora do prazo"
          icon={XCircle}
          tone={metrics && metrics.sla_breached > 0 ? 'danger' : 'neutral'}
          isLoading={loading}
        />
      </>
    )
  }

  return (
    <>
      <StatTile
        label="Chamados"
        value={value('created_in_period')}
        caption={periodCaption}
        icon={Inbox}
        isLoading={loading}
      />
      <StatTile
        label="Tempo médio de resolução"
        value={
          metrics?.avg_resolution_minutes != null
            ? formatMinutes(metrics.avg_resolution_minutes)
            : loading
              ? null
              : '—'
        }
        caption={periodCaption}
        icon={Timer}
        isLoading={loading}
      />
      <StatTile
        label="Satisfação"
        value={
          metrics?.satisfaction_avg != null
            ? `${metrics.satisfaction_avg.toFixed(1).replace('.', ',')} / 5`
            : loading
              ? null
              : '—'
        }
        caption={metrics ? `${metrics.satisfaction_count ?? 0} avaliações` : undefined}
        icon={Smile}
        isLoading={loading}
      />
      <StatTile
        label="Cumprimento de SLA"
        value={
          metrics?.sla_compliance_pct != null
            ? formatPercent(metrics.sla_compliance_pct)
            : loading
              ? null
              : '—'
        }
        caption="resolvidos dentro do prazo"
        icon={CheckCircle2}
        isLoading={loading}
      />
    </>
  )
}

function CategoryBars({ data }: { data: DashboardTickets }) {
  if (data.by_category.length === 0) {
    return <p className="text-sm text-secondary">Nenhum chamado no período.</p>
  }
  return (
    <BarList
      items={data.by_category.slice(0, 8).map((item) => ({ label: item.label, value: item.count }))}
    />
  )
}

interface PanelProps {
  title: string
  query: ReturnType<typeof useDashboardTickets>
  className?: string
  children: (data: DashboardTickets) => ReactNode
}

/** Card com os estados obrigatórios (loading, erro) da consulta de chamados. */
function Panel({ title, query, className, children }: PanelProps) {
  return (
    <Card title={title} className={className}>
      {query.isPending ? (
        <SkeletonText lines={4} />
      ) : query.isError ? (
        <ErrorState
          title="Não foi possível carregar esta seção."
          description={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
          isRetrying={query.isFetching}
          className="py-6"
        />
      ) : (
        children(query.data)
      )}
    </Card>
  )
}
