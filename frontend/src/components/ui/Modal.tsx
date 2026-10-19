import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'

import { cx, FOCUS_RING } from './styles'
import { useOverlay } from './useOverlay'

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  /** Descrição curta sob o título, também usada por leitores de tela. */
  description?: string
  size?: keyof typeof SIZES
  /** Ações do rodapé (ex.: Cancelar + Confirmar). */
  footer?: ReactNode
  children?: ReactNode
}

/** Modal acessível: `aria-modal`, foco preso, Esc e clique no fundo fecham (§54). */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useOverlay({ isOpen, onClose, containerRef: panelRef })

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      {/* Fundo: clicar fora fecha. O painel é o elemento interativo acessível. */}
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-overlay transition-opacity duration-150 motion-reduce:transition-none starting:opacity-0"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(
          'relative w-full rounded-xl border border-border bg-surface-raised shadow-overlay',
          'transition duration-150 ease-out motion-reduce:transition-none starting:translate-y-2 starting:opacity-0',
          SIZES[size],
        )}
      >
        {/* <div>, não <header>: o modal fica no <body> e um <header> ali viraria um
            segundo landmark "banner" ao lado da barra superior. */}
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-1">
          <div className="space-y-1">
            <h2 id={titleId} className="text-base font-semibold tracking-tight text-text">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-sm text-secondary">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className={cx(
              'rounded-lg p-1 text-secondary transition-colors hover:bg-surface-hover hover:text-text',
              FOCUS_RING,
            )}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        {children ? <div className="px-5 py-4 text-sm text-text">{children}</div> : null}
        {footer ? (
          <div className="flex flex-col-reverse gap-2 px-5 pt-2 pb-5 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
