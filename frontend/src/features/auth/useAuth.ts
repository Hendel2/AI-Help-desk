import { useContext } from 'react'

import { AuthContext } from './authContext'
import type { AuthContextValue } from './authContext'

/** Acesso à sessão autenticada. Lança se usado fora do `AuthProvider`. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  }
  return context
}
