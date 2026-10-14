import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'

import { cx, FOCUS_RING } from './styles'
import { useOverlay } from './useOverlay'

export interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  /** Rótulo acessível do painel (ex.: "Navegação"). */
  title: string
  children: ReactNode
}

/** Painel lateral com a mesma lógica de foco do Modal. Usado pela Sidebar no mobile (§53). */
export function Drawer({ isOpen, onClose, title, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useOverlay({ isOpen, onClose, containerRef: panelRef })

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Fechar navegação"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-overlay transition-opacity duration-200 motion-reduce:transition-none starting:opacity-0"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex h-full w-72 max-w-[85%] flex-col border-r border-border bg-background shadow-overlay transition-transform duration-200 ease-out motion-reduce:transition-none starting:-translate-x-full"
      >
        <div className="flex h-14 items-center justify-between gap-2 px-5">
          <h2 id={titleId} className="text-sm font-semibold text-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar navegação"
            className={cx(
              'rounded-md p-1 text-secondary transition-colors hover:bg-surface-hover hover:text-text',
              FOCUS_RING,
            )}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
