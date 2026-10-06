import { createContext } from 'react'

import type { CurrentUser, LoginCredentials, RegisterData, RoleName } from './types'

/** Contexto e tipos da sessão — separados do provider para o fast refresh do Vite. */

export const authQueryKeys = {
  me: ['auth', 'me'] as const,
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthContextValue {
  user: CurrentUser | null
  status: AuthStatus
  isAuthenticated: boolean
  login: (credentials: LoginCredentials) => Promise<CurrentUser>
  register: (data: RegisterData) => Promise<CurrentUser>
  logout: () => void
  /** Checagem de perfil para a UI. A autorização real é sempre do backend. */
  hasRole: (...roles: RoleName[]) => boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)
