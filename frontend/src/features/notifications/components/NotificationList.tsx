import { useId } from 'react'

import { cx, SECONDARY_ON_TINT } from '@/components/ui/styles'
import { formatRelative } from '@/utils/format'

import { NOTIFICATION_ICONS } from '../icons'
import type { AppNotification } from '../types'

interface NotificationListProps {
  items: AppNotification[]
  onOpen: (notification: AppNotification) => void
  className?: string
}

/** Lista de notificações (sino e página). Não lidas ficam tingidas. */
export function NotificationList({ items, onOpen, className }: NotificationListProps) {
  // Prefixo por lista: a mesma notificação pode aparecer no sino e no início ao mesmo tempo.
  const baseId = useId()
  return (
    <ul className={cx('divide-y divide-border', className)}>
      {items.map((notification) => {
        const { icon: Icon, className: tone } = NOTIFICATION_ICONS[notification.type]
        const id = `${baseId}-${notification.id}`
        return (
          <li key={notification.id}>
            <button
              type="button"
              onClick={() => onOpen(notification)}
              // Nome = título (+ "não lida"); mensagem e hora viram a descrição.
              aria-labelledby={`${id}-titulo`}
              aria-describedby={`${id}-detalhes`}
              className={cx(
                'group flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none',
                !notification.is_read && 'bg-primary-soft/60',
              )}
            >
              <span
                aria-hidden="true"
                className={cx('flex size-8 shrink-0 items-center justify-center rounded-lg', tone)}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span id={`${id}-titulo`} className="block text-sm font-semibold text-text">
                  {notification.title}
                  {!notification.is_read ? (
                    <>
                      {' '}
                      <span className="sr-only">(não lida)</span>
                    </>
                  ) : null}
                </span>
                <span id={`${id}-detalhes`} className="block">
                  <span className={cx('block truncate text-sm', SECONDARY_ON_TINT)}>
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
              {!notification.is_read ? (
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                />
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
