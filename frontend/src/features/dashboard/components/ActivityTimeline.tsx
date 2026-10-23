import { Bell } from 'lucide-react'
import { useId } from 'react'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { SeeAllLink } from '@/components/SectionHeading'
import { Card } from '@/components/ui/Card'
import { SkeletonText } from '@/components/ui/Skeleton'
import { cx, SECONDARY_ON_TINT } from '@/components/ui/styles'
import {
  useNotificationList,
  useOpenNotification,
} from '@/features/notifications/hooks/useNotifications'
import { NOTIFICATION_ICONS } from '@/features/notifications/icons'
import { formatRelative } from '@/utils/format'

const VISIBLE = 6

/** "Novidades" do início: as notificações recentes numa linha do tempo, da mais nova para trás. */
export function ActivityTimeline({ className }: { className?: string }) {
  const list = useNotificationList(true)
  const open = useOpenNotification()
  const baseId = useId()

  return (
    <Card
      title="Novidades"
      icon={Bell}
      action={<SeeAllLink to="/notificacoes" label="Ver todas as notificações" />}
      className={className}
    >
      {list.isPending ? (
        <SkeletonText lines={5} />
      ) : list.isError ? (
        <ErrorState
          title="Não foi possível carregar as notificações."
          onRetry={() => void list.refetch()}
          isRetrying={list.isFetching}
          className="py-6"
        />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="Nenhuma novidade por aqui." icon={Bell} className="py-8" />
      ) : (
        <ol className="-mx-2">
          {list.data.items.slice(0, VISIBLE).map((notification, index, items) => {
            const { icon: Icon, className: tone } = NOTIFICATION_ICONS[notification.type]
            const id = `${baseId}-${notification.id}`
            return (
              <li key={notification.id} className="relative">
                {/* Fio da linha do tempo até o próximo marco. */}
                {index < items.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-10 -bottom-2 left-6 w-px -translate-x-1/2 bg-border"
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => open(notification)}
                  // Nome = título (+ "não lida"); mensagem e hora viram a descrição.
                  aria-labelledby={`${id}-titulo`}
                  aria-describedby={`${id}-detalhes`}
                  className="group flex w-full gap-3 rounded-xl p-2 text-left transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      'relative flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-surface group-hover:ring-surface-hover group-focus-visible:ring-surface-hover',
                      tone,
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5">
                    <span
                      id={`${id}-titulo`}
                      className={cx(
                        'block text-sm text-text',
                        notification.is_read ? 'font-medium' : 'font-semibold',
                      )}
                    >
                      {notification.title}
                      {!notification.is_read ? (
                        <>
                          {' '}
                          <span className="sr-only">(não lida)</span>
                          <span
                            aria-hidden="true"
                            className="ml-1.5 inline-block size-2 rounded-full bg-primary align-middle"
                          />
                        </>
                      ) : null}
                    </span>
                    <span id={`${id}-detalhes`} className="block">
                      <span className={cx('line-clamp-2 text-sm', SECONDARY_ON_TINT)}>
                        {notification.message}
                      </span>{' '}
                      <time
                        dateTime={notification.created_at}
                        className={cx('text-xs', SECONDARY_ON_TINT)}
                      >
                        {formatRelative(notification.created_at)}
                      </time>
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
