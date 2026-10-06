import { Inbox } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cx } from '@/components/ui/styles'

export interface EmptyStateProps {
  /** Mensagem principal (ex.: "Nenhum chamado encontrado."). */
  title: string
  description?: string
  icon?: LucideIcon
  /** Ação sugerida (ex.: `<Button>Novo chamado</Button>` ou "Limpar filtros"). */
  action?: ReactNode
  className?: string
}

/** Estado vazio obrigatório das listagens (§52). */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cx('flex flex-col items-center gap-3 px-4 py-12 text-center', className)}
    >
      <Icon aria-hidden="true" className="size-6 text-secondary" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-text">{title}</p>
        {description ? <p className="text-sm text-secondary">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}
