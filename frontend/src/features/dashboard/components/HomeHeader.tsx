import {
  BookOpen,
  CalendarDays,
  ChartNoAxesColumn,
  Inbox,
  ListTodo,
  Plus,
  Ticket,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'

import { Skeleton } from '@/components/ui/Skeleton'
import { cx, FOCUS_RING } from '@/components/ui/styles'
import type { RoleName } from '@/features/auth/types'
import { greeting } from '@/utils/greeting'

import { summary } from '../summary'
import type { DashboardMetrics } from '../types'

interface Shortcut {
  to: string
  label: string
  icon: LucideIcon
}

const SHORTCUTS: Record<RoleName, Shortcut[]> = {
  USER: [
    { to: '/chamados/novo', label: 'Abrir chamado', icon: Plus },
    { to: '/chamados/meus', label: 'Meus chamados', icon: Ticket },
    { to: '/base-de-conhecimento', label: 'Base de conhecimento', icon: BookOpen },
  ],
  TECHNICIAN: [
    { to: '/chamados/meus', label: 'Minha fila', icon: Ticket },
    { to: '/chamados/nao-atribuidos', label: 'Não atribuídos', icon: ListTodo },
    { to: '/base-de-conhecimento', label: 'Base de conhecimento', icon: BookOpen },
  ],
  ADMIN: [
    { to: '/chamados', label: 'Todos os chamados', icon: Inbox },
    { to: '/chamados/nao-atribuidos', label: 'Não atribuídos', icon: ListTodo },
    { to: '/relatorios', label: 'Indicadores', icon: ChartNoAxesColumn },
  ],
}

const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** "quinta-feira, 23 de outubro" -> "Quinta-feira, 23 de outubro". */
function today(now: Date): string {
  const text = DATE_FORMAT.format(now)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

interface HomeHeaderProps {
  role: RoleName
  firstName: string
  metrics: DashboardMetrics | undefined
}

/** Abertura do início numa folha pontilhada: data, saudação, resumo do momento e atalhos. */
export function HomeHeader({ role, firstName, metrics }: HomeHeaderProps) {
  const now = new Date()
  return (
    <section
      aria-labelledby="inicio-titulo"
      className="relative overflow-hidden rounded-2xl border border-border bg-surface"
    >
      {/* Textura de papel quadriculado que some em direção ao texto. */}
      <div aria-hidden="true" className="absolute inset-0 bg-dots fade-to-left" />
      <div className="relative flex h-full flex-col gap-5 p-6 sm:p-8">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-secondary">
          <CalendarDays aria-hidden="true" className="size-4" />
          {today(now)}
        </p>
        <div className="space-y-2">
          <h1
            id="inicio-titulo"
            className="font-display text-3xl font-semibold tracking-tight break-words text-text sm:text-4xl"
          >
            {greeting(now)}, {firstName}.
          </h1>
          {metrics ? (
            <p className="max-w-xl text-sm text-secondary sm:text-base">{summary(role, metrics)}</p>
          ) : (
            <Skeleton className="h-5 w-full max-w-md" />
          )}
        </div>
        <nav aria-label="Atalhos" className="mt-auto">
          <ul className="flex flex-wrap gap-2">
            {SHORTCUTS[role].map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <Link
                  to={to}
                  className={cx(
                    'inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-background px-3.5 text-sm font-medium text-text transition-colors hover:border-border-strong md:min-h-9',
                    FOCUS_RING,
                  )}
                >
                  <Icon aria-hidden="true" className="size-4 text-primary" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  )
}
