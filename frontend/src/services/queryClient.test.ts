import { describe, expect, it } from 'vitest'

import { ApiError } from '@/services/api/errors'

import { shouldRetryQuery } from './queryClient'

function apiError(status: number, code = 'ANY_ERROR') {
  return new ApiError({ status, code, message: 'Erro.' })
}

describe('shouldRetryQuery', () => {
  it.each([
    ['a 5xx ApiError', apiError(503)],
    ['a network error', apiError(0, 'NETWORK_ERROR')],
    ['an unknown error', new Error('boom')],
  ])('retries %s only once', (_label, error) => {
    expect(shouldRetryQuery(0, error)).toBe(true)
    expect(shouldRetryQuery(1, error)).toBe(false)
  })

  it.each([400, 401, 403, 404, 422, 429])('never retries a %i ApiError', (status) => {
    expect(shouldRetryQuery(0, apiError(status))).toBe(false)
  })
})
