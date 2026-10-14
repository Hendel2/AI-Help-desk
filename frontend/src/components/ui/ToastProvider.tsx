import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { cx, FOCUS_RING } from './styles'
import { TOAST_DURATION_MS, ToastContext } from './toastContext'
import type { Toast, ToastContextValue, ToastTone } from './toastContext'

const TONE_STYLES: Record<ToastTone, { border: string; icon: typeof Info; iconColor: string }> = {
  success: { border: 'border-success/40', icon: CheckCircle2, iconColor: 'text-success' },
  error: { border: 'border-danger/40', icon: AlertCircle, iconColor: 'text-danger' },
  info: { border: 'border-border', icon: Info, iconColor: 'text-primary' },
}

let toastCounter = 0

/** Feedback de ações concluídas (§52). Um único provider na raiz da aplicação. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = `toast-${++toastCounter}`
    setToasts((current) => [...current, { id, tone, message }])
    return id
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Região anunciada por leitores de tela sem roubar o foco. Usa apenas
          aria-live: um role="status" permanente competiria com as regiões de
          status das páginas. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-60 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const { border, icon: Icon, iconColor } = TONE_STYLES[toast.tone]

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS[toast.tone])
    return () => clearTimeout(timer)
  }, [toast.id, toast.tone, onDismiss])

  return (
    <div
      className={cx(
        'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-surface-raised px-4 py-3 shadow-overlay transition duration-200 ease-out motion-reduce:transition-none starting:translate-y-2 starting:opacity-0',
        border,
      )}
    >
      <Icon aria-hidden="true" className={cx('mt-0.5 size-4 shrink-0', iconColor)} />
      <p className="flex-1 text-sm text-text">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Fechar aviso"
        className={cx(
          'rounded-md p-0.5 text-secondary transition-colors hover:bg-surface-hover hover:text-text',
          FOCUS_RING,
        )}
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  )
}
