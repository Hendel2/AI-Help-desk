import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Avatar } from '@/components/ui/Avatar'
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu'
import { ROLE_LABELS } from '@/features/auth/roleLabels'
import type { CurrentUser } from '@/features/auth/types'
import { useAuth } from '@/features/auth/useAuth'

/** Conta da pessoa na barra superior: perfil e saída. */
export function UserMenu({ user }: { user: CurrentUser }) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <Menu
      label={`Conta de ${user.name}`}
      triggerClassName="flex items-center gap-2.5 rounded-lg py-1 pr-1.5 pl-1 transition-colors hover:bg-surface-hover"
      trigger={
        <>
          <Avatar name={user.name} src={user.avatar} size="sm" />
          {/* Nome longo não empurra a barra: trunca (o completo está no menu e no rótulo). */}
          <span className="hidden max-w-40 min-w-0 text-left leading-tight sm:block">
            <span className="block truncate text-sm font-semibold text-text">{user.name}</span>
            <span className="block truncate text-xs text-secondary">{ROLE_LABELS[user.role]}</span>
          </span>
          <ChevronDown aria-hidden="true" className="hidden size-4 text-secondary sm:block" />
        </>
      }
    >
      <div className="px-2.5 pt-2 pb-2">
        <p className="truncate text-sm font-medium text-text">{user.name}</p>
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
