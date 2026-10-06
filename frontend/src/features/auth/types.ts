/** Contratos de autenticação — espelham os schemas de `backend/app/schemas/auth.py`. */

export const ROLES = ['USER', 'TECHNICIAN', 'ADMIN'] as const

export type RoleName = (typeof ROLES)[number]

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  company_name: string
  name: string
  email: string
  password: string
  cnpj?: string | null
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  /** Validade do access token em segundos. */
  expires_in: number
}

export interface CurrentUser {
  id: number
  company_id: number
  name: string
  email: string
  role: RoleName
  department_id: number | null
  avatar: string | null
  is_active: boolean
}
