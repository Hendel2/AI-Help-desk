import { BookOpen, Bot, CornerDownLeft, Plus, Search, Ticket } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'

import { cx } from '@/components/ui/styles'
import { useOverlay } from '@/components/ui/useOverlay'
import type { RoleName } from '@/features/auth/types'

import { getNavSections } from './navigation'

interface Command {
  id: string
  group: string
  label: string
  icon: LucideIcon
  to: string
  /** Termos extras que também encontram o comando. */
  keywords?: string
}

/** Sem acento e em minúsculas: "notificacoes" encontra "Notificações". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function baseCommands(role: RoleName): Command[] {
  const actions: Command[] = [
    {
      id: 'acao-novo-chamado',
      group: 'Ações',
      label: 'Abrir um novo chamado',
      icon: Plus,
      to: '/chamados/novo',
      keywords: 'criar ticket suporte problema',
    },
    {
      id: 'acao-assistente',
      group: 'Ações',
      label: 'Conversar com o Assistente de TI',
      icon: Bot,
      to: '/assistente',
      keywords: 'ia chat ajuda bot',
    },
  ]
  const pages = getNavSections(role).flatMap((section) =>
    section.items
      .filter((item) => item.available)
      .map((item) => ({
        id: `pagina-${item.to}`,
        group: 'Páginas',
        label: item.label,
        icon: item.icon,
        to: item.to,
        keywords: section.title,
      })),
  )
  return [...actions, ...pages]
}

/** Buscas que levam o texto digitado para a lista de chamados e para a base. */
function searchCommands(query: string, role: RoleName): Command[] {
  const term = query.trim()
  if (term.length < 2) return []
  const encoded = encodeURIComponent(term)
  return [
    {
      id: 'busca-chamados',
      group: 'Buscar',
      label: `Buscar chamados por “${term}”`,
      icon: Ticket,
      to: role === 'USER' ? `/chamados/meus?q=${encoded}` : `/chamados?q=${encoded}`,
    },
    {
      id: 'busca-artigos',
      group: 'Buscar',
      label: `Buscar artigos por “${term}”`,
      icon: BookOpen,
      to: `/base-de-conhecimento?q=${encoded}`,
    },
  ]
}

function filterCommands(commands: Command[], query: string): Command[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return commands
  return commands.filter((command) => {
    const haystack = normalize(`${command.label} ${command.group} ${command.keywords ?? ''}`)
    return words.every((word) => haystack.includes(word))
  })
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  role: RoleName
}

/** Busca global (Ctrl+K): páginas e ações do perfil, além de busca em chamados e artigos. */
export function CommandPalette({ isOpen, onClose, role }: CommandPaletteProps) {
  // Montado só quando aberto: cada abertura começa com a busca limpa.
  if (!isOpen) return null
  return <PaletteDialog onClose={onClose} role={role} />
}

function PaletteDialog({ onClose, role }: Omit<CommandPaletteProps, 'isOpen'>) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const optionId = (index: number) => `${listId}-opcao-${index}`
  const navigate = useNavigate()

  useOverlay({ isOpen: true, onClose, containerRef: panelRef })
  // O campo recebe o foco ao abrir (depois do foco inicial do overlay).
  useEffect(() => inputRef.current?.focus(), [])

  const all = useMemo(() => baseCommands(role), [role])
  const results = [...filterCommands(all, query), ...searchCommands(query, role)]
  const active = Math.min(activeIndex, Math.max(results.length - 1, 0))

  const run = (command: Command) => {
    onClose()
    void navigate(command.to)
  }

  const moveTo = (index: number) => {
    setActiveIndex(index)
    listRef.current
      ?.querySelector(`#${CSS.escape(optionId(index))}`)
      ?.scrollIntoView({ block: 'nearest' })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveTo((active + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveTo((active - 1 + results.length) % results.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      moveTo(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      moveTo(results.length - 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const command = results[active]
      if (command) run(command)
    }
  }

  // Agrupa preservando a ordem (o índice global continua sendo o da lista).
  const groups: Array<{ name: string; items: Array<{ command: Command; index: number }> }> = []
  results.forEach((command, index) => {
    const group = groups.find((candidate) => candidate.name === command.group)
    if (group) group.items.push({ command, index })
    else groups.push({ name: command.group, items: [{ command, index }] })
  })

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:pt-24">
      <button
        type="button"
        aria-label="Fechar busca"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-overlay transition-opacity duration-150 motion-reduce:transition-none starting:opacity-0"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar no AI Help Desk"
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-overlay transition duration-150 ease-out motion-reduce:transition-none starting:scale-98 starting:opacity-0"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search aria-hidden="true" className="size-5 shrink-0 text-secondary" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={results.length > 0 ? optionId(active) : undefined}
            aria-label="Buscar páginas, ações, chamados e artigos"
            placeholder="Buscar páginas, ações, chamados e artigos…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onKeyDown}
            className="min-h-14 w-full bg-transparent text-base text-text placeholder:text-secondary focus:outline-none"
          />
        </div>

        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Resultados"
          className="max-h-[min(24rem,60dvh)] overflow-y-auto p-2"
        >
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-secondary">
              Nada encontrado para “{query.trim()}”.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.name} role="group" aria-label={group.name} className="py-1">
                <div
                  role="presentation"
                  className="px-3 pt-1 pb-1.5 text-xs font-semibold text-secondary"
                >
                  {group.name}
                </div>
                {group.items.map(({ command, index }) => {
                  const Icon = command.icon
                  const selected = index === active
                  return (
                    <div
                      key={command.id}
                      id={optionId(index)}
                      role="option"
                      aria-selected={selected}
                      // O teclado fica no campo (combobox): setas e Enter. O mouse escolhe
                      // no mousedown para o campo não perder o foco.
                      tabIndex={-1}
                      onMouseMove={() => setActiveIndex(index)}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        run(command)
                      }}
                      className={cx(
                        'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm',
                        selected ? 'bg-primary-soft text-primary' : 'text-text',
                      )}
                    >
                      <Icon aria-hidden="true" className="size-4.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{command.label}</span>
                      {selected ? (
                        <CornerDownLeft aria-hidden="true" className="size-4 shrink-0" />
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div
          aria-hidden="true"
          className="hidden items-center gap-4 border-t border-border px-4 py-2.5 text-xs text-secondary sm:flex"
        >
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> navegar
          </span>
          <span>
            <Kbd>Enter</Kbd> abrir
          </span>
          <span>
            <Kbd>Esc</Kbd> fechar
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Tecla de atalho (decorativa: a função também está descrita em texto). */
export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-sans text-2xs font-semibold text-secondary">
      {children}
    </kbd>
  )
}
