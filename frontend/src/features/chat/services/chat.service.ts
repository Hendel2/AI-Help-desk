import { get, post } from '@/services/api/client'

import type { ChatTurn, Conversation, ConversationSummary } from '../types'

/** Chamadas HTTP do Assistente de TI. */
export const chatService = {
  list: (signal?: AbortSignal) => get<ConversationSummary[]>('/chat/conversations', { signal }),
  get: (id: number, signal?: AbortSignal) =>
    get<Conversation>(`/chat/conversations/${id}`, { signal }),
  create: () => post<Conversation>('/chat/conversations'),
  send: (id: number, content: string) =>
    post<ChatTurn>(`/chat/conversations/${id}/messages`, { content }),
  escalate: (id: number) =>
    post<{ ticket_id: number; ticket_number: string }>(`/chat/conversations/${id}/escalate`),
  resolve: (id: number) => post<Conversation>(`/chat/conversations/${id}/resolve`),
  feedback: (messageId: number, rating: 'POSITIVE' | 'NEGATIVE') =>
    post<void>(`/chat/messages/${messageId}/feedback`, { rating }),
}
