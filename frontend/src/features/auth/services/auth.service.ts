import { get, post } from '@/services/api/client'
import { isApiError, isSessionRejected } from '@/services/api/errors'

import { clearTokens, getRefreshToken, saveTokens } from '../tokenStorage'
import type { CurrentUser, LoginCredentials, RegisterData, TokenResponse } from '../types'

/** Chamadas de autenticação. Nenhum componente conhece estas rotas diretamente. */

export function login(credentials: LoginCredentials): Promise<TokenResponse> {
  return post<TokenResponse>('/auth/login', credentials)
}

export function register(data: RegisterData): Promise<TokenResponse> {
  return post<TokenResponse>('/auth/register', data)
}

export function refreshSession(refreshToken: string): Promise<TokenResponse> {
  return post<TokenResponse>('/auth/refresh', { refresh_token: refreshToken })
}

/** Troca a própria senha. Senha atual errada → 400 (não encerra a sessão). */
export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return post<void>('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  })
}

export function getMe(signal?: AbortSignal): Promise<CurrentUser> {
  return get<CurrentUser>('/auth/me', { signal })
}

/**
 * Carrega o usuário autenticado renovando a sessão uma única vez quando o
 * access token expirou. Se a renovação falhar, os tokens são descartados.
 */
export async function getMeWithRefresh(signal?: AbortSignal): Promise<CurrentUser> {
  try {
    return await getMe(signal)
  } catch (error) {
    const refreshToken = getRefreshToken()
    if (!isApiError(error) || error.status !== 401 || !refreshToken) {
      throw error
    }
    const tokens = await refreshSession(refreshToken).catch((refreshError: unknown) => {
      // Refresh token recusado: sessão encerrada. Falha de rede: mantém os tokens.
      if (isSessionRejected(refreshError)) clearTokens()
      throw refreshError
    })
    saveTokens(tokens)
    return getMe(signal)
  }
}
