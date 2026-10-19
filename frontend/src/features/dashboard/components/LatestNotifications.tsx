import { Bell } from 'lucide-react'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { SeeAllLink } from '@/components/SectionHeading'
import { Card } from '@/components/ui/Card'
import { SkeletonText } from '@/components/ui/Skeleton'
import { NotificationList } from '@/features/notifications/components/NotificationList'
import {
  useNotificationList,
  useOpenNotification,
} from '@/features/notifications/hooks/useNotifications'

const VISIBLE = 5

/** As notificações mais recentes no início, com atalho para a caixa completa. */
export function LatestNotifications({ className }: { className?: string }) {
  const list = useNotificationList(true)
  const open = useOpenNotification()

  return (
    <Card
      title="Últimas notificações"
      icon={Bell}
      action={<SeeAllLink to="/notificacoes" label="Ver todas as notificações" />}
      className={className}
    >
      <div className="-mx-4 -mb-4 sm:-mx-5 sm:-mb-5">
        {list.isPending ? (
          <SkeletonText lines={5} className="p-4" />
        ) : list.isError ? (
          <ErrorState
            title="Não foi possível carregar as notificações."
            onRetry={() => void list.refetch()}
            isRetrying={list.isFetching}
            className="py-6"
          />
        ) : list.data.items.length === 0 ? (
          <EmptyState title="Nenhuma notificação." icon={Bell} className="py-8" />
        ) : (
          <NotificationList
            items={list.data.items.slice(0, VISIBLE)}
            onOpen={open}
            className="overflow-hidden rounded-b-xl border-t border-border"
          />
        )}
      </div>
    </Card>
  )
}
