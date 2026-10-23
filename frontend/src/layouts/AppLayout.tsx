import { Suspense, useCallback, useEffect, useId, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router'

import { cx } from '@/components/ui/styles'
import { Drawer } from '@/components/ui/Drawer'
import { SkeletonText } from '@/components/ui/Skeleton'
import { useAuth } from '@/features/auth/useAuth'
import { ChatWidget } from '@/features/chat/components/ChatWidget'
import { AssistantWidgetProvider } from '@/features/chat/widget/AssistantWidgetProvider'

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
 * Moldura das telas autenticadas (§36): sobre o fundo próprio, a sidebar
 * flutuante (recolhível) e a folha de conteúdo, que rola por dentro no desktop;
 * no mobile, drawer (§53) e rolagem da página. Busca global (Ctrl+K) e
 * assistente flutuante em todas as telas.
 */
export function AppLayout() {
  const { user } = useAuth()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const sidebarId = useId()
  const scrollRef = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  // No chat a caixa de mensagem ocupa a tela toda e o assistente flutuante some.
  const isChat = pathname.startsWith('/assistente')

  const toggleSidebar = useCallback(() => {
    setCollapsed((current) => {
      saveCollapsed(!current)
      return !current
    })
  }, [])

  // A folha rola por dentro: cada página nova começa do topo.
  useEffect(() => {
    scrollRef.current?.scrollTo?.(0, 0)
  }, [pathname])

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
    <AssistantWidgetProvider>
      <div
        className={cx(
          'min-h-dvh lg:grid lg:h-dvh lg:gap-3 lg:overflow-hidden lg:p-3',
          collapsed ? 'lg:grid-cols-[4.5rem_1fr]' : 'lg:grid-cols-[16.5rem_1fr]',
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
          className="hidden min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card lg:flex"
        >
          <Sidebar
            user={user}
            collapsed={collapsed}
            onToggleCollapsed={toggleSidebar}
            controlsId={sidebarId}
            onOpenSearch={() => setIsSearchOpen(true)}
            className="flex-1"
          />
        </aside>

        <Drawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} title="Navegação">
          <Sidebar
            user={user}
            withBrand={false}
            onOpenSearch={() => setIsSearchOpen(true)}
            onNavigate={() => setIsMenuOpen(false)}
          />
        </Drawer>

        {/* Folha de conteúdo: no desktop é um painel arredondado que rola por dentro. */}
        <div
          ref={scrollRef}
          className="flex min-h-dvh min-w-0 flex-col bg-background lg:min-h-0 lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-border lg:shadow-card"
        >
          <Topbar
            user={user}
            onOpenMenu={() => setIsMenuOpen(true)}
            onOpenSearch={() => setIsSearchOpen(true)}
          />
          {/* pb extra: o botão do assistente não cobre o fim da página. */}
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
        <ChatWidget />
      </div>
    </AssistantWidgetProvider>
  )
}
