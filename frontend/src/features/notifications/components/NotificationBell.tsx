import { Bell } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Button } from '@/components/ui/Button'
import { SkeletonText } from '@/components/ui/Skeleton'
import { cx, FOCUS_RING } from '@/components/ui/styles'

import {
  useMarkAllNotificationsRead,
  useNotificationList,
  useOpenNotification,
  useUnreadCount,
} from '../hooks/useNotifications'
import { NotificationList } from './NotificationList'

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
          'relative rounded-lg p-2 text-secondary transition-colors hover:bg-surface-hover hover:text-text',
          FOCUS_RING,
        )}
      >
        <Bell aria-hidden="true" className="size-5" />
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-2xs font-semibold text-on-danger tabular-nums"
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
  const markAll = useMarkAllNotificationsRead()
  const open = useOpenNotification(onNavigate)

  return (
    <section
      id={id}
      aria-label="Notificações"
      className="fixed inset-x-2 top-16 z-40 rounded-xl border border-border bg-surface-raised shadow-overlay transition duration-150 ease-out motion-reduce:transition-none starting:-translate-y-1 starting:opacity-0 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-96"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-bold text-text">Notificações</h2>
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
          <NotificationList items={list.data.items} onOpen={open} />
        )}
      </div>
      <footer className="border-t border-border p-2">
        <Link
          to="/notificacoes"
          onClick={onNavigate}
          className={cx(
            'flex min-h-10 items-center justify-center rounded-lg text-sm font-semibold text-primary transition-colors hover:bg-surface-hover',
            FOCUS_RING,
          )}
        >
          Ver todas as notificações
        </Link>
      </footer>
    </section>
  )
}
