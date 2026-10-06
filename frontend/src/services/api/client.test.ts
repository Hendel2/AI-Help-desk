import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApiUrl, del, get, post, put, setAccessTokenGetter } from './client'
import { ApiError, CLIENT_ERROR_CODES } from './errors'

// Único arquivo de teste que substitui o `fetch`: os demais mockam a camada de service.
const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function lastRequest() {
  const call = fetchMock.mock.lastCall
  if (!call) throw new Error('fetch was not called')
  const [input, init = {}] = call
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  return { url, init, headers: new Headers(init.headers) }
}

async function captureApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
  throw new Error('Expected the promise to reject')
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_API_URL', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('buildApiUrl', () => {
  it('uses /api/v1 when VITE_API_URL is not set', () => {
    expect(buildApiUrl('/health')).toBe('/api/v1/health')
    expect(buildApiUrl('health')).toBe('/api/v1/health')
  })

  it('joins a configured base URL without duplicating slashes', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/api/v1/')

    expect(buildApiUrl('/tickets')).toBe('https://api.example.com/api/v1/tickets')
    expect(buildApiUrl('tickets/42')).toBe('https://api.example.com/api/v1/tickets/42')
  })

  it('falls back to the default when VITE_API_URL is blank', () => {
    vi.stubEnv('VITE_API_URL', '  ')

    expect(buildApiUrl('/health')).toBe('/api/v1/health')
  })
})

describe('apiRequest helpers', () => {
  it('returns the parsed JSON body on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }))
    const controller = new AbortController()

    const data = await get<{ status: string }>('/health', { signal: controller.signal })

    expect(data).toEqual({ status: 'ok' })
    const { url, init, headers } = lastRequest()
    expect(url).toBe('/api/v1/health')
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
    expect(init.signal).toBe(controller.signal)
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.has('Content-Type')).toBe(false)
    expect(headers.has('Authorization')).toBe(false)
  })

  it.each([
    ['POST', post],
    ['PUT', put],
  ] as const)('sends %s requests with a JSON body', async (method, send) => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1 }, 201))
    const payload = { title: 'Impressora sem conexão' }

    await expect(send('/tickets', payload)).resolves.toEqual({ id: 1 })

    const { init, headers } = lastRequest()
    expect(init.method).toBe(method)
    expect(init.body).toBe(JSON.stringify(payload))
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('resolves to undefined on 204 No Content', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(del('/tickets/1')).resolves.toBeUndefined()
    expect(lastRequest().init.method).toBe('DELETE')
  })

  it('converts the standard error body into an ApiError', async () => {
    const details = [{ loc: ['body', 'title'], msg: 'Field required', type: 'missing' }]
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 'VALIDATION_ERROR', message: 'Os dados enviados são inválidos.', details } },
        422,
      ),
    )

    const error = await captureApiError(post('/tickets', {}))

    expect(error.status).toBe(422)
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.message).toBe('Os dados enviados são inválidos.')
    expect(error.details).toEqual(details)
  })

  it('handles error responses without a JSON body', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html><body>Bad Gateway</body></html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    )

    const error = await captureApiError(get('/health'))

    expect(error.status).toBe(502)
    expect(error.code).toBe(CLIENT_ERROR_CODES.http)
    expect(error.message).toContain('HTTP 502')
    expect(error.details).toBeUndefined()
    expect(error.body).toBeUndefined()
  })

  it('keeps a non-standard JSON error body available on the ApiError', async () => {
    const payload = { status: 'degraded', database: 'unavailable', version: '0.1.0' }
    fetchMock.mockResolvedValue(jsonResponse(payload, 503))

    const error = await captureApiError(get('/health'))

    expect(error.status).toBe(503)
    expect(error.code).toBe(CLIENT_ERROR_CODES.http)
    expect(error.body).toEqual(payload)
  })

  it('converts network failures into NETWORK_ERROR', async () => {
    const cause = new TypeError('Failed to fetch')
    fetchMock.mockRejectedValue(cause)

    const error = await captureApiError(get('/health'))

    expect(error.status).toBe(0)
    expect(error.code).toBe(CLIENT_ERROR_CODES.network)
    expect(error.message).toBe(
      'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
    )
    expect(error.cause).toBe(cause)
  })

  it('rethrows cancellations untouched so TanStack Query can ignore them', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    fetchMock.mockRejectedValue(abortError)
    const controller = new AbortController()
    controller.abort()

    await expect(get('/health', { signal: controller.signal })).rejects.toBe(abortError)
  })

  it('rejects successful responses with invalid JSON', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }))

    const error = await captureApiError(get('/health'))

    expect(error.status).toBe(200)
    expect(error.code).toBe(CLIENT_ERROR_CODES.invalidResponse)
  })

  it('sends the access token once the auth layer registers a getter', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    setAccessTokenGetter(() => 'token-123')

    try {
      await get('/auth/me')
    } finally {
      setAccessTokenGetter(() => null)
    }

    expect(lastRequest().headers.get('Authorization')).toBe('Bearer token-123')
  })
})
