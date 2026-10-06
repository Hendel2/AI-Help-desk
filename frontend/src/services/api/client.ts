import type { ApiErrorBody } from '@/types/api'

import { ApiError, CLIENT_ERROR_CODES } from './errors'

/**
 * Cliente HTTP da aplicação: único ponto que chama `fetch`.
 * Fluxo: Component -> Hook -> TanStack Query -> Service -> client (este arquivo).
 */

const DEFAULT_API_BASE_URL = '/api/v1'

const NETWORK_ERROR_MESSAGE =
  'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
const INVALID_RESPONSE_MESSAGE = 'O servidor retornou uma resposta inválida. Tente novamente.'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface RequestOptions {
  method?: HttpMethod
  /** Corpo da requisição; serializado como JSON quando informado. */
  body?: unknown
  headers?: HeadersInit
  /** Permite cancelar a requisição (ex.: o `signal` recebido do TanStack Query). */
  signal?: AbortSignal
}

/** Opções dos helpers: o método vem do helper e o corpo, de um parâmetro próprio. */
export type HelperOptions = Omit<RequestOptions, 'method' | 'body'>

type AccessTokenGetter = () => string | null

/**
 * Ponto de extensão da autenticação (etapa 04).
 * A camada de autenticação registra aqui como obter o token de acesso e todas
 * as requisições passam a enviar `Authorization: Bearer <token>`.
 * Até lá nenhum token é enviado.
 */
let getAccessToken: AccessTokenGetter = () => null

export function setAccessTokenGetter(getter: AccessTokenGetter): void {
  getAccessToken = getter
}

/** Base da API: `VITE_API_URL` ou `/api/v1` (atendido pelo proxy do Vite em desenvolvimento). */
export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL?.trim() || DEFAULT_API_BASE_URL
}

export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl().replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalizedPath}`
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers, signal } = options

  let response: Response
  try {
    response = await fetch(buildApiUrl(path), {
      method,
      headers: buildHeaders(headers, body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    // Cancelamentos são repassados intactos para o TanStack Query reconhecê-los.
    if (isAbortError(error, signal)) throw error
    throw new ApiError({
      status: 0,
      code: CLIENT_ERROR_CODES.network,
      message: NETWORK_ERROR_MESSAGE,
      cause: error,
    })
  }

  if (!response.ok) {
    throw await toApiError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  try {
    return (await readJson(response)) as T
  } catch (error) {
    if (isAbortError(error, signal)) throw error
    throw new ApiError({
      status: response.status,
      code: CLIENT_ERROR_CODES.invalidResponse,
      message: INVALID_RESPONSE_MESSAGE,
      cause: error,
    })
  }
}

export function get<T>(path: string, options?: HelperOptions): Promise<T> {
  return apiRequest<T>(path, { ...options, method: 'GET' })
}

export function post<T>(path: string, body?: unknown, options?: HelperOptions): Promise<T> {
  return apiRequest<T>(path, { ...options, method: 'POST', body })
}

export function put<T>(path: string, body?: unknown, options?: HelperOptions): Promise<T> {
  return apiRequest<T>(path, { ...options, method: 'PUT', body })
}

export function del<T = void>(path: string, options?: HelperOptions): Promise<T> {
  return apiRequest<T>(path, { ...options, method: 'DELETE' })
}

function buildHeaders(custom: HeadersInit | undefined, hasJsonBody: boolean): Headers {
  const headers = new Headers(custom)
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }
  if (hasJsonBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getAccessToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return headers
}

/** Lê o corpo como JSON; corpo vazio resulta em `undefined`. Lança se o JSON for inválido. */
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text.trim()) return undefined
  return JSON.parse(text) as unknown
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown
  try {
    body = await readJson(response)
  } catch {
    body = undefined // corpo não-JSON (ex.: página HTML de erro de um proxy)
  }

  if (isApiErrorBody(body)) {
    return new ApiError({
      status: response.status,
      code: body.error.code,
      message: body.error.message,
      details: body.error.details ?? undefined,
      body,
    })
  }

  return new ApiError({
    status: response.status,
    code: CLIENT_ERROR_CODES.http,
    message: `O servidor respondeu com um erro inesperado (HTTP ${response.status}). Tente novamente.`,
    body,
  })
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false
  const { error } = value
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  )
}

function isAbortError(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError')
}
