import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'

import { ErrorState } from '@/components/ErrorState'

import { useAuth } from '../useAuth'
import type { RoleName } from '../types'

interface ProtectedRouteProps {
  children: ReactNode
  /** Quando informado, apenas estes perfis acessam a rota. */
  roles?: RoleName[]
}

/**
 * Proteção de rota — é apenas UX: evita telas vazias e redireciona para o login.
 * A autorização real acontece no backend em cada requisição.
 */
export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { status, user, retry } = useAuth()
  const location = useLocation()

  if (status === 'error') {
    return (
      <ErrorState
        title="Não foi possível verificar sua sessão."
        description="Verifique sua conexão. Você continua conectado."
        onRetry={retry}
      />
    )
  }

  if (status === 'loading') {
    return (
      <output aria-busy="true" className="block p-8 text-sm text-secondary">
        Carregando sua sessão...
      </output>
    )
  }

  if (status === 'unauthenticated' || !user) {
    // `state.from` permite voltar à página pretendida após o login.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
