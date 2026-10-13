/** Contratos do dashboard — espelham `backend/app/schemas/dashboard.py`. */

import type { RoleName } from '@/features/auth/types'
import type {
  CategorySummary,
  TicketHistoryAction,
  TicketPriority,
  TicketStatus,
  UserSummary,
} from '@/features/tickets/types'

export interface DashboardMetrics {
  scope: RoleName
  period_days: number
  open: number
  in_progress: number
  waiting_user: number
  resolved: number
  created_in_period: number
  sla_warning: number
  sla_breached: number
  assigned_to_me: number | null
  avg_resolution_minutes: number | null
  satisfaction_avg: number | null
  satisfaction_count: number | null
  sla_compliance_pct: number | null
}

export interface CountItem {
  label: string
  count: number
}

export interface DailyCount {
  date: string
  count: number
}

export interface RecentTicket {
  id: number
  ticket_number: string
  title: string
  status: TicketStatus
  priority: TicketPriority
  updated_at: string
  requester: UserSummary
  technician: UserSummary | null
  category: CategorySummary | null
}

export interface ActivityItem {
  id: number
  action: TicketHistoryAction
  field: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
  user: UserSummary | null
  ticket_id: number
  ticket_number: string
}

export interface TechnicianPerformance {
  technician: UserSummary
  resolved: number
  avg_resolution_minutes: number | null
  satisfaction_avg: number | null
}

export interface DashboardTickets {
  period_days: number
  by_priority: CountItem[]
  by_category: CountItem[]
  daily_volume: DailyCount[]
  recent: RecentTicket[]
  activity: ActivityItem[]
  technicians: TechnicianPerformance[] | null
}

export interface SLAWeek {
  week_start: string
  resolved: number
  within_sla: number
  compliance_pct: number | null
}

export interface DashboardSLA {
  weeks: SLAWeek[]
}

export type AIActionType =
  | 'CLASSIFY_TICKET'
  | 'SUMMARIZE_TICKET'
  | 'SUGGEST_SOLUTION'
  | 'GENERATE_RESPONSE'
  | 'RAG_SEARCH'
  | 'CHAT_RESPONSE'

/** Observação calculada a partir dos dados (números exatos, sem LLM). */
export interface AIInsight {
  kind: 'growth' | 'drop' | 'share' | 'slowest' | 'sla' | 'assistant' | 'feedback'
  tone: 'info' | 'success' | 'warning'
  text: string
}

export interface DashboardAI {
  period_days: number
  conversations: number
  conversations_resolved: number
  conversations_escalated: number
  assistant_resolution_pct: number | null
  feedback_count: number
  positive_feedback_pct: number | null
  usage: Array<{ action_type: AIActionType; total: number; success: number }>
  insights: AIInsight[]
}
