/** Resposta de `GET /api/v1/health` (espelha `HealthResponse` do backend). */
export interface HealthResponse {
  status: 'ok' | 'degraded'
  database: 'ok' | 'unavailable'
  version: string
}
