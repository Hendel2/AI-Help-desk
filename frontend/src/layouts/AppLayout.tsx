import { Suspense, useState } from 'react'
import { Outlet } from 'react-router'

import { BrandMark } from '@/components/BrandMark'
import { Drawer } from '@/components/ui/Drawer'
import { SkeletonText } from '@/components/ui/Skeleton'
import { useAuth } from '@/features/auth/useAuth'

import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

/**
 * Moldura das telas autenticadas (§36): sidebar fixa no desktop, drawer no
 * mobile (§53) e conteúdo da rota no `Outlet`.
 */
export function AppLayout() {
  const { user } = useAuth()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // A rota é protegida: sem usuário o ProtectedRoute já redirecionou.
  if (!user) return null

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-text focus:outline-2 focus:outline-primary"
      >
        Ir para o conteúdo
      </a>

      <aside
        aria-label="Menu lateral"
        className="hidden border-r border-border bg-background lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col"
      >
        <div className="flex h-14 shrink-0 items-center px-5">
          <BrandMark />
        </div>
        <Sidebar role={user.role} className="flex-1 overflow-y-auto" />
      </aside>

      <Drawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} title="Navegação">
        <Sidebar role={user.role} onNavigate={() => setIsMenuOpen(false)} />
      </Drawer>

      <div className="flex min-w-0 flex-col">
        <Topbar user={user} onOpenMenu={() => setIsMenuOpen(true)} />
        <main id="conteudo" className="flex-1 px-4 py-6 md:px-6 lg:px-8 lg:py-8">
          {/* Telas carregadas sob demanda: esqueleto enquanto o código chega. */}
          <Suspense fallback={<SkeletonText lines={6} className="mx-auto max-w-6xl" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
