import { get, post } from '@/services/api/client'
import { isApiError } from '@/services/api/errors'

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
    const tokens = await refreshSession(refreshToken).catch((refreshError) => {
      clearTokens()
      throw refreshError
    })
    saveTokens(tokens)
    return getMe(signal)
  }
}
