/** Dados de teste compartilhados. Só usados em arquivos `*.test.tsx`. */

import type { CurrentUser, RoleName, TokenResponse } from '@/features/auth/types'
import type {
  Category,
  Ticket,
  TicketComment,
  TicketHistoryEntry,
  TicketListItem,
} from '@/features/tickets/types'
import type { Paginated } from '@/types/api'

export const TEST_TOKENS: TokenResponse = {
  access_token: 'access',
  refresh_token: 'refresh',
  token_type: 'bearer',
  expires_in: 1800,
}

export function makeUser(role: RoleName = 'USER', overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: role === 'USER' ? 10 : 20,
    company_id: 1,
    name: role === 'USER' ? 'Ana Solicitante' : 'Téo Técnico',
    email: role === 'USER' ? 'ana@empresa.com' : 'teo@empresa.com',
    role,
    department_id: null,
    avatar: null,
    is_active: true,
    ...overrides,
  }
}

const NOW = new Date()
const minutesFromNow = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString()

export function makeListItem(overrides: Partial<TicketListItem> = {}): TicketListItem {
  return {
    id: 1,
    ticket_number: 'HD-000001',
    title: 'VPN não conecta',
    status: 'OPEN',
    priority: 'HIGH',
    source: 'WEB',
    created_at: minutesFromNow(-30),
    updated_at: minutesFromNow(-10),
    requester: { id: 10, name: 'Ana Solicitante', email: 'ana@empresa.com' },
    technician: null,
    category: { id: 3, name: 'VPN' },
    sla: {
      status: 'ON_TIME',
      response: {
        deadline: minutesFromNow(30),
        completed_at: null,
        status: 'ON_TIME',
        remaining_seconds: 1800,
      },
      resolution: {
        deadline: minutesFromNow(450),
        completed_at: null,
        status: 'ON_TIME',
        remaining_seconds: 27_000,
      },
    },
    ...overrides,
  }
}

export function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    ...makeListItem(),
    description: 'Desde as 08:30 a VPN recusa minhas credenciais.',
    first_response_at: null,
    resolved_at: null,
    closed_at: null,
    allowed_transitions: [],
    ...overrides,
  }
}

export function makeComment(overrides: Partial<TicketComment> = {}): TicketComment {
  return {
    id: 100,
    content: 'Já estamos verificando.',
    is_internal: false,
    created_at: minutesFromNow(-5),
    author: { id: 20, name: 'Téo Técnico', email: 'teo@empresa.com' },
    ...overrides,
  }
}

export function makeHistory(overrides: Partial<TicketHistoryEntry> = {}): TicketHistoryEntry {
  return {
    id: 200,
    action: 'CREATED',
    field: null,
    old_value: null,
    new_value: null,
    created_at: minutesFromNow(-30),
    user: { id: 10, name: 'Ana Solicitante', email: 'ana@empresa.com' },
    ...overrides,
  }
}

export const CATEGORIES: Category[] = [
  { id: 3, name: 'VPN', description: null, default_priority: 'HIGH' },
  { id: 4, name: 'Impressora', description: null, default_priority: 'LOW' },
]

export function paginated<T>(items: T[], overrides: Partial<Paginated<T>> = {}): Paginated<T> {
  return { items, total: items.length, page: 1, page_size: 20, pages: items.length ? 1 : 0, ...overrides }
}
