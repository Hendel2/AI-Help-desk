import { Check } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useCallback, useContext, useEffect, useId, useRef, useState } from 'react'

import { MenuContext } from './menuContext'
import { cx, FOCUS_RING } from './styles'

const ITEM_SELECTOR = '[role^="menuitem"]:not([aria-disabled="true"])'

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return Array.from(menu?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])
}

export interface MenuProps {
  /** Nome acessível do botão (obrigatório quando o gatilho é só um ícone). */
  label: string
  /** Conteúdo visível do botão. */
  trigger: ReactNode
  triggerClassName?: string
  /** Lado em que o menu se alinha ao botão. */
  align?: 'start' | 'end'
  children: ReactNode
}

/**
 * Botão de menu (padrão WAI-ARIA "menu button"): setas, Home e End percorrem os
 * itens; Esc fecha e devolve o foco; clicar fora ou sair com Tab também fecha.
 */
export function Menu({ label, trigger, triggerClassName, align = 'end', children }: MenuProps) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)


  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  // Ao abrir, o foco vai para o item marcado (ou o primeiro).
  useEffect(() => {
    if (!open) return
    const list = menuItems(menuRef.current)
    const checked = list.find((item) => item.getAttribute('aria-checked') === 'true')
    ;(checked ?? list[0])?.focus()
  }, [open])

  // Clique fora fecha sem roubar o foco do que foi clicado.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = menuItems(menuRef.current)
    const index = list.indexOf(document.activeElement as HTMLElement)
    const move: Record<string, () => number> = {
      ArrowDown: () => (index + 1) % list.length,
      ArrowUp: () => (index - 1 + list.length) % list.length,
      Home: () => 0,
      End: () => list.length - 1,
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'Tab') {
      setOpen(false)
    } else {
      const target = move[event.key]
      if (target && list.length > 0) {
        event.preventDefault()
        list[target()]?.focus()
      }
    }
  }

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onTriggerKeyDown}
        className={cx(FOCUS_RING, triggerClassName)}
      >
        {trigger}
      </button>
      {open ? (
        <MenuContext.Provider value={{ close }}>
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onMenuKeyDown}
            className={cx(
              'absolute top-full z-40 mt-2 min-w-52 rounded-lg border border-border bg-surface-raised p-1 shadow-overlay',
              'origin-top transition duration-150 ease-out motion-reduce:transition-none starting:-translate-y-1 starting:opacity-0',
              align === 'end' ? 'right-0' : 'left-0',
            )}
          >
            {children}
          </div>
        </MenuContext.Provider>
      ) : null}
    </div>
  )
}

const ITEM_BASE =
  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-text outline-none transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover'

function useMenu() {
  const context = useContext(MenuContext)
  if (!context) throw new Error('Itens de menu precisam estar dentro de <Menu>.')
  return context
}

interface MenuItemProps {
  icon?: ReactNode
  onSelect: () => void
  children: ReactNode
}

/** Ação do menu: executa e fecha. */
export function MenuItem({ icon, onSelect, children }: MenuItemProps) {
  const { close } = useMenu()
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={() => {
        close()
        onSelect()
      }}
      className={ITEM_BASE}
    >
      {icon}
      <span className="flex-1">{children}</span>
    </button>
  )
}

interface MenuRadioItemProps extends MenuItemProps {
  checked: boolean
}

/** Opção exclusiva de um grupo (ex.: tema claro/escuro/sistema). */
export function MenuRadioItem({ icon, checked, onSelect, children }: MenuRadioItemProps) {
  const { close } = useMenu()
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      tabIndex={-1}
      onClick={() => {
        close()
        onSelect()
      }}
      className={ITEM_BASE}
    >
      {icon}
      <span className="flex-1">{children}</span>
      <Check
        aria-hidden="true"
        className={cx('size-4 text-primary', checked ? 'visible' : 'invisible')}
      />
    </button>
  )
}

/** Grupo nomeado de itens (ex.: as opções de tema), com o nome visível. */
export function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  const labelId = useId()
  return (
    <div role="group" aria-labelledby={labelId}>
      <div id={labelId} className="px-2.5 pt-2 pb-1 text-xs text-secondary">
        {label}
      </div>
      {children}
    </div>
  )
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 border-t border-border" />
}
