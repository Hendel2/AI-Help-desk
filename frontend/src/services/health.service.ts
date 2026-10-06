import { get } from '@/services/api/client'
import { isApiError } from '@/services/api/errors'
import type { HealthResponse } from '@/types/health'

/**
 * `GET /health`. Com o banco indisponível o backend responde **503** com o próprio
 * `HealthResponse` (`status: "degraded"`); esse caso é um resultado válido, não um erro.
 */
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  try {
    return await get<HealthResponse>('/health', { signal })
  } catch (error) {
    if (isApiError(error) && error.status === 503 && isHealthResponse(error.body)) {
      return error.body
    }
    throw error
  }
}

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) return false
  const { status, database, version } = value as Record<string, unknown>
  return (
    (status === 'ok' || status === 'degraded') &&
    (database === 'ok' || database === 'unavailable') &&
    typeof version === 'string'
  )
}
