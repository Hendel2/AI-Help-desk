import { Menu as MenuIcon } from 'lucide-react'

import { BrandMark } from '@/components/BrandMark'
import { cx, FOCUS_RING } from '@/components/ui/styles'
import type { CurrentUser } from '@/features/auth/types'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { ThemeMenu } from '@/features/theme/components/ThemeMenu'

import { UserMenu } from './UserMenu'

interface TopbarProps {
  user: CurrentUser
  /** Abre a navegação em drawer (mobile). */
  onOpenMenu: () => void
}

/** Barra superior (§38): navegação no mobile, tema, notificações e conta. */
export function Topbar({ user, onOpenMenu }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-4 backdrop-blur-sm md:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir navegação"
        className={cx(
          '-ml-2 rounded-md p-2 text-secondary transition-colors hover:bg-surface-hover hover:text-text lg:hidden',
          FOCUS_RING,
        )}
      >
        <MenuIcon aria-hidden="true" className="size-5" />
      </button>

      <BrandMark className="lg:hidden" />

      <div className="ml-auto flex items-center gap-1">
        <ThemeMenu />
        <NotificationBell />
        <div aria-hidden="true" className="mx-2 h-6 w-px bg-border" />
        <UserMenu user={user} />
      </div>
    </header>
  )
}
