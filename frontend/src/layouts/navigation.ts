import {
  Bot,
  BookOpen,
  Building2,
  ChartNoAxesColumn,
  FolderTree,
  LayoutDashboard,
  ScrollText,
  Settings,
  Ticket,
  Timer,
  UserRound,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { RoleName } from '@/features/auth/types'

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
}

export interface NavSection {
  /** Título do grupo; ausente = itens soltos no topo. */
  title?: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', to: '/', icon: LayoutDashboard, available: true },
      { label: 'Assistente IA', to: '/assistente', icon: Bot, available: true },
      { label: 'Base de conhecimento', to: '/base-de-conhecimento', icon: BookOpen, available: true },
    ],
  },
  {
    title: 'Chamados',
    items: [
      {
        label: 'Todos',
        to: '/chamados',
        icon: Ticket,
        available: true,
        roles: ['TECHNICIAN', 'ADMIN'],
      },
      { label: 'Meus chamados', to: '/chamados/meus', icon: Ticket, available: true },
      {
        label: 'Não atribuídos',
        to: '/chamados/nao-atribuidos',
        icon: Ticket,
        available: true,
        roles: ['TECHNICIAN', 'ADMIN'],
      },
    ],
  },
  {
    title: 'Relatórios',
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
    items: [{ label: 'Perfil', to: '/perfil', icon: UserRound, available: true }],
  },
]

/** Seções visíveis para o perfil, já sem itens vazios. */
export function getNavSections(role: RoleName): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.roles || item.roles.includes(role)),
  })).filter((section) => section.items.length > 0)
}
