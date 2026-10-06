import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { AuthContext, authQueryKeys } from './authContext'
import type { AuthContextValue, AuthStatus } from './authContext'
import {
  getMeWithRefresh,
  login as loginRequest,
  register as registerRequest,
} from './services/auth.service'
import { clearTokens, hasSession, saveTokens } from './tokenStorage'
import type { LoginCredentials, RegisterData, RoleName } from './types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [sessionActive, setSessionActive] = useState(hasSession)

  // Token inválido, expirado ou conta desativada: descarta a sessão local.
  const loadCurrentUser = useCallback(async (signal?: AbortSignal) => {
    try {
      return await getMeWithRefresh(signal)
    } catch (error) {
      clearTokens()
      throw error
    }
  }, [])

  const meQuery = useQuery({
    queryKey: authQueryKeys.me,
    queryFn: ({ signal }) => loadCurrentUser(signal),
    enabled: sessionActive,
    retry: false,
    staleTime: Infinity,
  })

  const startSession = useCallback(
    async (tokens: Awaited<ReturnType<typeof loginRequest>>) => {
      saveTokens(tokens)
      setSessionActive(true)
      // Busca o usuário já com o novo token antes de liberar as rotas protegidas.
      const user = await queryClient.fetchQuery({
        queryKey: authQueryKeys.me,
        queryFn: ({ signal }) => loadCurrentUser(signal),
        staleTime: Infinity,
      })
      return user
    },
    [queryClient, loadCurrentUser],
  )

  const login = useCallback(
    async (credentials: LoginCredentials) => startSession(await loginRequest(credentials)),
    [startSession],
  )

  const register = useCallback(
    async (data: RegisterData) => startSession(await registerRequest(data)),
    [startSession],
  )

  const logout = useCallback(() => {
    clearTokens()
    setSessionActive(false)
    // Remove dados de outras empresas/usuários do cache.
    queryClient.clear()
  }, [queryClient])

  // Sessão recusada pelo backend: trata como não autenticado (sem setState em efeito).
  const sessionValid = sessionActive && !meQuery.isError
  const user = sessionValid ? (meQuery.data ?? null) : null

  const status: AuthStatus = !sessionValid ? 'unauthenticated' : user ? 'authenticated' : 'loading'

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      login,
      register,
      logout,
      hasRole: (...roles: RoleName[]) => (user ? roles.includes(user.role) : false),
    }),
    [user, status, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
