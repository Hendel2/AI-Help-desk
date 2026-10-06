/** Contratos de chamados — espelham `backend/app/schemas/ticket.py`. */

export const TICKET_STATUSES = [
  'OPEN',
  'TRIAGE',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_USER',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export type TicketSource = 'WEB' | 'CHATBOT' | 'EMAIL' | 'API'
export type SLAStatus = 'ON_TIME' | 'WARNING' | 'BREACHED'

export type TicketHistoryAction =
  | 'CREATED'
  | 'STATUS_CHANGED'
  | 'PRIORITY_CHANGED'
  | 'ASSIGNED'
  | 'CATEGORY_CHANGED'
  | 'COMMENTED'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED'
  | 'CANCELLED'

export interface UserSummary {
  id: number
  name: string
  email: string
}

export interface CategorySummary {
  id: number
  name: string
}

export interface Category extends CategorySummary {
  description: string | null
  default_priority: TicketPriority
}

export interface SLAClock {
  deadline: string | null
  completed_at: string | null
  status: SLAStatus | null
  /** Segundos até o prazo; negativo quando venceu. */
  remaining_seconds: number | null
}

export interface TicketSLA {
  /** `null` quando o chamado não tem política de SLA. */
  status: SLAStatus | null
  response: SLAClock
  resolution: SLAClock
}

export interface TicketListItem {
  id: number
  ticket_number: string
  title: string
  status: TicketStatus
  priority: TicketPriority
  source: TicketSource
  created_at: string
  updated_at: string
  requester: UserSummary
  technician: UserSummary | null
  category: CategorySummary | null
  sla: TicketSLA
}

export interface Ticket extends TicketListItem {
  description: string
  first_response_at: string | null
  resolved_at: string | null
  closed_at: string | null
  /** Status para os quais o usuário atual pode levar o chamado (calculado no backend). */
  allowed_transitions: TicketStatus[]
}

export interface TicketComment {
  id: number
  content: string
  is_internal: boolean
  created_at: string
  author: UserSummary
}

export interface TicketHistoryEntry {
  id: number
  action: TicketHistoryAction
  field: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
  user: UserSummary | null
}

export interface TicketCreateData {
  title: string
  description: string
  category_id?: number | null
  priority?: TicketPriority | null
}

export interface TicketUpdateData {
  title?: string
  description?: string
  category_id?: number
  priority?: TicketPriority
}

/** Filtros da listagem, espelhados na URL (§42). */
export interface TicketListParams {
  page: number
  pageSize: number
  status: TicketStatus[]
  priority: TicketPriority[]
  categoryId: number | null
  search: string
  mine: boolean
  unassigned: boolean
}
