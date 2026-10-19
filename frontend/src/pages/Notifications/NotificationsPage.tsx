import { Bell, CheckCheck } from 'lucide-react'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SkeletonText } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/useToast'
import { NotificationList } from '@/features/notifications/components/NotificationList'
import {
  useMarkAllNotificationsRead,
  useNotificationList,
  useOpenNotification,
  useUnreadCount,
} from '@/features/notifications/hooks/useNotifications'
import { getErrorMessage } from '@/services/api/errors'

/** Caixa de notificações em tela cheia (o sino mostra só um resumo). */
export function NotificationsPage() {
  const list = useNotificationList(true)
  const unread = useUnreadCount()
  const markAll = useMarkAllNotificationsRead()
  const open = useOpenNotification()
  const { showToast } = useToast()
  const unreadCount = unread.data ?? 0

  const markAllRead = async () => {
    try {
      await markAll.mutateAsync()
      showToast('Todas as notificações foram marcadas como lidas.')
    } catch (error) {
      showToast(getErrorMessage(error, 'Não foi possível marcar as notificações.'), 'error')
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Notificações"
        description={
          unreadCount > 0
            ? `${unreadCount} ${unreadCount === 1 ? 'não lida' : 'não lidas'}. Avisos sobre seus chamados e prazos.`
            : 'Avisos sobre seus chamados e prazos.'
        }
        actions={
          unreadCount > 0 ? (
            <Button
              variant="secondary"
              icon={<CheckCheck aria-hidden="true" className="size-4" />}
              isLoading={markAll.isPending}
              onClick={() => void markAllRead()}
            >
              Marcar todas como lidas
            </Button>
          ) : null
        }
      />

      <Card className="overflow-hidden" title="Mais recentes" icon={Bell}>
        <div className="-mx-4 -mb-4 sm:-mx-5 sm:-mb-5">
          {list.isPending ? (
            <SkeletonText lines={6} className="p-4" />
          ) : list.isError ? (
            <ErrorState
              title="Não foi possível carregar as notificações."
              description={getErrorMessage(list.error)}
              onRetry={() => void list.refetch()}
              isRetrying={list.isFetching}
              className="py-8"
            />
          ) : list.data.items.length === 0 ? (
            <EmptyState
              title="Nenhuma notificação."
              description="Quando algo acontecer nos seus chamados, você verá aqui."
              icon={Bell}
              className="py-10"
            />
          ) : (
            <NotificationList
              items={list.data.items}
              onOpen={open}
              className="border-t border-border"
            />
          )}
        </div>
      </Card>
    </div>
  )
}
