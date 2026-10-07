import { get, post } from '@/services/api/client'
import type { Paginated } from '@/types/api'

import type { AppNotification } from '../types'

/** Chamadas HTTP da caixa de notificações. */
export const notificationsService = {
  list: (signal?: AbortSignal) =>
    get<Paginated<AppNotification>>('/notifications?page_size=15', { signal }),
  unreadCount: (signal?: AbortSignal) =>
    get<{ unread: number }>('/notifications/unread-count', { signal }),
  markRead: (id: number) => post<AppNotification>(`/notifications/${id}/read`),
  markAllRead: () => post<{ updated: number }>('/notifications/read-all'),
}
