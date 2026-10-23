import { ChevronRight, Menu as MenuIcon, Search } from 'lucide-react'
import { useLocation } from 'react-router'

import { BrandMark } from '@/components/BrandMark'
import { cx, FOCUS_RING } from '@/components/ui/styles'
import type { CurrentUser } from '@/features/auth/types'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { ThemeMenu } from '@/features/theme/components/ThemeMenu'

import { getBreadcrumb } from './navigation'
import { UserMenu } from './UserMenu'

interface TopbarProps {
  user: CurrentUser
  /** Abre a navegação em drawer (mobile/tablet). */
  onOpenMenu: () => void
  onOpenSearch: () => void
}

const ICON_BUTTON = cx(
  'rounded-lg p-2 text-secondary transition-colors hover:bg-surface-hover hover:text-text',
  FOCUS_RING,
)

/**
 * Barra superior da folha de conteúdo (§38): onde a pessoa está (seção › página),
 * tema e notificações. Busca e conta ficam na sidebar; sem ela (mobile/tablet),
 * aparecem aqui.
 */
export function Topbar({ user, onOpenMenu, onOpenSearch }: TopbarProps) {
  const { pathname } = useLocation()
  const crumb = getBreadcrumb(pathname)

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-md md:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir navegação"
        className={cx('-ml-2 lg:hidden', ICON_BUTTON)}
      >
        <MenuIcon aria-hidden="true" className="size-5" />
      </button>
      <BrandMark className="lg:hidden" />

      <nav aria-label="Você está em" className="hidden min-w-0 lg:block">
        <ol className="flex items-center gap-1.5 text-sm">
          {crumb.section ? (
            <>
              <li className="text-secondary">{crumb.section}</li>
              <li aria-hidden="true">
                <ChevronRight className="size-4 text-secondary" />
              </li>
            </>
          ) : null}
          <li aria-current="page" className="truncate font-display font-semibold text-text">
            {crumb.page}
          </li>
        </ol>
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenSearch}
          aria-haspopup="dialog"
          aria-label="Buscar"
          className={cx('lg:hidden', ICON_BUTTON)}
        >
          <Search aria-hidden="true" className="size-5" />
        </button>
        <ThemeMenu />
        <NotificationBell />
        <div className="lg:hidden">
          <UserMenu user={user} variant="compact" />
        </div>
      </div>
    </header>
  )
}
