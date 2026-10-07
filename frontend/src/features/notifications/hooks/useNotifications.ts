import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { notificationsService } from '../services/notifications.service'

export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
  unread: () => [...notificationKeys.all, 'unread'] as const,
}

/** Intervalo de atualização do contador (sem WebSocket, polling leve). */
export const UNREAD_POLL_MS = 30_000

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unread(),
    queryFn: ({ signal }) => notificationsService.unreadCount(signal),
    refetchInterval: UNREAD_POLL_MS,
    select: (data) => data.unread,
  })
}

export function useNotificationList(enabled: boolean) {
  return useQuery({
    queryKey: notificationKeys.list(),
    queryFn: ({ signal }) => notificationsService.list(signal),
    enabled,
    staleTime: 0,
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => notificationsService.markRead(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => notificationsService.markAllRead(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}
