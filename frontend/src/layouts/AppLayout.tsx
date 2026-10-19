import { Suspense, useCallback, useEffect, useId, useState } from 'react'
import { Outlet, useLocation } from 'react-router'

import { BrandMark } from '@/components/BrandMark'
import { cx } from '@/components/ui/styles'
import { Drawer } from '@/components/ui/Drawer'
import { SkeletonText } from '@/components/ui/Skeleton'
import { useAuth } from '@/features/auth/useAuth'

import { AssistantLauncher } from './AssistantLauncher'
import { CommandPalette } from './CommandPalette'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

const COLLAPSED_KEY = 'ai-helpdesk.sidebar-collapsed'

/** Preferência por pessoa/navegador; sem storage (modo privado), começa expandida. */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function saveCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // Sem storage a preferência só não sobrevive ao recarregar.
  }
}

/**
 * Moldura das telas autenticadas (§36): sidebar fixa (recolhível) no desktop,
 * drawer no mobile (§53), busca global (Ctrl+K) e o conteúdo da rota no `Outlet`.
 */
export function AppLayout() {
  const { user } = useAuth()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const sidebarId = useId()
  // No chat a caixa de mensagem ocupa a tela toda e o botão flutuante some.
  const isChat = useLocation().pathname.startsWith('/assistente')

  const toggleSidebar = useCallback(() => {
    setCollapsed((current) => {
      saveCollapsed(!current)
      return !current
    })
  }, [])

  // Ctrl+K / Cmd+K abre a busca de qualquer tela.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setIsSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // A rota é protegida: sem usuário o ProtectedRoute já redirecionou.
  if (!user) return null

  return (
    <div
      className={cx(
        'min-h-dvh lg:grid',
        collapsed ? 'lg:grid-cols-[4.5rem_1fr]' : 'lg:grid-cols-[16rem_1fr]',
      )}
    >
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-text focus:outline-2 focus:outline-primary"
      >
        Ir para o conteúdo
      </a>

      <aside
        id={sidebarId}
        aria-label="Menu lateral"
        className="hidden border-r border-border bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col"
      >
        <div
          className={cx(
            'flex h-16 shrink-0 items-center',
            collapsed ? 'justify-center px-2' : 'px-5',
          )}
        >
          <BrandMark withName={!collapsed} />
        </div>
        <Sidebar role={user.role} collapsed={collapsed} className="flex-1" />
      </aside>

      <Drawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} title="Navegação">
        <Sidebar role={user.role} onNavigate={() => setIsMenuOpen(false)} />
      </Drawer>

      <div className="flex min-w-0 flex-col">
        <Topbar
          user={user}
          onOpenMenu={() => setIsMenuOpen(true)}
          onToggleSidebar={toggleSidebar}
          isSidebarCollapsed={collapsed}
          sidebarId={sidebarId}
          onOpenSearch={() => setIsSearchOpen(true)}
        />
        {/* pb extra: o botão flutuante do assistente não cobre o fim da página. */}
        <main
          id="conteudo"
          className={cx(
            'flex-1 px-4 pt-6 md:px-6 lg:px-8 lg:pt-8',
            isChat ? 'pb-6 lg:pb-8' : 'pb-24',
          )}
        >
          {/* Telas carregadas sob demanda: esqueleto enquanto o código chega. */}
          <Suspense fallback={<SkeletonText lines={6} className="mx-auto max-w-6xl" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <CommandPalette
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        role={user.role}
      />
      <AssistantLauncher />
    </div>
  )
}
