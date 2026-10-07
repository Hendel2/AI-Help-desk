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
import { isSessionRejected } from '@/services/api/errors'

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
      // Só o backend encerra a sessão. Uma requisição cancelada (ex.: montagem
      // dupla do StrictMode, troca de rota) ou uma queda de rede não pode
      // apagar os tokens — isso deslogaria o usuário sem motivo.
      if (isSessionRejected(error)) clearTokens()
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

  // Sessão recusada pelo backend → não autenticado. Falha de rede/servidor →
  // estado de erro com nova tentativa (sem deslogar). Sem setState em efeito.
  const sessionRejected = meQuery.isError && isSessionRejected(meQuery.error)
  const user = sessionActive && !meQuery.isError ? (meQuery.data ?? null) : null

  let status: AuthStatus
  if (!sessionActive || sessionRejected) status = 'unauthenticated'
  else if (meQuery.isError) status = 'error'
  else status = user ? 'authenticated' : 'loading'

  const { refetch } = meQuery
  const retry = useCallback(() => {
    void refetch()
  }, [refetch])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      login,
      register,
      logout,
      retry,
      hasRole: (...roles: RoleName[]) => (user ? roles.includes(user.role) : false),
    }),
    [user, status, login, register, logout, retry],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
