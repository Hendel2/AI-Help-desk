import { apiRequest, get, post, put } from '@/services/api/client'
import type { Paginated } from '@/types/api'

import type {
  Category,
  Ticket,
  TicketAttachment,
  TicketComment,
  TicketCreateData,
  TicketHistoryEntry,
  TicketListItem,
  TicketListParams,
  TicketStatus,
  TicketUpdateData,
} from '../types'

/** Chamadas HTTP de chamados. Componentes nunca chamam a API diretamente (§57). */

export function buildTicketQuery(params: TicketListParams): string {
  const query = new URLSearchParams()
  query.set('page', String(params.page))
  query.set('page_size', String(params.pageSize))
  params.status.forEach((status) => query.append('status', status))
  params.priority.forEach((priority) => query.append('priority', priority))
  if (params.categoryId !== null) query.set('category_id', String(params.categoryId))
  if (params.search.trim()) query.set('search', params.search.trim())
  if (params.mine) query.set('mine', 'true')
  if (params.unassigned) query.set('unassigned', 'true')
  return query.toString()
}

export function listTickets(
  params: TicketListParams,
  signal?: AbortSignal,
): Promise<Paginated<TicketListItem>> {
  return get<Paginated<TicketListItem>>(`/tickets?${buildTicketQuery(params)}`, { signal })
}

export function getTicket(id: number, signal?: AbortSignal): Promise<Ticket> {
  return get<Ticket>(`/tickets/${id}`, { signal })
}

export function createTicket(data: TicketCreateData): Promise<Ticket> {
  return post<Ticket>('/tickets', data)
}

export function updateTicket(id: number, data: TicketUpdateData): Promise<Ticket> {
  return put<Ticket>(`/tickets/${id}`, data)
}

/** Sem `technicianId` o usuário autenticado assume o chamado. */
export function assignTicket(id: number, technicianId?: number): Promise<Ticket> {
  return post<Ticket>(`/tickets/${id}/assign`, { technician_id: technicianId ?? null })
}

export function changeTicketStatus(
  id: number,
  status: TicketStatus,
  comment?: string,
): Promise<Ticket> {
  return post<Ticket>(`/tickets/${id}/status`, { status, comment: comment || null })
}

export function resolveTicket(id: number, solution: string): Promise<Ticket> {
  return post<Ticket>(`/tickets/${id}/resolve`, { solution })
}

export function closeTicket(id: number, reason?: string): Promise<Ticket> {
  return post<Ticket>(`/tickets/${id}/close`, { reason: reason || null })
}

export function listComments(id: number, signal?: AbortSignal): Promise<TicketComment[]> {
  return get<TicketComment[]>(`/tickets/${id}/comments`, { signal })
}

export function addComment(
  id: number,
  content: string,
  isInternal: boolean,
): Promise<TicketComment> {
  return post<TicketComment>(`/tickets/${id}/comments`, { content, is_internal: isInternal })
}

export function listHistory(id: number, signal?: AbortSignal): Promise<TicketHistoryEntry[]> {
  return get<TicketHistoryEntry[]>(`/tickets/${id}/history`, { signal })
}

export function listCategories(signal?: AbortSignal): Promise<Category[]> {
  return get<Category[]>('/categories', { signal })
}

/** Técnicos e administradores ativos (para o ADMIN atribuir chamados). */
export function listTechnicians(signal?: AbortSignal): Promise<Array<{ id: number; name: string }>> {
  return get<Array<{ id: number; name: string }>>('/users/technicians', { signal })
}

export function listAttachments(id: number, signal?: AbortSignal): Promise<TicketAttachment[]> {
  return get<TicketAttachment[]>(`/tickets/${id}/attachments`, { signal })
}

export function uploadAttachment(id: number, file: File): Promise<TicketAttachment> {
  const form = new FormData()
  form.append('file', file)
  return post<TicketAttachment>(`/tickets/${id}/attachments`, form)
}

/** O download exige o token de acesso, por isso não é um link direto. */
export function downloadAttachment(ticketId: number, attachmentId: number): Promise<Blob> {
  return apiRequest<Blob>(`/tickets/${ticketId}/attachments/${attachmentId}/download`, {
    responseType: 'blob',
  })
}
