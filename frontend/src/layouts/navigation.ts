import {
  Activity,
  Bell,
  Bot,
  BookOpen,
  Building2,
  ChartNoAxesColumn,
  FolderTree,
  Inbox,
  LayoutDashboard,
  ListTodo,
  ScrollText,
  Settings,
  SquarePen,
  Ticket,
  Timer,
  UserRound,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { RoleName } from '@/features/auth/types'

/** Contadores exibidos ao lado do item (ver `useNavCounters`). */
export type NavCounter = 'unread' | 'myTickets' | 'slaBreached'

/**
 * Menu da especificação §37. `available: false` marca a etapa do roadmap que
 * ainda não chegou: o item aparece desabilitado (em vez de virar link quebrado)
 * e basta ligar a flag quando a rota existir.
 */
export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  available: boolean
  /** Perfis que veem o item; ausente = todos os perfis. */
  roles?: RoleName[]
  counter?: NavCounter
}

export interface NavSection {
  /** Título do grupo; ausente = itens soltos no topo. */
  title?: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: 'Início', to: '/', icon: LayoutDashboard, available: true },
      { label: 'Assistente IA', to: '/assistente', icon: Bot, available: true },
      {
        label: 'Notificações',
        to: '/notificacoes',
        icon: Bell,
        available: true,
        counter: 'unread',
      },
    ],
  },
  {
    title: 'Atendimento',
    items: [
      {
        label: 'Todos os chamados',
        to: '/chamados',
        icon: Inbox,
        available: true,
        roles: ['TECHNICIAN', 'ADMIN'],
        counter: 'slaBreached',
      },
      {
        label: 'Meus chamados',
        to: '/chamados/meus',
        icon: Ticket,
        available: true,
        counter: 'myTickets',
      },
      {
        label: 'Não atribuídos',
        to: '/chamados/nao-atribuidos',
        icon: ListTodo,
        available: true,
        roles: ['TECHNICIAN', 'ADMIN'],
      },
    ],
  },
  {
    title: 'Conhecimento',
    items: [
      {
        label: 'Base de conhecimento',
        to: '/base-de-conhecimento',
        icon: BookOpen,
        available: true,
      },
      {
        label: 'Novo artigo',
        to: '/base-de-conhecimento/novo',
        icon: SquarePen,
        available: true,
        // Mesmo perfil da rota (só ADMIN publica artigos).
        roles: ['ADMIN'],
      },
    ],
  },
  {
    title: 'Análises',
    items: [
      {
        label: 'Indicadores',
        to: '/relatorios',
        icon: ChartNoAxesColumn,
        available: true,
        roles: ['TECHNICIAN', 'ADMIN'],
      },
    ],
  },
  {
    title: 'Administração',
    items: [
      { label: 'Usuários', to: '/admin/usuarios', icon: Users, available: true, roles: ['ADMIN'] },
      {
        label: 'Departamentos',
        to: '/admin/departamentos',
        icon: Building2,
        available: true,
        roles: ['ADMIN'],
      },
      {
        label: 'Categorias',
        to: '/admin/categorias',
        icon: FolderTree,
        available: true,
        roles: ['ADMIN'],
      },
      { label: 'SLA', to: '/admin/sla', icon: Timer, available: true, roles: ['ADMIN'] },
      {
        label: 'Configurações',
        to: '/admin/configuracoes',
        icon: Settings,
        available: true,
        roles: ['ADMIN'],
      },
      {
        label: 'Auditoria',
        to: '/admin/auditoria',
        icon: ScrollText,
        available: true,
        roles: ['ADMIN'],
      },
    ],
  },
  {
    title: 'Acesso rápido',
    items: [
      { label: 'Status dos sistemas', to: '/status', icon: Activity, available: true },
      { label: 'Meu perfil', to: '/perfil', icon: UserRound, available: true },
    ],
  },
]

/** Seções visíveis para o perfil, já sem itens vazios. */
export function getNavSections(role: RoleName): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.roles || item.roles.includes(role)),
  })).filter((section) => section.items.length > 0)
}

/** Rotas sem item próprio no menu (detalhes, formulários). */
const EXTRA_TITLES: Array<[RegExp, string]> = [
  [/^\/chamados\/novo$/, 'Novo chamado'],
  [/^\/chamados\/[^/]+$/, 'Detalhe do chamado'],
  [/^\/base-de-conhecimento\/[^/]+\/editar$/, 'Editar artigo'],
  [/^\/base-de-conhecimento\/[^/]+$/, 'Artigo'],
]

/** Título curto da página atual para a barra superior. */
export function getPageTitle(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  for (const section of NAV_SECTIONS) {
    const item = section.items.find((candidate) => candidate.to === path)
    if (item) return item.label
  }
  return EXTRA_TITLES.find(([pattern]) => pattern.test(path))?.[1] ?? 'AI Help Desk'
}
