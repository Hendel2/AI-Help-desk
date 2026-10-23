import type { RoleName } from '@/features/auth/types'
import { formatPercent } from '@/utils/format'

import type { DashboardMetrics } from './types'

export function count(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`
}

/** Uma frase com o que importa agora para o perfil (números reais, sem estimativa). */
export function summary(role: RoleName, metrics: DashboardMetrics): string {
  if (role === 'USER') {
    if (metrics.waiting_user > 0) {
      return `${count(metrics.waiting_user, 'chamado aguarda', 'chamados aguardam')} a sua resposta. Responder agiliza o atendimento.`
    }
    if (metrics.open > 0) {
      return `${count(metrics.open, 'chamado em aberto', 'chamados em aberto')} com a equipe. Você será avisado a cada novidade.`
    }
    return 'Nenhum chamado em aberto. Se algo der problema, o assistente ajuda na hora ou abre o chamado para você.'
  }
  if (role === 'TECHNICIAN') {
    // A fila pessoal e o risco da equipe são números diferentes: frases separadas.
    const mine = metrics.assigned_to_me ?? 0
    const risk = metrics.sla_warning + metrics.sla_breached
    const queue = `${count(mine, 'chamado atribuído', 'chamados atribuídos')} a você.`
    return risk > 0
      ? `${queue} Na fila da equipe, ${count(risk, 'chamado está', 'chamados estão')} com o prazo em risco.`
      : `${queue} Nenhum chamado da equipe com prazo em risco.`
  }
  const compliance =
    metrics.sla_compliance_pct === null
      ? ''
      : `, ${formatPercent(metrics.sla_compliance_pct)} resolvidos dentro do SLA`
  return `${count(metrics.created_in_period, 'chamado aberto', 'chamados abertos')} nos últimos ${metrics.period_days} dias${compliance}.`
}
