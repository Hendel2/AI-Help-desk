import { Bot, ChartNoAxesColumn, Inbox, ListTodo, Plus, Ticket } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { ButtonLink } from '@/components/ui/ButtonLink'
import { Skeleton } from '@/components/ui/Skeleton'
import type { RoleName } from '@/features/auth/types'
import { formatPercent } from '@/utils/format'

import type { DashboardMetrics } from '../types'

function greeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function count(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`
}

/** Uma frase com o que importa agora para o perfil (números reais, sem estimativa). */
function summary(role: RoleName, metrics: DashboardMetrics): string {
  if (role === 'USER') {
    if (metrics.waiting_user > 0) {
      return `${count(metrics.waiting_user, 'chamado aguarda', 'chamados aguardam')} a sua resposta. Responder agiliza o atendimento.`
    }
    if (metrics.open > 0) {
      return `${count(metrics.open, 'chamado em aberto', 'chamados em aberto')} com a equipe. Você será avisado a cada novidade.`
    }
    return 'Nenhum chamado em aberto. Se algo der problema, o assistente ajuda na hora ou abre o chamado para você.'
  }
  if (role === 'TECHNICIAN') {
    // A fila pessoal e o risco da equipe são números diferentes: frases separadas.
    const mine = metrics.assigned_to_me ?? 0
    const risk = metrics.sla_warning + metrics.sla_breached
    const queue = `${count(mine, 'chamado atribuído', 'chamados atribuídos')} a você.`
    return risk > 0
      ? `${queue} Na fila da equipe, ${count(risk, 'chamado está', 'chamados estão')} com o prazo em risco.`
      : `${queue} Nenhum chamado da equipe com prazo em risco.`
  }
  const compliance =
    metrics.sla_compliance_pct === null
      ? ''
      : `, ${formatPercent(metrics.sla_compliance_pct)} resolvidos dentro do SLA`
  return `${count(metrics.created_in_period, 'chamado aberto', 'chamados abertos')} nos últimos ${metrics.period_days} dias${compliance}.`
}

interface BannerAction {
  to: string
  label: string
  icon: LucideIcon
}

const ACTIONS: Record<RoleName, [BannerAction, BannerAction]> = {
  USER: [
    { to: '/assistente', label: 'Falar com o assistente', icon: Bot },
    { to: '/chamados/novo', label: 'Abrir chamado', icon: Plus },
  ],
  TECHNICIAN: [
    { to: '/chamados/meus', label: 'Ver minha fila', icon: Ticket },
    { to: '/chamados/nao-atribuidos', label: 'Não atribuídos', icon: ListTodo },
  ],
  ADMIN: [
    { to: '/relatorios', label: 'Ver indicadores', icon: ChartNoAxesColumn },
    { to: '/chamados', label: 'Todos os chamados', icon: Inbox },
  ],
}

interface WelcomeBannerProps {
  role: RoleName
  firstName: string
  metrics: DashboardMetrics | undefined
}

/** Abertura do início: saudação, resumo do momento e as duas ações mais comuns do perfil. */
export function WelcomeBanner({ role, firstName, metrics }: WelcomeBannerProps) {
  const [primary, secondary] = ACTIONS[role]
  const PrimaryIcon = primary.icon
  const SecondaryIcon = secondary.icon

  return (
    <section
      aria-labelledby="inicio-titulo"
      className="relative overflow-hidden rounded-2xl border border-border bg-linear-to-br from-hero-from to-hero-to shadow-card"
    >
      <div className="flex flex-col gap-6 p-6 sm:p-8 md:flex-row md:items-center">
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm font-medium text-secondary">{greeting(new Date())}</p>
          <h1
            id="inicio-titulo"
            className="text-2xl font-bold tracking-tight break-words text-text sm:text-3xl"
          >
            Olá, {firstName}
          </h1>
          {metrics ? (
            <p className="max-w-xl text-sm text-text sm:text-base">{summary(role, metrics)}</p>
          ) : (
            <Skeleton className="h-5 w-full max-w-md" />
          )}
          <div className="flex flex-wrap gap-3 pt-2">
            <ButtonLink
              to={primary.to}
              icon={<PrimaryIcon aria-hidden="true" className="size-4" />}
            >
              {primary.label}
            </ButtonLink>
            <ButtonLink
              to={secondary.to}
              variant="secondary"
              icon={<SecondaryIcon aria-hidden="true" className="size-4" />}
            >
              {secondary.label}
            </ButtonLink>
          </div>
        </div>
        <HeroIllustration />
      </div>
    </section>
  )
}

/**
 * Cena do suporte: um chamado resolvido e a conversa com o assistente.
 * Decorativa (aria-hidden) e desenhada com os tokens, então acompanha o tema.
 */
function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 240 160"
      aria-hidden="true"
      className="hidden h-40 w-60 shrink-0 md:block lg:h-44 lg:w-66"
    >
      <circle cx="140" cy="82" r="72" className="fill-primary/10" />
      <circle cx="140" cy="82" r="50" className="fill-primary/10" />

      {/* Chamado */}
      <rect
        x="70"
        y="40"
        width="124"
        height="86"
        rx="14"
        strokeWidth="1.5"
        className="fill-surface stroke-border"
      />
      <rect x="86" y="56" width="58" height="8" rx="4" className="fill-primary" />
      <rect x="152" y="54" width="28" height="12" rx="6" className="fill-success/20" />
      <circle cx="159" cy="60" r="3" className="fill-success" />
      <rect x="86" y="74" width="90" height="6" rx="3" className="fill-border" />
      <rect x="86" y="86" width="74" height="6" rx="3" className="fill-border" />
      <rect x="86" y="98" width="50" height="6" rx="3" className="fill-border" />

      {/* Resolvido */}
      <circle cx="190" cy="120" r="17" className="fill-success" />
      <path
        d="M182.5 120.5 188 126 197.5 115.5"
        fill="none"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-surface"
      />

      {/* Conversa com o assistente */}
      <path
        d="M30 24h52a14 14 0 0 1 14 14v12a14 14 0 0 1-14 14H50l-12 10v-10h-8a14 14 0 0 1-14-14V38a14 14 0 0 1 14-14z"
        className="fill-primary"
      />
      <circle cx="44" cy="44" r="4" className="fill-on-primary" />
      <circle cx="56" cy="44" r="4" className="fill-on-primary" />
      <circle cx="68" cy="44" r="4" className="fill-on-primary" />

      {/* Brilhos */}
      <path d="M212 22l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" className="fill-primary/60" />
      <path d="M40 112l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" className="fill-primary/40" />
    </svg>
  )
}
