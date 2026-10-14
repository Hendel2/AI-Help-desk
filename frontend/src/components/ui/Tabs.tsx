import type { KeyboardEvent, ReactNode } from 'react'
import { useId, useRef, useState } from 'react'

import { cx, FOCUS_RING } from './styles'

export interface TabItem {
  id: string
  label: string
  /** Conteúdo do painel; só é montado quando a aba está ativa. */
  content: ReactNode
}

export interface TabsProps {
  /** Nome acessível do grupo de abas. */
  label: string
  tabs: TabItem[]
  defaultTabId?: string
  /** Modo controlado: aba ativa e aviso de troca. */
  activeTabId?: string
  onTabChange?: (id: string) => void
  className?: string
}

/**
 * Abas acessíveis (padrão WAI-ARIA): setas, Home e End movem entre as abas;
 * apenas a aba ativa entra na ordem de tabulação.
 */
export function Tabs({
  label,
  tabs,
  defaultTabId,
  activeTabId,
  onTabChange,
  className,
}: TabsProps) {
  const baseId = useId()
  const [internalId, setInternalId] = useState(defaultTabId ?? tabs[0]?.id)
  const activeId = activeTabId ?? internalId
  const setActiveId = (id: string) => {
    setInternalId(id)
    onTabChange?.(id)
  }
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeId),
  )

  const focusTab = (index: number) => {
    const target = tabs[(index + tabs.length) % tabs.length]
    if (!target) return
    setActiveId(target.id)
    tabRefs.current[(index + tabs.length) % tabs.length]?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => focusTab(activeIndex + 1),
      ArrowLeft: () => focusTab(activeIndex - 1),
      Home: () => focusTab(0),
      End: () => focusTab(tabs.length - 1),
    }
    const action = keys[event.key]
    if (action) {
      event.preventDefault()
      action()
    }
  }

  const active = tabs[activeIndex]

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className="flex gap-1 border-b border-border">
        {tabs.map((tab, index) => {
          const selected = index === activeIndex
          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[index] = element
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(tab.id)}
              onKeyDown={handleKeyDown}
              className={cx(
                '-mb-px min-h-11 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                selected
                  ? 'border-primary text-text'
                  : 'border-transparent text-secondary hover:text-text',
                FOCUS_RING,
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      {active ? (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active.id}`}
          aria-labelledby={`${baseId}-tab-${active.id}`}
          tabIndex={0}
          className="pt-4 focus-visible:outline-none"
        >
          {active.content}
        </div>
      ) : null}
    </div>
  )
}
