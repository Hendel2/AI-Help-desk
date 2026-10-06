import type { RoleName } from './types'

/** Rótulo pt-BR único para cada perfil (nunca exibir o enum cru). */
export const ROLE_LABELS: Record<RoleName, string> = {
  USER: 'Usuário',
  TECHNICIAN: 'Técnico',
  ADMIN: 'Administrador',
}
