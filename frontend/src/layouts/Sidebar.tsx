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

// 44px no toque (drawer do mobile); mais compacto no desktop, onde há mouse.
const ITEM_BASE =
  'relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors lg:min-h-9'

/** Navegação principal (§37). Itens de etapas futuras aparecem desabilitados. */
export function Sidebar({ role, onNavigate, className }: SidebarProps) {
  return (
    <nav aria-label="Navegação principal" className={cx('flex flex-col gap-5 p-3', className)}>
      {getNavSections(role).map((section, index) => (
        <div key={section.title ?? `secao-${index}`}>
          {section.title ? (
            <h2 className="px-3 pb-1.5 text-xs font-medium text-secondary">{section.title}</h2>
          ) : null}
          <ul className="space-y-px">
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
        className={cx(ITEM_BASE, 'cursor-not-allowed text-secondary')}
        title="Disponível em breve"
      >
        <Icon aria-hidden="true" className="size-4.5 shrink-0" />
        <span className="flex-1">{label}</span>
        <span className="text-xs">em breve</span>
      </span>
    )
  }

  return (
    <NavLink
      to={to}
      // "/" e "/chamados" só ficam ativos na rota exata (não em "/chamados/meus").
      end={to === '/' || to === '/chamados'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cx(
          ITEM_BASE,
          FOCUS_RING,
          isActive
            ? // Barra de petróleo à esquerda marca a página atual (além do peso e do fundo).
              'bg-surface-hover font-medium text-text before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
            : 'text-secondary hover:bg-surface-hover hover:text-text',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            aria-hidden="true"
            className={cx('size-4.5 shrink-0', isActive ? 'text-primary' : undefined)}
          />
          <span>{label}</span>
          {isActive ? <span className="sr-only">(página atual)</span> : null}
        </>
      )}
    </NavLink>
  )
}
