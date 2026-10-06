import { createContext } from 'react'

/** Contexto do Toast, separado do provider para o fast refresh do Vite. */

export type ToastTone = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  tone: ToastTone
  message: string
}

export interface ToastContextValue {
  /** Exibe um aviso temporário. Retorna o id, útil para dispensar antes do tempo. */
  showToast: (message: string, tone?: ToastTone) => string
  dismissToast: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

/** Tempo de exibição; erros ficam mais tempo na tela. */
export const TOAST_DURATION_MS: Record<ToastTone, number> = {
  success: 4000,
  info: 4000,
  error: 7000,
}
