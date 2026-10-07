import { cx } from '@/components/ui/styles'

export interface BarListItem {
  label: string
  value: number
}

interface BarListProps {
  items: BarListItem[]
  /** Formata o valor exibido na ponta da barra. */
  formatValue?: (value: number) => string
  className?: string
}

/**
 * Barras horizontais de uma série (magnitude por categoria). Cada valor fica
 * escrito na ponta, então a lista já é a própria "tabela" — não depende de cor
 * nem de hover. Barra fina (≤ 24px), ponta arredondada, base reta.
 */
export function BarList({ items, formatValue = String, className }: BarListProps) {
  const max = Math.max(...items.map((item) => item.value), 0)

  return (
    <ul className={cx('space-y-3', className)}>
      {items.map((item) => {
        const pct = max > 0 ? (item.value / max) * 100 : 0
        return (
          <li key={item.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-text">{item.label}</span>
              <span className="font-medium text-text tabular-nums">{formatValue(item.value)}</span>
            </div>
            <div aria-hidden="true" className="h-2.5 rounded-r bg-surface-hover">
              <div
                className="h-full rounded-r bg-primary"
                style={{ width: `${pct}%`, minWidth: item.value > 0 ? '4px' : 0 }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
