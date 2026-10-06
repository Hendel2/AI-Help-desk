import { beforeEach, describe, expect, it, vi } from 'vitest'

import { get } from '@/services/api/client'
import { ApiError } from '@/services/api/errors'
import type { HealthResponse } from '@/types/health'

import { getHealth } from './health.service'

vi.mock('@/services/api/client')

const getMock = vi.mocked(get)

function httpError(status: number, body: unknown) {
  return new ApiError({ status, code: 'HTTP_ERROR', message: 'Erro.', body })
}

beforeEach(() => {
  getMock.mockReset()
})

describe('getHealth', () => {
  it('requests GET /health through the API client, forwarding the AbortSignal', async () => {
    const health: HealthResponse = { status: 'ok', database: 'ok', version: '0.1.0' }
    getMock.mockResolvedValue(health)
    const { signal } = new AbortController()

    await expect(getHealth(signal)).resolves.toEqual(health)
    expect(getMock).toHaveBeenCalledWith('/health', { signal })
  })

  it('treats the 503 "degraded" health payload as a valid result', async () => {
    const degraded: HealthResponse = {
      status: 'degraded',
      database: 'unavailable',
      version: '0.1.0',
    }
    getMock.mockRejectedValue(httpError(503, degraded))

    await expect(getHealth()).resolves.toEqual(degraded)
  })

  it.each([
    ['a 503 without a health payload', httpError(503, { error: { code: 'X', message: 'Y' } })],
    ['a 500 with a health-like payload', httpError(500, { status: 'ok', database: 'ok', version: '1' })],
  ])('rethrows %s', async (_label, error) => {
    getMock.mockRejectedValue(error)

    await expect(getHealth()).rejects.toBe(error)
  })
})
