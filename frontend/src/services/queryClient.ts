import { QueryClient } from '@tanstack/react-query'

import { isApiError } from '@/services/api/errors'

const STALE_TIME_MS = 30_000
const MAX_QUERY_RETRIES = 1

/**
 * Tenta novamente no máximo uma vez. Erros 4xx são definitivos (validação,
 * permissão, recurso inexistente): repetir a requisição não mudaria o resultado.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) {
    return false
  }
  return failureCount < MAX_QUERY_RETRIES
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_MS,
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false,
    },
  },
})
