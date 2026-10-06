import { NavLink } from 'react-router'

import { cx, FOCUS_RING } from '@/components/ui/styles'
import type { RoleName } from '@/features/auth/types'

import { getNavSections } from './navigation'
import type { NavItem } from './navigation'

interface SidebarProps {
  role: RoleName
  /** Fecha o drawer ao navegar (no mobile). */
  onNavigate?: () => void
  className?: string
}

const ITEM_BASE =
  'flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors'

/** Navegação principal (§37). Itens de outras etapas aparecem desabilitados. */
export function Sidebar({ role, onNavigate, className }: SidebarProps) {
  return (
    <nav aria-label="Navegação principal" className={cx('flex flex-col gap-6 p-4', className)}>
      {getNavSections(role).map((section, index) => (
        <div key={section.title ?? `secao-${index}`} className="space-y-1">
          {section.title ? (
            <h2 className="px-3 pb-1 text-xs font-semibold tracking-wide text-secondary uppercase">
              {section.title}
            </h2>
          ) : null}
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <SidebarItem item={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function SidebarItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { icon: Icon, label, to, available } = item

  if (!available) {
    return (
      <span
        aria-disabled="true"
        className={cx(ITEM_BASE, 'cursor-not-allowed text-secondary/70')}
        title="Disponível em breve"
      >
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        <span className="flex-1">{label}</span>
        <span className="text-xs text-secondary/70">em breve</span>
      </span>
    )
  }

  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cx(
          ITEM_BASE,
          FOCUS_RING,
          isActive
            ? 'bg-primary-soft font-medium text-primary'
            : 'text-text hover:bg-surface-hover',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon aria-hidden="true" className="size-5 shrink-0" />
          <span>{label}</span>
          {isActive ? <span className="sr-only">(página atual)</span> : null}
        </>
      )}
    </NavLink>
  )
}
