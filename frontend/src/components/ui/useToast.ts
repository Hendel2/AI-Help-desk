import { useContext } from 'react'

import { ToastContext } from './toastContext'
import type { ToastContextValue } from './toastContext'

/** Acesso ao Toast. Lança se usado fora do `ToastProvider`. */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (context === null) {
    throw new Error('useToast precisa estar dentro de <ToastProvider>')
  }
  return context
}
