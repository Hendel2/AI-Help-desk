import { Plus } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import { cx, FOCUS_RING } from '@/components/ui/styles'
import { buttonClasses } from '@/components/ui/buttonStyles'
import type { RoleName } from '@/features/auth/types'
import { AssistantStatus } from '@/features/chat/components/AssistantStatus'

import { getNavSections } from './navigation'
import type { NavItem, NavSection } from './navigation'
import { useNavCounters } from './useNavCounters'
import type { NavCount } from './useNavCounters'

interface SidebarProps {
  role: RoleName
  /** Desktop recolhido: só ícones (o nome vira dica e texto para leitores de tela). */
  collapsed?: boolean
  /** Fecha o drawer ao navegar (no mobile). */
  onNavigate?: () => void
  className?: string
}

// 44px no toque (drawer do mobile); mais compacto no desktop, onde há mouse.
const ITEM_BASE =
  'group relative flex min-h-11 items-center gap-3 rounded-lg text-sm font-medium transition-colors lg:min-h-10'

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

/** Navegação principal (§37): novo chamado, seções do perfil e status do assistente. */
export function Sidebar({ role, collapsed = false, onNavigate, className }: SidebarProps) {
  const sections = getNavSections(role)
  const { pathname } = useLocation()
  const active = findActiveItem(sections, pathname)
  const counters = useNavCounters(role)

  return (
    <div className={cx('flex min-h-0 flex-col', className)}>
      <div className={cx('pb-3', collapsed ? 'px-2' : 'px-3')}>
        <Link
          to="/chamados/novo"
          onClick={onNavigate}
          aria-label={collapsed ? 'Novo chamado' : undefined}
          title={collapsed ? 'Novo chamado' : undefined}
          className={buttonClasses({ className: 'w-full' })}
        >
          <Plus aria-hidden="true" className="size-4.5" />
          {collapsed ? null : 'Novo chamado'}
        </Link>
      </div>

      <nav
        aria-label="Navegação principal"
        className={cx('flex-1 space-y-4 overflow-y-auto pb-4', collapsed ? 'px-2' : 'px-3')}
      >
        {sections.map((section, index) => (
          <div
            key={section.title ?? `secao-${index}`}
            className={index > 0 ? 'border-t border-border pt-4' : undefined}
          >
            {section.title ? (
              <h2
                className={cx(
                  'px-3 pb-2 text-2xs font-semibold tracking-wider text-secondary uppercase',
                  collapsed && 'sr-only',
                )}
              >
                {section.title}
              </h2>
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

      <div className={cx('border-t border-border', collapsed ? 'p-2' : 'p-3')}>
        <AssistantStatus collapsed={collapsed} onNavigate={onNavigate} />
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
          ? // Barra azul à esquerda marca a página atual (além da cor e do fundo).
            'bg-primary-soft text-primary before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-primary'
          : 'text-secondary hover:bg-surface-hover hover:text-text',
      )}
    >
      <span className="relative shrink-0">
        <Icon aria-hidden="true" className="size-5" />
        {collapsed && counter ? (
          <span
            aria-hidden="true"
            className={cx(
              'absolute -top-1 -right-1.5 size-2.5 rounded-full ring-2 ring-background',
              counter.tone === 'danger' ? 'bg-danger' : 'bg-primary',
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
                'rounded-full px-1.5 py-0.5 text-2xs font-bold tabular-nums',
                counter.tone === 'danger'
                  ? 'bg-danger text-on-danger'
                  : 'bg-primary text-on-primary',
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
