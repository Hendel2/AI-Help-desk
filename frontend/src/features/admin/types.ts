/** Contratos da administração — espelham `backend/app/schemas/admin.py`. */

import type { RoleName } from '@/features/auth/types'
import type { TicketPriority } from '@/features/tickets/types'

export interface AdminUser {
  id: number
  name: string
  email: string
  role: RoleName
  department: { id: number; name: string } | null
  is_active: boolean
  created_at: string
}

export interface UserListParams {
  page?: number
  search?: string
  role?: RoleName | ''
  status?: 'active' | 'inactive' | ''
}

export interface UserInput {
  name: string
  email: string
  role: RoleName
  department_id: number | null
  /** Obrigatória na criação; na edição, vazia = mantém a atual. */
  password?: string
  is_active?: boolean
}

export interface Department {
  id: number
  name: string
  description: string | null
  user_count: number
}

export interface DepartmentInput {
  name: string
  description: string | null
}

export interface AdminCategory {
  id: number
  name: string
  description: string | null
  default_priority: TicketPriority
  default_sla_policy_id: number | null
  is_active: boolean
}

export type CategoryInput = Omit<AdminCategory, 'id'>

export interface SLAPolicy {
  id: number
  name: string
  description: string | null
  priority: TicketPriority | null
  response_time_minutes: number
  resolution_time_minutes: number
  is_active: boolean
}

export type SLAPolicyInput = Omit<SLAPolicy, 'id'>

export interface Company {
  id: number
  name: string
  cnpj: string | null
  email: string | null
  phone: string | null
}

export type CompanyInput = Omit<Company, 'id'>

export type AuditAction =
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'TICKET_CREATED'
  | 'TICKET_UPDATED'
  | 'TICKET_DELETED'
  | 'PERMISSION_CHANGED'
  | 'AI_ACTION_EXECUTED'
  | 'KNOWLEDGE_CREATED'
  | 'KNOWLEDGE_UPDATED'
  | 'KNOWLEDGE_DELETED'
  | 'LOGIN_SUCCEEDED'
  | 'LOGIN_FAILED'
  | 'SETTINGS_CHANGED'

export interface AuditEntry {
  id: number
  action: AuditAction
  entity: string
  entity_id: string | null
  user: { id: number; name: string } | null
  metadata: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

export interface AuditListParams {
  page?: number
  action?: AuditAction | ''
}

export interface AISettings {
  provider: string
  model: string | null
  generative_enabled: boolean
  vector_store: string
  actions_last_30_days: number
  success_rate: number | null
  positive_feedback_rate: number | null
}
