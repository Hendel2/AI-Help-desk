import { ChevronsUpDown, LogOut, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Avatar } from '@/components/ui/Avatar'
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu'
import { cx } from '@/components/ui/styles'
import { ROLE_LABELS } from '@/features/auth/roleLabels'
import type { CurrentUser } from '@/features/auth/types'
import { useAuth } from '@/features/auth/useAuth'

interface UserMenuProps {
  user: CurrentUser
  /**
   * `sidebar`: cartão no rodapé da sidebar (menu abre para cima);
   * `compact`: só o avatar (barra superior no celular).
   */
  variant?: 'sidebar' | 'compact'
  /** Sidebar recolhida: só o avatar. */
  collapsed?: boolean
}

/** Conta da pessoa: perfil e saída. */
export function UserMenu({ user, variant = 'compact', collapsed = false }: UserMenuProps) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const inSidebar = variant === 'sidebar'
  const showName = inSidebar && !collapsed

  return (
    <Menu
      label={`Conta de ${user.name}`}
      side={inSidebar ? 'top' : 'bottom'}
      align={inSidebar ? 'start' : 'end'}
      className={inSidebar ? 'w-full' : undefined}
      triggerClassName={cx(
        'flex items-center gap-2.5 rounded-xl transition-colors hover:bg-surface-hover',
        inSidebar ? 'w-full p-2' : 'p-1',
        collapsed && 'justify-center',
      )}
      trigger={
        <>
          <Avatar name={user.name} src={user.avatar} size="sm" />
          {showName ? (
            <>
              {/* Nome longo não empurra o layout: trunca (o completo está no menu). */}
              <span className="min-w-0 flex-1 text-left leading-tight">
                <span className="block truncate text-sm font-semibold text-text">{user.name}</span>
                <span className="block truncate text-xs text-secondary">
                  {ROLE_LABELS[user.role]}
                </span>
              </span>
              <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-secondary" />
            </>
          ) : null}
        </>
      }
    >
      <div className="px-2.5 pt-2 pb-2">
        <p className="truncate text-sm font-semibold text-text">{user.name}</p>
        <p className="truncate text-xs text-secondary">{user.email}</p>
      </div>
      <MenuSeparator />
      <MenuItem
        icon={<UserRound aria-hidden="true" className="size-4 text-secondary" />}
        onSelect={() => void navigate('/perfil')}
      >
        Meu perfil
      </MenuItem>
      <MenuItem
        icon={<LogOut aria-hidden="true" className="size-4 text-secondary" />}
        onSelect={() => {
          logout()
          void navigate('/login', { replace: true })
        }}
      >
        Sair
      </MenuItem>
    </Menu>
  )
}
