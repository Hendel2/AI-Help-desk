import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  hasSession,
  loadTokensFromStorage,
  saveTokens,
} from './tokenStorage'
import type { TokenResponse } from './types'

const TOKENS: TokenResponse = {
  access_token: 'access-123',
  refresh_token: 'refresh-456',
  token_type: 'bearer',
  expires_in: 1800,
}

afterEach(() => {
  clearTokens()
  vi.restoreAllMocks()
})

describe('tokenStorage', () => {
  it('guarda, lê e limpa os tokens', () => {
    expect(hasSession()).toBe(false)

    saveTokens(TOKENS)

    expect(hasSession()).toBe(true)
    expect(getAccessToken()).toBe('access-123')
    expect(getRefreshToken()).toBe('refresh-456')
    expect(window.localStorage.getItem('ai-helpdesk.access_token')).toBe('access-123')

    clearTokens()

    expect(hasSession()).toBe(false)
    expect(getAccessToken()).toBeNull()
    expect(window.localStorage.getItem('ai-helpdesk.access_token')).toBeNull()
  })

  it('restaura a sessão do localStorage ao recarregar a página', () => {
    window.localStorage.setItem('ai-helpdesk.access_token', 'persistido')
    window.localStorage.setItem('ai-helpdesk.refresh_token', 'persistido-refresh')

    loadTokensFromStorage()

    expect(getAccessToken()).toBe('persistido')
    expect(getRefreshToken()).toBe('persistido-refresh')
  })

  it('funciona quando o navegador bloqueia o armazenamento', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage bloqueado')
    })
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage bloqueado')
    })

    expect(() => saveTokens(TOKENS)).not.toThrow()
    // A sessão continua válida em memória nesta aba.
    expect(getAccessToken()).toBe('access-123')
    expect(() => loadTokensFromStorage()).not.toThrow()
  })
})
