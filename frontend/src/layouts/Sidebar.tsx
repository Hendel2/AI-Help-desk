import { PanelLeftClose, PanelLeftOpen, Plus, Search } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import { BrandMark } from '@/components/BrandMark'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { cx, FOCUS_RING } from '@/components/ui/styles'
import type { CurrentUser } from '@/features/auth/types'
import { AssistantStatus } from '@/features/chat/components/AssistantStatus'

import { Kbd } from './CommandPalette'
import { getNavSections } from './navigation'
import type { NavItem, NavSection } from './navigation'
import { useNavCounters } from './useNavCounters'
import type { NavCount } from './useNavCounters'
import { UserMenu } from './UserMenu'

interface SidebarProps {
  user: CurrentUser
  /** Desktop recolhido: só ícones (o nome vira dica e texto para leitores de tela). */
  collapsed?: boolean
  /** Recolhe/expande (só no desktop; o drawer do mobile não recolhe). */
  onToggleCollapsed?: () => void
  /** Id da sidebar, controlada pelo botão de recolher. */
  controlsId?: string
  onOpenSearch: () => void
  /** Fecha o drawer ao navegar (no mobile). */
  onNavigate?: () => void
  /** Mostra a marca no topo (no drawer o título já é "Navegação"). */
  withBrand?: boolean
  className?: string
}

// 44px no toque (drawer do mobile); mais compacto no desktop, onde há mouse.
const ITEM_BASE =
  'group relative flex min-h-11 items-center gap-3 rounded-xl text-sm font-medium transition-colors lg:min-h-10'

/**
 * Item ativo = o de caminho mais específico que contém a página atual
 * ("/chamados/meus" vence "/chamados"); "/" só na página inicial.
 */
function findActiveItem(sections: NavSection[], pathname: string): string | null {
  let best: string | null = null
  for (const item of sections.flatMap((section) => section.items)) {
    const matches =
      item.to === '/'
        ? pathname === '/'
        : pathname === item.to || pathname.startsWith(`${item.to}/`)
    if (matches && (best === null || item.to.length > best.length)) best = item.to
  }
  return best
}

/**
 * Navegação principal (§37) num painel flutuante: marca, busca, novo chamado,
 * seções do perfil e, no rodapé, o assistente e a conta.
 */
export function Sidebar({
  user,
  collapsed = false,
  onToggleCollapsed,
  controlsId,
  onOpenSearch,
  onNavigate,
  withBrand = true,
  className,
}: SidebarProps) {
  const sections = getNavSections(user.role)
  const { pathname } = useLocation()
  const active = findActiveItem(sections, pathname)
  const counters = useNavCounters(user.role)
  const padding = collapsed ? 'px-2' : 'px-3'

  return (
    <div className={cx('flex min-h-0 flex-col', className)}>
      {withBrand ? (
        <div
          className={cx(
            'flex h-16 shrink-0 items-center gap-2',
            collapsed ? 'justify-center px-2' : 'justify-between pr-2 pl-5',
          )}
        >
          {collapsed ? null : <BrandMark />}
          {onToggleCollapsed ? (
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-controls={controlsId}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
              title={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
              className={cx(
                'rounded-lg p-2 text-secondary transition-colors hover:bg-surface-hover hover:text-text',
                FOCUS_RING,
              )}
            >
              {collapsed ? (
                <PanelLeftOpen aria-hidden="true" className="size-5" />
              ) : (
                <PanelLeftClose aria-hidden="true" className="size-5" />
              )}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={cx('space-y-2 pb-4', padding)}>
        <button
          type="button"
          onClick={() => {
            onNavigate?.()
            onOpenSearch()
          }}
          aria-haspopup="dialog"
          aria-keyshortcuts="Control+K Meta+K"
          aria-label={collapsed ? 'Buscar' : undefined}
          title={collapsed ? 'Buscar (Ctrl K)' : undefined}
          className={cx(
            'flex min-h-10 w-full items-center gap-2.5 rounded-xl border border-border bg-background text-sm text-secondary transition-colors hover:border-border-strong hover:text-text',
            collapsed ? 'justify-center' : 'px-3',
            FOCUS_RING,
          )}
        >
          <Search aria-hidden="true" className="size-4 shrink-0" />
          {collapsed ? null : (
            <>
              <span className="flex-1 text-left">Buscar</span>
              <span aria-hidden="true" className="flex gap-1">
                <Kbd>Ctrl</Kbd>
                <Kbd>K</Kbd>
              </span>
            </>
          )}
        </button>
        <Link
          to="/chamados/novo"
          onClick={onNavigate}
          aria-label={collapsed ? 'Novo chamado' : undefined}
          title={collapsed ? 'Novo chamado' : undefined}
          className={buttonClasses({ className: 'w-full rounded-xl' })}
        >
          <Plus aria-hidden="true" className="size-4.5" />
          {collapsed ? null : 'Novo chamado'}
        </Link>
      </div>

      <nav
        aria-label="Navegação principal"
        className={cx('flex-1 space-y-5 overflow-y-auto pb-4', padding)}
      >
        {sections.map((section, index) => (
          <div key={section.title ?? `secao-${index}`}>
            {section.title ? (
              collapsed ? (
                <>
                  <h2 className="sr-only">{section.title}</h2>
                  <div aria-hidden="true" className="mx-2 mb-2 h-px bg-border" />
                </>
              ) : (
                // Rótulo do grupo com um fio até a borda (sem caixa alta).
                <h2 className="flex items-center gap-2 px-3 pb-2 text-xs font-semibold text-secondary after:h-px after:flex-1 after:bg-border">
                  {section.title}
                </h2>
              )
            ) : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <SidebarItem
                    item={item}
                    isActive={item.to === active}
                    collapsed={collapsed}
                    counter={item.counter ? counters[item.counter] : undefined}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cx('space-y-1 border-t border-border py-2', padding)}>
        <AssistantStatus collapsed={collapsed} onNavigate={onNavigate} />
        <UserMenu user={user} variant="sidebar" collapsed={collapsed} />
      </div>
    </div>
  )
}

interface SidebarItemProps {
  item: NavItem
  isActive: boolean
  collapsed: boolean
  counter?: NavCount
  onNavigate?: () => void
}

function SidebarItem({ item, isActive, collapsed, counter, onNavigate }: SidebarItemProps) {
  const { icon: Icon, label, to, available } = item
  const layout = collapsed ? 'justify-center px-0' : 'px-3'

  if (!available) {
    return (
      <span
        aria-disabled="true"
        className={cx(ITEM_BASE, layout, 'cursor-not-allowed text-secondary')}
        title="Disponível em breve"
      >
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        <span className={collapsed ? 'sr-only' : 'flex-1'}>{label}</span>
        {collapsed ? null : <span className="text-xs">em breve</span>}
      </span>
    )
  }

  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={cx(
        ITEM_BASE,
        layout,
        FOCUS_RING,
        isActive
          ? // Página atual: pílula preenchida (cor, peso e aria-current).
            'bg-primary font-semibold text-on-primary shadow-card'
          : 'text-secondary hover:bg-surface-hover hover:text-text',
      )}
    >
      <span className="relative shrink-0">
        <Icon aria-hidden="true" className="size-5" />
        {collapsed && counter ? (
          <span
            aria-hidden="true"
            className={cx(
              'absolute -top-1 -right-1.5 size-2.5 rounded-full ring-2 ring-surface',
              counter.tone === 'danger' ? 'bg-danger' : isActive ? 'bg-on-primary' : 'bg-primary',
            )}
          />
        ) : null}
      </span>
      <span className={collapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{label}</span>
      {counter ? (
        <>
          {collapsed ? null : (
            <span
              aria-hidden="true"
              className={cx(
                'rounded-md px-1.5 py-0.5 font-display text-2xs font-bold tabular-nums',
                isActive
                  ? counter.tone === 'danger'
                    ? 'bg-on-primary text-danger'
                    : 'bg-on-primary text-primary'
                  : counter.tone === 'danger'
                    ? 'bg-danger-soft text-danger'
                    : 'bg-primary-soft text-primary',
              )}
            >
              {counter.count > 99 ? '99+' : counter.count}
            </span>
          )}
          <span className="sr-only">, {counter.label}</span>
        </>
      ) : null}
    </Link>
  )
}
