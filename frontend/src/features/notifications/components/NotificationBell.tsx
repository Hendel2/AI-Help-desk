import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  MessageSquare,
  Ticket,
  UserCheck,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Button } from '@/components/ui/Button'
import { SkeletonText } from '@/components/ui/Skeleton'
import { cx, FOCUS_RING, SECONDARY_ON_TINT } from '@/components/ui/styles'
import { formatRelative } from '@/utils/format'

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationList,
  useUnreadCount,
} from '../hooks/useNotifications'
import type { AppNotification, NotificationType } from '../types'

const ICONS: Record<NotificationType, { icon: LucideIcon; className: string }> = {
  TICKET_CREATED: { icon: Ticket, className: 'text-primary' },
  TICKET_ASSIGNED: { icon: UserCheck, className: 'text-primary' },
  COMMENT_ADDED: { icon: MessageSquare, className: 'text-primary' },
  TICKET_RESOLVED: { icon: CheckCircle2, className: 'text-success' },
  SLA_WARNING: { icon: AlertTriangle, className: 'text-warning' },
  SLA_BREACHED: { icon: XCircle, className: 'text-danger' },
}

/** Sino de notificações da barra superior (§22, §38). */
export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const unread = useUnreadCount()
  const count = unread.data ?? 0

  // Fecha com Esc ou clique fora; o foco volta para o sino.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={count > 0 ? `Notificações, ${count} não lidas` : 'Notificações'}
        onClick={() => setIsOpen((open) => !open)}
        className={cx(
          'relative rounded-md p-2 text-secondary transition-colors hover:bg-surface-hover hover:text-text',
          FOCUS_RING,
        )}
      >
        <Bell aria-hidden="true" className="size-5" />
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] leading-4 font-semibold text-surface"
          >
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <NotificationPanel id={panelId} onNavigate={() => setIsOpen(false)} hasUnread={count > 0} />
      ) : null}
    </div>
  )
}

interface NotificationPanelProps {
  id: string
  hasUnread: boolean
  onNavigate: () => void
}

function NotificationPanel({ id, hasUnread, onNavigate }: NotificationPanelProps) {
  const list = useNotificationList(true)
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const navigate = useNavigate()

  const open = (notification: AppNotification) => {
    if (!notification.is_read) markRead.mutate(notification.id)
    onNavigate()
    if (notification.ticket_id !== null) void navigate(`/chamados/${notification.ticket_id}`)
  }

  return (
    <section
      id={id}
      aria-label="Notificações"
      className="fixed inset-x-2 top-14 z-40 rounded-lg border border-border bg-surface shadow-sm sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-96"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">Notificações</h2>
        {hasUnread ? (
          <Button
            variant="ghost"
            size="sm"
            isLoading={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Marcar todas como lidas
          </Button>
        ) : null}
      </header>
      <div className="max-h-[min(28rem,70dvh)] overflow-y-auto">
        {list.isPending ? (
          <SkeletonText lines={4} className="p-4" />
        ) : list.isError ? (
          <ErrorState
            title="Não foi possível carregar as notificações."
            onRetry={() => void list.refetch()}
            className="py-6"
          />
        ) : list.data.items.length === 0 ? (
          <EmptyState title="Nenhuma notificação." icon={Bell} className="py-8" />
        ) : (
          <ul className="divide-y divide-border">
            {list.data.items.map((notification) => {
              const { icon: Icon, className } = ICONS[notification.type]
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => open(notification)}
                    className={cx(
                      'group flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none',
                      !notification.is_read && 'bg-primary-soft/60',
                    )}
                  >
                    <Icon aria-hidden="true" className={cx('mt-0.5 size-4 shrink-0', className)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-text">
                        {notification.title}
                        {!notification.is_read ? <span className="sr-only"> (não lida)</span> : null}
                      </span>
                      <span className={cx('block truncate text-sm', SECONDARY_ON_TINT)}>
                        {notification.message}
                      </span>
                      <time
                        dateTime={notification.created_at}
                        className={cx('text-xs', SECONDARY_ON_TINT)}
                      >
                        {formatRelative(notification.created_at)}
                      </time>
                    </span>
                    {!notification.is_read ? (
                      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
