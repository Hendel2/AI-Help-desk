import type { ReactNode } from 'react'

interface AdminHeaderProps {
  title: string
  description: string
  action?: ReactNode
}

/** Cabeçalho padrão das telas de administração (§50). */
export function AdminHeader({ title, description, action }: AdminHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-text">{title}</h1>
        <p className="text-sm text-secondary">{description}</p>
      </div>
      {action}
    </header>
  )
}
