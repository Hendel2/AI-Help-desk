import { setAccessTokenGetter } from '@/services/api/client'

import type { TokenResponse } from './types'

/**
 * Persistência dos tokens JWT.
 *
 * Usa `localStorage` para a sessão sobreviver ao recarregamento da página.
 * Contrapartida conhecida: um XSS consegue ler o token — por isso o access
 * token é curto (30 min) e toda autorização real é verificada no backend.
 * Nenhum segredo da aplicação é guardado aqui, apenas tokens do próprio usuário.
 */

const ACCESS_TOKEN_KEY = 'ai-helpdesk.access_token'
const REFRESH_TOKEN_KEY = 'ai-helpdesk.refresh_token'

/** Cache em memória: evita ler o localStorage em cada requisição e funciona
 * mesmo quando o navegador bloqueia o armazenamento (modo privado). */
let accessToken: string | null = null
let refreshToken: string | null = null

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Armazenamento indisponível: a sessão vale apenas para esta aba.
  }
}

export function loadTokensFromStorage(): void {
  accessToken = read(ACCESS_TOKEN_KEY)
  refreshToken = read(REFRESH_TOKEN_KEY)
}

export function getAccessToken(): string | null {
  return accessToken
}

export function getRefreshToken(): string | null {
  return refreshToken
}

export function hasSession(): boolean {
  return accessToken !== null
}

export function saveTokens(tokens: TokenResponse): void {
  accessToken = tokens.access_token
  refreshToken = tokens.refresh_token
  write(ACCESS_TOKEN_KEY, accessToken)
  write(REFRESH_TOKEN_KEY, refreshToken)
}

export function clearTokens(): void {
  accessToken = null
  refreshToken = null
  write(ACCESS_TOKEN_KEY, null)
  write(REFRESH_TOKEN_KEY, null)
}

// Liga o cliente HTTP ao armazenamento: a partir daqui toda requisição envia
// `Authorization: Bearer <token>` quando existe uma sessão.
loadTokensFromStorage()
setAccessTokenGetter(getAccessToken)
