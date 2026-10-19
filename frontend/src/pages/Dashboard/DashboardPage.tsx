import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChartPie,
  Clock,
  History,
  Inbox,
  MessageSquareReply,
  ShieldCheck,
  Smile,
  Timer,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { BarList } from '@/components/charts/BarList'
import { ColumnChart } from '@/components/charts/ColumnChart'
import { ErrorState } from '@/components/ErrorState'
import { RadialProgress } from '@/components/RadialProgress'
import type { RadialTone } from '@/components/RadialProgress'
import { SectionHeading, SeeAllLink } from '@/components/SectionHeading'
import { StatGroup, StatTile } from '@/components/StatTile'
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
import { LatestNotifications } from '@/features/dashboard/components/LatestNotifications'
import { SituationCards } from '@/features/dashboard/components/SituationCards'
import { WelcomeBanner } from '@/features/dashboard/components/WelcomeBanner'
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

/** "2026-10-07" -> "07/10" sem conversão de fuso (a data já vem em UTC do backend). */
function shortDate(iso: string): { short: string; full: string } {
  const [year, month, day] = iso.split('-')
  return { short: `${day}/${month}`, full: `${day}/${month}/${year}` }
}

/** Painéis lado a lado só quando a coluna de conteúdo comporta (container query). */
const PANEL_GRID = 'grid grid-cols-1 gap-6 @2xl:grid-cols-2'

/** Início por perfil (§39–41): boas-vindas, situação, indicadores, painéis e notificações. */
export function DashboardPage() {
  const { user } = useAuth()
  const [days, setDays] = useState(30)
  const metrics = useDashboardMetrics(days)
  const tickets = useDashboardTickets(days)
  const isAdmin = user?.role === 'ADMIN'
  const sla = useDashboardSLA(8, isAdmin)
  const ai = useDashboardAI(days, isAdmin)

  if (!user) return null
  const firstName = user.name.split(' ')[0] ?? user.name
  const periodCaption = `nos últimos ${days} dias`

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8">
      <WelcomeBanner role={user.role} firstName={firstName} metrics={metrics.data} />

      <section aria-labelledby="situacao-titulo" className="space-y-4">
        <SectionHeading id="situacao-titulo" title="Situação" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <SituationCards role={user.role} metrics={metrics.data} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="@container min-w-0 space-y-8">
          {/* O grupo de números já é a região "Indicadores"; aqui só o título e o período. */}
          <div className="space-y-4">
            <SectionHeading
              id="indicadores-titulo"
              title="Indicadores"
              action={
                <Select
                  label="Período"
                  options={PERIOD_OPTIONS}
                  value={String(days)}
                  onChange={(event) => setDays(Number(event.target.value))}
                  containerClassName="w-full sm:w-44"
                />
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
          </div>

          {user.role === 'USER' ? (
            <Panel
              title="Chamados recentes"
              icon={History}
              query={tickets}
              action={<SeeAllLink to="/chamados/meus" label="Ver todos os meus chamados" />}
            >
              {(data) => <RecentTicketsList tickets={data.recent} />}
            </Panel>
          ) : null}

          {user.role === 'TECHNICIAN' ? (
            <div className={PANEL_GRID}>
              <Panel title="Em aberto por prioridade" icon={BarChart3} query={tickets}>
                {(data) => (
                  <BarList
                    items={data.by_priority.map((item) => ({
                      label: PRIORITY_LABELS[item.label as TicketPriority],
                      value: item.count,
                    }))}
                  />
                )}
              </Panel>
              <Panel title="Distribuição por categoria" icon={ChartPie} query={tickets}>
                {(data) => <CategoryBars data={data} />}
              </Panel>
              <Panel
                title="Chamados recentes"
                icon={History}
                query={tickets}
                action={<SeeAllLink to="/chamados" label="Ver todos os chamados" />}
              >
                {(data) => <RecentTicketsList tickets={data.recent} />}
              </Panel>
              <Panel title="Atividade recente" icon={Clock} query={tickets}>
                {(data) => <ActivityFeed items={data.activity} />}
              </Panel>
            </div>
          ) : null}

          {isAdmin ? (
            <div className={PANEL_GRID}>
              <AIInsightsCard query={ai} className="@2xl:col-span-2" />
              <Panel
                title="Volume de chamados"
                icon={CalendarDays}
                query={tickets}
                className="@2xl:col-span-2"
              >
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
              <Panel title="Chamados por categoria" icon={ChartPie} query={tickets}>
                {(data) => <CategoryBars data={data} />}
              </Panel>
              <Panel title="Atividade recente" icon={Clock} query={tickets}>
                {(data) => <ActivityFeed items={data.activity} />}
              </Panel>
              <Card
                title="Evolução do SLA"
                icon={ShieldCheck}
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
              <Panel title="Desempenho dos técnicos" icon={Users} query={tickets}>
                {(data) => <TechnicianTable rows={data.technicians ?? []} />}
              </Panel>
            </div>
          ) : null}
        </div>

        <LatestNotifications className="self-start xl:sticky xl:top-24" />
      </div>
    </div>
  )
}

/** Percentual de prazo cumprido: âmbar abaixo de 80% (risco), verde acima. */
function deadlineTone(value: number | null): RadialTone {
  if (value === null) return 'primary'
  return value < 80 ? 'warning' : 'success'
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
    const total = metrics ? metrics.open + metrics.resolved : 0
    const resolvedPct = metrics && total > 0 ? (100 * metrics.resolved) / total : null
    return (
      <>
        <RadialProgress
          value={resolvedPct}
          label={
            metrics && total > 0
              ? `dos seus ${total} chamados já foram resolvidos`
              : 'Nenhum chamado ainda'
          }
          isLoading={loading}
        />
        <StatTile label="Em aberto" value={value('open')} icon={Inbox} isLoading={loading} />
        <StatTile
          label="Aguardando você"
          value={value('waiting_user')}
          caption={metrics && metrics.waiting_user > 0 ? 'precisam da sua resposta' : undefined}
          icon={MessageSquareReply}
          tone={metrics && metrics.waiting_user > 0 ? 'warning' : 'neutral'}
          isLoading={loading}
        />
        <StatTile
          label="Abertos no período"
          value={value('created_in_period')}
          caption={periodCaption}
          icon={CalendarDays}
          isLoading={loading}
        />
      </>
    )
  }

  if (role === 'TECHNICIAN') {
    const onTimePct =
      metrics && metrics.open > 0
        ? (100 * (metrics.open - metrics.sla_warning - metrics.sla_breached)) / metrics.open
        : null
    return (
      <>
        <RadialProgress
          value={onTimePct}
          tone={deadlineTone(onTimePct)}
          label={
            metrics && metrics.open > 0
              ? `dos ${metrics.open} chamados em aberto estão no prazo`
              : 'Nenhum chamado em aberto'
          }
          isLoading={loading}
        />
        <StatTile
          label="Atribuídos a mim"
          value={value('assigned_to_me')}
          icon={UserCheck}
          isLoading={loading}
        />
        <StatTile
          label="Perto do prazo"
          value={value('sla_warning')}
          caption="SLA quase vencendo"
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

  const compliance = metrics?.sla_compliance_pct ?? null
  return (
    <>
      <RadialProgress
        value={compliance}
        tone={deadlineTone(compliance)}
        label={
          compliance === null ? 'Sem chamados resolvidos no período' : 'resolvidos dentro do SLA'
        }
        isLoading={loading}
      />
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
  icon?: LucideIcon
  action?: ReactNode
  query: ReturnType<typeof useDashboardTickets>
  className?: string
  children: (data: DashboardTickets) => ReactNode
}

/** Card com os estados obrigatórios (loading, erro) da consulta de chamados. */
function Panel({ title, icon, action, query, className, children }: PanelProps) {
  return (
    <Card title={title} icon={icon} action={action} className={className}>
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
