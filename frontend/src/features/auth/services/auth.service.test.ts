import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/services/api/errors'

import { clearTokens, getAccessToken, saveTokens } from '../tokenStorage'
import type { CurrentUser, TokenResponse } from '../types'
import { getMeWithRefresh, login } from './auth.service'

const USER: CurrentUser = {
  id: 1,
  company_id: 2,
  name: 'Maria Admin',
  email: 'maria@empresa.com',
  role: 'ADMIN',
  department_id: null,
  avatar: null,
  is_active: true,
}

const NEW_TOKENS: TokenResponse = {
  access_token: 'novo-access',
  refresh_token: 'novo-refresh',
  token_type: 'bearer',
  expires_in: 1800,
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function unauthorizedResponse(): Response {
  return jsonResponse(
    { error: { code: 'INVALID_TOKEN', message: 'Sessão inválida ou expirada.' } },
    401,
  )
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  clearTokens()
  vi.unstubAllGlobals()
})

describe('login', () => {
  it('envia as credenciais para /auth/login', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(NEW_TOKENS))

    const tokens = await login({ email: 'maria@empresa.com', password: 'senha-secreta' })

    expect(tokens).toEqual(NEW_TOKENS)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/auth/login')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(
      JSON.stringify({ email: 'maria@empresa.com', password: 'senha-secreta' }),
    )
  })
})

describe('getMeWithRefresh', () => {
  it('retorna o usuário quando o token está válido', async () => {
    saveTokens({ ...NEW_TOKENS, access_token: 'valido' })
    fetchMock.mockResolvedValueOnce(jsonResponse(USER))

    await expect(getMeWithRefresh()).resolves.toEqual(USER)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('renova a sessão uma vez quando o access token expirou', async () => {
    saveTokens({ ...NEW_TOKENS, access_token: 'expirado', refresh_token: 'refresh-valido' })
    fetchMock
      .mockResolvedValueOnce(unauthorizedResponse())
      .mockResolvedValueOnce(jsonResponse(NEW_TOKENS))
      .mockResolvedValueOnce(jsonResponse(USER))

    await expect(getMeWithRefresh()).resolves.toEqual(USER)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(getAccessToken()).toBe('novo-access')
  })

  it('descarta a sessão quando a renovação falha', async () => {
    saveTokens({ ...NEW_TOKENS, access_token: 'expirado', refresh_token: 'refresh-invalido' })
    fetchMock
      .mockResolvedValueOnce(unauthorizedResponse())
      .mockResolvedValueOnce(unauthorizedResponse())

    await expect(getMeWithRefresh()).rejects.toBeInstanceOf(ApiError)
    expect(getAccessToken()).toBeNull()
  })

  it('não tenta renovar sem refresh token', async () => {
    fetchMock.mockResolvedValueOnce(unauthorizedResponse())

    await expect(getMeWithRefresh()).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
