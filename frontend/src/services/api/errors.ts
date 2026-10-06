/** Códigos de erro gerados pelo próprio cliente HTTP (os demais vêm do backend). */
export const CLIENT_ERROR_CODES = {
  /** Falha de rede: servidor inacessível, sem conexão, CORS etc. (`status` = 0). */
  network: 'NETWORK_ERROR',
  /** Resposta de erro sem o corpo padronizado (ex.: HTML de um proxy/gateway). */
  http: 'HTTP_ERROR',
  /** Resposta de sucesso com JSON inválido. */
  invalidResponse: 'INVALID_RESPONSE',
} as const

export const DEFAULT_ERROR_MESSAGE = 'Não foi possível concluir a ação. Tente novamente.'

export interface ApiErrorInit {
  /** Status HTTP da resposta; 0 quando a requisição nem chegou ao servidor. */
  status: number
  code: string
  message: string
  details?: unknown
  /** Corpo JSON da resposta de erro, quando houver. */
  body?: unknown
  cause?: unknown
}

/** Erro normalizado de qualquer chamada à API. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown
  /**
   * Corpo JSON bruto da resposta de erro (`undefined` se ausente ou não-JSON).
   * Útil para endpoints que respondem um payload próprio em status de erro,
   * como o 503 do health check.
   */
  readonly body: unknown

  constructor({ status, code, message, details, body, cause }: ApiErrorInit) {
    super(message, { cause })
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.body = body
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/**
 * Mensagem segura para exibir ao usuário. Apenas mensagens de `ApiError`
 * (já em pt-BR) são exibidas; erros inesperados usam o texto de fallback.
 */
export function getErrorMessage(error: unknown, fallback: string = DEFAULT_ERROR_MESSAGE): string {
  if (isApiError(error) && error.message.trim()) {
    return error.message
  }
  return fallback
}
