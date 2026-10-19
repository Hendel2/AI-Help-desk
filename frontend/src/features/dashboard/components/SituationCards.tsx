import { AlarmClock, BookOpen, Bot, ListTodo, MessageSquareReply, Ticket } from 'lucide-react'

import { ActionCard } from '@/components/ActionCard'
import type { ActionTone } from '@/components/ActionCard'
import type { RoleName } from '@/features/auth/types'
import { useAssistantInfo } from '@/features/chat/hooks/useChat'

import type { DashboardMetrics } from '../types'

function plural(value: number, singular: string, pluralForm: string): string {
  return `${value} ${value === 1 ? singular : pluralForm}`
}

/** Prazos em risco: vermelho se algum venceu, âmbar se só estão perto, verde se nenhum. */
function deadlineCard(metrics: DashboardMetrics | undefined): {
  description: string | null
  tone: ActionTone
} {
  if (!metrics) return { description: null, tone: 'neutral' }
  const { sla_breached: breached, sla_warning: warning } = metrics
  if (breached > 0) {
    const extra = warning > 0 ? ` e ${plural(warning, 'perto do prazo', 'perto do prazo')}` : ''
    return { description: `${plural(breached, 'vencido', 'vencidos')}${extra}`, tone: 'danger' }
  }
  if (warning > 0) {
    return {
      description: `${plural(warning, 'chamado perto', 'chamados perto')} do prazo`,
      tone: 'warning',
    }
  }
  return { description: 'Nenhum prazo em risco', tone: 'success' }
}

interface SituationCardsProps {
  role: RoleName
  metrics: DashboardMetrics | undefined
}

/** "Situação": o que pede atenção agora, cada card levando à tela que resolve. */
export function SituationCards({ role, metrics }: SituationCardsProps) {
  const assistant = useAssistantInfo()
  const deadline = deadlineCard(metrics)

  if (role === 'USER') {
    const waiting = metrics?.waiting_user
    return (
      <>
        <ActionCard
          to="/chamados/meus?status=WAITING_USER"
          title="Aguardando sua resposta"
          icon={MessageSquareReply}
          tone={waiting === undefined ? 'neutral' : waiting > 0 ? 'warning' : 'success'}
          description={
            waiting === undefined
              ? null
              : waiting > 0
                ? `${plural(waiting, 'chamado precisa', 'chamados precisam')} de você`
                : 'Nada pendente'
          }
        />
        <ActionCard
          to="/assistente"
          title="Assistente de TI"
          icon={Bot}
          tone="primary"
          description="Resolva na hora, sem abrir chamado"
        />
        <ActionCard
          to="/base-de-conhecimento"
          title="Base de conhecimento"
          icon={BookOpen}
          description="Guias para os problemas mais comuns"
        />
      </>
    )
  }

  const assistantState = !assistant.data
    ? { description: null, tone: 'neutral' as ActionTone }
    : !assistant.data.ai_enabled
      ? { description: 'Sem IA: respondendo pela base', tone: 'warning' as ActionTone }
      : assistant.data.slow_responses
        ? { description: 'IA local ativa (mais lenta)', tone: 'warning' as ActionTone }
        : { description: 'IA ativa e respondendo', tone: 'success' as ActionTone }

  return (
    <>
      {role === 'TECHNICIAN' ? (
        <ActionCard
          to="/chamados/meus"
          title="Minha fila"
          icon={Ticket}
          tone="primary"
          description={
            metrics
              ? plural(metrics.assigned_to_me ?? 0, 'chamado atribuído', 'chamados atribuídos')
              : null
          }
        />
      ) : null}
      <ActionCard to="/chamados" title="Prazos em risco" icon={AlarmClock} {...deadline} />
      <ActionCard
        to="/chamados/nao-atribuidos"
        title="Não atribuídos"
        icon={ListTodo}
        description="Distribua os chamados da fila"
      />
      {role === 'ADMIN' ? (
        <ActionCard
          to="/admin/configuracoes"
          title="Assistente de IA"
          icon={Bot}
          tone={assistantState.tone}
          description={assistantState.description}
        />
      ) : null}
    </>
  )
}
