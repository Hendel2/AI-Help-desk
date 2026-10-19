import type { RoleName } from '@/features/auth/types'
import { useDashboardMetrics } from '@/features/dashboard/hooks/useDashboard'
import { useUnreadCount } from '@/features/notifications/hooks/useNotifications'

import type { NavCounter } from './navigation'

export interface NavCount {
  count: number
  /** `danger` só para risco (SLA vencido); o resto usa o azul de destaque. */
  tone: 'primary' | 'danger'
  /** Texto para leitores de tela (o número sozinho não diz o que conta). */
  label: string
}

/** Período das métricas do início: o menu reaproveita o mesmo cache. */
const DASHBOARD_DAYS = 30

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/** Números ao lado dos itens do menu: não lidas, chamados em aberto e SLA vencido. */
export function useNavCounters(role: RoleName): Partial<Record<NavCounter, NavCount>> {
  const unread = useUnreadCount()
  const metrics = useDashboardMetrics(DASHBOARD_DAYS)
  const counters: Partial<Record<NavCounter, NavCount>> = {}

  const unreadCount = unread.data ?? 0
  if (unreadCount > 0) {
    counters.unread = {
      count: unreadCount,
      tone: 'primary',
      label: plural(unreadCount, 'não lida', 'não lidas'),
    }
  }

  const data = metrics.data
  if (data) {
    // Para quem pede ajuda, "meus" são os abertos por ele; para a equipe, os atribuídos a ela.
    const mine = role === 'USER' ? data.open : (data.assigned_to_me ?? 0)
    if (mine > 0) {
      counters.myTickets = {
        count: mine,
        tone: 'primary',
        label:
          role === 'USER'
            ? plural(mine, 'em aberto', 'em aberto')
            : plural(mine, 'atribuído a você', 'atribuídos a você'),
      }
    }
    if (role !== 'USER' && data.sla_breached > 0) {
      counters.slaBreached = {
        count: data.sla_breached,
        tone: 'danger',
        label: plural(data.sla_breached, 'com SLA vencido', 'com SLA vencido'),
      }
    }
  }
  return counters
}
