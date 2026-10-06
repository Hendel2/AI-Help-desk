import { LogOut, Menu } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { cx, FOCUS_RING } from '@/components/ui/styles'
import { ROLE_LABELS } from '@/features/auth/roleLabels'
import type { CurrentUser } from '@/features/auth/types'
import { useAuth } from '@/features/auth/useAuth'

interface TopbarProps {
  user: CurrentUser
  /** Abre a navegação em drawer (mobile). */
  onOpenMenu: () => void
}

/**
 * Barra superior: acesso à navegação no mobile, identidade do produto e usuário.
 * Busca global (§38) e notificações (§22) entram com as etapas 08 e 11.
 */
export function Topbar({ user, onOpenMenu }: TopbarProps) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    void navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir navegação"
        className={cx(
          'rounded-md p-2 text-secondary transition-colors hover:bg-surface-hover hover:text-text lg:hidden',
          FOCUS_RING,
        )}
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>

      <span className="font-semibold text-text lg:hidden">AI Help Desk</span>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <Avatar name={user.name} src={user.avatar} size="sm" />
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-medium text-text">{user.name}</span>
            <span className="text-xs text-secondary">{ROLE_LABELS[user.role]}</span>
          </span>
        </div>
        <Button variant="ghost" size="sm" icon={<LogOut aria-hidden="true" className="size-4" />} onClick={handleLogout}>
          <span className="hidden sm:inline">Sair</span>
          <span className="sr-only sm:hidden">Sair da conta</span>
        </Button>
      </div>
    </header>
  )
}
