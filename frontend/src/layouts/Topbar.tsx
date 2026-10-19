import { Menu as MenuIcon, PanelLeft, Search } from 'lucide-react'
import { useLocation } from 'react-router'

import { BrandMark } from '@/components/BrandMark'
import { cx, FOCUS_RING } from '@/components/ui/styles'
import type { CurrentUser } from '@/features/auth/types'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { ThemeMenu } from '@/features/theme/components/ThemeMenu'

import { Kbd } from './CommandPalette'
import { getPageTitle } from './navigation'
import { UserMenu } from './UserMenu'

interface TopbarProps {
  user: CurrentUser
  /** Abre a navegação em drawer (mobile). */
  onOpenMenu: () => void
  /** Recolhe/expande a sidebar (desktop). */
  onToggleSidebar: () => void
  isSidebarCollapsed: boolean
  /** Id da sidebar controlada pelo botão de recolher. */
  sidebarId: string
  onOpenSearch: () => void
}

const ICON_BUTTON = cx(
  'rounded-lg p-2 text-secondary transition-colors hover:bg-surface-hover hover:text-text',
  FOCUS_RING,
)

/** Barra superior (§38): página atual, busca global, tema, notificações e conta. */
export function Topbar({
  user,
  onOpenMenu,
  onToggleSidebar,
  isSidebarCollapsed,
  sidebarId,
  onOpenSearch,
}: TopbarProps) {
  const { pathname } = useLocation()

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-md md:gap-3 md:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir navegação"
        className={cx('-ml-2 lg:hidden', ICON_BUTTON)}
      >
        <MenuIcon aria-hidden="true" className="size-5" />
      </button>
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-controls={sidebarId}
        aria-expanded={!isSidebarCollapsed}
        aria-label={isSidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
        title={isSidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
        className={cx('-ml-2 hidden lg:inline-flex', ICON_BUTTON)}
      >
        <PanelLeft aria-hidden="true" className="size-5" />
      </button>

      <BrandMark className="lg:hidden" />
      <span aria-hidden="true" className="hidden h-6 w-px bg-border lg:block" />
      <p className="hidden min-w-0 truncate text-sm font-semibold text-text lg:block">
        {getPageTitle(pathname)}
      </p>

      <button
        type="button"
        onClick={onOpenSearch}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        className={cx(
          'mx-auto hidden w-full max-w-md min-w-0 items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm text-secondary shadow-card transition-colors hover:border-border-strong md:flex',
          FOCUS_RING,
        )}
      >
        <Search aria-hidden="true" className="size-4 shrink-0" />
        <span className="flex-1 truncate">Buscar páginas, chamados e artigos…</span>
        <span aria-hidden="true" className="flex gap-1">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1 md:ml-0">
        <button
          type="button"
          onClick={onOpenSearch}
          aria-haspopup="dialog"
          aria-label="Buscar"
          className={cx('md:hidden', ICON_BUTTON)}
        >
          <Search aria-hidden="true" className="size-5" />
        </button>
        <ThemeMenu />
        <NotificationBell />
        <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <UserMenu user={user} />
      </div>
    </header>
  )
}
